import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FulfillmentProgressPayloadSchema, PlatformEventSchema } from '@platform/contracts';

/**
 * DELAI-ACCEPTATION-1 · THE SEAM, on real workerd: the answer clock as the
 * platform runs it — the order arrives through the real Shop+ intake, the
 * book's own alarm fires on its own (Miniflare runs Durable Object alarms in
 * real time), and the outcome is read through the apps' OWN ports: the
 * supplier's `listMine` and the founder's `listPaidOrders`. What Shop+
 * received is parsed against the canon event schema — the refund road it
 * already runs on `fulfillment.rejected.v1`.
 *
 * The clock is 1.5 s here through the lower-only test knob (never in
 * wrangler.toml; the production clock is the ruled 120 minutes, which the knob
 * cannot lengthen — proven in `delai-acceptation.test.ts`).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0077';
const OPS_SECRET = 'test-fulfillment-ops-secret-0077';
const PROGRESS_SECRET = 'test-progress-write-secret-0077';
const T0 = '2026-09-27T08:00:00.000Z';
const SUPPLIER = 'supplier-delai-001';
const DELAI_MS = 1_500;

const persist = mkdtempSync(join(tmpdir(), 'delai-acceptation-'));
const recu: { auth: string | null; body: string }[] = [];
let mf: Miniflare;

beforeAll(() => {
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persist,
    bindings: {
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      ACCEPTANCE_DECISION_MS: String(DELAI_MS),
    },
    serviceBindings: {
      STOREFRONT: async (request: Request) => {
        recu.push({ auth: request.headers.get('Authorization'), body: await request.text() });
        return Response.json({ ok: true, status: 'recorded' });
      },
    },
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

async function post(path: string, body: unknown, auth: string) {
  const res = (await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })) as unknown as Response;
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}
const ops = `Bearer ${OPS_SECRET}`;

function seed(pv: string) {
  return {
    commandId: `seed-${pv}`,
    offerId: `offer-${pv}`,
    product: {
      id: pv, supplierId: SUPPLIER, version: 1, name: `Pagne (${pv})`, productCode: `DA-${pv}`.slice(0, 20), facts: {},
      category: 'fashion_bags_fabrics', zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: pv, basePrice: 8_000, resellerCommission: 800, eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 5,
    asOf: T0,
  };
}

const confirmer = (orderId: string, pv: string) =>
  post(
    '/fulfillment/order-confirmed',
    {
      name: 'order.confirmed.v1',
      envelope: {
        command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`,
        aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
      },
      payload: { orderId, productVersionId: pv, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY', paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000 },
    },
    `Bearer ${FULFILL_SECRET}`,
  );

async function ports() {
  vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'http://o');
  vi.stubGlobal('fetch', ((url: string, init?: RequestInit) => mf.dispatchFetch(url, init as never)) as never);
  const { resolveOperationsService } = await import('../../../apps/supplier-app/src/operations/service');
  const { resolveFournisseurService } = await import('../../../apps/supplier-app/src/fournisseur/service');
  return { console: resolveOperationsService()!, fournisseur: resolveFournisseurService()! };
}

describe('DELAI-ACCEPTATION-1 · the seam — the clock cancels only the order nobody answered, and Shop+ is told', () => {
  it('three paid orders: one accepted, one refused by him, one left unanswered — only the last is cancelled `delai`, on both screens, and Shop+ gets one canon rejected fact for it', async () => {
    // his code first: the book refuses products for a supplier it does not know
    const mint = await post('/fulfillment/supplier-code', { supplierId: SUPPLIER }, ops);
    expect(mint.status, mint.text).toBe(200);
    const code = mint.json['code'] as string;
    for (const pv of ['pv-da-1', 'pv-da-2', 'pv-da-3']) { const r = await post('/offers', seed(pv), ops); expect(r.status, r.text).toBe(200); }
    for (const [id, pv] of [['ord-da-1', 'pv-da-1'], ['ord-da-2', 'pv-da-2'], ['ord-da-3', 'pv-da-3']] as const) {
      const r = await confirmer(id, pv);
      expect(r.status, r.text).toBe(200);
    }

    const { console: fondateur, fournisseur } = await ports();
    const avant = await fournisseur.listMine(code);
    expect(avant.ok).toBe(true);
    if (avant.ok) {
      expect(avant.orders).toHaveLength(3);
      expect(avant.orders.every((o) => typeof o.repondreAvant === 'string'), 'each unanswered order says until when').toBe(true);
    }

    expect((await post('/fulfillment/accept', { orderId: 'ord-da-1' }, `Bearer ${code}`)).status).toBe(200);
    expect((await post('/fulfillment/refuse', { orderId: 'ord-da-2' }, `Bearer ${code}`)).status).toBe(200);

    // the book's own alarm, on its own
    let lu: Awaited<ReturnType<typeof fondateur.listPaidOrders>> | null = null;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      lu = await fondateur.listPaidOrders(OPS_SECRET);
      if (lu.ok && lu.orders.find((o) => o.orderId === 'ord-da-3')?.fulfillment?.refusedAt !== undefined) break;
    }
    expect(lu?.ok).toBe(true);
    if (!lu?.ok) return;
    const par = (id: string) => lu!.ok ? lu!.orders.find((o) => o.orderId === id)?.fulfillment : undefined;
    expect(par('ord-da-3'), 'THE BOOK, read by his console: cancelled by the clock').toMatchObject({ refusPar: 'delai' });
    expect(par('ord-da-2')?.refusedAt, 'his own refusal stays his').toBeDefined();
    expect(par('ord-da-2')?.refusPar).toBeUndefined();
    expect(par('ord-da-1')?.refusedAt, 'the order he accepted is never cancelled').toBeUndefined();

    const sienne = await fournisseur.listMine(code);
    expect(sienne.ok).toBe(true);
    if (sienne.ok) {
      const o3 = sienne.orders.find((o) => o.orderId === 'ord-da-3')!;
      expect(o3.fulfillment).toMatchObject({ refusPar: 'delai' });
      expect(o3.repondreAvant, 'no deadline left on a cancelled order').toBeUndefined();
      expect(sienne.orders.find((o) => o.orderId === 'ord-da-1')!.repondreAvant).toBeUndefined();
    }

    // What Shop+ received: canon events, one rejected per ended order, nothing for the accepted one
    const faits = recu.map((r) => PlatformEventSchema.parse(JSON.parse(r.body)));
    expect(recu.every((r) => r.auth === `Bearer ${PROGRESS_SECRET}`)).toBe(true);
    const rejetes = faits.filter((f) => f.name === 'fulfillment.rejected.v1').map((f) => FulfillmentProgressPayloadSchema.parse(f.payload).orderId).sort();
    expect(rejetes).toEqual(['ord-da-2', 'ord-da-3']);

    // A late « Accepter » on the cancelled order is refused by name
    const tard = await post('/fulfillment/accept', { orderId: 'ord-da-3' }, `Bearer ${code}`);
    expect(tard.status).toBe(409);
    expect(tard.json).toMatchObject({ reason: 'refusee' });
  }, 30_000);
});
