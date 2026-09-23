import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ COLIS-FOURNISSEUR-1 — BOUTIK+'S HALF, THROUGH THE REAL WORKER ═══
 *
 * Founder ruling 2026-09-23 (canon 3.20.0): one package and one delivery fee
 * per supplier inside a grouped payment. This file drives the deployed bundle
 * (dist/worker/worker.mjs) for the three things this service now does:
 *
 *   1. Shop+ asks which of a panier's products leave TOGETHER — the answer is
 *      groups of the asked product ids and nothing else (never a supplier),
 *      behind the supply-read credential Shop+ already holds, and past the
 *      app write-key gate (a POST that carries no write key must still land).
 *   2. The paid-order wire names the package; HIS list carries it.
 *   3. ONE code at the stall hands over the WHOLE colis; ONE return code takes
 *      back what came home — while a delivered article stays delivered.
 *
 * ⚠ THE SÉRA DOUBLE IS CONTRACT-CERTIFIED to Séra's intake doors (their bounds
 * are pinned by sera's own seams, including its COLIS seam: ANY article of a
 * package names its one course, so both answer the same verdict for either):
 * Bearer must be the intake secret or 401; string command_id/orderId/code or
 * 400; the answer is always `{ok:true, verdict}`.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const WRITE_SECRET = 'test-offer-write-secret-colis';
const FULFILL_SECRET = 'test-fulfillment-write-secret-colis';
const OPS_SECRET = 'test-fulfillment-ops-secret-colis';
const PROGRESS_SECRET = 'test-progress-write-secret-colis';
const SERA_SECRET = 'test-sera-intake-secret-colis';
const READ_SECRET = 'test-supply-read-secret-colis';
const T0 = '2026-09-23T08:00:00.000Z';
const SUPPLIER_A = 'supplier-colis-a';
const SUPPLIER_B = 'supplier-colis-b';
const PV1 = 'pv-colis-pagne';
const PV2 = 'pv-colis-sandales';
const PV3 = 'pv-colis-ailleurs';
const ORD1 = 'ord-colis-bk-1';
const ORD2 = 'ord-colis-bk-2';
const COLIS = { packageId: 'col-bk-1', orderIds: [ORD1, ORD2] };
/** The ONE course's codes, as Séra's book holds them for either article. */
const CODE_COURSE = 'KVN-38M';
const CODE_RETOUR = 'RTR-9QX';

const norm = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
let seraServer: Server;
let seraBase = '';

beforeAll(async () => {
  seraServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const door = req.url === '/intake/ramassage/verify' ? CODE_COURSE : req.url === '/intake/retour/verify' ? CODE_RETOUR : null;
      if (door === null) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, applied: true }));
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
      const verdict = COLIS.orderIds.includes(parsed['orderId']) && norm(parsed['code']) === norm(door) ? 'confirme' : 'non_confirme';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, verdict }));
    });
  });
  await new Promise<void>((resolve) => seraServer.listen(0, '127.0.0.1', resolve));
  seraBase = `http://127.0.0.1:${(seraServer.address() as AddressInfo).port}`;
});

const persist = mkdtempSync(join(tmpdir(), 'colis-bk-'));
let mf: Miniflare;

afterAll(async () => {
  await mf?.dispose();
  await new Promise<void>((resolve) => seraServer.close(() => resolve()));
  rmSync(persist, { recursive: true, force: true });
});

async function post(path: string, body: unknown, headers: Record<string, string>) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

const offre = (pv: string, supplierId: string, n: string, name: string) => ({
  commandId: `seed-colis-${n}`,
  offerId: `offer-colis-${n}`,
  product: {
    id: pv, supplierId, version: 1, name,
    productCode: `FASO-C${n}`, facts: {}, category: 'fashion_bags_fabrics',
    zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: pv, basePrice: 8_000, resellerCommission: 800,
    eligibleVariants: [], zones: [],
    effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 3,
  asOf: T0,
});

const paye = (orderId: string, pv: string, pkg?: typeof COLIS) => ({
  name: 'order.confirmed.v1',
  envelope: {
    command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
  },
  payload: {
    orderId, productVersionId: pv, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
    paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
    ...(pkg !== undefined ? { package: pkg } : {}),
  },
});

let codeA = '';

async function mine(code: string): Promise<Record<string, unknown>[]> {
  const res = await mf.dispatchFetch('http://o/fulfillment/mine', { headers: { Authorization: `Bearer ${code}` } });
  return ((await res.json()) as { orders?: Record<string, unknown>[] }).orders ?? [];
}

describe('COLIS-FOURNISSEUR-1 — Boutik+ groups a panier by supplier (never naming one), keeps the package, and moves the colis whole', () => {
  it('the grouping door: groups of the asked products, by supplier, unknown ones alone — behind the supply-read key, past the write gate, and not one supplier id in the answer', async () => {
    mf = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
      durableObjectsPersist: persist,
      bindings: {
        OFFER_WRITE_SECRET: WRITE_SECRET,
        FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
        FULFILLMENT_OPS_SECRET: OPS_SECRET,
        PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
        SUPPLY_READ_SECRET: READ_SECRET,
        SERA_INTAKE_BASE: seraBase,
        SERA_INTAKE_SECRET: SERA_SECRET,
      },
      serviceBindings: { STOREFRONT: async () => Response.json({ ok: true, status: 'recorded' }) },
    });
    codeA = (await post('/fulfillment/supplier-code', { supplierId: SUPPLIER_A }, { Authorization: `Bearer ${OPS_SECRET}` })).json['code'] as string;
    await post('/fulfillment/supplier-code', { supplierId: SUPPLIER_B }, { Authorization: `Bearer ${OPS_SECRET}` });
    for (const [pv, s, n, name] of [[PV1, SUPPLIER_A, '1', 'Pagne wax'], [PV2, SUPPLIER_A, '2', 'Sandales cuir'], [PV3, SUPPLIER_B, '3', 'Panier tressé']] as const) {
      const seeded = await post('/offers', offre(pv, s, n, name), { 'X-Write-Key': WRITE_SECRET });
      expect(seeded.status, seeded.text).toBe(200);
    }

    const ask = { productVersionIds: [PV1, PV3, PV2, 'pv-colis-inconnu'] };
    // No key, a wrong key, and the app's own write key: all refused.
    expect((await post('/supply-grouping', ask, {})).status).toBe(401);
    expect((await post('/supply-grouping', ask, { Authorization: 'Bearer faux' })).status).toBe(401);
    expect((await post('/supply-grouping', ask, { Authorization: `Bearer ${WRITE_SECRET}`, 'X-Write-Key': WRITE_SECRET })).status).toBe(401);
    // Not a question: one product, a product twice, an extra field.
    for (const bad of [{ productVersionIds: [PV1] }, { productVersionIds: [PV1, PV1] }, { ...ask, supplierId: SUPPLIER_A }]) {
      expect((await post('/supply-grouping', bad, { Authorization: `Bearer ${READ_SECRET}` })).status, JSON.stringify(bad)).toBe(400);
    }
    const answer = await post('/supply-grouping', ask, { Authorization: `Bearer ${READ_SECRET}` });
    expect(answer.status, answer.text).toBe(200);
    expect(answer.json).toEqual({ groups: [[PV1, PV2], [PV3], ['pv-colis-inconnu']] });
    for (const s of [SUPPLIER_A, SUPPLIER_B]) expect(answer.text.includes(s), `supplier ${s} leaked`).toBe(false);
    expect(Object.keys(answer.json)).toEqual(['groups']);
  });

  it('the paid-order wire names the package → his list carries it on both articles; one pickup code hands over the WHOLE colis; one return code takes back only what did not arrive', async () => {
    for (const [o, pv] of [[ORD1, PV1], [ORD2, PV2]] as const) {
      const r = await post('/fulfillment/order-confirmed', paye(o, pv, COLIS), { Authorization: `Bearer ${FULFILL_SECRET}` });
      expect(r.status, r.text).toBe(200);
    }
    // A wire naming a package this order is not in is not canonical.
    const faux = await post('/fulfillment/order-confirmed', paye('ord-colis-bk-9', PV1, { packageId: 'col-x', orderIds: ['ord-y', 'ord-z'] }), { Authorization: `Bearer ${FULFILL_SECRET}` });
    expect(faux.status).toBe(400);

    let lignes = await mine(codeA);
    for (const o of [ORD1, ORD2]) {
      expect(lignes.find((l) => l['orderId'] === o)?.['colis'], o).toEqual(COLIS);
    }

    // Ready both (one photo, one confirmation per order under it — B6.2).
    for (const [o, pv] of [[ORD1, PV1], [ORD2, PV2]] as const) {
      expect((await post('/fulfillment/accept', { orderId: o }, { Authorization: `Bearer ${codeA}` })).json['ok']).toBe(true);
      const ch = await post('/fulfillment/ready/challenge', { orderId: o }, { Authorization: `Bearer ${codeA}` });
      expect(ch.json['ok'], ch.text).toBe(true);
      const ready = await post('/fulfillment/ready', {
        orderId: o,
        photoRef: { ref: 'media/readiness/colis-bk-1', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
        readinessChallenge: ch.json['challenge'], qty: 1, variant: pv, availableConfirmed: true, at: T0,
      }, { Authorization: `Bearer ${codeA}` });
      expect(ready.json['ok'], ready.text).toBe(true);
    }

    // ONE code at the stall, typed on EITHER article's card: both leave.
    const pris = await post('/fulfillment/ramassage/verify', { orderId: ORD2, codeRamassage: 'kvn 38m' }, { Authorization: `Bearer ${codeA}` });
    expect(pris.json).toEqual({ ok: true, verdict: 'confirme' });
    lignes = await mine(codeA);
    for (const o of [ORD1, ORD2]) {
      expect((lignes.find((l) => l['orderId'] === o)?.['fulfillment'] as Record<string, unknown>)['handedOverAt'], `${o} handed over`).toEqual(expect.any(String));
    }

    // The buyer kept the pagne (Séra's delivery reaches this book through Shop+)…
    const livre = await post('/fulfillment/delivered', {
      name: 'delivery.validated.v1',
      envelope: { command_id: `eligibility-${ORD1}`, correlation_id: `corr-${ORD1}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-09-23T12:00:00.000Z', version: '1' },
      payload: { order_id: ORD1, task_id: `task-${ORD1}`, validation_id: `val-${ORD1}`, result: 'validated', settlement_eligibility: true, supplier_ref: SUPPLIER_A },
    }, { Authorization: `Bearer ${FULFILL_SECRET}` });
    expect(livre.status, livre.text).toBe(200);

    // …and refused the sandals: the return code, typed on the PAGNE's card,
    // takes back ONLY the sandals — the delivered pagne stays delivered.
    const rendu = await post('/fulfillment/retour/verify', { orderId: ORD1, codeRetour: CODE_RETOUR }, { Authorization: `Bearer ${codeA}` });
    expect(rendu.json).toEqual({ ok: true, verdict: 'confirme' });
    lignes = await mine(codeA);
    const pagne = lignes.find((l) => l['orderId'] === ORD1)?.['fulfillment'] as Record<string, unknown>;
    const sandales = lignes.find((l) => l['orderId'] === ORD2)?.['fulfillment'] as Record<string, unknown>;
    expect(sandales['returnedAt'], 'the refused article came back').toEqual(expect.any(String));
    expect(pagne['deliveredAt'], 'the kept article stays delivered').toEqual(expect.any(String));
  });

  it('⚠ another supplier’s code never moves this colis — the book proves ownership before Séra is asked', async () => {
    const codeB = (await post('/fulfillment/supplier-code', { supplierId: SUPPLIER_B }, { Authorization: `Bearer ${OPS_SECRET}` })).json['code'] as string;
    const vol = await post('/fulfillment/ramassage/verify', { orderId: ORD1, codeRamassage: CODE_COURSE }, { Authorization: `Bearer ${codeB}` });
    expect(vol.status).toBe(404);
    expect((await mine(codeB)).some((l) => l['orderId'] === ORD1 || l['orderId'] === ORD2)).toBe(false);
  });
});
