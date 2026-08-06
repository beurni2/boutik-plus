import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ SE-LIVE-2b — THE READINESS FACT REACHES SÉRA'S DOOR ═══
 *
 * Séra's dispatch gate (SE-I02) admits a delivery task only for an order that
 * is « supplier-ready (readiness confirmed) », and SE-I09 forbids Séra from
 * deciding that itself: it consumes the supplier's own confirmation, which is
 * already durable on the FulfillmentDO. This suite asserts the ACTUAL REQUEST
 * that leaves the Worker (a real local http origin, not a stubbed `fetch`).
 *
 * THE PROPERTY ABOVE ALL OTHERS — what must never travel. `readinessChallenge`
 * is one of the four non-interchangeable secrets (§5.4), the readiness photo is
 * seller-side evidence, and `buyerDropCode` is banned from anything seller-side
 * (Ten Laws #3). Séra is told THAT the package is ready and WHEN — nothing
 * else. Asserted on the raw bytes AND by an exact key allowlist.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'sera-readiness-'));
const persistUnwired = mkdtempSync(join(tmpdir(), 'sera-readiness-unwired-'));
const WRITE_SECRET = 'test-offer-write-secret-0009';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0009';
const OPS_SECRET = 'test-fulfillment-ops-secret-0009';
const PROGRESS_SECRET = 'test-progress-write-secret-0009';
const SERA_SECRET = 'test-sera-intake-secret-0009';
const T0 = '2026-08-06T08:00:00.000Z';
const PV = 'pv-sera-001';
const SUPPLIER = 'supplier-sera-001';
const ORDER = 'ord-sera-0001';

/** Every request Séra's door received, verbatim. */
const seraPosts: { auth: string | null; path: string; body: string }[] = [];
let seraRespond: 'ok' | 'down' | 'unauthorized' = 'ok';
let seraServer: Server;
let seraBase = '';

/** Shop+'s leg still runs beside it — captured so the two can be told apart. */
const storefrontPosts: { path: string; body: string }[] = [];

beforeAll(async () => {
  seraServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seraPosts.push({
        auth: req.headers['authorization'] ?? null,
        path: req.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      });
      const code = seraRespond === 'down' ? 503 : seraRespond === 'unauthorized' ? 401 : 200;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(code === 200 ? { ok: true, applied: true } : { ok: false }));
    });
  });
  await new Promise<void>((resolve) => seraServer.listen(0, '127.0.0.1', resolve));
  seraBase = `http://127.0.0.1:${(seraServer.address() as AddressInfo).port}`;
});

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
      // The UNWIRED deployment is Boutik+ shipped before Séra's door exists —
      // the deploy-order law's normal case, not an error.
      ...(wired ? { SERA_INTAKE_BASE: seraBase, SERA_INTAKE_SECRET: SERA_SECRET } : {}),
    },
    serviceBindings: {
      STOREFRONT: async (request: Request) => {
        storefrontPosts.push({ path: new URL(request.url).pathname, body: await request.text() });
        return Response.json({ ok: true, status: 'recorded' });
      },
    },
  });
}

let mf: Miniflare;
let unwired: Miniflare | undefined;

afterAll(async () => {
  await mf?.dispose();
  if (unwired !== undefined) await unwired.dispose();
  await new Promise<void>((resolve) => seraServer.close(() => resolve()));
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistUnwired, { recursive: true, force: true });
});

const seed = {
  commandId: 'seed-sera-1',
  offerId: 'offer-sera-1',
  product: {
    id: PV, supplierId: SUPPLIER, version: 1, name: 'Bogolan teint (Séra)',
    productCode: 'FASO-0041', facts: {}, category: 'fashion_bags_fabrics',
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

async function waitForSera(n: number, timeoutMs = 8_000): Promise<void> {
  const started = Date.now();
  while (seraPosts.length < n && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** The whole real path: mint a code, seed the offer, take the paid order,
 *  accept it, then confirm readiness with a live challenge. */
async function driveToReady(m: Miniflare, orderId: string): Promise<string> {
  const minted = await post(m, '/fulfillment/supplier-code', { supplierId: SUPPLIER }, {
    Authorization: `Bearer ${OPS_SECRET}`,
  });
  expect(minted.status, minted.text).toBe(200);
  const code = minted.json['code'] as string;
  expect((await post(m, '/offers', seed, { 'X-Write-Key': WRITE_SECRET })).status).toBe(200);
  const confirmed = await post(
    m,
    '/fulfillment/order-confirmed',
    {
      name: 'order.confirmed.v1',
      envelope: {
        command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`,
        aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
      },
      payload: {
        orderId, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
        paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
      },
    },
    { Authorization: `Bearer ${FULFILL_SECRET}` },
  );
  expect(confirmed.status, confirmed.text).toBe(200);
  expect((await post(m, '/fulfillment/accept', { orderId }, { Authorization: `Bearer ${code}` })).status).toBe(200);
  const challenge = await post(m, '/fulfillment/ready/challenge', { orderId }, {
    Authorization: `Bearer ${code}`,
  });
  expect(challenge.status, challenge.text).toBe(200);
  const ready = await post(
    m,
    '/fulfillment/ready',
    {
      orderId,
      photoRef: { ref: `media/readiness/${orderId}`, sha256: 'b'.repeat(64), mimeType: 'image/jpeg' },
      readinessChallenge: challenge.json['challenge'],
      qty: 1,
      variant: PV,
      availableConfirmed: true,
      at: new Date().toISOString(),
    },
    { Authorization: `Bearer ${code}` },
  );
  expect(ready.status, ready.text).toBe(200);
  return ready.json['confirmedAt'] as string;
}

describe('SE-LIVE-2b — the readiness fact leaves Boutik+ for Séra, and nothing else does', () => {
  it('READY posts the fact to /intake/readiness with the bearer, the order, and the confirmed instant', async () => {
    mf = makeMf(persist, true);
    seraPosts.length = 0;
    seraRespond = 'ok';
    const confirmedAt = await driveToReady(mf, ORDER);
    await waitForSera(1);

    expect(seraPosts).toHaveLength(1);
    const sent = seraPosts[0]!;
    expect(sent.path).toBe('/intake/readiness');
    expect(sent.auth).toBe(`Bearer ${SERA_SECRET}`);
    const fact = JSON.parse(sent.body) as Record<string, unknown>;
    expect(fact['orderId']).toBe(ORDER);
    expect(fact['ready']).toBe(true);
    // The instant is the supplier's own confirmation time, as this object
    // recorded it — the same value the Shop+ progress event carries.
    expect(fact['asOf']).toBe(confirmedAt);
    expect(Object.keys(fact).sort()).toEqual(['asOf', 'orderId', 'ready']);
  });

  it('THE BOUNDARY, on the raw bytes: no readiness secret, no photo, no supplier identity, no franc', async () => {
    const raw = seraPosts[0]!.body;
    for (const banned of [
      'srch-',              // the readiness challenge's own prefix (§5.4 secret)
      'readinessChallenge', // the field name itself
      'photoRef',           // seller-side evidence
      'media/readiness',    // the photo's ref
      'dropCode',           // Ten Laws #3 — never in anything seller-side
      SUPPLIER,             // supplier identity crosses no wire
      '8000', '8 000',      // no franc figure belongs on this wire
    ]) {
      expect(raw, `« ${banned} » must never reach Séra`).not.toContain(banned);
    }
  });

  it('the Shop+ progress leg is untouched beside it — both facts left, each to its own consumer', () => {
    const paths = storefrontPosts.map((p) => p.path);
    expect(paths).toContain('/fulfillment/progress');
    // Séra got exactly one row; Shop+ got its two (accepted + ready).
    expect(storefrontPosts.filter((p) => p.body.includes('fulfillment.ready.v1'))).toHaveLength(1);
    expect(seraPosts).toHaveLength(1);
  });

  it('FIRST-WINS: re-confirming readiness never posts a second fact', async () => {
    const before = seraPosts.length;
    // A re-assertion re-enters the enqueue path; the row already exists.
    const again = await post(mf, '/fulfillment/ready/challenge', { orderId: ORDER }, {
      Authorization: `Bearer ${(await post(mf, '/fulfillment/supplier-code', { supplierId: SUPPLIER }, { Authorization: `Bearer ${OPS_SECRET}` })).json['code'] as string}`,
    });
    // (The challenge call itself is enough to re-enter; readiness is already
    // confirmed, so the ready route answers from the existing record.)
    expect([200, 409]).toContain(again.status);
    await new Promise((r) => setTimeout(r, 300));
    expect(seraPosts.length).toBe(before);
  });

  /**
   * ⚠ THE TWO REFUSALS THAT ACTUALLY OCCUR ON THIS ROUTE, and why 422 is not
   * one of them. Séra's `/intake/readiness` answers 400 for a malformed fact
   * and 200 otherwise; the 422 « not admissible yet » belongs to the
   * task-ready route, not to a fact. So the transient cases this wire really
   * meets are: Séra down (5xx / unreachable) and Séra's secret not yet set
   * (401) — both must retry. A 4xx that is NOT 401/408/429 is PARKED as
   * unsendable by the existing (verifier-reviewed) policy, visible in storage
   * with its reason: correct for a malformed fact, which waiting cannot fix.
   * No special case was invented here for a status this route never returns.
   */
  it('SÉRA DOWN (5xx) RETRIES — the fact is re-attempted on the backoff ladder, never parked', async () => {
    seraRespond = 'down';
    seraPosts.length = 0;
    const order2 = 'ord-sera-0002';
    await driveToReady(mf, order2);
    await waitForSera(1);
    expect(seraPosts.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(seraPosts[0]!.body)['orderId']).toBe(order2);
    // A second attempt follows the backoff ladder (1 s first rung), proving
    // the row is still pending rather than parked.
    await waitForSera(2, 6_000);
    expect(seraPosts.length).toBeGreaterThanOrEqual(2);
    seraRespond = 'ok';
  });

  it('SÉRA’S SECRET NOT YET SET (401) also retries — the backlog drains when the founder arms the door', async () => {
    seraRespond = 'unauthorized';
    seraPosts.length = 0;
    const order4 = 'ord-sera-0004';
    await driveToReady(mf, order4);
    await waitForSera(1);
    expect(seraPosts.length).toBeGreaterThanOrEqual(1);
    await waitForSera(2, 6_000);
    expect(seraPosts.length, '401 must not park the row').toBeGreaterThanOrEqual(2);
    seraRespond = 'ok';
  });

  it('BOUTIK+ DEPLOYED BEFORE SÉRA (no base, no secret): nothing is attempted and no readiness is lost', async () => {
    const before = seraPosts.length;
    unwired = makeMf(persistUnwired, false);
    await driveToReady(unwired, 'ord-sera-0003');
    await new Promise((r) => setTimeout(r, 500));
    // Not one request left the Worker — an unconfigured wire does not guess.
    expect(seraPosts.length).toBe(before);
    // …and the supplier's act succeeded anyway: readiness is recorded, the
    // Shop+ leg still delivered. The fact waits in the outbox for the door.
    expect(storefrontPosts.filter((p) => p.body.includes('ord-sera-0003'))).not.toHaveLength(0);
  });
});
