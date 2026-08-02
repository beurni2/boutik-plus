import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * READINESS-RETURN-1b — THE RETURN LEG LEAVING BOUTIK+, on real workerd.
 *
 * Founder-approved 2026-08-02: a reseller's follow-up continues past
 * « payée ». Two facts travel home — the supplier ACCEPTED, and the supplier
 * confirmed PACKAGE-READY — and this suite asserts the ACTUAL DELIVERED BYTES,
 * not the intent to deliver.
 *
 * THE PROPERTY ABOVE ALL OTHERS: what must never leave. Supplier identity
 * crosses no cross-app wire in either direction; the `sellerReadinessChallenge`
 * is one of the four non-interchangeable secrets (§5.4); readiness evidence
 * (the photo) and `buyerDropCode` are banned from anything seller-side by Ten
 * Laws #3; and no franc belongs on this wire at all. Each is asserted on the
 * raw delivered body, not on a parsed field.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'readiness-return-'));
const WRITE_SECRET = 'test-offer-write-secret-0003';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0003';
const OPS_SECRET = 'test-fulfillment-ops-secret-0003';
const PROGRESS_SECRET = 'test-progress-write-secret-0003';
const T0 = '2026-08-02T08:00:00.000Z';
const PV = 'pv-return-001';
const SUPPLIER = 'supplier-return-001';

/** Every delivery Shop+ would have received, captured verbatim. */
const delivered: { auth: string | null; body: string; path: string }[] = [];

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: {
    OFFER_WRITE_SECRET: WRITE_SECRET,
    FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    FULFILLMENT_OPS_SECRET: OPS_SECRET,
    PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
  },
  serviceBindings: {
    STOREFRONT: async (request: Request) => {
      delivered.push({
        auth: request.headers.get('Authorization'),
        body: await request.text(),
        path: new URL(request.url).pathname,
      });
      return Response.json({ ok: true, status: 'recorded' });
    },
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const seed = {
  commandId: 'seed-return-1',
  offerId: 'offer-return-1',
  product: {
    id: PV, supplierId: SUPPLIER, version: 1, name: 'Bogolan teint (retour)',
    productCode: 'FASO-0031', facts: {}, category: 'fashion_bags_fabrics',
    zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: PV, basePrice: 8_000, resellerCommission: 800,
    eligibleVariants: [], zones: [],
    effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 3,
  asOf: T0,
};

async function post(path: string, body: unknown, headers: Record<string, string>) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

/** The alarm delivers asynchronously; poll rather than guess a sleep. */
async function waitForDeliveries(n: number, timeoutMs = 8_000): Promise<void> {
  const started = Date.now();
  while (delivered.length < n && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('READINESS-RETURN-1b — the two facts leave Boutik+, and nothing else does', () => {
  const ORDER = 'ord-return-0001';
  let code = '';
  let lastChallenge = '';

  it('sets the stage: a paid order, a supplier with a personal code', async () => {
    expect((await post('/offers', seed, { 'X-Write-Key': WRITE_SECRET })).status).toBe(200);
    const confirmed = await post(
      '/fulfillment/order-confirmed',
      {
        name: 'order.confirmed.v1',
        envelope: {
          command_id: `ord-confirm-${ORDER}`, correlation_id: `corr-${ORDER}`,
          aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
        },
        payload: {
          orderId: ORDER, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
          paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
        },
      },
      { Authorization: `Bearer ${FULFILL_SECRET}` },
    );
    expect(confirmed.status, confirmed.text).toBe(200);
    const minted = await post('/fulfillment/supplier-code', { supplierId: SUPPLIER }, {
      Authorization: `Bearer ${OPS_SECRET}`,
    });
    expect(minted.status, minted.text).toBe(200);
    code = minted.json['code'] as string;
    expect(code.startsWith('BF-')).toBe(true);
  });

  it('ACCEPT emits fulfillment.accepted.v1 — the canon name, the founder-approved payload, and the intake’s own Bearer', async () => {
    const before = delivered.length;
    const accepted = await post('/fulfillment/accept', { orderId: ORDER }, { Authorization: `Bearer ${code}` });
    expect(accepted.status, accepted.text).toBe(200);
    await waitForDeliveries(before + 1);

    const sent = delivered[before]!;
    expect(sent.path).toBe('/fulfillment/progress');
    expect(sent.auth).toBe(`Bearer ${PROGRESS_SECRET}`);
    const event = JSON.parse(sent.body) as { name: string; payload: Record<string, unknown> };
    expect(event.name).toBe('fulfillment.accepted.v1');
    expect(Object.keys(event.payload).sort()).toEqual(['at', 'orderId']);
    expect(event.payload['orderId']).toBe(ORDER);
    expect(event.payload['at']).toBe(accepted.json['acceptedAt']);
  });

  it('READY emits fulfillment.ready.v1 — the LAST fact anyone can prove today', async () => {
    const challenge = await post('/fulfillment/ready/challenge', { orderId: ORDER }, {
      Authorization: `Bearer ${code}`,
    });
    expect(challenge.status, challenge.text).toBe(200);
    lastChallenge = challenge.json['challenge'] as string;
    const before = delivered.length;
    const ready = await post(
      '/fulfillment/ready',
      // The router takes the WHOLE body as the confirmation and adds `code`
      // from the Bearer itself (`forwardSupplierAct`) — so the canon shape is
      // posted bare, exactly as the fournisseur surface posts it.
      {
        orderId: ORDER,
        photoRef: { ref: `media/readiness/${ORDER}`, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
        readinessChallenge: challenge.json['challenge'],
        qty: 1,
        variant: PV,
        availableConfirmed: true,
        at: new Date().toISOString(),
      },
      { Authorization: `Bearer ${code}` },
    );
    expect(ready.status, ready.text).toBe(200);
    await waitForDeliveries(before + 1);

    const sent = delivered[before]!;
    const event = JSON.parse(sent.body) as { name: string; payload: Record<string, unknown> };
    expect(event.name).toBe('fulfillment.ready.v1');
    expect(Object.keys(event.payload).sort()).toEqual(['at', 'orderId']);
    expect(event.payload['at']).toBe(ready.json['confirmedAt']);
  });

  it('THE BOUNDARY, on the raw delivered bytes: no supplier identity, no readiness secret, no evidence, no franc', async () => {
    expect(delivered.length).toBeGreaterThanOrEqual(2);
    const bytes = delivered.map((d) => d.body).join('\n');
    for (const banned of [
      SUPPLIER,                       // the supplier id, by value
      'supplierId',
      'readinessChallenge',
      'sellerReadinessChallenge',
      'srch-',                        // the challenge's own prefix
      'photoRef',
      'media/readiness',              // the evidence location
      'a'.repeat(64),                 // the evidence digest
      'buyerDropCode',
      'pickupVerificationCode',
      'sellerBasePrice',
      '8000', '8 000',                // B, by value
      'resellerCommission',
      'zoneTo', 'Gounghin',           // the buyer's zone is not this wire's business
      'productVersionId', PV,
    ]) {
      expect(bytes.includes(banned), `the return wire leaked: ${banned}`).toBe(false);
    }
  });

  it('FIRST-WINS: re-accepting AND re-confirming never emit a second time — both acts, not just the first', async () => {
    const before = delivered.length;
    const again = await post('/fulfillment/accept', { orderId: ORDER }, { Authorization: `Bearer ${code}` });
    expect(again.json['status']).toBe('already_accepted');
    // VERIFIER: the readiness half was named in the title and never exercised.
    const readyAgain = await post(
      '/fulfillment/ready',
      {
        orderId: ORDER,
        photoRef: { ref: `media/readiness/${ORDER}`, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
        readinessChallenge: lastChallenge,
        qty: 1,
        variant: PV,
        availableConfirmed: true,
        at: new Date().toISOString(),
      },
      { Authorization: `Bearer ${code}` },
    );
    expect(readyAgain.json['status'], readyAgain.text).toBe('already_ready');
    await new Promise((r) => setTimeout(r, 400));
    expect(delivered.length, 'a repeated act must not re-announce').toBe(before);
  });

  /**
   * B1 — THE RECOVERY PATH, AND WHY NO TEST HERE CLAIMS TO PROVE IT.
   *
   * The verifier proved the original design lost a fact FOREVER: one storage
   * failure during enqueue wrote no outbox row, and NEITHER call site
   * re-entered `enqueueProgress` — while that method's own catch claimed
   * « both call sites are idempotent and re-enter here ». Both now genuinely
   * re-enter, so re-asserting the act recreates a lost row.
   *
   * A FIRST ATTEMPT AT A TEST FOR THIS PASSED FOR THE WRONG REASON and was
   * DELETED rather than kept: it never actually lost a row, and the mutation
   * that re-broke the fix left it green. Losing one genuinely needs a
   * fault-injection seam in production code or a storage backdoor on this
   * object, and neither earns its blast radius for a path whose correctness
   * is one `await` at each of two call sites.
   *
   * WHAT IS PROVEN INSTEAD, by the refusal suite at the end of this file: a
   * fact the consumer refuses is never marked delivered and is still
   * delivered later — the failure mode that actually happens in production.
   * Recorded here rather than papered over with a green test.
   */
});

/**
 * THE UNCONFIGURED WORLD — a Worker deployed before the founder runs
 * `wrangler secret put PROGRESS_WRITE_SECRET`. The supplier's act MUST still
 * succeed and the fact MUST NOT be silently dropped: it stays pending and
 * retries. This is the honest-failure half of the wire, and it is the half a
 * comment could otherwise claim without owning.
 */
describe('READINESS-RETURN-1b — with no progress secret, the act succeeds and nothing is ever claimed delivered', () => {
  const persist2 = mkdtempSync(join(tmpdir(), 'readiness-return-nosecret-'));
  const seen: string[] = [];
  const blind = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persist2,
    bindings: {
      OFFER_WRITE_SECRET: WRITE_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
      // PROGRESS_WRITE_SECRET deliberately ABSENT
    },
    serviceBindings: {
      STOREFRONT: async (request: Request) => {
        seen.push(await request.text());
        return Response.json({ ok: true });
      },
    },
  });

  it('accepts the order, delivers nothing, and does not fail the supplier', async () => {
    const ORDER2 = 'ord-return-0002';
    const pub = await blind.dispatchFetch('http://o/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Write-Key': WRITE_SECRET },
      body: JSON.stringify({ ...seed, commandId: 'seed-return-2', offerId: 'offer-return-2' }),
    });
    expect(pub.status).toBe(200);
    const conf = await blind.dispatchFetch('http://o/fulfillment/order-confirmed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
      body: JSON.stringify({
        name: 'order.confirmed.v1',
        envelope: {
          command_id: `ord-confirm-${ORDER2}`, correlation_id: `corr-${ORDER2}`,
          aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
        },
        payload: {
          orderId: ORDER2, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
          paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
        },
      }),
    });
    expect(conf.status).toBe(200);
    const mint = await blind.dispatchFetch('http://o/fulfillment/supplier-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_SECRET}` },
      body: JSON.stringify({ supplierId: SUPPLIER }),
    });
    const theCode = ((await mint.json()) as { code: string }).code;

    const acc = await blind.dispatchFetch('http://o/fulfillment/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${theCode}` },
      body: JSON.stringify({ orderId: ORDER2 }),
    });
    // THE SUPPLIER'S ACT IS UNHARMED — his work never depends on a wire home
    expect(acc.status, await acc.clone().text()).toBe(200);
    await new Promise((r) => setTimeout(r, 400));
    expect(seen, 'nothing may be delivered without the secret').toEqual([]);
    await blind.dispose();

    /**
     * …AND NOTHING WAS FALSELY MARKED DELIVERED — proven BEHAVIOURALLY, which
     * is the only honest way without a test backdoor into the outbox.
     *
     * The verifier showed the old assertion (`seen === []`) could not see this:
     * hardcoding `delivered = true` left the whole suite green while every
     * fact was silently marked sent and never actually delivered. Here the
     * SAME durable store is reopened by a Worker that HAS the secret. If the
     * row had been marked delivered, it could never arrive. It must arrive.
     */
    const landed: string[] = [];
    const configured = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
      durableObjectsPersist: persist2,
      bindings: {
        OFFER_WRITE_SECRET: WRITE_SECRET,
        FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
        FULFILLMENT_OPS_SECRET: OPS_SECRET,
        PROGRESS_WRITE_SECRET: PROGRESS_SECRET, // now set, as the founder would
      },
      serviceBindings: {
        STOREFRONT: async (request: Request) => {
          landed.push(await request.text());
          return Response.json({ ok: true });
        },
      },
    });
    try {
      // Re-asserting the act re-arms a pending row that lost its alarm.
      const again = await configured.dispatchFetch('http://o/fulfillment/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${theCode}` },
        body: JSON.stringify({ orderId: ORDER2 }),
      });
      expect(again.status).toBe(200);
      const started = Date.now();
      while (landed.length === 0 && Date.now() - started < 8_000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(landed.length, 'the fact must still be deliverable — it was never truly sent').toBe(1);
      const event = JSON.parse(landed[0]!) as { name: string; payload: { orderId: string } };
      expect(event.name).toBe('fulfillment.accepted.v1');
      expect(event.payload.orderId).toBe(ORDER2);
    } finally {
      await configured.dispose();
      rmSync(persist2, { recursive: true, force: true });
    }
  });
});

/**
 * READINESS-RETURN-1b — A REFUSED DELIVERY IS NOT A DELIVERY.
 *
 * The verifier proved the earlier suite could not see this: hardcoding
 * `delivered = true` left every test green while facts were marked sent and
 * never actually arrived. That mutation was invisible because the only
 * unconfigured world never entered the delivery branch at all.
 *
 * Here the consumer is REACHABLE and REFUSES with a 503 — the retryable
 * shape — so the branch runs, `res.ok` is false, and the row must stay
 * pending. Then the consumer starts accepting and the fact must still arrive.
 * If a refusal were ever recorded as a delivery, it never would.
 */
describe('READINESS-RETURN-1b — a refusal keeps the fact alive until it truly lands', () => {
  it('503 first, then 200: the fact survives the refusal and is delivered exactly once', async () => {
    const p = mkdtempSync(join(tmpdir(), 'readiness-return-refuse-'));
    let refuse = true;
    const arrived: string[] = [];
    const world = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
      durableObjectsPersist: p,
      bindings: {
        OFFER_WRITE_SECRET: WRITE_SECRET,
        FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
        FULFILLMENT_OPS_SECRET: OPS_SECRET,
        PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      },
      serviceBindings: {
        STOREFRONT: async (request: Request) => {
          const body = await request.text();
          if (refuse) return new Response('{"ok":false}', { status: 503 });
          arrived.push(body);
          return Response.json({ ok: true });
        },
      },
    });
    const ORDER3 = 'ord-return-0003';
    try {
      await world.dispatchFetch('http://o/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Write-Key': WRITE_SECRET },
        body: JSON.stringify({ ...seed, commandId: 'seed-return-3', offerId: 'offer-return-3' }),
      });
      await world.dispatchFetch('http://o/fulfillment/order-confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
        body: JSON.stringify({
          name: 'order.confirmed.v1',
          envelope: {
            command_id: `ord-confirm-${ORDER3}`, correlation_id: `corr-${ORDER3}`,
            aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
          },
          payload: {
            orderId: ORDER3, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
            paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
          },
        }),
      });
      const mint = await world.dispatchFetch('http://o/fulfillment/supplier-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_SECRET}` },
        body: JSON.stringify({ supplierId: SUPPLIER }),
      });
      const theCode = ((await mint.json()) as { code: string }).code;

      const acc = await world.dispatchFetch('http://o/fulfillment/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${theCode}` },
        body: JSON.stringify({ orderId: ORDER3 }),
      });
      expect(acc.status).toBe(200);

      // the consumer refused; nothing may be considered delivered
      await new Promise((r) => setTimeout(r, 600));
      expect(arrived, 'a 503 is not a delivery').toEqual([]);

      // now it accepts — the fact must still be there to send
      refuse = false;
      const started = Date.now();
      while (arrived.length === 0 && Date.now() - started < 10_000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(arrived.length, 'a fact refused once must still be delivered later').toBe(1);
      const event = JSON.parse(arrived[0]!) as { name: string; payload: { orderId: string } };
      expect(event.name).toBe('fulfillment.accepted.v1');
      expect(event.payload.orderId).toBe(ORDER3);
    } finally {
      await world.dispose();
      rmSync(p, { recursive: true, force: true });
    }
  }, 30_000);
});
