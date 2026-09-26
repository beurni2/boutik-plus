import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ B5.1 (RESERVATION-FOURNISSEUR-1) — THE SEAM, on REAL workerd ═══
 *
 * Plan B5.1: « Reserve/release atomic; no negative; concurrency test. » Spec
 * acceptance: « concurrent reservation cannot oversell ». Founder ruling
 * 2026-09-17: a PRIVATE door on Shop+'s intake credential.
 *
 * This suite drives the two doors Shop+ will call — `POST /fulfillment/
 * stock-hold` and `…/stock-hold/release` — then asks the LEDGER (the
 * projection Shop+ reads, the founder's list, the journal) rather than
 * believing the answer. The hold is converted by the REAL confirmed-order
 * intake (the wire Shop+ already emits). The concurrency proof runs on the
 * runtime's own input gate: twenty holds on one unit, one winner.
 *
 * THIS SUITE IS ALSO THE CONTRACT the Shop+ double is certified against
 * (`offerDouble` in the Shop+ Worker's `test/regle-helpers.ts`): every
 * answer shape asserted here is the shape the double must emit, byte for
 * byte.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const WRITE_SECRET = 'test-offer-write-secret-0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0001';
const OPS_SECRET = 'test-fulfillment-ops-secret-0001';
const READ_SECRET = 'test-supply-read-secret-0001';
const T0 = '2026-09-18T08:00:00.000Z';

function makeMf(persistDir: string, extra: Record<string, string> = {}): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persistDir,
    bindings: {
      OFFER_WRITE_SECRET: WRITE_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
      SUPPLY_READ_SECRET: READ_SECRET,
      ...extra,
    },
  });
}

const persist = mkdtempSync(join(tmpdir(), 'stock-hold-'));
const persistTtl = mkdtempSync(join(tmpdir(), 'stock-hold-ttl-'));
const mf = makeMf(persist);
// A second Worker with the hold expiry lowered to ONE SECOND, for the expiry
// case alone — the main flow must never race its own holds against a clock.
const mfTtl = makeMf(persistTtl, { STOCK_HOLD_TTL_MS: '1000' });
afterAll(async () => {
  await mf.dispose();
  await mfTtl.dispose();
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistTtl, { recursive: true, force: true });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let supplierCode = '';

function seedFor(pv: string, offerId: string, available: number) {
  return {
    commandId: `seed-${offerId}`,
    offerId,
    product: {
      id: pv,
      supplierId: 'supplier-founder-001',
      version: 1,
      name: 'Pagne tissé (hold e2e)',
      productCode: `SH-${offerId}`.slice(0, 20),
      facts: {},
      category: 'fashion_bags_fabrics',
      zone: 'Gounghin',
      moderationState: 'approved',
      status: 'active',
      supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: pv,
      basePrice: 10_000,
      resellerCommission: 1_000,
      eligibleVariants: [],
      zones: [],
      effective: '2026-07-10T00:00:00.000Z',
      expiry: '2026-12-31T00:00:00.000Z',
    },
    available,
    asOf: T0,
  };
}

async function seed(inst: Miniflare, pv: string, offerId: string, available: number): Promise<void> {
  if (supplierCode === '' || inst !== mf) {
    const minted = await inst.dispatchFetch('http://o/fulfillment/supplier-code', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: 'supplier-founder-001' }),
    });
    if (minted.status !== 200) throw new Error(`mint: ${minted.status} ${await minted.text()}`);
    if (inst === mf) supplierCode = ((await minted.json()) as { code: string }).code;
  }
  const res = await inst.dispatchFetch('http://o/offers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(seedFor(pv, offerId, available)),
  });
  if (res.status !== 200) throw new Error(`seed: ${res.status} ${await res.text()}`);
}

async function hold(inst: Miniflare, body: unknown, auth: string | null = `Bearer ${FULFILL_SECRET}`) {
  const res = await inst.dispatchFetch('http://o/fulfillment/stock-hold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth === null ? {} : { Authorization: auth }) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function release(inst: Miniflare, body: unknown, auth: string | null = `Bearer ${FULFILL_SECRET}`) {
  const res = await inst.dispatchFetch('http://o/fulfillment/stock-hold/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth === null ? {} : { Authorization: auth }) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** The road Shop+ joins on every buyer read — the NET availability. */
async function projection(inst: Miniflare, pv: string) {
  const res = await inst.dispatchFetch(`http://o/supply-projection/${pv}`, { headers: { Authorization: `Bearer ${READ_SECRET}` } });
  return { status: res.status, json: (await res.json()) as { value?: { available?: number }; reason?: string } };
}

async function journal(offerId: string) {
  const res = await mf.dispatchFetch(`http://o/offers/journal?offerId=${offerId}`, { headers: { Authorization: `Bearer ${OPS_SECRET}` } });
  return (await res.json()) as { available?: number; rows?: { seq: number; kind: string; from: number; to: number; orderId?: string }[] };
}

function confirmedEvent(orderId: string, pv: string) {
  return {
    name: 'order.confirmed.v1',
    envelope: { command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1' },
    payload: { orderId, productVersionId: pv, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY', paidAt: T0, zoneTo: 'Gounghin Sud, Ouagadougou', sellerBasePrice: 10_000 },
  };
}

async function postIntake(orderId: string, pv: string) {
  const res = await mf.dispatchFetch('http://o/fulfillment/order-confirmed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
    body: JSON.stringify(confirmedEvent(orderId, pv)),
  });
  return res.status;
}

const PV = 'pv-hold-001';
const OFFER = 'offer-hold-001';

describe('THE DOORS ARE SHOP+’S — the intake credential alone opens them', () => {
  it('write key, ops key, wrong key, no key ⇒ 401 on both doors; nothing is held', async () => {
    await seed(mf, PV, OFFER, 1);
    for (const auth of [`Bearer ${WRITE_SECRET}`, `Bearer ${OPS_SECRET}`, 'Bearer wrong', null]) {
      expect((await hold(mf, { productVersionId: PV, reservationId: 'res-intrus', orderId: 'ord-intrus' }, auth)).status, `hold ${auth}`).toBe(401);
      expect((await release(mf, { productVersionId: PV, reservationId: 'res-intrus' }, auth)).status, `release ${auth}`).toBe(401);
    }
    expect((await projection(mf, PV)).json.value?.available).toBe(1);
  });

  it('malformed asks are refused by name; an unknown product is 404', async () => {
    expect((await hold(mf, { reservationId: 'r', orderId: 'o' })).status).toBe(400);
    expect((await hold(mf, { productVersionId: PV, orderId: 'o' })).status).toBe(400);
    expect((await hold(mf, { productVersionId: PV, reservationId: 'r' })).status).toBe(400);
    expect((await hold(mf, { productVersionId: 'pv-jamais-vu', reservationId: 'r', orderId: 'o' })).status).toBe(404);
    expect((await release(mf, { productVersionId: 'pv-jamais-vu', reservationId: 'r' })).status).toBe(404);
  });
});

describe('THE HOLD — one unit set aside, seen by every reader, given back or consumed', () => {
  it('held: the LAST unit disappears from the projection and his list; the journal writes nothing (a hold is not a movement)', async () => {
    const a = await hold(mf, { productVersionId: PV, reservationId: 'res-a', orderId: 'ord-a' });
    expect(a.status, JSON.stringify(a.json)).toBe(200);
    expect(a.json['status']).toBe('held');
    expect(a.json['reservationId']).toBe('res-a');
    expect(a.json['available']).toBe(0);
    expect(Date.parse(String(a.json['expiresAt']))).toBeGreaterThan(Date.now());
    expect((await projection(mf, PV)).json.value?.available).toBe(0);
    const mine = await mf.dispatchFetch('http://o/offers/mine', { headers: { Authorization: `Bearer ${supplierCode}` } });
    const row = ((await mine.json()) as { items: { productVersionId: string; available: number }[] }).items.find((i) => i.productVersionId === PV);
    expect(row?.available).toBe(0);
    const j = await journal(OFFER);
    expect(j.rows!.map((r) => r.kind)).toEqual(['declare']);
    // The journal describes the PHYSICAL counter (a hold is not a movement), so
    // its read says 1 while every selling road says 0 — the two are different
    // truths, both stated.
    expect(j.available).toBe(1);
  });

  it('a second buyer asking for the held unit is refused BY NAME — 409 insufficient_stock, net 0', async () => {
    const b = await hold(mf, { productVersionId: PV, reservationId: 'res-b', orderId: 'ord-b' });
    expect(b.status).toBe(409);
    expect(b.json).toEqual({ error: 'insufficient_stock', available: 0 });
  });

  it('the SAME reservation asked again (the at-least-once wire) is idempotent — same expiry, nothing moved', async () => {
    const first = await hold(mf, { productVersionId: PV, reservationId: 'res-a', orderId: 'ord-a' });
    expect(first.json['status']).toBe('idempotent');
    expect((await projection(mf, PV)).json.value?.available).toBe(0);
  });

  it('released: the unit is back on the projection; releasing again is idempotent', async () => {
    const r = await release(mf, { productVersionId: PV, reservationId: 'res-a', reason: 'payment_failed' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: 'released', available: 1 });
    expect((await projection(mf, PV)).json.value?.available).toBe(1);
    expect((await release(mf, { productVersionId: PV, reservationId: 'res-a', reason: 'payment_failed' })).json).toEqual({ status: 'idempotent', available: 1 });
  });

  it('CONSUMED: the confirmed order (REAL intake) that named this hold takes the unit — counter 1 → 0, the hold gone; the redelivery moves nothing', async () => {
    const b = await hold(mf, { productVersionId: PV, reservationId: 'res-b', orderId: 'ord-b' });
    expect(b.json['status']).toBe('held');
    expect((await projection(mf, PV)).json.value?.available).toBe(0);
    expect(await postIntake('ord-b', PV)).toBe(200);
    const j = await journal(OFFER);
    expect(j.rows!.map((r) => [r.seq, r.kind, r.from, r.to])).toEqual([[1, 'declare', 0, 1], [2, 'vendu', 1, 0]]);
    expect(j.rows![1]!.orderId).toBe('ord-b');
    expect(j.available).toBe(0);
    expect((await projection(mf, PV)).json.value?.available).toBe(0);
    // the hold is gone: releasing it now is « nothing to release » (a stale
    // hold left on top of the consumed unit would answer `released` here)
    expect((await release(mf, { productVersionId: PV, reservationId: 'res-b', reason: 'cancelled' })).json['status']).toBe('idempotent');
    expect(await postIntake('ord-b', PV)).toBe(200);
    expect((await journal(OFFER)).rows).toHaveLength(2);
  });

  it('HER OWN hold under a NEW reservation id (Shop+’s two-minute slot died, she reserved again): re-keyed, never refused to her, never counted twice — and the sale still finds it', async () => {
    await seed(mf, 'pv-hold-rekey', 'offer-hold-rekey', 1);
    expect((await hold(mf, { productVersionId: 'pv-hold-rekey', reservationId: 'res-k1', orderId: 'ord-k' })).json['status']).toBe('held');
    const again = await hold(mf, { productVersionId: 'pv-hold-rekey', reservationId: 'res-k2', orderId: 'ord-k' });
    expect(again.status, JSON.stringify(again.json)).toBe(200);
    expect(again.json['status']).toBe('held');
    expect(again.json['available']).toBe(0);
    expect((await projection(mf, 'pv-hold-rekey')).json.value?.available).toBe(0);
    // another buyer is still refused; her OLD id now releases nothing
    expect((await hold(mf, { productVersionId: 'pv-hold-rekey', reservationId: 'res-other', orderId: 'ord-other' })).status).toBe(409);
    expect((await release(mf, { productVersionId: 'pv-hold-rekey', reservationId: 'res-k1', reason: 'payment_failed' })).json).toEqual({ status: 'idempotent', available: 0 });
    // the confirmed sale finds the hold by its ORDER id, whichever reservation id it wears
    expect(await postIntake('ord-k', 'pv-hold-rekey')).toBe(200);
    expect((await journal('offer-hold-rekey')).rows!.map((r) => [r.kind, r.from, r.to])).toEqual([['declare', 0, 1], ['vendu', 1, 0]]);
    expect((await release(mf, { productVersionId: 'pv-hold-rekey', reservationId: 'res-k2', reason: 'cancelled' })).json['status']).toBe('idempotent');
  });

  it('a sale that never held (an older flow) consumes exactly as before this slice', async () => {
    await seed(mf, 'pv-hold-legacy', 'offer-hold-legacy', 2);
    expect(await postIntake('ord-legacy', 'pv-hold-legacy')).toBe(200);
    const j = await journal('offer-hold-legacy');
    expect(j.rows!.map((r) => [r.kind, r.from, r.to])).toEqual([['declare', 0, 2], ['vendu', 2, 1]]);
    expect((await projection(mf, 'pv-hold-legacy')).json.value?.available).toBe(1);
  });

  it('a hold whose order confirms AFTER a fresh hold by someone else: each consume takes its OWN unit, the net never lies', async () => {
    await seed(mf, 'pv-hold-two', 'offer-hold-two', 2);
    expect((await hold(mf, { productVersionId: 'pv-hold-two', reservationId: 'res-x', orderId: 'ord-x' })).json['available']).toBe(1);
    expect((await hold(mf, { productVersionId: 'pv-hold-two', reservationId: 'res-y', orderId: 'ord-y' })).json['available']).toBe(0);
    expect((await projection(mf, 'pv-hold-two')).json.value?.available).toBe(0);
    expect(await postIntake('ord-y', 'pv-hold-two')).toBe(200);
    // counter 2 → 1, one hold (x) still live: net 0
    expect((await projection(mf, 'pv-hold-two')).json.value?.available).toBe(0);
    expect(await postIntake('ord-x', 'pv-hold-two')).toBe(200);
    expect((await projection(mf, 'pv-hold-two')).json.value?.available).toBe(0);
    expect((await journal('offer-hold-two')).rows!.map((r) => [r.kind, r.from, r.to])).toEqual([['declare', 0, 2], ['vendu', 2, 1], ['vendu', 1, 0]]);
  });
});

describe('CONCURRENCY — « concurrent reservation cannot oversell », on the runtime’s own input gate', () => {
  it('twenty holds on ONE unit, fired together ⇒ exactly ONE held, nineteen refused by name', async () => {
    await seed(mf, 'pv-hold-race', 'offer-hold-race', 1);
    const answers = await Promise.all(
      Array.from({ length: 20 }, (_, i) => hold(mf, { productVersionId: 'pv-hold-race', reservationId: `res-race-${i}`, orderId: `ord-race-${i}` })),
    );
    const held = answers.filter((a) => a.status === 200 && a.json['status'] === 'held');
    const refused = answers.filter((a) => a.status === 409 && a.json['error'] === 'insufficient_stock');
    expect(held).toHaveLength(1);
    expect(refused).toHaveLength(19);
    expect((await projection(mf, 'pv-hold-race')).json.value?.available).toBe(0);
  });

  it('twenty holds on THREE units ⇒ exactly three held', async () => {
    await seed(mf, 'pv-hold-race3', 'offer-hold-race3', 3);
    const answers = await Promise.all(
      Array.from({ length: 20 }, (_, i) => hold(mf, { productVersionId: 'pv-hold-race3', reservationId: `res-r3-${i}`, orderId: `ord-r3-${i}` })),
    );
    expect(answers.filter((a) => a.json['status'] === 'held')).toHaveLength(3);
    expect(answers.filter((a) => a.status === 409)).toHaveLength(17);
    expect((await projection(mf, 'pv-hold-race3')).json.value?.available).toBe(0);
  });
});

describe('EXPIRY — a hold nobody confirms or releases frees itself (the net against a Shop+ crash)', () => {
  it('with the window at one second: held → the unit is gone → after the window it is back, and a new hold is granted', async () => {
    await seed(mfTtl, 'pv-hold-ttl', 'offer-hold-ttl', 1);
    const a = await hold(mfTtl, { productVersionId: 'pv-hold-ttl', reservationId: 'res-ttl-a', orderId: 'ord-ttl-a' });
    expect(a.json['status']).toBe('held');
    expect(Date.parse(String(a.json['expiresAt'])) - Date.now()).toBeLessThanOrEqual(1_000);
    expect((await projection(mfTtl, 'pv-hold-ttl')).json.value?.available).toBe(0);
    expect((await hold(mfTtl, { productVersionId: 'pv-hold-ttl', reservationId: 'res-ttl-b', orderId: 'ord-ttl-b' })).status).toBe(409);
    await wait(1_200);
    expect((await projection(mfTtl, 'pv-hold-ttl')).json.value?.available).toBe(1);
    const b = await hold(mfTtl, { productVersionId: 'pv-hold-ttl', reservationId: 'res-ttl-b', orderId: 'ord-ttl-b' });
    expect(b.json['status']).toBe('held');
    // …and the confirmed order of the EXPIRED hold still consumes (the money
    // moved), on the counter, without touching the live hold b
    expect(await mfTtl.dispatchFetch('http://o/fulfillment/order-confirmed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
      body: JSON.stringify(confirmedEvent('ord-ttl-a', 'pv-hold-ttl')),
    }).then((r) => r.status)).toBe(200);
    expect((await release(mfTtl, { productVersionId: 'pv-hold-ttl', reservationId: 'res-ttl-b', reason: 'cancelled' })).json['status']).toBe('released');
  });
});
