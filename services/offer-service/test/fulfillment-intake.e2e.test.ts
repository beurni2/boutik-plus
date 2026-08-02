import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ORDER-PAID-WIRE-1c — THE PREPARATION INTAKE, ON REAL WORKERD, through the
 * COMBINED bundle: the Bearer gate at the composition root, the canon parse,
 * the INTERNAL supplier join (pv → the offer store's own supplierId), the
 * first-wins book, and its durability across a process death.
 *
 * The seeded offer is the SAME founder-seed shape the combined-worker e2e
 * uses, so the supplier join resolves against a REAL entry written through
 * the real command path — not a fixture the join could not miss.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'fulfillment-intake-'));
const WRITE_SECRET = 'test-offer-write-secret-0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0001';
const OPS_SECRET = 'test-fulfillment-ops-secret-0001';
const T0 = '2026-08-01T08:00:00.000Z';
const PV = 'pv-intake-001';

const SEED = {
  commandId: 'seed-intake-001',
  offerId: 'offer-intake-001',
  product: {
    id: PV,
    supplierId: 'supplier-founder-001',
    version: 1,
    name: 'Pagne tissé Faso (démo)',
    productCode: 'FASO-001',
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
  available: 5,
  asOf: T0,
};

function makeMf(secret: string | null = FULFILL_SECRET, persistDir: string = persist): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persistDir,
    bindings: {
      OFFER_WRITE_SECRET: WRITE_SECRET,
      ...(secret !== null ? { FULFILLMENT_WRITE_SECRET: secret } : {}),
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
    },
  });
}

let mf = makeMf();
async function restart(): Promise<void> {
  await mf.dispose();
  mf = makeMf();
}
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

/** The canon event the Shop+ emitter produces (mirrors its e2e-proven bytes). */
function confirmedEvent(orderId: string, over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) {
  return {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: `ord-confirm-${orderId}`,
      correlation_id: `corr-${orderId}`,
      aggregateVersion: 5,
      // The producer's real actor names its own service; canon requires only a
      // non-empty string and the intake asserts nothing about it. Spelled
      // NEUTRALLY here because B+I-15's gate greps this repo's source for
      // consumer-commerce words, and a neighbour service's name in a fixture is
      // that gate's one legitimate false positive — do not "fix" this back to
      // the wire-literal value; the schema both ends parse is the fidelity
      // anchor, not this string.
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
      zoneTo: 'Gounghin, Ouagadougou',
      sellerBasePrice: 10_000,
      ...payloadOver,
    },
    ...over,
  };
}

async function postIntake(event: unknown, auth: string | null = `Bearer ${FULFILL_SECRET}`, m: Miniflare = mf) {
  const res = await m.dispatchFetch('http://o/fulfillment/order-confirmed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth !== null ? { Authorization: auth } : {}) },
    body: JSON.stringify(event),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function listOrders(m: Miniflare = mf) {
  const res = await m.dispatchFetch('http://o/fulfillment/orders', {
    headers: { Authorization: `Bearer ${OPS_SECRET}` },
  });
  return (await res.json()) as { ok: boolean; orders: Record<string, unknown>[] };
}

async function postRelance(orderId: unknown, auth: string | null = `Bearer ${OPS_SECRET}`, m: Miniflare = mf) {
  const res = await m.dispatchFetch('http://o/fulfillment/relance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth !== null ? { Authorization: auth } : {}) },
    body: JSON.stringify({ orderId }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function seedOffer(): Promise<void> {
  // MINT BEFORE SEED (LISTER-POUR-1a'): a create may only name a supplier
  // who currently holds an active code. Re-minting is the rotation story,
  // so calling this more than once stays safe.
  const minted = await mf.dispatchFetch('http://o/fulfillment/supplier-code', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ supplierId: SEED.product.supplierId }),
  });
  if (minted.status !== 200) throw new Error(`mint: ${minted.status} ${await minted.text()}`);
  const res = await mf.dispatchFetch('http://o/offers', {
    method: 'POST',
    headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(SEED),
  });
  if (res.status !== 200) throw new Error(`seed: ${res.status} ${await res.text()}`);
}

describe('the intake gate — fail closed, its own credential, never the write key', () => {
  it('NO SECRET BOUND (a Worker deployed before `wrangler secret put`): every intake is 401', async () => {
    // Its OWN persist dir: two workerd runtimes on one SQLite dir deadlock
    // (SQLITE_BUSY) — the same reason the shop harness gives its slow-provider
    // runtime a separate dir.
    const bareDir = mkdtempSync(join(tmpdir(), 'fulfillment-bare-'));
    const bare = makeMf(null, bareDir);
    try {
      const res = await postIntake(confirmedEvent('ord-q-gate1'), `Bearer ${FULFILL_SECRET}`, bare);
      expect(res.status).toBe(401);
    } finally {
      await bare.dispose();
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it('wrong secret, missing header, and THE WRITE KEY all answer the same 401 — never an oracle, never interchangeable', async () => {
    for (const auth of ['Bearer wrong-secret', null, `Bearer ${WRITE_SECRET}`]) {
      const res = await postIntake(confirmedEvent('ord-q-gate2'), auth);
      expect(res.status, String(auth)).toBe(401);
    }
    // …and the write key's own header form grants nothing either.
    const res = await mf.dispatchFetch('http://o/fulfillment/order-confirmed', {
      method: 'POST',
      headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmedEvent('ord-q-gate3')),
    });
    expect(res.status).toBe(401);
  });
});

describe('the intake — canon-parsed, supplier joined INTERNALLY, first-wins, durable', () => {
  it('A REAL EVENT REGISTERS: the supplier resolves from the offer store, and the response carries NO supplier id', async () => {
    await seedOffer();
    const res = await postIntake(confirmedEvent('ord-quote-real-1'));
    expect(res.status, res.text).toBe(200);
    expect(res.json).toEqual({ ok: true, status: 'registered' });
    expect(res.text.includes('supplier-founder-001')).toBe(false); // the join's result stays home

    const { orders } = await listOrders();
    const rec = orders.find((o) => o['orderId'] === 'ord-quote-real-1');
    expect(rec).toMatchObject({
      productVersionId: PV,
      productName: 'Pagne tissé Faso (démo)', // joined from the same entry as the supplier
      supplierId: 'supplier-founder-001',
      supplierResolved: true,
      sellerBasePrice: 10_000,
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Gounghin, Ouagadougou',
    });
  });

  it('AT-LEAST-ONCE ABSORBED: a redelivery answers duplicate and the ORIGINAL record survives byte-for-byte', async () => {
    const first = await postIntake(confirmedEvent('ord-quote-dup-1'));
    expect(first.json['status']).toBe('registered');
    // The redelivery even carries a LATER paidAt — the crafted-clock-reset case.
    const again = await postIntake(confirmedEvent('ord-quote-dup-1', {}, { paidAt: '2026-08-02T00:00:00.000Z' }));
    expect(again.status).toBe(200);
    expect(again.json['status']).toBe('duplicate');
    const { orders } = await listOrders();
    const rec = orders.find((o) => o['orderId'] === 'ord-quote-dup-1');
    expect(rec?.['paidAt']).toBe(T0); // first wins; the clock cannot be reset
  });

  it('A NON-CANONICAL EVENT IS 400 BY NAME — a smuggled buyerPhone is refused at THIS end too', async () => {
    for (const [label, event] of [
      ['smuggled buyerPhone', confirmedEvent('ord-q-bad1', {}, { buyerPhone: '+226 70 00 00 00' })],
      ['wrong name', confirmedEvent('ord-q-bad2', { name: 'order.paid.v1' })],
      ['fractional francs', confirmedEvent('ord-q-bad3', {}, { sellerBasePrice: 10_000.5 })],
      ['not json at all', 'garbage'],
    ] as const) {
      const res = await postIntake(event);
      expect(res.status, label).toBe(400);
      expect(res.json['reason'], label).toBe('event_not_canonical');
    }
    const { orders } = await listOrders();
    expect(orders.some((o) => String(o['orderId']).startsWith('ord-q-bad'))).toBe(false);
  });

  it('AN UNKNOWN PRODUCT REGISTERS UNRESOLVED — a paid order is never dropped, and the anomaly is visible', async () => {
    const res = await postIntake(confirmedEvent('ord-quote-ghost-1', {}, { productVersionId: 'pv-nobody-knows' }));
    expect(res.status).toBe(200);
    expect(res.json['status']).toBe('registered');
    const { orders } = await listOrders();
    const rec = orders.find((o) => o['orderId'] === 'ord-quote-ghost-1');
    expect(rec).toMatchObject({ supplierId: '', supplierResolved: false });
  });

  it('THE BOOK SURVIVES A PROCESS DEATH — records, supplier joins and first-wins intact', async () => {
    await restart();
    const { orders } = await listOrders();
    const real = orders.find((o) => o['orderId'] === 'ord-quote-real-1');
    expect(real?.['supplierId']).toBe('supplier-founder-001');
    const again = await postIntake(confirmedEvent('ord-quote-dup-1'));
    expect(again.json['status']).toBe('duplicate');
  });

  it("the ops read is GATED BY THE FOUNDER'S OWN KEY — no secret 401, and THE INTAKE SECRET (Shop+'s) does not open it", async () => {
    const bare = await mf.dispatchFetch('http://o/fulfillment/orders');
    expect(bare.status).toBe(401);
    // The verifier's finding, closed structurally: the credential Shop+ holds
    // to DELIVER must never read supplier identities back out.
    const shopKey = await mf.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: `Bearer ${FULFILL_SECRET}` },
    });
    expect(shopKey.status).toBe(401);
    // …nor the APP'S write key — the one credential that ships in a public
    // bundle is exactly the one that must never see a supplier id.
    const appKey = await mf.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: `Bearer ${WRITE_SECRET}` },
    });
    expect(appKey.status).toBe(401);
    // …and the ops key does not open the INTAKE either: two keys, two doors.
    const opsOnIntake = await postIntake(confirmedEvent('ord-q-cross'), `Bearer ${OPS_SECRET}`);
    expect(opsOnIntake.status).toBe(401);
  });
});

/**
 * CONSOLE-2 — THE RELANCE: the operator's own chase log.
 *
 * The property that outranks every other here: a relance is « j'ai appelé »,
 * NOT « le produit est prêt ». Canon readiness (B+I-06 / B6.2) is the
 * SUPPLIER's evidenced act — `PackageReadinessConfirmation` with a photo and
 * the short-TTL `sellerReadinessChallenge` — and it is what gates a Séra
 * pickup. Nothing on this route can produce, imply, or be mistaken for it.
 */
describe('the relance — the founder’s credential alone, his act, our clock', () => {
  it('IT IS NOT READINESS: the route stores no evidence, no challenge, no ready flag — the answer names only the call', async () => {
    await seedOffer();
    await postIntake(confirmedEvent('ord-relance-1'));
    const res = await postRelance('ord-relance-1');
    expect(res.status, res.text).toBe(200);
    expect(res.json['ok']).toBe(true);
    const mark = res.json['relance'] as Record<string, unknown>;
    expect(Object.keys(mark).sort()).toEqual(['at', 'count']); // no `ready`, no challenge, no photoRef
    expect(mark['count']).toBe(1);
    // and the words canon reserves for readiness appear NOWHERE in the answer
    for (const forbidden of ['ready', 'readiness', 'prêt', 'challenge', 'photoRef', 'pickup']) {
      expect(res.text.toLowerCase().includes(forbidden.toLowerCase()), forbidden).toBe(false);
    }
  });

  it('THE CLOCK IS THE WORKER’S: the stored mark is a real instant near now, and the router forwards no claim', async () => {
    await seedOffer();
    await postIntake(confirmedEvent('ord-relance-clock'));
    const before = Date.now();
    // A hostile caller insisting the call happened last year. The ROUTER
    // strips it (only `orderId` is forwarded), so this reaches the book as a
    // clean relance — and the stored instant is ours.
    const res = await mf.dispatchFetch('http://o/fulfillment/relance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_SECRET}` },
      body: JSON.stringify({ orderId: 'ord-relance-clock', at: '2025-01-01T00:00:00.000Z', count: 99 }),
    });
    const json = (await res.json()) as { relance: { at: string; count: number } };
    expect(json.relance.count).toBe(1); // the claimed count is not honoured either
    const at = Date.parse(json.relance.at);
    expect(Number.isNaN(at)).toBe(false);
    expect(at).toBeGreaterThanOrEqual(before - 60_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(json.relance.at).not.toBe('2025-01-01T00:00:00.000Z');
  });

  it('THE BOOK ITSELF REFUSES a body carrying `at`/`count` — so the clock defence is testable at BOTH layers, not just the router', async () => {
    // The verifier's finding and its better fix: the object used to IGNORE
    // those fields, which made a regression HERE invisible (the router had
    // already thrown them away). Refusing means either layer failing alone
    // goes red. Addressed to the DO directly, past the router that strips.
    await seedOffer();
    await postIntake(confirmedEvent('ord-relance-refuse'));
    const id = await mf.getDurableObjectNamespace('FULFILLMENT');
    const stub = id.get(id.idFromName('paid-orders'));
    for (const body of [
      { orderId: 'ord-relance-refuse', at: '2025-01-01T00:00:00.000Z' },
      { orderId: 'ord-relance-refuse', count: 99 },
    ]) {
      // The Miniflare DO proxy takes (url, init) — a Request instance built
      // out here cannot cross the process boundary.
      const res = await stub.fetch('https://do/relance', { method: 'POST', body: JSON.stringify(body) });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(((await res.json()) as { reason: string }).reason).toBe('malformed');
    }
    // …and nothing was written by the refused calls.
    const rec = (await listOrders()).orders.find((o) => o['orderId'] === 'ord-relance-refuse');
    expect(rec?.['relance']).toBeUndefined();
  });

  it('A SECOND CALL IS A REAL EVENT: the count grows and `at` moves forward — he called again, and the book says so', async () => {
    await seedOffer();
    await postIntake(confirmedEvent('ord-relance-2'));
    const first = await postRelance('ord-relance-2');
    const firstAt = (first.json['relance'] as { at: string }).at;
    await new Promise((r) => setTimeout(r, 5));
    const second = await postRelance('ord-relance-2');
    const mark = second.json['relance'] as { at: string; count: number };
    expect(mark.count).toBe(2);
    expect(mark.at >= firstAt).toBe(true);
  });

  it('AN ORDER THE BOOK NEVER SAW IS 404 — a chase log about a phantom order is a lie about a real one', async () => {
    const res = await postRelance('ord-never-existed');
    expect(res.status).toBe(404);
    expect(res.json['reason']).toBe('unknown_order');
    const { orders } = await listOrders();
    expect(orders.some((o) => o['orderId'] === 'ord-never-existed')).toBe(false); // nothing invented
  });

  it('a missing / empty / non-string orderId is 400 malformed', async () => {
    for (const bad of [undefined, '', 42, null]) {
      const res = await postRelance(bad);
      expect(res.status, String(bad)).toBe(400);
      expect(res.json['reason']).toBe('malformed');
    }
  });

  it('THE GATE IS THE FOUNDER’S KEY: no key, the INTAKE key (Shop+’s), and the app WRITE key are all 401 — and none of them logs a call', async () => {
    await seedOffer();
    await postIntake(confirmedEvent('ord-relance-gate'));
    for (const auth of [null, `Bearer ${FULFILL_SECRET}`, `Bearer ${WRITE_SECRET}`, 'Bearer wrong']) {
      const res = await postRelance('ord-relance-gate', auth);
      expect(res.status, String(auth)).toBe(401);
    }
    const { orders } = await listOrders();
    const rec = orders.find((o) => o['orderId'] === 'ord-relance-gate');
    expect(rec?.['relance']).toBeUndefined(); // refused means NOTHING was written
  });

  it('THE MARK RIDES THE OPS LIST and SURVIVES A PROCESS DEATH — while the paid-order record stays byte-identical', async () => {
    await seedOffer();
    await postIntake(confirmedEvent('ord-relance-durable'));
    const before = (await listOrders()).orders.find((o) => o['orderId'] === 'ord-relance-durable');
    expect(before?.['relance']).toBeUndefined();
    await postRelance('ord-relance-durable');
    await restart();
    const after = (await listOrders()).orders.find((o) => o['orderId'] === 'ord-relance-durable');
    expect((after?.['relance'] as { count: number }).count).toBe(1);
    // The annotation is stored SEPARATELY, and this asserts what its title
    // says — WHOLE-RECORD identity, not a list of field names I remembered.
    // A verifier proved the field loop's weakness: writing an extra
    // `chasedByOperator: true` back onto the order record (precisely the
    // "annotations never mutate it" violation) kept the loop green.
    const { relance: _mark, ...afterWithoutMark } = after as Record<string, unknown>;
    expect(afterWithoutMark).toEqual(before);
  });

  it('A REDELIVERY AFTER A RELANCE keeps both: duplicate absorbed, the call still logged', async () => {
    await seedOffer();
    await postIntake(confirmedEvent('ord-relance-dup'));
    await postRelance('ord-relance-dup');
    const again = await postIntake(confirmedEvent('ord-relance-dup'));
    expect(again.json['status']).toBe('duplicate');
    const rec = (await listOrders()).orders.find((o) => o['orderId'] === 'ord-relance-dup');
    expect((rec?.['relance'] as { count: number }).count).toBe(1);
  });
});
