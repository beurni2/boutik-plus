import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * STOCK-JOURNAL-1 (B5.2) — THE SEAM, on REAL workerd through the combined
 * bundle. Two laws, proven by asking the ledger rather than believing any
 * response:
 *
 *   THE JOURNAL — the declaration is row one; a paid sale (through the REAL
 *   confirmed-order intake Shop+ emits to) writes `vendu`; the founder's
 *   typed count writes `confirme` or `ajuste` and moves the counter every
 *   surface reads; a replayed act writes nothing twice.
 *
 *   THE FREEZE — with the window lowered to ONE SECOND by the lower-only knob,
 *   an offer nobody has confirmed in a second disappears from BOTH roads Shop+
 *   reads (the single projection answers 409 `stock_unconfirmed`, the
 *   collection omits it) while his own console still SHOWS it, marked. One
 *   confirmation brings it back on every road.
 *
 * And the doors stay HIS: the confirm act and the journal read open only to
 * the ops credential — not the bundled write key, not a supplier's code.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'stock-journal-'));
const WRITE_SECRET = 'test-offer-write-secret-0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0001';
const OPS_SECRET = 'test-fulfillment-ops-secret-0001';
const READ_SECRET = 'test-supply-read-secret-0001';
const T0 = '2026-09-17T08:00:00.000Z';
const PV = 'pv-stock-journal-001';
const OFFER = 'offer-sj-e2e-001';
const DUE_MS = 1_000;

const SEED = {
  commandId: 'seed-sj-e2e-001',
  offerId: OFFER,
  product: {
    id: PV,
    supplierId: 'supplier-founder-001',
    version: 1,
    name: 'Pagne tissé (journal e2e)',
    productCode: 'SJ-E2E-001',
    facts: {},
    category: 'fashion_bags_fabrics',
    zone: 'Gounghin',
    moderationState: 'approved',
    status: 'active',
    supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: PV,
    basePrice: 10_000,
    resellerCommission: 1_000,
    eligibleVariants: [],
    zones: [],
    effective: '2026-07-10T00:00:00.000Z',
    expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 3,
  asOf: '2020-01-01T00:00:00.000Z', // a device clock, deliberately absurd — never the stamp
};

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
    STOCK_RECONFIRM_DUE_MS: String(DUE_MS),
  },
});
let supplierCode = '';
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  seq: number;
  at: string;
  kind: string;
  from: number;
  to: number;
  orderId?: string;
  commandId?: string;
}

async function journal(auth: string | null = `Bearer ${OPS_SECRET}`) {
  const res = await mf.dispatchFetch(`http://o/offers/journal?offerId=${OFFER}`, {
    headers: auth === null ? {} : { Authorization: auth },
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as { available?: number; stockConfirmedAt?: string | null; rows?: Row[] },
  };
}

async function confirmer(commandId: string, available: unknown, auth: string | null = `Bearer ${OPS_SECRET}`) {
  const res = await mf.dispatchFetch('http://o/offers/stock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth === null ? {} : { Authorization: auth }) },
    body: JSON.stringify({ offerId: OFFER, commandId, available }),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** The canon event Shop+'s e2e-proven emitter produces. */
function confirmedEvent(orderId: string) {
  return {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: `ord-confirm-${orderId}`,
      correlation_id: `corr-${orderId}`,
      aggregateVersion: 5,
      actor: 'shop-plus:order-emitter',
      serverTime: T0,
      version: 'v1',
    },
    payload: {
      orderId,
      productVersionId: PV,
      offerVersion: 'ov-1',
      paymentMode: 'FULL_PREPAY',
      paidAt: T0,
      zoneTo: 'Gounghin Sud, Ouagadougou',
      sellerBasePrice: 10_000,
    },
  };
}

async function postIntake(orderId: string) {
  const res = await mf.dispatchFetch('http://o/fulfillment/order-confirmed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
    body: JSON.stringify(confirmedEvent(orderId)),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** His console's own road — the row with `available`, `stockConfirmedAt`, `hiddenReason`. */
async function ligneConsole() {
  const res = await mf.dispatchFetch('http://o/offers/mine', { headers: { Authorization: `Bearer ${supplierCode}` } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    items: { productVersionId: string; available: number; stockConfirmedAt?: string; hiddenReason?: string }[];
  };
  const row = body.items.find((i) => i.productVersionId === PV);
  expect(row, 'the seeded offer is missing from his console list').toBeDefined();
  return row!;
}

/** The road Shop+ joins on every buyer read. */
async function projection() {
  const res = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { headers: { Authorization: `Bearer ${READ_SECRET}` } });
  return { status: res.status, json: (await res.json()) as { value?: { available?: number }; reason?: string; status?: string } };
}

/** The road Shop+'s Opportunités walks. */
async function collectionHasIt(): Promise<boolean> {
  const res = await mf.dispatchFetch('http://o/supply-projections', { headers: { Authorization: `Bearer ${READ_SECRET}` } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: { value?: { productVersionId?: string } }[] };
  return body.items.some((i) => i.value?.productVersionId === PV);
}

async function seed(): Promise<void> {
  const minted = await mf.dispatchFetch('http://o/fulfillment/supplier-code', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ supplierId: SEED.product.supplierId }),
  });
  if (minted.status !== 200) throw new Error(`mint: ${minted.status} ${await minted.text()}`);
  supplierCode = ((await minted.json()) as { code: string }).code;
  const res = await mf.dispatchFetch('http://o/offers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(SEED),
  });
  if (res.status !== 200) throw new Error(`seed: ${res.status} ${await res.text()}`);
}

describe('STOCK-JOURNAL — every movement is a row, on the real worker', () => {
  it('the declaration is ROW ONE, stamped with the server clock (never the device asOf)', async () => {
    const before = Date.now();
    await seed();
    const j = await journal();
    expect(j.status).toBe(200);
    expect(j.json.available).toBe(3);
    expect(j.json.rows).toHaveLength(1);
    const declare = j.json.rows![0]!;
    expect(declare).toMatchObject({ seq: 1, kind: 'declare', from: 0, to: 3, commandId: SEED.commandId });
    expect(Date.parse(declare.at)).toBeGreaterThanOrEqual(before - 1_000);
    expect(declare.at).not.toBe(SEED.asOf);
    expect(j.json.stockConfirmedAt).toBe(declare.at);
    // …and his console row carries the same stamp.
    expect((await ligneConsole()).stockConfirmedAt).toBe(declare.at);
  });

  it('a paid sale through the REAL intake writes `vendu` 3 → 2 naming the order; the redelivery writes nothing twice', async () => {
    expect((await postIntake('ord-sj-1')).status).toBe(200);
    let j = await journal();
    expect(j.json.available).toBe(2);
    expect(j.json.rows!.map((r) => r.kind)).toEqual(['declare', 'vendu']);
    expect(j.json.rows![1]).toMatchObject({ seq: 2, kind: 'vendu', from: 3, to: 2, orderId: 'ord-sj-1' });

    expect((await postIntake('ord-sj-1')).status).toBe(200);
    j = await journal();
    expect(j.json.rows, 'the at-least-once redelivery journaled a second sale').toHaveLength(2);
    expect(j.json.available).toBe(2);
  });

  it('the founder types the SAME count → `confirme` (2 → 2), counter untouched, clock restarted', async () => {
    const stampBefore = (await journal()).json.stockConfirmedAt!;
    await wait(20);
    const r = await confirmer('act-sj-1', 2);
    expect(r.status).toBe(200);
    expect(r.json['status']).toBe('confirmed');
    const j = await journal();
    expect(j.json.available).toBe(2);
    expect(j.json.rows![2]).toMatchObject({ seq: 3, kind: 'confirme', from: 2, to: 2, commandId: 'act-sj-1' });
    expect(Date.parse(j.json.stockConfirmedAt!)).toBeGreaterThan(Date.parse(stampBefore));
    expect((await ligneConsole()).stockConfirmedAt).toBe(j.json.stockConfirmedAt);
  });

  it('he types a DIFFERENT count → `ajuste` (2 → 5), and the counter moves on BOTH roads Shop+ reads', async () => {
    const r = await confirmer('act-sj-2', 5);
    expect(r.status).toBe(200);
    expect(r.json['status']).toBe('adjusted');
    expect(r.json['available']).toBe(5);
    const j = await journal();
    expect(j.json.rows![3]).toMatchObject({ seq: 4, kind: 'ajuste', from: 2, to: 5, commandId: 'act-sj-2' });
    expect((await ligneConsole()).available).toBe(5);
    const p = await projection();
    expect(p.status).toBe(200);
    expect(p.json.value?.available).toBe(5);
  });

  it('the SAME act replayed (a retried tap) is idempotent — no fifth row, counter holds', async () => {
    const r = await confirmer('act-sj-2', 5);
    expect(r.status).toBe(200);
    expect(r.json['status']).toBe('idempotent');
    expect((await journal()).json.rows).toHaveLength(4);
    // …even replayed with a DIFFERENT count: the command id is the act.
    const r2 = await confirmer('act-sj-2', 99);
    expect(r2.json['status']).toBe('idempotent');
    expect((await journal()).json.available).toBe(5);
  });

  it('a bad count is refused by name and journals nothing', async () => {
    for (const bad of [-1, 2.5, 'trois', null]) {
      const r = await confirmer(`act-bad-${String(bad)}`, bad);
      expect(r.status, `count ${String(bad)}`).toBe(400);
      expect(r.json['error']).toBe('invalid_qty');
    }
    expect((await journal()).json.rows).toHaveLength(4);
  });

  it('an unknown offer answers 404; a missing offerId 400', async () => {
    const res = await mf.dispatchFetch('http://o/offers/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_SECRET}` },
      body: JSON.stringify({ offerId: 'offer-jamais-vu', commandId: 'x', available: 1 }),
    });
    expect(res.status).toBe(404);
    const noId = await mf.dispatchFetch('http://o/offers/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_SECRET}` },
      body: JSON.stringify({ commandId: 'x', available: 1 }),
    });
    expect(noId.status).toBe(400);
  });

  it('THE DOORS ARE HIS — the write key, the supplier code and no key all answer 401 on both routes, and nothing moves', async () => {
    for (const auth of [`Bearer ${WRITE_SECRET}`, `Bearer ${FULFILL_SECRET}`, `Bearer ${supplierCode}`, 'Bearer wrong', null]) {
      expect((await confirmer('act-intrus', 1, auth)).status, `confirm with ${auth}`).toBe(401);
      expect((await journal(auth)).status, `journal with ${auth}`).toBe(401);
    }
    // X-Write-Key (the bundled key's own header) opens neither.
    const viaWriteKey = await mf.dispatchFetch('http://o/offers/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Write-Key': WRITE_SECRET },
      body: JSON.stringify({ offerId: OFFER, commandId: 'act-intrus-2', available: 1 }),
    });
    expect(viaWriteKey.status).toBe(401);
    expect((await journal()).json.available).toBe(5);
    expect((await journal()).json.rows).toHaveLength(4);
  });
});

describe('THE FREEZE — unconfirmed past the window, Shop+ stops selling; one confirmation brings it back', () => {
  it('past the (one-second) window: the single read answers 409 stock_unconfirmed, the collection omits it, his console SHOWS it marked', async () => {
    await wait(DUE_MS + 200);
    const p = await projection();
    expect(p.status).toBe(409);
    expect(p.json.reason).toBe('stock_unconfirmed');
    expect(await collectionHasIt()).toBe(false);
    const row = await ligneConsole();
    expect(row.hiddenReason).toBe('stock_unconfirmed');
    expect(row.available).toBe(5); // shown, marked, never dropped
  });

  it('a paid order landing on a FROZEN offer still journals its `vendu` (the money moved; the row records it)', async () => {
    expect((await postIntake('ord-sj-2')).status).toBe(200);
    const j = await journal();
    expect(j.json.available).toBe(4);
    expect(j.json.rows![4]).toMatchObject({ seq: 5, kind: 'vendu', from: 5, to: 4, orderId: 'ord-sj-2' });
    // a sale does NOT vouch for the stock — the freeze stands until a human confirms
    expect((await projection()).status).toBe(409);
  });

  it('the refused unit comes home through the REAL refused intake → `rendu` 4 → 5 naming the order (the fifth kind, read off the ledger)', async () => {
    const res = await mf.dispatchFetch('http://o/fulfillment/delivery-refused', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
      body: JSON.stringify({
        name: 'delivery.refused.v1',
        envelope: { command_id: 'door-refusal-ord-sj-2', correlation_id: 'corr-ord-sj-2', aggregateVersion: 9, actor: 'sera:custody', serverTime: T0, version: 'v1' },
        payload: { order_id: 'ord-sj-2', task_id: 'task-ord-sj-2', family: 'return', reason_code: 'change_of_mind', fault_class: 'buyer', fee_retained: true },
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status?: string }).status).toBe('restocked');
    const j = await journal();
    expect(j.json.available).toBe(5);
    expect(j.json.rows![5]).toMatchObject({ seq: 6, kind: 'rendu', from: 4, to: 5, orderId: 'ord-sj-2' });
    // a unit coming home is not a human vouching either — still frozen
    expect((await projection()).status).toBe(409);
  });

  it('one confirmation from his console and the offer is back on EVERY road', async () => {
    const r = await confirmer('act-sj-3', 5);
    expect(r.json['status']).toBe('confirmed');
    const p = await projection();
    expect(p.status).toBe(200);
    expect(p.json.value?.available).toBe(5);
    expect(await collectionHasIt()).toBe(true);
    expect((await ligneConsole()).hiddenReason).toBeUndefined();
  });

  it('the journal reads back in sequence order, complete, after everything above', async () => {
    const rows = (await journal()).json.rows!;
    expect(rows.map((r) => [r.seq, r.kind, r.from, r.to])).toEqual([
      [1, 'declare', 0, 3],
      [2, 'vendu', 3, 2],
      [3, 'confirme', 2, 2],
      [4, 'ajuste', 2, 5],
      [5, 'vendu', 5, 4],
      [6, 'rendu', 4, 5],
      [7, 'confirme', 5, 5],
    ]);
    // every stamp is a real server instant, monotone non-decreasing
    for (let i = 1; i < rows.length; i += 1) {
      expect(Date.parse(rows[i]!.at)).toBeGreaterThanOrEqual(Date.parse(rows[i - 1]!.at));
    }
  });

  it('deleting the offer takes its journal with it (no ghost rows for a record that is gone)', async () => {
    const del = await mf.dispatchFetch('http://o/offers/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: 'del-sj-1', offerId: OFFER, productVersionId: PV }),
    });
    expect(del.status).toBe(200);
    expect((await journal()).status).toBe(404);
  });
});
