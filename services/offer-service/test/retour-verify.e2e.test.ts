import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ RETOUR-VERIFY — the supplier's RETURN door, through the REAL Worker ═══
 *
 * RETOUR-VIVANT-1 (Séra SE6.2, the supplier's half). The buyer refused; the
 * coursier brings the sealed colis back and says the RETURN code his app
 * shows; the supplier types it on his own console. This Worker proves the
 * order is his and only then asks Séra — server-side, over the intake secret
 * no browser holds — and relays the verdict. A `confirme` is the supplier
 * accepting the colis back: it marks `returnedAt` on his own list (the row
 * leaves « En route »), and NOTHING else — custody moves on the coursier's
 * two-key act on Séra, never on this door.
 *
 * ⚠ THE DOUBLE IS CONTRACT-CERTIFIED to Séra's actual door (sera:
 * services/logistics-service, `POST /intake/retour/verify`, pinned by that
 * repo's cross-Worker seam test): Bearer must be the intake secret or 401;
 * body must carry string command_id/orderId/code or 400; the answer is
 * ALWAYS `{ok:true, verdict:'confirme'|'non_confirme'}` — case and
 * separators forgiven on the code, characters not; an order with no return
 * open answers `non_confirme`; never an oracle.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const WRITE_SECRET = 'test-offer-write-secret-0021';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0021';
const OPS_SECRET = 'test-fulfillment-ops-secret-0021';
const PROGRESS_SECRET = 'test-progress-write-secret-0021';
const SERA_SECRET = 'test-sera-intake-secret-0021';
const T0 = '2026-09-17T08:00:00.000Z';
const PV = 'pv-retv-001';
const SUPPLIER_A = 'supplier-retv-001';
const SUPPLIER_B = 'supplier-retv-002';
const ORDER = 'ord-retv-0001';

/** What each course's RETURN code IS, as Séra's book would hold it — and
 *  the ramassage code beside it, so the two doors can be told apart. */
const codesRetour: Record<string, string> = { [ORDER]: 'RTR-K7M' };
const codesRamassage: Record<string, string> = { [ORDER]: 'KVN-38M' };
const retourPosts: { auth: string | null; body: string }[] = [];
const ramassagePosts: string[] = [];
let seraMode: 'ok' | 'down' | 'garbage' = 'ok';
let seraServer: Server;
let seraBase = '';

const norm = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

beforeAll(async () => {
  seraServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (req.url === '/intake/ramassage/verify') {
        ramassagePosts.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, verdict: 'non_confirme' }));
        return;
      }
      if (req.url !== '/intake/retour/verify') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, applied: true }));
        return;
      }
      retourPosts.push({ auth: req.headers['authorization'] ?? null, body });
      if (seraMode === 'down') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
        return;
      }
      if (seraMode === 'garbage') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('<html>not json</html>');
        return;
      }
      if (req.headers['authorization'] !== `Bearer ${SERA_SECRET}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* malformed */ }
      const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
      if (parsed === null || !isStr(parsed['command_id']) || !isStr(parsed['orderId']) || !isStr(parsed['code'])) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'malformed' }));
        return;
      }
      const attendu = codesRetour[parsed['orderId']];
      const verdict = attendu !== undefined && norm(parsed['code']) === norm(attendu) ? 'confirme' : 'non_confirme';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, verdict }));
    });
  });
  await new Promise<void>((resolve) => seraServer.listen(0, '127.0.0.1', resolve));
  seraBase = `http://127.0.0.1:${(seraServer.address() as AddressInfo).port}`;
});

const persist = mkdtempSync(join(tmpdir(), 'retv-'));
const persistUnwired = mkdtempSync(join(tmpdir(), 'retv-unwired-'));
let mf: Miniflare;
let unwired: Miniflare;
let codeA = '';
let codeB = '';

function makeMf(persistDir: string, wired: boolean): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persistDir,
    bindings: {
      OFFER_WRITE_SECRET: WRITE_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      ...(wired ? { SERA_INTAKE_BASE: seraBase, SERA_INTAKE_SECRET: SERA_SECRET } : {}),
    },
    serviceBindings: {
      STOREFRONT: async () => Response.json({ ok: true, status: 'recorded' }),
    },
  });
}

afterAll(async () => {
  await mf?.dispose();
  await unwired?.dispose();
  await new Promise<void>((resolve) => seraServer.close(() => resolve()));
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistUnwired, { recursive: true, force: true });
});

async function post(m: Miniflare, path: string, body: unknown, headers: Record<string, string>) {
  const res = await m.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

const verifier = (m: Miniflare, bearer: string, orderId: string, dit: string) =>
  post(m, '/fulfillment/retour/verify', { orderId, codeRetour: dit }, {
    ...(bearer === '' ? {} : { Authorization: `Bearer ${bearer}` }),
  });

const mine = async (m: Miniflare, code: string) => {
  const res = await m.dispatchFetch('http://o/fulfillment/mine', { headers: { Authorization: `Bearer ${code}` } });
  const body = (await res.json()) as { orders?: Record<string, unknown>[] };
  return body.orders ?? [];
};

async function seedWorld(m: Miniflare): Promise<{ a: string; b: string }> {
  const a = (await post(m, '/fulfillment/supplier-code', { supplierId: SUPPLIER_A }, {
    Authorization: `Bearer ${OPS_SECRET}`,
  })).json['code'] as string;
  const b = (await post(m, '/fulfillment/supplier-code', { supplierId: SUPPLIER_B }, {
    Authorization: `Bearer ${OPS_SECRET}`,
  })).json['code'] as string;
  expect((await post(m, '/offers', {
    commandId: 'seed-retv-1',
    offerId: 'offer-retv-1',
    product: {
      id: PV, supplierId: SUPPLIER_A, version: 1, name: 'Bogolan teint (retour)',
      productCode: 'FASO-0043', facts: {}, category: 'fashion_bags_fabrics',
      zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: PV, basePrice: 8_000, resellerCommission: 800,
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 3,
    asOf: T0,
  }, { Authorization: `Bearer ${OPS_SECRET}` })).status).toBe(200);
  const confirmed = await post(m, '/fulfillment/order-confirmed', {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: `ord-confirm-${ORDER}`, correlation_id: `corr-${ORDER}`,
      aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
    },
    payload: {
      orderId: ORDER, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
      paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
    },
  }, { Authorization: `Bearer ${FULFILL_SECRET}` });
  expect(confirmed.status, confirmed.text).toBe(200);
  return { a, b };
}

describe('the supplier’s RETURN door proves the order is HIS, asks Séra’s return door, and relays only the verdict', () => {
  it('his own order + the said code → Séra’s RETURN door (never the ramassage one) is asked with the intake bearer and exactly {code, command_id, orderId}; both verdicts come back verbatim', async () => {
    mf = makeMf(persist, true);
    unwired = makeMf(persistUnwired, false);
    const codes = await seedWorld(mf);
    codeA = codes.a;
    codeB = codes.b;
    seraMode = 'ok';
    retourPosts.length = 0;
    ramassagePosts.length = 0;

    // said correctly — lowercase, spaced: Séra's own normalisation forgives it
    const bon = await verifier(mf, codeA, ORDER, 'rtr k7m');
    expect(bon.status, bon.text).toBe(200);
    expect(bon.json).toEqual({ ok: true, verdict: 'confirme' });
    // said wrong — and the RAMASSAGE code is wrong at this door: two codes,
    // two doors, never confusable
    const faux = await verifier(mf, codeA, ORDER, codesRamassage[ORDER]!);
    expect(faux.json).toEqual({ ok: true, verdict: 'non_confirme' });

    expect(retourPosts).toHaveLength(2);
    expect(ramassagePosts, 'the return check must never ride the ramassage door').toHaveLength(0);
    const sent = retourPosts[0]!;
    expect(sent.auth).toBe(`Bearer ${SERA_SECRET}`);
    const fact = JSON.parse(sent.body) as Record<string, unknown>;
    expect(Object.keys(fact).sort()).toEqual(['code', 'command_id', 'orderId']);
    expect(fact['orderId']).toBe(ORDER);
    expect(fact['code']).toBe('rtr k7m');
    expect(fact['command_id']).toBe(`cmd-boutik-retour-${ORDER}-RTRK7M`);
  });

  it('⚠ the supplier’s PERSONAL code never crosses to Séra — not in any byte of any relay', () => {
    for (const p of retourPosts) {
      expect(p.body.includes(codeA), 'personal code A leaked to Séra').toBe(false);
      expect(p.body.includes(codeB), 'personal code B leaked to Séra').toBe(false);
      expect(p.auth?.includes(codeA), 'personal code as bearer to Séra').toBe(false);
    }
  });

  it('a CONFIRMED return code marks `returnedAt` on HIS list, first-wins — and a non-confirmed one marks nothing', async () => {
    const row = (await mine(mf, codeA)).find((o) => o['orderId'] === ORDER);
    const marks = row?.['fulfillment'] as Record<string, unknown>;
    expect(marks['returnedAt'], 'a confirmed return code must mark the return').toEqual(expect.any(String));
    expect(marks['handedOverAt'], 'the return door never writes the handover mark').toBeUndefined();
    expect(marks['deliveredAt']).toBeUndefined();
    const first = marks['returnedAt'];
    // a second confirmation keeps the first clock
    expect((await verifier(mf, codeA, ORDER, 'RTR-K7M')).json).toEqual({ ok: true, verdict: 'confirme' });
    const again = (await mine(mf, codeA)).find((o) => o['orderId'] === ORDER);
    expect((again?.['fulfillment'] as Record<string, unknown>)['returnedAt']).toBe(first);
  });

  it('a FOREIGN order answers not_yours_or_unknown — and Séra is never even asked', async () => {
    const avant = retourPosts.length;
    const vol = await verifier(mf, codeB, ORDER, 'RTR-K7M');
    expect(vol.status).toBe(404);
    expect(vol.json).toEqual({ ok: false, reason: 'not_yours_or_unknown' });
    const inconnu = await verifier(mf, codeA, 'ord-retv-jamais', 'RTR-K7M');
    expect(inconnu.status).toBe(404);
    expect(inconnu.json).toEqual({ ok: false, reason: 'not_yours_or_unknown' });
    expect(retourPosts.length, 'ownership is proven BEFORE Séra is asked').toBe(avant);
  });

  it('every wrong credential is the one uniform 401, and none of them reach Séra', async () => {
    const avant = retourPosts.length;
    for (const bearer of ['', 'BF-WRNG-WRNG-WRNG-WRNG', WRITE_SECRET, OPS_SECRET, FULFILL_SECRET, SERA_SECRET]) {
      const res = await verifier(mf, bearer, ORDER, 'RTR-K7M');
      expect(res.status, bearer === '' ? '(none)' : bearer).toBe(401);
    }
    expect(retourPosts.length).toBe(avant);
  });

  it('a malformed ask is refused at THIS door: no code, a blank one, an overlong one, a smuggled extra field, the ramassage field name', async () => {
    const avant = retourPosts.length;
    const arms: unknown[] = [
      { orderId: ORDER },
      { orderId: ORDER, codeRetour: '   ' },
      { orderId: ORDER, codeRetour: 'A'.repeat(33) },
      { orderId: ORDER, codeRetour: 'RTR-K7M', extra: 'non' },
      { orderId: ORDER, codeRamassage: 'RTR-K7M' },
    ];
    for (const body of arms) {
      const res = await post(mf, '/fulfillment/retour/verify', body, { Authorization: `Bearer ${codeA}` });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json).toEqual({ ok: false, reason: 'malformed' });
    }
    expect(retourPosts.length).toBe(avant);
  });

  it('an unreachable Séra is NEVER dressed as a verdict — down, garbage, and unwired all answer sera_unreachable', async () => {
    seraMode = 'down';
    const down = await verifier(mf, codeA, ORDER, 'RTR-K7M');
    expect(down.status).toBe(503);
    expect(down.json).toEqual({ ok: false, reason: 'sera_unreachable' });

    seraMode = 'garbage';
    const garbage = await verifier(mf, codeA, ORDER, 'RTR-K7M');
    expect(garbage.status).toBe(503);
    expect(garbage.json).toEqual({ ok: false, reason: 'sera_unreachable' });
    seraMode = 'ok';

    const codesUnwired = await seedWorld(unwired);
    const jamais = await verifier(unwired, codesUnwired.a, ORDER, 'RTR-K7M');
    expect(jamais.status).toBe(503);
    expect(jamais.json).toEqual({ ok: false, reason: 'sera_unreachable' });
  });
});
