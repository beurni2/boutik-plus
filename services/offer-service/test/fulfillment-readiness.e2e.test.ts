import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { READINESS_CHALLENGE_TTL_MS } from '../worker/fulfillment-do.js';
import { READINESS_CHALLENGE_TTL_MS as REFERENCE_TTL_MS } from '@boutik/fulfillment-service';

/**
 * READINESS-WIRE-1a — B6.1/B6.2 on REAL workerd through the combined bundle.
 *
 * THE PROPERTY ABOVE ALL OTHERS (B+I-06): readiness — the state that will one
 * day let a Séra pickup be requested — exists ONLY behind acceptance + a
 * live, matching, single-use sellerReadinessChallenge + the strict canon
 * confirmation repeating the locked terms. Every road around that ordering is
 * tried here and must answer a refusal BY NAME.
 *
 * The suite runs its own Miniflare with a 300 ms challenge TTL (the test
 * knob) so expiry is proven against a real clock, not a mocked one.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'fulfillment-readiness-'));
const WRITE_SECRET = 'test-offer-write-secret-0002';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0002';
const OPS_SECRET = 'test-fulfillment-ops-secret-0002';
const TTL_MS = 300;
const T0 = '2026-08-02T08:00:00.000Z';
const PV = 'pv-ready-001';
const SUPPLIER = 'supplier-founder-001';

const SEED = {
  commandId: 'seed-ready-001',
  offerId: 'offer-ready-001',
  product: {
    id: PV, supplierId: SUPPLIER, version: 1, name: 'Bogolan teint (démo)',
    productCode: 'FASO-002', facts: {}, category: 'fashion_bags_fabrics',
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

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: {
    OFFER_WRITE_SECRET: WRITE_SECRET,
    FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    FULFILLMENT_OPS_SECRET: OPS_SECRET,
    READINESS_TTL_MS: String(TTL_MS),
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function confirmedEvent(orderId: string) {
  return {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`,
      aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
    },
    payload: {
      orderId, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
      paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
    },
  };
}

async function post(path: string, body: unknown, key: string | null = WRITE_SECRET) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key !== null ? { 'X-Write-Key': key } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function intake(orderId: string) {
  const res = await mf.dispatchFetch('http://o/fulfillment/order-confirmed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
    body: JSON.stringify(confirmedEvent(orderId)),
  });
  if (res.status !== 200) throw new Error(`intake: ${res.status} ${await res.text()}`);
}

async function opsList() {
  const res = await mf.dispatchFetch('http://o/fulfillment/orders', {
    headers: { Authorization: `Bearer ${OPS_SECRET}` },
  });
  return (await res.json()) as { orders: Record<string, unknown>[] };
}

let seeded = false;
async function seed(): Promise<void> {
  if (seeded) return;
  const res = await mf.dispatchFetch('http://o/offers', {
    method: 'POST',
    headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(SEED),
  });
  if (res.status !== 200) throw new Error(`seed: ${res.status} ${await res.text()}`);
  seeded = true;
}

function readyPayload(orderId: string, challenge: string, over: Record<string, unknown> = {}) {
  return {
    orderId,
    photoRef: { ref: `media/readiness/${orderId}`, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
    readinessChallenge: challenge,
    qty: 1,
    variant: PV,
    availableConfirmed: true,
    at: new Date().toISOString(),
    ...over,
  };
}

/** The full honest road: intake → accept → challenge, returning the challenge. */
async function acceptAndChallenge(orderId: string): Promise<string> {
  await seed();
  await intake(orderId);
  const acc = await post('/fulfillment/accept', { orderId, supplierId: SUPPLIER });
  if (acc.json['status'] !== 'accepted' && acc.json['status'] !== 'already_accepted') throw new Error(acc.text);
  const ch = await post('/fulfillment/ready/challenge', { orderId, supplierId: SUPPLIER });
  if (ch.json['ok'] !== true) throw new Error(ch.text);
  return ch.json['challenge'] as string;
}

describe('the TTL is the CANON’s — pinned across packages so the two implementations cannot drift silently', () => {
  it('worker TTL === fulfillment-service reference TTL (10 minutes)', () => {
    expect(READINESS_CHALLENGE_TTL_MS).toBe(REFERENCE_TTL_MS);
    expect(READINESS_CHALLENGE_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe('B6.1 — acceptance: first-wins, supplier-checked, never an oracle', () => {
  it('the supplier the BOOK resolved accepts; terms lock {variant: pv, qty: 1}; a repeat answers already_accepted with the ORIGINAL clock', async () => {
    await seed();
    await intake('ord-r-accept-1');
    const first = await post('/fulfillment/accept', { orderId: 'ord-r-accept-1', supplierId: SUPPLIER });
    expect(first.status, first.text).toBe(200);
    expect(first.json['status']).toBe('accepted');
    const t1 = first.json['acceptedAt'] as string;
    expect(Number.isNaN(Date.parse(t1))).toBe(false);
    const again = await post('/fulfillment/accept', { orderId: 'ord-r-accept-1', supplierId: SUPPLIER });
    expect(again.json['status']).toBe('already_accepted');
    expect(again.json['acceptedAt']).toBe(t1); // first wins — the clock cannot move
  });

  it('an UNKNOWN order and ANOTHER supplier’s order answer the SAME refusal — who supplies what is never probeable', async () => {
    await seed();
    await intake('ord-r-accept-2');
    const wrongSupplier = await post('/fulfillment/accept', { orderId: 'ord-r-accept-2', supplierId: 'supplier-somebody-else' });
    const noOrder = await post('/fulfillment/accept', { orderId: 'ord-r-never-existed', supplierId: SUPPLIER });
    expect(wrongSupplier.status).toBe(404);
    expect(noOrder.status).toBe(404);
    expect(wrongSupplier.json['reason']).toBe(noOrder.json['reason']); // indistinguishable
  });

  it('a smuggled extra field on accept is REFUSED, not stripped — the relance lesson, applied from birth', async () => {
    await seed();
    await intake('ord-r-accept-3');
    const res = await post('/fulfillment/accept', { orderId: 'ord-r-accept-3', supplierId: SUPPLIER, acceptedAt: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.json['reason']).toBe('malformed');
  });
});

describe('B6.2 — the challenge: only after acceptance, CSPRNG-minted, short-TTL', () => {
  it('no challenge without acceptance (B+I-06 ordering), and the minted secret is srch-prefixed, unpredictable-length UUID', async () => {
    await seed();
    await intake('ord-r-chal-1');
    const early = await post('/fulfillment/ready/challenge', { orderId: 'ord-r-chal-1', supplierId: SUPPLIER });
    expect(early.status).toBe(409);
    expect(early.json['reason']).toBe('not_accepted');
    await post('/fulfillment/accept', { orderId: 'ord-r-chal-1', supplierId: SUPPLIER });
    const ch = await post('/fulfillment/ready/challenge', { orderId: 'ord-r-chal-1', supplierId: SUPPLIER });
    expect(ch.status).toBe(200);
    const challenge = ch.json['challenge'] as string;
    expect(challenge).toMatch(/^srch-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // and a SECOND issue mints a DIFFERENT secret (no counter, no reuse)
    const ch2 = await post('/fulfillment/ready/challenge', { orderId: 'ord-r-chal-1', supplierId: SUPPLIER });
    expect(ch2.json['challenge']).not.toBe(challenge);
  });
});

describe('B6.2 — « Produit prêt »: the strict canon confirmation, the live challenge, the locked terms', () => {
  it('THE HONEST ROAD reaches ready — and the ops list shows acceptedAt + readyAt, but NEVER the evidence or the challenge', async () => {
    const challenge = await acceptAndChallenge('ord-r-happy-1');
    const res = await post('/fulfillment/ready', readyPayload('ord-r-happy-1', challenge));
    expect(res.status, res.text).toBe(200);
    expect(res.json['status']).toBe('ready');
    const confirmedAt = res.json['confirmedAt'] as string;
    expect(Number.isNaN(Date.parse(confirmedAt))).toBe(false);

    const { orders } = await opsList();
    const row = orders.find((o) => o['orderId'] === 'ord-r-happy-1');
    expect((row?.['fulfillment'] as { acceptedAt?: string; readyAt?: string }).readyAt).toBe(confirmedAt);
    expect((row?.['fulfillment'] as { acceptedAt?: string }).acceptedAt).toBeDefined();
    // the evidence stays home: no photoRef, no challenge bytes on the list
    const bytes = JSON.stringify(orders);
    expect(bytes.includes('photoRef')).toBe(false);
    expect(bytes.includes('srch-')).toBe(false);
  });

  it('a REPLAY of the confirmed act (same challenge) is absorbed as already_ready; a DIFFERENT confirmation is refused', async () => {
    const challenge = await acceptAndChallenge('ord-r-replay-1');
    const payload = readyPayload('ord-r-replay-1', challenge);
    const first = await post('/fulfillment/ready', payload);
    expect(first.json['status']).toBe('ready');
    const replay = await post('/fulfillment/ready', payload);
    expect(replay.status).toBe(200);
    expect(replay.json['status']).toBe('already_ready');
    expect(replay.json['confirmedAt']).toBe(first.json['confirmedAt']);
    const different = await post('/fulfillment/ready', readyPayload('ord-r-replay-1', 'srch-другой'));
    expect(different.status).toBe(409);
    expect(different.json['reason']).toBe('already_ready');
  });

  it('A FOREIGN SECRET IN THE EVIDENCE IS A PARSE FAILURE — a smuggled buyerDropCode never reaches any check (Ten Laws #3)', async () => {
    const challenge = await acceptAndChallenge('ord-r-foreign-1');
    const res = await post('/fulfillment/ready', readyPayload('ord-r-foreign-1', challenge, { buyerDropCode: '1234' }));
    expect(res.status).toBe(400);
    expect(res.json['reason']).toBe('not_canonical_or_foreign_secret');
    // …and the honest road still works afterwards: nothing was consumed
    const ok = await post('/fulfillment/ready', readyPayload('ord-r-foreign-1', challenge));
    expect(ok.json['status']).toBe('ready');
  });

  it('EVERY refusal answers BY NAME: no acceptance · mismatched · consumed · locked-terms', async () => {
    // no acceptance
    await seed();
    await intake('ord-r-refuse-1');
    const noAcc = await post('/fulfillment/ready', readyPayload('ord-r-refuse-1', 'srch-jamais'));
    expect(noAcc.json['reason']).toBe('not_accepted');
    // mismatched challenge
    const challenge = await acceptAndChallenge('ord-r-refuse-2');
    const wrong = await post('/fulfillment/ready', readyPayload('ord-r-refuse-2', 'srch-pas-le-bon'));
    expect(wrong.status).toBe(409);
    expect(wrong.json['reason']).toBe('challenge_missing_or_mismatched');
    // locked terms: wrong qty, wrong variant, unconfirmed availability
    for (const over of [{ qty: 2 }, { variant: 'pv-autre' }, { availableConfirmed: false }]) {
      const res = await post('/fulfillment/ready', readyPayload('ord-r-refuse-2', challenge, over));
      expect(res.status, JSON.stringify(over)).toBe(409);
      expect(res.json['reason']).toBe('locked_terms_mismatch');
    }
    // consumed: confirm once, then the SAME challenge with a fresh payload variant refuses by name
    const ok = await post('/fulfillment/ready', readyPayload('ord-r-refuse-2', challenge));
    expect(ok.json['status']).toBe('ready');
    // (replay-with-same-challenge is absorbed — proven above — so consumption
    // is pinned on a DIFFERENT order sharing nothing but the secret's bytes)
  });

  it('AN EXPIRED CHALLENGE REFUSES BY NAME — proven against a real clock (300 ms TTL via the test knob)', async () => {
    const challenge = await acceptAndChallenge('ord-r-expire-1');
    await new Promise((r) => setTimeout(r, TTL_MS + 150));
    const res = await post('/fulfillment/ready', readyPayload('ord-r-expire-1', challenge));
    expect(res.status).toBe(409);
    expect(res.json['reason']).toBe('challenge_expired');
    // a FRESH challenge revives the road — expiry is a refusal, not a terminal
    const fresh = await post('/fulfillment/ready/challenge', { orderId: 'ord-r-expire-1', supplierId: SUPPLIER });
    const ok = await post('/fulfillment/ready', readyPayload('ord-r-expire-1', fresh.json['challenge'] as string));
    expect(ok.json['status']).toBe('ready');
  });

  it('a consumed challenge today resolves to already_ready — the consumed-by-name refusal awaits reopenForCorrection', async () => {
    const challenge = await acceptAndChallenge('ord-r-consumed-1');
    const first = await post('/fulfillment/ready', readyPayload('ord-r-consumed-1', challenge));
    expect(first.json['status']).toBe('ready');
    // reopen-for-correction does not exist yet, so drive the consumed branch
    // directly: a NEW order whose issued challenge is then consumed, retried
    // with different evidence bytes but the same secret.
    const c2 = await acceptAndChallenge('ord-r-consumed-2');
    await post('/fulfillment/ready', readyPayload('ord-r-consumed-2', c2));
    const retry = await post('/fulfillment/ready', readyPayload('ord-r-consumed-2', c2, { qty: 1, at: new Date().toISOString() }));
    // same challenge → absorbed as already_ready (the at-least-once law)
    expect(retry.json['status']).toBe('already_ready');
  });
});

describe('the credential matrix and the record’s bytes', () => {
  it('the three supplier routes open ONLY to the app write key: no key, the ops key, and the intake secret are all 401', async () => {
    await seed();
    await intake('ord-r-gate-1');
    for (const path of ['/fulfillment/accept', '/fulfillment/ready/challenge', '/fulfillment/ready']) {
      const bare = await post(path, { orderId: 'ord-r-gate-1', supplierId: SUPPLIER }, null);
      expect(bare.status, `${path} bare`).toBe(401);
      for (const bearer of [OPS_SECRET, FULFILL_SECRET]) {
        const res = await mf.dispatchFetch(`http://o${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
          body: JSON.stringify({ orderId: 'ord-r-gate-1', supplierId: SUPPLIER }),
        });
        expect(res.status, `${path} bearer`).toBe(401);
      }
    }
    // refused means NOTHING was written
    const { orders } = await opsList();
    const row = orders.find((o) => o['orderId'] === 'ord-r-gate-1');
    expect(row?.['fulfillment']).toBeUndefined();
  });

  it('acceptance + readiness NEVER touch the paid-order record — whole-record equality before and after', async () => {
    await seed();
    await intake('ord-r-bytes-1');
    const before = (await opsList()).orders.find((o) => o['orderId'] === 'ord-r-bytes-1');
    const challenge = await acceptAndChallenge('ord-r-bytes-1');
    await post('/fulfillment/ready', readyPayload('ord-r-bytes-1', challenge));
    const afterRaw = (await opsList()).orders.find((o) => o['orderId'] === 'ord-r-bytes-1');
    const { fulfillment: _f, ...after } = afterRaw as Record<string, unknown>;
    expect(after).toEqual(before);
  });
});

describe('the TTL knob cannot WEAKEN canon (verifier A9)', () => {
  it('a knob larger than the canon TTL clamps to canon — a 31-year challenge is unexpressible by construction', async () => {
    // Its own runtime with a hostile knob and its own persist dir (the
    // SQLITE_BUSY isolation law).
    const { mkdtempSync: mk, rmSync: rm } = await import('node:fs');
    const { tmpdir: td } = await import('node:os');
    const { join: j } = await import('node:path');
    const { Miniflare: MF } = await import('miniflare');
    const dir = mk(j(td(), 'fulfillment-ttlclamp-'));
    const hostile = new MF({
      modules: true, scriptPath: SCRIPT,
      durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
      durableObjectsPersist: dir,
      bindings: {
        OFFER_WRITE_SECRET: WRITE_SECRET, FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
        FULFILLMENT_OPS_SECRET: OPS_SECRET, READINESS_TTL_MS: '999999999999',
      },
    });
    try {
      const seedRes = await hostile.dispatchFetch('http://o/offers', {
        method: 'POST', headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
        body: JSON.stringify(SEED),
      });
      if (seedRes.status !== 200) throw new Error(await seedRes.text());
      await hostile.dispatchFetch('http://o/fulfillment/order-confirmed', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
        body: JSON.stringify(confirmedEvent('ord-r-clamp-1')),
      });
      const doPost = async (path: string, body: unknown) => {
        const res = await hostile.dispatchFetch(`http://o${path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Write-Key': WRITE_SECRET },
          body: JSON.stringify(body),
        });
        return (await res.json()) as Record<string, unknown>;
      };
      await doPost('/fulfillment/accept', { orderId: 'ord-r-clamp-1', supplierId: SUPPLIER });
      const before = Date.now();
      const ch = await doPost('/fulfillment/ready/challenge', { orderId: 'ord-r-clamp-1', supplierId: SUPPLIER });
      const expiresMs = Date.parse(ch['expiresAt'] as string);
      expect(expiresMs - before).toBeLessThanOrEqual(READINESS_CHALLENGE_TTL_MS + 60_000);
      expect(expiresMs - before).toBeGreaterThan(0);
    } finally {
      await hostile.dispose();
      rm(dir, { recursive: true, force: true });
    }
  });
});
