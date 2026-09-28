import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * STOCK-VRAI-1 (AUDIT-B+2 slice 6) — THE SEAM, on REAL workerd through the
 * combined bundle, asking the ledgers (the stock journal, the order book, the
 * roads Shop+ reads) rather than believing any response.
 *
 * F-03 — the audit's own probe: 3 declared, one sold and not collected, « 3 »
 * typed at the count. Before, the count put that unit back on sale and the
 * later sales on units that did not exist were never flagged. Now the book's
 * waiting parcel is taken off, the counter says 2, and the sale past the real
 * stock carries the oversold mark. A parcel that left his hands (delivered,
 * refused by him, cancelled by the founder) is not taken off again.
 *
 * F-12 — an offer past its year: gone from both roads Shop+ reads, « Prolonger
 * d'un an » on HIS key, and it is back on both — same product version, same
 * money, the version one higher.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'stock-vrai-'));
const WRITE_SECRET = 'test-offer-write-secret-0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0001';
const OPS_SECRET = 'test-fulfillment-ops-secret-0001';
const READ_SECRET = 'test-supply-read-secret-0001';
const T0 = '2026-09-28T08:00:00.000Z';
const SUPPLIER = 'supplier-founder-001';
const DAY = 24 * 60 * 60 * 1000;

const produit = (id: string, name: string) => ({
  id,
  supplierId: SUPPLIER,
  version: 1,
  name,
  productCode: id.toUpperCase(),
  facts: {},
  category: 'fashion_bags_fabrics',
  zone: 'Gounghin',
  moderationState: 'approved',
  status: 'active',
  supplyMode: 'SELLER_HELD',
});

const seedCmd = (offerId: string, pv: string, available: number, effective: string, expiry: string) => ({
  commandId: `seed-${offerId}`,
  offerId,
  product: produit(pv, `Pagne ${offerId}`),
  draft: { productVersionId: pv, basePrice: 10_000, resellerCommission: 1_000, eligibleVariants: [], zones: [], effective, expiry },
  available,
  asOf: T0,
});

const PV_A = 'pv-stock-vrai-a';
const OFFER_A = 'offer-stock-vrai-a';
const PV_B = 'pv-stock-vrai-b';
const OFFER_B = 'offer-stock-vrai-b';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: {
    OFFER_WRITE_SECRET: WRITE_SECRET,
    FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    FULFILLMENT_OPS_SECRET: OPS_SECRET,
    SUPPLY_READ_SECRET: READ_SECRET,
  },
});
let supplierCode = '';

afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

async function post(path: string, body: unknown, auth: string | null = `Bearer ${OPS_SECRET}`) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth === null ? {} : { Authorization: auth }) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
async function get(path: string, auth: string | null = `Bearer ${OPS_SECRET}`) {
  const res = await mf.dispatchFetch(`http://o${path}`, { headers: auth === null ? {} : { Authorization: auth } });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function paid(orderId: string, pv: string) {
  return {
    name: 'order.confirmed.v1',
    envelope: { command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1' },
    payload: { orderId, productVersionId: pv, offerVersion: '1', paymentMode: 'FULL_PREPAY', paidAt: T0, zoneTo: 'Gounghin', sellerBasePrice: 10_000 },
  };
}
const payer = async (orderId: string, pv = PV_A) => {
  const r = await post('/fulfillment/order-confirmed', paid(orderId, pv), `Bearer ${FULFILL_SECRET}`);
  expect(r.status, JSON.stringify(r.json)).toBe(200);
};
const compter = (commandId: string, available: number, extra: Record<string, unknown> = {}) =>
  post('/offers/stock', { offerId: OFFER_A, commandId, available, ...extra });
const attente = async (offerId = OFFER_A) => get(`/offers/stock/attente?offerId=${offerId}`);
const journal = async () => (await get(`/offers/journal?offerId=${OFFER_A}`)).json as { available: number; rows: Record<string, unknown>[] };
async function ligneDuCarnet(orderId: string): Promise<Record<string, unknown> | undefined> {
  const r = await get('/fulfillment/orders');
  return (r.json['orders'] as Record<string, unknown>[]).find((o) => o['orderId'] === orderId);
}
const projection = async (pv: string) => get(`/supply-projection/${pv}`, `Bearer ${READ_SECRET}`);
async function collectionA(pv: string): Promise<boolean> {
  const r = await get('/supply-projections', `Bearer ${READ_SECRET}`);
  return (r.json['items'] as { value?: { productVersionId?: string } }[]).some((i) => i.value?.productVersionId === pv);
}
async function saLigne(pv: string) {
  const r = await get('/offers/mine', `Bearer ${supplierCode}`);
  return (r.json['items'] as Record<string, unknown>[]).find((i) => i['productVersionId'] === pv);
}

beforeAll(async () => {
  const minted = await post('/fulfillment/supplier-code', { supplierId: SUPPLIER });
  expect(minted.status).toBe(200);
  supplierCode = minted.json['code'] as string;
  expect((await post('/offers', seedCmd(OFFER_A, PV_A, 3, '2026-07-01T00:00:00.000Z', '2027-12-31T00:00:00.000Z'))).status).toBe(200);
  // B's year ended on 1 August: the founder's own date, long past.
  expect((await post('/offers', seedCmd(OFFER_B, PV_B, 2, '2025-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'))).status).toBe(200);
});

describe('F-03 — the count takes off the parcels still waiting for the rider (the audit probe, on the real worker)', () => {
  it('one sold, not collected: his count sheet says 1 is waiting, and « 3 » in hand keeps the counter at 2', async () => {
    await payer('ord-sv-a');
    expect((await journal()).available).toBe(2);
    const a = await attente();
    expect(a.status).toBe(200);
    expect(a.json).toEqual({ enAttente: 1 });
    const r = await compter('count-1', 3);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: 'confirmed', available: 2, compte: 3, enAttente: 1 });
    const j = await journal();
    expect(j.available).toBe(2);
    expect(j.rows.at(-1)).toMatchObject({ kind: 'confirme', from: 2, to: 2, compte: 3, enAttente: 1 });
  });

  it('two more sales take the last two units, and the fourth sale — past the real stock — carries the oversold mark', async () => {
    await payer('ord-sv-b');
    await payer('ord-sv-c');
    await payer('ord-sv-d');
    expect((await journal()).available).toBe(0);
    for (const id of ['ord-sv-a', 'ord-sv-b', 'ord-sv-c']) expect((await ligneDuCarnet(id))?.['oversold'], id).toBeUndefined();
    expect((await ligneDuCarnet('ord-sv-d'))?.['oversold'], 'the sale on a unit that did not exist went unflagged').toBe(true);
  });

  it('a parcel that left his hands is not taken off again: delivered, refused by him, cancelled by the founder', async () => {
    expect((await attente()).json).toEqual({ enAttente: 4 });
    const livre = await post(
      '/fulfillment/delivered',
      {
        name: 'delivery.validated.v1',
        envelope: { command_id: 'delivered-ord-sv-a', correlation_id: 'corr-ord-sv-a', aggregateVersion: 12, actor: 'sera:custody', serverTime: T0, version: 'v1' },
        payload: { order_id: 'ord-sv-a', task_id: 'task-ord-sv-a', result: 'validated', settlement_eligibility: true },
      },
      `Bearer ${FULFILL_SECRET}`,
    );
    expect(livre.status).toBe(200);
    expect((await post('/fulfillment/refuse', { orderId: 'ord-sv-b' }, `Bearer ${supplierCode}`)).status).toBe(200);
    expect((await post('/fulfillment/order/annuler', { orderId: 'ord-sv-c' })).status).toBe(200);
    // Only ord-sv-d is still a parcel in his hands.
    expect((await attente()).json).toEqual({ enAttente: 1 });
    const r = await compter('count-2', 4);
    expect(r.json).toMatchObject({ status: 'adjusted', available: 3, compte: 4, enAttente: 1 });
  });

  it('the waiting count comes from the book, never from the request: a caller sending « nothing is waiting » is ignored', async () => {
    const r = await compter('count-3', 4, { enAttente: [] });
    expect(r.json).toMatchObject({ available: 3, enAttente: 1 });
    const r2 = await compter('count-4', 4, { enAttente: ['ord-sv-a', 'ord-sv-b', 'ord-sv-c', 'ord-sv-d', 'ord-inventee'] });
    expect(r2.json).toMatchObject({ available: 3, enAttente: 1 });
  });

  it('an unknown offer answers 404 on both doors; a missing offer id 400', async () => {
    expect((await post('/offers/stock', { offerId: 'offer-jamais-vu', commandId: 'x', available: 1 })).status).toBe(404);
    expect((await attente('offer-jamais-vu')).status).toBe(404);
    expect((await get('/offers/stock/attente')).status).toBe(400);
    expect((await post('/offers/stock', { commandId: 'x', available: 1 })).status).toBe(400);
  });

  it('the count sheet door is HIS: the write key, Shop+’s intake key, the supplier’s code and no key answer 401', async () => {
    for (const auth of [`Bearer ${WRITE_SECRET}`, `Bearer ${FULFILL_SECRET}`, `Bearer ${supplierCode}`, 'Bearer wrong', null]) {
      expect((await get(`/offers/stock/attente?offerId=${OFFER_A}`, auth)).status, `attente with ${auth}`).toBe(401);
    }
  });
});

describe('F-12 — « Prolonger d’un an » brings a lapsed offer back on every road', () => {
  it('past its year: both roads Shop+ reads drop it, and his own list says why and when', async () => {
    const p = await projection(PV_B);
    expect(p.status).toBe(409);
    expect(p.json['reason']).toBe('offer_not_effective');
    expect(await collectionA(PV_B)).toBe(false);
    expect(await saLigne(PV_B)).toMatchObject({ hiddenReason: 'offer_not_effective', expiry: '2026-08-01T00:00:00.000Z' });
  });

  it('the doors are HIS: the write key, Shop+’s intake key, the supplier’s code and no key answer 401, and nothing moves', async () => {
    for (const auth of [`Bearer ${WRITE_SECRET}`, `Bearer ${FULFILL_SECRET}`, `Bearer ${supplierCode}`, 'Bearer wrong', null]) {
      expect((await post('/offers/prolonger', { offerId: OFFER_B, commandId: 'intrus' }, auth)).status, `prolonger with ${auth}`).toBe(401);
    }
    expect((await projection(PV_B)).status).toBe(409);
  });

  it('one press: a year from today, the same product version, the same money, the version one higher — and back on both roads', async () => {
    const avant = Date.now();
    const r = await post('/offers/prolonger', { offerId: OFFER_B, commandId: 'prolonge-1' });
    expect(r.status).toBe(200);
    expect(r.json['status']).toBe('prolonge');
    expect(r.json['version']).toBe(2);
    const fin = Date.parse(r.json['expiry'] as string);
    expect(fin).toBeGreaterThanOrEqual(avant + 365 * DAY - 1_000);
    expect(fin).toBeLessThanOrEqual(Date.now() + 365 * DAY + 1_000);

    const p = await projection(PV_B);
    expect(p.status).toBe(200);
    const v = p.json['value'] as Record<string, unknown>;
    expect(v).toMatchObject({ productVersionId: PV_B, offerVersion: '2', basePrice: 10_000, resellerCommission: 1_000, available: 2 });
    expect(await collectionA(PV_B)).toBe(true);
    const ligne = await saLigne(PV_B);
    expect(ligne?.['hiddenReason']).toBeUndefined();
    expect(ligne?.['expiry']).toBe(r.json['expiry']);
  });

  it('a retried press extends once; a second press extends a year after the CURRENT end', async () => {
    const premier = (await saLigne(PV_B))?.['expiry'] as string;
    const again = await post('/offers/prolonger', { offerId: OFFER_B, commandId: 'prolonge-1' });
    expect(again.json).toMatchObject({ status: 'idempotent', expiry: premier, version: 2 });
    const second = await post('/offers/prolonger', { offerId: OFFER_B, commandId: 'prolonge-2' });
    expect(second.json['version']).toBe(3);
    expect(second.json['expiry']).toBe(new Date(Date.parse(premier) + 365 * DAY).toISOString());
  });

  it('an unknown offer answers 404; a missing offer id or command id 400', async () => {
    expect((await post('/offers/prolonger', { offerId: 'offer-jamais-vu', commandId: 'p' })).status).toBe(404);
    expect((await post('/offers/prolonger', { commandId: 'p' })).status).toBe(400);
    expect((await post('/offers/prolonger', { offerId: OFFER_B })).status).toBe(400);
  });
});
