import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FulfillmentProgressPayloadSchema, PlatformEventSchema } from '@platform/contracts';

/**
 * ═══ REMBOURSABLE-1 — every paid order has a road to its refund, on real workerd ═══
 *
 * AUDIT-B+2 F-02, F-08, F-33, F-37, F-61, driven through the REAL Worker bundle:
 *
 *  · F-02 — the founder's « Annuler et rembourser »: HIS key only, before
 *    « prêt » only, the canon `fulfillment.rejected.v1` {orderId, at} leaves
 *    for Shop+ exactly as a supplier's refusal does, and the order is closed
 *    to every later act. It works where the supplier's own door cannot: his
 *    access cut, or no supplier found for the product at all.
 *  · F-02 (the cut) — the code list says how many paid orders each supplier
 *    still has open, so « Couper l'accès » is never blind to them.
 *  · F-08 — a rider's refusal at pickup is RECORDED on the order (first-wins,
 *    for every fault class), and both lists carry it.
 *  · F-61 — the founder's list carries the book's own marks (handed over,
 *    delivered, returned, pickup refused), so his screen never needs another
 *    Worker's read to know an order is finished.
 *  · F-37 — « retirer » refuses while a refusal notice has not reached Shop+.
 *  · F-33 — deleting a product or erasing a supplier refuses while a buyer
 *    holds a unit.
 *
 * ⚠ THE SÉRA DOUBLE answers the two verify doors with Séra's own shape
 * (`{ok:true, verdict}`), and the Shop+ double accepts what Shop+'s progress
 * door accepts; the refusal body is held here to the canon envelope and the
 * strict progress payload, the same parse Shop+ runs on receipt.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0031';
const OPS_SECRET = 'test-fulfillment-ops-secret-0031';
const PROGRESS_SECRET = 'test-progress-write-secret-0031';
const SERA_SECRET = 'test-sera-intake-secret-0031';
const T0 = '2026-09-26T08:00:00.000Z';
const T1 = '2026-09-26T10:15:00.000Z';
const T2 = '2026-09-26T11:40:00.000Z';

const SUPPLIER_A = 'supplier-remb-001';
const SUPPLIER_B = 'supplier-remb-002';
const SUPPLIER_C = 'supplier-remb-003';
const SUPPLIER_D = 'supplier-remb-004';
const PV_A = 'pv-remb-a';
const PV_B = 'pv-remb-b';
const PV_C = 'pv-remb-c';
const PV_D = 'pv-remb-d';

/** What Shop+ would have received, verbatim. */
const delivered: { auth: string | null; body: string }[] = [];
let storefrontDown = false;

const RAMASSAGE: Record<string, string> = {};
const RETOUR: Record<string, string> = {};
let seraServer: Server;
let seraBase = '';

beforeAll(async () => {
  seraServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const answer = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.headers['authorization'] !== `Bearer ${SERA_SECRET}`) return answer(401, { error: 'unauthorized' });
      if (req.url === '/intake/readiness') return answer(200, { ok: true, applied: true });
      let b: Record<string, unknown> | null = null;
      try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; } catch { /* malformed */ }
      const s = (v: unknown): v is string => typeof v === 'string' && v !== '';
      if (b === null || !s(b['command_id']) || !s(b['orderId']) || !s(b['code'])) return answer(400, { ok: false, reason: 'malformed' });
      const book = req.url === '/intake/ramassage/verify' ? RAMASSAGE : req.url === '/intake/retour/verify' ? RETOUR : null;
      if (book === null) return answer(404, { error: 'not_found' });
      const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const attendu = book[b['orderId']];
      return answer(200, { ok: true, verdict: attendu !== undefined && norm(b['code']) === norm(attendu) ? 'confirme' : 'non_confirme' });
    });
  });
  await new Promise<void>((resolve) => seraServer.listen(0, '127.0.0.1', resolve));
  seraBase = `http://127.0.0.1:${(seraServer.address() as AddressInfo).port}`;
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persist,
    bindings: {
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      SERA_INTAKE_BASE: seraBase,
      SERA_INTAKE_SECRET: SERA_SECRET,
    },
    serviceBindings: {
      STOREFRONT: async (request: Request) => {
        if (storefrontDown) return Response.json({ ok: false }, { status: 503 });
        delivered.push({ auth: request.headers.get('Authorization'), body: await request.text() });
        return Response.json({ ok: true, status: 'recorded' });
      },
    },
  });
});

const persist = mkdtempSync(join(tmpdir(), 'remboursable-'));
let mf: Miniflare;
afterAll(async () => {
  await mf?.dispose();
  await new Promise<void>((resolve) => seraServer.close(() => resolve()));
  rmSync(persist, { recursive: true, force: true });
});

async function call(method: 'GET' | 'POST', path: string, body: unknown, auth: string | null) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth === null ? {} : { Authorization: auth }) },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}
const ops = `Bearer ${OPS_SECRET}`;
const post = (path: string, body: unknown, auth: string | null = ops) => call('POST', path, body, auth);
const get = (path: string, auth: string | null = ops) => call('GET', path, null, auth);

function seed(pv: string, supplierId: string, available: number) {
  return {
    commandId: `seed-${pv}`,
    offerId: `offer-${pv}`,
    product: {
      id: pv, supplierId, version: 1, name: `Pagne (${pv})`, productCode: `RB-${pv}`.slice(0, 20), facts: {},
      category: 'fashion_bags_fabrics', zone: 'Gounghin', moderationState: 'approved', status: 'active',
      supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: pv, basePrice: 8_000, resellerCommission: 800, eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available,
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
      payload: {
        orderId, productVersionId: pv, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
        paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
      },
    },
    `Bearer ${FULFILL_SECRET}`,
  );

async function pret(orderId: string, pv: string, code: string) {
  expect((await post('/fulfillment/accept', { orderId }, `Bearer ${code}`)).status).toBe(200);
  const ch = await post('/fulfillment/ready/challenge', { orderId }, `Bearer ${code}`);
  expect(ch.status, ch.text).toBe(200);
  const ready = await post(
    '/fulfillment/ready',
    {
      orderId,
      photoRef: { ref: `media/readiness/${orderId}`, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
      readinessChallenge: ch.json['challenge'], qty: 1, variant: pv, availableConfirmed: true,
      at: new Date().toISOString(),
    },
    `Bearer ${code}`,
  );
  expect(ready.status, ready.text).toBe(200);
}

const refusedEvent = (orderId: string, serverTime: string, payload: Record<string, unknown>) => ({
  name: 'delivery.refused.v1',
  envelope: {
    command_id: `refusal-${orderId}-${serverTime}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 9, actor: 'sera:custody', serverTime, version: 'v1',
  },
  payload: { order_id: orderId, task_id: `task-${orderId}`, ...payload },
});
const pickupRefusal = (orderId: string, serverTime: string, faultClass = 'seller') =>
  refusedEvent(orderId, serverTime, { rejection: 'pickup_refusal', fault_class: faultClass, failed_checks: ['item_mismatch'] });

const rejectedFor = (orderId: string) =>
  delivered.filter((d) => {
    const e = JSON.parse(d.body) as { name?: string; payload?: { orderId?: string } };
    return e.name === 'fulfillment.rejected.v1' && e.payload?.orderId === orderId;
  });

async function waitFor(check: () => boolean, timeoutMs = 12_000): Promise<void> {
  const started = Date.now();
  while (!check() && Date.now() - started < timeoutMs) await new Promise((r) => setTimeout(r, 50));
}

async function rowOf(orderId: string): Promise<Record<string, unknown> | undefined> {
  const list = await get('/fulfillment/orders');
  expect(list.status, list.text).toBe(200);
  return (list.json['orders'] as Record<string, unknown>[]).find((o) => o['orderId'] === orderId);
}
async function mineOf(code: string, orderId: string): Promise<Record<string, unknown> | undefined> {
  const mine = await get('/fulfillment/mine', `Bearer ${code}`);
  expect(mine.status, mine.text).toBe(200);
  return (mine.json['orders'] as Record<string, unknown>[]).find((o) => o['orderId'] === orderId);
}
const mint = async (supplierId: string) => {
  const m = await post('/fulfillment/supplier-code', { supplierId });
  expect(m.status, m.text).toBe(200);
  return m.json['code'] as string;
};

let codeA = '';
let codeB = '';

describe('F-02 — « Annuler et rembourser »: the founder refunds a paid order no supplier will serve', () => {
  it('sets the stage: two suppliers, their products, their paid orders', async () => {
    codeA = await mint(SUPPLIER_A);
    codeB = await mint(SUPPLIER_B);
    expect((await post('/offers', seed(PV_A, SUPPLIER_A, 20))).status).toBe(200);
    expect((await post('/offers', seed(PV_B, SUPPLIER_B, 5))).status).toBe(200);
    for (const id of ['ord-remb-01', 'ord-remb-02', 'ord-remb-03', 'ord-remb-06']) {
      expect((await confirmer(id, PV_A)).status).toBe(200);
    }
    expect((await confirmer('ord-remb-04', PV_B)).status).toBe(200);
    // A paid order for a product this platform cannot find: no supplier can
    // ever refuse it, so only his door can refund it.
    const orphelin = await confirmer('ord-remb-05', 'pv-jamais-liste');
    expect(orphelin.status, orphelin.text).toBe(200);
  });

  it('opens to HIS key only — never a supplier code, never the intake secret — and refuses a body it cannot read', async () => {
    for (const auth of [null, 'Bearer ', `Bearer ${codeA}`, `Bearer ${FULFILL_SECRET}`, `Bearer ${PROGRESS_SECRET}`]) {
      const r = await post('/fulfillment/order/annuler', { orderId: 'ord-remb-01' }, auth);
      expect(r.status, `${auth}`).toBe(401);
    }
    for (const body of [{}, { orderId: '' }, { orderId: 7 }, { orderId: 'ord-remb-01', cause: 'x' }]) {
      const r = await post('/fulfillment/order/annuler', body);
      expect(`${r.status} ${r.json['reason']}`, JSON.stringify(body)).toBe('400 malformed');
    }
    const inconnue = await post('/fulfillment/order/annuler', { orderId: 'ord-jamais-payee' });
    expect(`${inconnue.status} ${inconnue.json['reason']}`).toBe('404 unknown_order');
    expect(delivered.filter((d) => d.body.includes('fulfillment.rejected.v1'))).toHaveLength(0);
  });

  it('an order waiting on its supplier: cancelled, the canon refusal reaches Shop+ as its door reads it, and nothing more can happen to it', async () => {
    const ORDER = 'ord-remb-01';
    const r = await post('/fulfillment/order/annuler', { orderId: ORDER });
    expect(r.status, r.text).toBe(200);
    expect(r.json['status']).toBe('annulee');
    const at = r.json['refusedAt'] as string;
    expect(Number.isNaN(Date.parse(at))).toBe(false);

    await waitFor(() => rejectedFor(ORDER).length === 1);
    const sent = rejectedFor(ORDER);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.auth).toBe(`Bearer ${PROGRESS_SECRET}`);
    const event = PlatformEventSchema.safeParse(JSON.parse(sent[0]!.body));
    expect(event.success).toBe(true);
    const payload = FulfillmentProgressPayloadSchema.safeParse(event.success ? event.data.payload : null);
    expect(payload.success && payload.data).toEqual({ orderId: ORDER, at });
    // Who cancelled is Boutik+'s own business: it never rides to Shop+.
    expect(sent[0]!.body).not.toContain('fondateur');
    expect(sent[0]!.body).not.toContain(SUPPLIER_A);

    // His list and the supplier's list both say it was cancelled BY HIM.
    expect((await rowOf(ORDER))?.['fulfillment']).toEqual({ refusedAt: at, refusPar: 'fondateur' });
    expect((await mineOf(codeA, ORDER))?.['fulfillment']).toEqual({ refusedAt: at, refusPar: 'fondateur' });

    // Closed to every later act, by name.
    const accepte = await post('/fulfillment/accept', { orderId: ORDER }, `Bearer ${codeA}`);
    expect(`${accepte.status} ${accepte.json['reason']}`).toBe('409 refusee');

    // A repeat (a lost answer, a double tap) announces nothing new.
    const encore = await post('/fulfillment/order/annuler', { orderId: ORDER });
    expect(`${encore.status} ${encore.json['status']}`).toBe('200 already_refused');
    expect(encore.json['refusedAt']).toBe(at);
    const siennes = await post('/fulfillment/refuse', { orderId: ORDER }, `Bearer ${codeA}`);
    expect(siennes.json['status']).toBe('already_refused');
    await new Promise((res) => setTimeout(res, 300));
    expect(rejectedFor(ORDER)).toHaveLength(1);
  });

  it('an order he ACCEPTED but never made ready: cancellable too, and « prêt » is closed after it', async () => {
    const ORDER = 'ord-remb-02';
    expect((await post('/fulfillment/accept', { orderId: ORDER }, `Bearer ${codeA}`)).status).toBe(200);
    const r = await post('/fulfillment/order/annuler', { orderId: ORDER });
    expect(`${r.status} ${r.json['status']}`).toBe('200 annulee');
    const defi = await post('/fulfillment/ready/challenge', { orderId: ORDER }, `Bearer ${codeA}`);
    expect(`${defi.status} ${defi.json['reason']}`).toBe('409 refusee');
    await waitFor(() => rejectedFor(ORDER).length === 1);
    expect(rejectedFor(ORDER)).toHaveLength(1);
  });

  it('an order already READY is on Séra\'s road: refused by name, nothing announced', async () => {
    const ORDER = 'ord-remb-03';
    await pret(ORDER, PV_A, codeA);
    const r = await post('/fulfillment/order/annuler', { orderId: ORDER });
    expect(`${r.status} ${r.json['reason']}`).toBe('409 already_ready');
    expect((await rowOf(ORDER))?.['fulfillment']).not.toHaveProperty('refusedAt');
    await new Promise((res) => setTimeout(res, 300));
    expect(rejectedFor(ORDER)).toHaveLength(0);
  });

  it('his access CUT: the supplier\'s own door is closed, his is not — the buyer is refunded without giving him his code back', async () => {
    const ORDER = 'ord-remb-04';
    const cut = await post('/fulfillment/supplier-code/revoke', { supplierId: SUPPLIER_B });
    expect(cut.status, cut.text).toBe(200);
    expect((await post('/fulfillment/refuse', { orderId: ORDER }, `Bearer ${codeB}`)).status).toBe(401);
    const r = await post('/fulfillment/order/annuler', { orderId: ORDER });
    expect(`${r.status} ${r.json['status']}`).toBe('200 annulee');
    await waitFor(() => rejectedFor(ORDER).length === 1);
    expect(rejectedFor(ORDER)).toHaveLength(1);
    // Still cut: the refund did not reopen his door.
    const codes = await get('/fulfillment/supplier-codes');
    const rowB = (codes.json['codes'] as Record<string, unknown>[]).find((c) => c['supplierId'] === SUPPLIER_B);
    expect(typeof rowB?.['revokedAt']).toBe('string');
  });

  it('an order no supplier was ever found for: only his door can refund it, and it does', async () => {
    const ORDER = 'ord-remb-05';
    expect((await rowOf(ORDER))?.['supplierResolved']).toBe(false);
    const r = await post('/fulfillment/order/annuler', { orderId: ORDER });
    expect(`${r.status} ${r.json['status']}`).toBe('200 annulee');
    await waitFor(() => rejectedFor(ORDER).length === 1);
    expect(rejectedFor(ORDER)).toHaveLength(1);
  });

  it('an order the SUPPLIER refused: already refunding — his tap answers so, and the list keeps it as the supplier\'s refusal', async () => {
    const ORDER = 'ord-remb-06';
    const sienne = await post('/fulfillment/refuse', { orderId: ORDER }, `Bearer ${codeA}`);
    expect(sienne.json['status']).toBe('refused');
    const r = await post('/fulfillment/order/annuler', { orderId: ORDER });
    expect(`${r.status} ${r.json['status']}`).toBe('200 already_refused');
    expect((await rowOf(ORDER))?.['fulfillment']).toEqual({ refusedAt: sienne.json['refusedAt'] });
    await waitFor(() => rejectedFor(ORDER).length === 1);
    expect(rejectedFor(ORDER)).toHaveLength(1);
  });

  it('the code list says how many paid orders each supplier still has OPEN — cancelled and refused ones are not open', async () => {
    const codes = await get('/fulfillment/supplier-codes');
    expect(codes.status, codes.text).toBe(200);
    const of = (id: string) => (codes.json['codes'] as Record<string, unknown>[]).find((c) => c['supplierId'] === id);
    // A: 01 cancelled, 02 cancelled, 03 ready (open), 06 refused by him.
    expect(of(SUPPLIER_A)?.['commandesOuvertes']).toBe(1);
    expect(of(SUPPLIER_B)?.['commandesOuvertes']).toBe(0);
    // Never a code, never a hash, never an order id on this read.
    expect(codes.text).not.toContain(codeA);
    expect(codes.text).not.toContain('ord-remb-');
  });
});

describe('F-08 + F-61 — a rider\'s refusal at pickup is written on the order, and the founder\'s list carries every mark the book holds', () => {
  const PICK = 'ord-remb-11';
  const PICK_PROVIDER = 'ord-remb-12';
  const PICK_BAD_TIME = 'ord-remb-13';
  const DOOR = 'ord-remb-14';
  const LIVREE = 'ord-remb-15';

  it('sets the stage: five orders made ready and handed to the rider', async () => {
    for (const id of [PICK, PICK_PROVIDER, PICK_BAD_TIME, DOOR, LIVREE]) {
      expect((await confirmer(id, PV_A)).status).toBe(200);
      await pret(id, PV_A, codeA);
      RAMASSAGE[id] = `RMS-${id.slice(-2)}`;
      const v = await post('/fulfillment/ramassage/verify', { orderId: id, codeRamassage: RAMASSAGE[id] }, `Bearer ${codeA}`);
      expect(`${v.status} ${v.json['verdict']}`, v.text).toBe('200 confirme');
    }
    const row = await rowOf(PICK);
    const f = row?.['fulfillment'] as Record<string, unknown>;
    expect(typeof f['handedOverAt']).toBe('string');
    expect(typeof f['readyAt']).toBe('string');
  });

  it('pickup refused (seller fault): the mark is Séra\'s own instant, on both lists — and a redelivery never moves it', async () => {
    const r = await post('/fulfillment/delivery-refused', pickupRefusal(PICK, T1), `Bearer ${FULFILL_SECRET}`);
    expect(r.status, r.text).toBe(200);
    expect((await rowOf(PICK))?.['fulfillment']).toMatchObject({ pickupRefusedAt: T1 });
    expect((await mineOf(codeA, PICK))?.['fulfillment']).toMatchObject({ pickupRefusedAt: T1 });
    const again = await post('/fulfillment/delivery-refused', pickupRefusal(PICK, T2), `Bearer ${FULFILL_SECRET}`);
    expect(again.status, again.text).toBe(200);
    expect((await rowOf(PICK))?.['fulfillment']).toMatchObject({ pickupRefusedAt: T1 });
  });

  it('pickup refused on a provider fault: the unit comes home AND the mark is written — the two never depend on each other', async () => {
    const r = await post('/fulfillment/delivery-refused', pickupRefusal(PICK_PROVIDER, T1, 'provider'), `Bearer ${FULFILL_SECRET}`);
    expect(r.status, r.text).toBe(200);
    expect((await rowOf(PICK_PROVIDER))?.['fulfillment']).toMatchObject({ pickupRefusedAt: T1 });
  });

  it('an unreadable instant is never a reason to refuse the fact: 200, and the mark takes this Worker\'s clock', async () => {
    const r = await post('/fulfillment/delivery-refused', pickupRefusal(PICK_BAD_TIME, 'pas-une-date'), `Bearer ${FULFILL_SECRET}`);
    expect(r.status, r.text).toBe(200);
    const f = (await rowOf(PICK_BAD_TIME))?.['fulfillment'] as Record<string, unknown>;
    expect(Number.isNaN(Date.parse(f['pickupRefusedAt'] as string))).toBe(false);
  });

  it('a refusal at the buyer\'s DOOR is not a pickup refusal: no mark; the return is his own code, merged on the list', async () => {
    const r = await post(
      '/fulfillment/delivery-refused',
      refusedEvent(DOOR, T1, { family: 'return', reason_code: 'change_of_mind', fault_class: 'buyer', fee_retained: true }),
      `Bearer ${FULFILL_SECRET}`,
    );
    expect(r.status, r.text).toBe(200);
    expect((await rowOf(DOOR))?.['fulfillment']).not.toHaveProperty('pickupRefusedAt');
    RETOUR[DOOR] = 'RTR-14';
    const v = await post('/fulfillment/retour/verify', { orderId: DOOR, codeRetour: RETOUR[DOOR] }, `Bearer ${codeA}`);
    expect(`${v.status} ${v.json['verdict']}`, v.text).toBe('200 confirme');
    expect(typeof ((await rowOf(DOOR))?.['fulfillment'] as Record<string, unknown>)['returnedAt']).toBe('string');
  });

  it('a delivery reaches the founder\'s list from the book itself, not from another Worker\'s read', async () => {
    const d = await post(
      '/fulfillment/delivered',
      {
        name: 'delivery.validated.v1',
        envelope: {
          command_id: `delivered-${LIVREE}`, correlation_id: `corr-${LIVREE}`,
          aggregateVersion: 12, actor: 'sera:custody', serverTime: T2, version: 'v1',
        },
        payload: { order_id: LIVREE, task_id: `task-${LIVREE}`, result: 'validated', settlement_eligibility: true },
      },
      `Bearer ${FULFILL_SECRET}`,
    );
    expect(d.status, d.text).toBe(200);
    expect((await rowOf(LIVREE))?.['fulfillment']).toMatchObject({ deliveredAt: T2 });
  });

  it('a pickup refusal for an order this book never saw stays 200 unknown_order — never a wedge on the wire', async () => {
    const r = await post('/fulfillment/delivery-refused', pickupRefusal('ord-jamais-vue', T1), `Bearer ${FULFILL_SECRET}`);
    expect(`${r.status} ${r.json['status']}`).toBe('200 unknown_order');
  });

  it('none of the finished orders counts as open for the cut warning', async () => {
    const codes = await get('/fulfillment/supplier-codes');
    const a = (codes.json['codes'] as Record<string, unknown>[]).find((c) => c['supplierId'] === SUPPLIER_A);
    // Still only 03 (ready, never picked up): 11–13 were refused at pickup,
    // 14 came back, 15 was delivered.
    expect(a?.['commandesOuvertes']).toBe(1);
  });
});

describe('F-37 — « retirer » never destroys a refund notice Shop+ has not received yet', () => {
  const ORDER = 'ord-remb-21';

  it('refused while Shop+ is unreachable: retire answers 409 refus_en_attente and the order stays', async () => {
    expect((await confirmer(ORDER, PV_A)).status).toBe(200);
    storefrontDown = true;
    const refus = await post('/fulfillment/refuse', { orderId: ORDER }, `Bearer ${codeA}`);
    expect(refus.json['status']).toBe('refused');
    const retire = await post('/fulfillment/order/retirer', { orderId: ORDER });
    expect(`${retire.status} ${retire.json['reason']}`).toBe('409 refus_en_attente');
    expect(await rowOf(ORDER)).toBeDefined();
  });

  it('once the notice is delivered, the same retire goes through', async () => {
    storefrontDown = false;
    await waitFor(() => rejectedFor(ORDER).length === 1);
    expect(rejectedFor(ORDER)).toHaveLength(1);
    // The delivered row is written right after the answer — give it a beat.
    let retire = await post('/fulfillment/order/retirer', { orderId: ORDER });
    for (let i = 0; i < 40 && retire.status === 409; i++) {
      await new Promise((r) => setTimeout(r, 50));
      retire = await post('/fulfillment/order/retirer', { orderId: ORDER });
    }
    expect(`${retire.status} ${retire.json['status']}`).toBe('200 retire');
    expect(await rowOf(ORDER)).toBeUndefined();
  });
});

describe('F-33 — no product and no supplier vanishes while a buyer is paying for a unit', () => {
  const hold = (pv: string, reservationId: string) =>
    post('/fulfillment/stock-hold', { productVersionId: pv, reservationId, orderId: `ord-${reservationId}` }, `Bearer ${FULFILL_SECRET}`);
  const release = (pv: string, reservationId: string) =>
    post('/fulfillment/stock-hold/release', { productVersionId: pv, reservationId }, `Bearer ${FULFILL_SECRET}`);
  // The WHOLE inventory, not his list: a cut supplier's products leave his
  // list, and « nothing purged » must be read where they still are.
  const listed = async (supplierId: string) =>
    ((await get('/offers/inventaire')).json['items'] as Record<string, unknown>[] | undefined)
      ?.filter((i) => i['supplierId'] === supplierId).length ?? 0;

  it('delete: refused by name while a unit is held, done once it is released', async () => {
    await mint(SUPPLIER_C);
    expect((await post('/offers', seed(PV_C, SUPPLIER_C, 2))).status).toBe(200);
    expect((await hold(PV_C, 'res-c-1')).status).toBe(200);
    const del = { commandId: 'del-c-1', offerId: `offer-${PV_C}`, productVersionId: PV_C };
    const refused = await post('/offers/delete', del);
    expect(`${refused.status} ${refused.json['error']}`).toBe('409 unite_reservee');
    expect(await listed(SUPPLIER_C)).toBe(1);
    expect((await release(PV_C, 'res-c-1')).status).toBe(200);
    const done = await post('/offers/delete', { ...del, commandId: 'del-c-2' });
    expect(`${done.status} ${done.json['status']}`).toBe('200 deleted');
    expect(await listed(SUPPLIER_C)).toBe(0);
  });

  it('erase: refused by name while a unit is held, nothing purged; done once it is released', async () => {
    await mint(SUPPLIER_D);
    expect((await post('/offers', seed(PV_D, SUPPLIER_D, 2))).status).toBe(200);
    expect((await hold(PV_D, 'res-d-1')).status).toBe(200);
    expect((await post('/fulfillment/supplier-code/revoke', { supplierId: SUPPLIER_D })).status).toBe(200);
    const refused = await post('/fulfillment/supplier/effacer', { supplierId: SUPPLIER_D });
    expect(`${refused.status} ${refused.json['reason']}`).toBe('409 paiement_en_cours');
    // Nothing was purged: the erase below still finds his one product
    // (a cut supplier's products are off every list, so the proof is there).
    expect((await release(PV_D, 'res-d-1')).status).toBe(200);
    const done = await post('/fulfillment/supplier/effacer', { supplierId: SUPPLIER_D });
    expect(`${done.status} ${done.json['ok']} ${done.json['supprimes']}`, done.text).toBe('200 true 1');
  });
});
