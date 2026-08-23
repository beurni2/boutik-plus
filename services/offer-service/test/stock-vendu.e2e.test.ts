import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * STOCK-VENDU-1 — THE SEAM, ON REAL WORKERD through the combined bundle
 * (founder order 2026-08-23: « make sure the stock on products is updated
 * everywhere if someone buys a product »).
 *
 * The wire under test is the one Shop+ already emits at its confirm
 * transition (`order.confirmed.v1`, at-least-once, Bearer-gated). This suite
 * drives that REAL intake and then asks the LEDGER — the same reads every
 * surface consumes — rather than believing the response:
 *   · `/offers/mine` — the supplier console's own road (his « Stock : n » row)
 *   · `/supply-projection/:pv` — the road Shop+ joins on EVERY buyer read
 *     (`inStock: available > 0` — épuisé at zero, by the vitrine's own law)
 * One counter, read live everywhere: that is what makes « everywhere » true
 * by construction rather than by fan-out.
 *
 * And the write stays CLOSED: the internal consume path is not routed on the
 * public worker, so nothing outside the confirmed-order wire can move stock.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'stock-vendu-'));
const WRITE_SECRET = 'test-offer-write-secret-0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0001';
const OPS_SECRET = 'test-fulfillment-ops-secret-0001';
const READ_SECRET = 'test-supply-read-secret-0001';
const T0 = '2026-08-01T08:00:00.000Z';
const PV = 'pv-stock-vendu-001';

const SEED = {
  commandId: 'seed-sv-e2e-001',
  offerId: 'offer-sv-e2e-001',
  product: {
    id: PV,
    supplierId: 'supplier-founder-001',
    version: 1,
    name: 'Siège auto (stock e2e)',
    productCode: 'SV-E2E-001',
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
  asOf: T0,
};

function makeMf(persistDir: string = persist): Miniflare {
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
    },
  });
}

let mf = makeMf();
let supplierCode = '';
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

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

/** The supplier console's own road — the row that says « Stock : n ». */
async function stockSurConsole(): Promise<number> {
  const res = await mf.dispatchFetch('http://o/offers/mine', {
    headers: { Authorization: `Bearer ${supplierCode}` },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: { productVersionId: string; available: number }[] };
  const row = body.items.find((i) => i.productVersionId === PV);
  expect(row, 'the seeded offer is missing from his console list').toBeDefined();
  return row!.available;
}

/** The road Shop+ joins on every buyer read. */
async function stockSurProjection(): Promise<number> {
  const res = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, {
    headers: { Authorization: `Bearer ${READ_SECRET}` },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { value?: { available?: number } };
  const n = body.value?.available;
  expect(typeof n, `no available on the projection: ${JSON.stringify(body)}`).toBe('number');
  return n as number;
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
    headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(SEED),
  });
  if (res.status !== 200) throw new Error(`seed: ${res.status} ${await res.text()}`);
}

describe('STOCK-VENDU — a sale moves the ONE counter every surface reads', () => {
  it('declared 3 · one paid order → 2, on the console road AND the buyer road', async () => {
    await seed();
    expect(await stockSurConsole()).toBe(3);
    expect(await stockSurProjection()).toBe(3);

    const first = await postIntake('ord-sv-1');
    expect(first.status).toBe(200);
    expect(first.json['ok']).toBe(true);

    expect(await stockSurConsole()).toBe(2);
    expect(await stockSurProjection()).toBe(2);
  });

  it('THE WRITE STAYS CLOSED — probed while stock is ABOVE zero, so « unmoved » is a real claim (verifier note)', async () => {
    // The root refuses unknown paths behind its auth wall (401-first, never an
    // oracle). Both halves are load-bearing HERE, at stock 2: a routed request
    // would answer 200 {status:'consumed'} (caught by the status pin) AND
    // would move the counter (caught by the unmoved pin) — at zero the floor
    // would have masked the second half.
    for (const auth of [`Bearer ${FULFILL_SECRET}`, `Bearer ${WRITE_SECRET}`, `Bearer ${OPS_SECRET}`, null]) {
      const res = await mf.dispatchFetch(`http://o/supply-consume/${PV}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth !== null ? { Authorization: auth } : {}) },
        body: JSON.stringify({ orderId: 'ord-intrus' }),
      });
      expect([401, 404]).toContain(res.status);
    }
    expect(await stockSurConsole()).toBe(2);
  });

  it('the wire is at-least-once: the SAME order redelivered moves nothing', async () => {
    const again = await postIntake('ord-sv-1');
    expect(again.status).toBe(200);
    expect(await stockSurConsole()).toBe(2);
    expect(await stockSurProjection()).toBe(2);
  });

  it('DURABILITY at stock 1 — the counter AND the consumed marker both survive a process death (verifier note: proven above zero, where the floor cannot mask a lost marker)', async () => {
    await postIntake('ord-sv-2');
    expect(await stockSurConsole()).toBe(1);
    await mf.dispose();
    mf = makeMf();
    expect(await stockSurConsole()).toBe(1);
    // The marker's own proof: a lost marker would consume afresh (1 → 0);
    // a surviving one answers idempotent and the counter HOLDS at 1.
    await postIntake('ord-sv-2');
    expect(await stockSurConsole()).toBe(1);
  });

  it('the last sale reaches an honest zero — what the vitrine renders as épuisé', async () => {
    await postIntake('ord-sv-3');
    expect(await stockSurConsole()).toBe(0);
    expect(await stockSurProjection()).toBe(0);
  });

  it('an OVERSOLD order (paid against an empty counter) still lands on his board; the counter floors, never negative', async () => {
    const over = await postIntake('ord-sv-4');
    expect(over.status).toBe(200);
    const list = await mf.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const body = (await list.json()) as { orders: { orderId: string }[] };
    expect(body.orders.some((o) => o.orderId === 'ord-sv-4'), 'the oversold sale vanished from the book').toBe(true);
    expect(await stockSurConsole()).toBe(0);
  });

  it('an UNKNOWN product never wedges the wire (verifier BLOCKER): the order lands, the intake answers 200, twice', async () => {
    // The eternal-wedge cell: a paid order whose pv resolves to no offer must
    // NOT 503 — a 5xx would make the at-least-once outbox redeliver forever
    // against a counter that does not exist. The real chain under test:
    // router 404 for the unresolved pointer → the store adapter's honest
    // `no_offer` (never a throw) → the intake proceeds. The order still lands
    // on the board (the record already marks it supplier-unresolved), and a
    // redelivery answers 200 again — no wedge, first delivery or tenth.
    const fantome = {
      ...confirmedEvent('ord-sv-fantome'),
      payload: { ...confirmedEvent('ord-sv-fantome').payload, productVersionId: 'pv-fantome-001' },
    };
    const post = async () =>
      mf.dispatchFetch('http://o/fulfillment/order-confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
        body: JSON.stringify(fantome),
      });
    const first = await post();
    expect(first.status).toBe(200);
    const again = await post();
    expect(again.status).toBe(200);
    const list = await mf.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const body = (await list.json()) as { orders: { orderId: string }[] };
    expect(body.orders.some((o) => o.orderId === 'ord-sv-fantome'), 'the unresolved sale vanished from the book').toBe(true);
    // …and the SEEDED offer's counter was untouched by the phantom pv.
    expect(await stockSurConsole()).toBe(0);
  });
});

describe('STOCK-VENDU-1b — the refused unit comes home, on the real worker', () => {
  function refusedEvent(orderId: string, faultClass?: string) {
    return {
      name: 'delivery.refused.v1',
      envelope: {
        command_id: `door-refusal-${orderId}`,
        correlation_id: `corr-${orderId}`,
        aggregateVersion: 9,
        actor: 'sera:custody',
        serverTime: T0,
        version: 'v1',
      },
      payload: {
        order_id: orderId,
        task_id: `task-${orderId}`,
        family: 'return',
        reason_code: 'change_of_mind',
        ...(faultClass !== undefined ? { fault_class: faultClass } : {}),
        fee_retained: true,
      },
    };
  }
  async function postRefused(event: unknown, auth: string | null = `Bearer ${FULFILL_SECRET}`) {
    const res = await mf.dispatchFetch('http://o/fulfillment/delivery-refused', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth !== null ? { Authorization: auth } : {}) },
      body: JSON.stringify(event),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  it('the intake door is Bearer-gated like its siblings', async () => {
    expect((await postRefused(refusedEvent('ord-sv-3', 'buyer'), null)).status).toBe(401);
    expect((await postRefused(refusedEvent('ord-sv-3', 'buyer'), 'Bearer wrong')).status).toBe(401);
  });

  it('a BUYER-fault refusal restocks the unit — 0 back to 1, on the road his console reads; the redelivery moves nothing', async () => {
    const first = await postRefused(refusedEvent('ord-sv-3', 'buyer'));
    expect(first.status).toBe(200);
    expect(first.json['status']).toBe('restocked');
    expect(await stockSurConsole()).toBe(1);
    expect(await stockSurProjection()).toBe(1);
    const again = await postRefused(refusedEvent('ord-sv-3', 'buyer'));
    expect(again.status).toBe(200);
    expect(again.json['status']).toBe('idempotent');
    expect(await stockSurConsole()).toBe(1);
  });

  it('a SELLER-fault refusal restores nothing automatically (the safest default, founder-tunable)', async () => {
    const res = await postRefused(refusedEvent('ord-sv-1', 'seller'));
    expect(res.status).toBe(200);
    expect(res.json['status']).toBe('no_restock');
    expect(await stockSurConsole()).toBe(1);
  });

  it('a refusal with NO fault class (the evidence-rejected emit) restocks nothing', async () => {
    const res = await postRefused(refusedEvent('ord-sv-2'));
    expect(res.status).toBe(200);
    expect(res.json['status']).toBe('no_restock');
    expect(await stockSurConsole()).toBe(1);
  });

  it('an UNKNOWN order answers 200 — the at-least-once emitter must stop, never wedge', async () => {
    const res = await postRefused(refusedEvent('ord-jamais-vu', 'buyer'));
    expect(res.status).toBe(200);
    expect(res.json['status']).toBe('unknown_order');
    expect(await stockSurConsole()).toBe(1);
  });

  it("the OVERSOLD sale wears its mark on his board's own read; a clean sale does not", async () => {
    const list = await mf.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const body = (await list.json()) as { orders: { orderId: string; oversold?: boolean }[] };
    const sv4 = body.orders.find((o) => o.orderId === 'ord-sv-4');
    const sv1 = body.orders.find((o) => o.orderId === 'ord-sv-1');
    expect(sv4?.oversold, 'the oversold sale lost its mark').toBe(true);
    expect(sv1?.oversold).toBeUndefined();
  });
});
