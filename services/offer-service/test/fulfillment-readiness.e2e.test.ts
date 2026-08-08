import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { READINESS_CHALLENGE_TTL_MS } from '../worker/fulfillment-do.js';
import { READINESS_CHALLENGE_TTL_MS as REFERENCE_TTL_MS } from '@boutik/fulfillment-service';

/**
 * READINESS-WIRE-1a/1b-i — B6.1/B6.2 on REAL workerd, through the PERSONAL
 * CODE DOOR (founder ruling 2026-08-02: suppliers are fulfillment-only; the
 * offers write key never opens their acts).
 *
 * THE PROPERTY ABOVE ALL OTHERS (B+I-06): readiness — the state that will one
 * day let a Séra pickup be requested — exists ONLY behind acceptance + a
 * live, matching, single-use sellerReadinessChallenge + the strict canon
 * confirmation repeating the locked terms. Every road around that ordering is
 * tried here and must answer a refusal BY NAME.
 *
 * TWO REAL SUPPLIERS are seeded so identity scoping is proven by value: the
 * code IS the identity (derived server-side, never claimed), and supplier B's
 * code opens exactly nothing of supplier A's.
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
const PV_A = 'pv-ready-001';
const PV_B = 'pv-ready-002';
const SUPPLIER_A = 'supplier-founder-001';
const SUPPLIER_B = 'supplier-deux-002';

function seedFor(pv: string, supplierId: string, n: string) {
  return {
    commandId: `seed-ready-${n}`,
    offerId: `offer-ready-${n}`,
    product: {
      id: pv, supplierId, version: 1, name: `Bogolan teint (démo ${n})`,
      productCode: `FASO-00${n}`, facts: {}, category: 'fashion_bags_fabrics',
      zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: pv, basePrice: 8_000, resellerCommission: 800,
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 3,
    asOf: T0,
  };
}

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

function confirmedEvent(orderId: string, pv: string = PV_A) {
  return {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`,
      aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
    },
    payload: {
      orderId, productVersionId: pv, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
      paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
    },
  };
}

/** Supplier act: Bearer = the personal code. */
async function act(path: string, body: unknown, code: string | null) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(code !== null ? { Authorization: `Bearer ${code}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function mine(code: string | null) {
  const res = await mf.dispatchFetch('http://o/fulfillment/mine', {
    headers: code !== null ? { Authorization: `Bearer ${code}` } : {},
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function opsPost(path: string, body: unknown, bearer: string | null = OPS_SECRET) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer !== null ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function intake(orderId: string, pv: string = PV_A) {
  const res = await mf.dispatchFetch('http://o/fulfillment/order-confirmed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
    body: JSON.stringify(confirmedEvent(orderId, pv)),
  });
  if (res.status !== 200) throw new Error(`intake: ${res.status} ${await res.text()}`);
}

async function opsList() {
  const res = await mf.dispatchFetch('http://o/fulfillment/orders', {
    headers: { Authorization: `Bearer ${OPS_SECRET}` },
  });
  return (await res.json()) as { orders: Record<string, unknown>[] };
}

let prepared: { codeA: string; codeB: string } | null = null;
/** One-time world: both offers seeded, both codes minted. */
async function world(): Promise<{ codeA: string; codeB: string }> {
  if (prepared !== null) return prepared;
  // MINT BEFORE SEED (LISTER-POUR-1a'): a create may only name a supplier
  // who currently holds an active code, so the codes come first.
  const a = await opsPost('/fulfillment/supplier-code', { supplierId: SUPPLIER_A });
  const b = await opsPost('/fulfillment/supplier-code', { supplierId: SUPPLIER_B });
  if (a.json['ok'] !== true || b.json['ok'] !== true) throw new Error(`mint: ${a.text} ${b.text}`);
  for (const seed of [seedFor(PV_A, SUPPLIER_A, '1'), seedFor(PV_B, SUPPLIER_B, '2')]) {
    const res = await mf.dispatchFetch('http://o/offers', {
      method: 'POST',
      headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify(seed),
    });
    if (res.status !== 200) throw new Error(`seed: ${res.status} ${await res.text()}`);
  }
  prepared = { codeA: a.json['code'] as string, codeB: b.json['code'] as string };
  return prepared;
}

function readyPayload(orderId: string, challenge: string, over: Record<string, unknown> = {}, pv: string = PV_A) {
  return {
    orderId,
    photoRef: { ref: `media/readiness/${orderId}`, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
    readinessChallenge: challenge,
    qty: 1,
    variant: pv,
    availableConfirmed: true,
    at: new Date().toISOString(),
    ...over,
  };
}

/** The full honest road for supplier A: intake → accept → challenge. */
async function acceptAndChallenge(orderId: string): Promise<{ codeA: string; challenge: string }> {
  const { codeA } = await world();
  await intake(orderId);
  const acc = await act('/fulfillment/accept', { orderId }, codeA);
  if (acc.json['status'] !== 'accepted' && acc.json['status'] !== 'already_accepted') throw new Error(acc.text);
  const ch = await act('/fulfillment/ready/challenge', { orderId }, codeA);
  if (ch.json['ok'] !== true) throw new Error(ch.text);
  return { codeA, challenge: ch.json['challenge'] as string };
}

describe('the TTL is the CANON’s — pinned across packages so the two implementations cannot drift silently', () => {
  it('worker TTL === fulfillment-service reference TTL (10 minutes)', () => {
    expect(READINESS_CHALLENGE_TTL_MS).toBe(REFERENCE_TTL_MS);
    expect(READINESS_CHALLENGE_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe('1b-i — the personal code: minted by the FOUNDER alone, hash-stored, one per supplier', () => {
  it('the mint is ops-key-gated: no key, the write key, and the intake secret are all 401', async () => {
    for (const bearer of [null, FULFILL_SECRET]) {
      const res = await opsPost('/fulfillment/supplier-code', { supplierId: 'supplier-x' }, bearer);
      expect(res.status, String(bearer)).toBe(401);
    }
    const asWriteKey = await mf.dispatchFetch('http://o/fulfillment/supplier-code', {
      method: 'POST',
      headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: 'supplier-x' }),
    });
    expect(asWriteKey.status).toBe(401);
  });

  it('the minted code has the handover shape, and its BYTES appear nowhere the founder’s list can leak them', async () => {
    const { codeA } = await world();
    expect(codeA).toMatch(/^BF-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    const { orders } = await opsList();
    expect(JSON.stringify(orders).includes(codeA)).toBe(false); // hash-stored: the plaintext lives only in the mint response
  });

  it('RE-MINT replaces: the old code dies at that instant, the new one works — rotation IS revocation', async () => {
    const first = await opsPost('/fulfillment/supplier-code', { supplierId: 'supplier-rotate-1' });
    const second = await opsPost('/fulfillment/supplier-code', { supplierId: 'supplier-rotate-1' });
    const oldCode = first.json['code'] as string;
    const newCode = second.json['code'] as string;
    expect(oldCode).not.toBe(newCode);
    expect((await mine(oldCode)).status).toBe(401);
    expect((await mine(newCode)).status).toBe(200);
  });

  it('REVOKE cuts a supplier off mid-flow, and is honestly idempotent', async () => {
    const minted = await opsPost('/fulfillment/supplier-code', { supplierId: 'supplier-revoke-1' });
    const code = minted.json['code'] as string;
    expect((await mine(code)).status).toBe(200);
    const revoked = await opsPost('/fulfillment/supplier-code/revoke', { supplierId: 'supplier-revoke-1' });
    expect(revoked.json['status']).toBe('revoked');
    expect((await mine(code)).status).toBe(401);
    const again = await opsPost('/fulfillment/supplier-code/revoke', { supplierId: 'supplier-revoke-1' });
    expect(again.json['status']).toBe('no_code');
  });
});

describe('1b-i — /fulfillment/mine: the code is the identity, and only YOUR orders leave', () => {
  it('supplier A sees exactly A’s orders (allowlisted fields, no relance, no supplierId echo); B sees B’s; a bad code sees a 401', async () => {
    const { codeA, codeB } = await world();
    await intake('ord-mine-a1');
    await intake('ord-mine-b1', PV_B);
    // the founder chases A's order — HIS log must not reach the supplier
    await opsPost('/fulfillment/relance', { orderId: 'ord-mine-a1' });

    const a = await mine(codeA);
    expect(a.status).toBe(200);
    const aOrders = a.json['orders'] as Record<string, unknown>[];
    expect(aOrders.some((o) => o['orderId'] === 'ord-mine-a1')).toBe(true);
    expect(aOrders.some((o) => o['orderId'] === 'ord-mine-b1')).toBe(false);
    const row = aOrders.find((o) => o['orderId'] === 'ord-mine-a1')!;
    expect(Object.keys(row).sort()).toEqual(
      ['offerVersion', 'orderId', 'paidAt', 'paymentMode', 'productName', 'productVersionId', 'sellerBasePrice', 'zoneTo'].sort(),
    ); // the ALLOWLIST: no relance, no supplierId, no correlation, no registeredAt

    const b = await mine(codeB);
    const bOrders = b.json['orders'] as Record<string, unknown>[];
    expect(bOrders.some((o) => o['orderId'] === 'ord-mine-b1')).toBe(true);
    expect(bOrders.some((o) => o['orderId'] === 'ord-mine-a1')).toBe(false);

    expect((await mine('BF-FAKE-FAKE-FAKE-FAKE')).status).toBe(401);
    expect((await mine(null)).status).toBe(401);
  });

  it('the fulfillment marks ride /mine — the supplier follows their own order’s state', async () => {
    const { codeA, challenge } = await acceptAndChallenge('ord-mine-follow-1');
    await act('/fulfillment/ready', readyPayload('ord-mine-follow-1', challenge), codeA);
    const res = await mine(codeA);
    const row = (res.json['orders'] as Record<string, unknown>[]).find((o) => o['orderId'] === 'ord-mine-follow-1')!;
    const mark = row['fulfillment'] as { acceptedAt?: string; readyAt?: string };
    expect(mark.acceptedAt).toBeDefined();
    expect(mark.readyAt).toBeDefined();
  });
});

describe('B6.1 — acceptance through the code door: derived identity, first-wins, never an oracle', () => {
  it('A’s code accepts A’s order; the terms lock; a repeat answers already_accepted with the ORIGINAL clock', async () => {
    const { codeA } = await world();
    await intake('ord-r-accept-1');
    const first = await act('/fulfillment/accept', { orderId: 'ord-r-accept-1' }, codeA);
    expect(first.status, first.text).toBe(200);
    expect(first.json['status']).toBe('accepted');
    const t1 = first.json['acceptedAt'] as string;
    expect(Number.isNaN(Date.parse(t1))).toBe(false);
    const again = await act('/fulfillment/accept', { orderId: 'ord-r-accept-1' }, codeA);
    expect(again.json['status']).toBe('already_accepted');
    expect(again.json['acceptedAt']).toBe(t1);
  });

  it('B’s code on A’s order and A’s code on an UNKNOWN order answer the SAME refusal — never an oracle', async () => {
    const { codeA, codeB } = await world();
    await intake('ord-r-accept-2');
    const wrongSupplier = await act('/fulfillment/accept', { orderId: 'ord-r-accept-2' }, codeB);
    const noOrder = await act('/fulfillment/accept', { orderId: 'ord-r-never-existed' }, codeA);
    expect(wrongSupplier.status).toBe(404);
    expect(noOrder.status).toBe(404);
    expect(wrongSupplier.json['reason']).toBe(noOrder.json['reason']);
  });

  it('the offers WRITE KEY no longer opens any supplier act — the founder’s capability ruling, structural', async () => {
    const { codeA: _ } = await world();
    await intake('ord-r-gate-2');
    for (const path of ['/fulfillment/accept', '/fulfillment/ready/challenge']) {
      const asHeader = await mf.dispatchFetch(`http://o${path}`, {
        method: 'POST',
        headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: 'ord-r-gate-2' }),
      });
      expect(asHeader.status, `${path} X-Write-Key`).toBe(401);
      const asBearer = await act(path, { orderId: 'ord-r-gate-2' }, WRITE_SECRET);
      expect(asBearer.status, `${path} bearer`).toBe(401);
      // …nor the founder's ops key, nor Shop+'s intake secret
      for (const bearer of [OPS_SECRET, FULFILL_SECRET]) {
        expect((await act(path, { orderId: 'ord-r-gate-2' }, bearer)).status, `${path}`).toBe(401);
      }
    }
    const { orders } = await opsList();
    expect(orders.find((o) => o['orderId'] === 'ord-r-gate-2')?.['fulfillment']).toBeUndefined();
  });

  it('a smuggled `code` field in the BODY cannot substitute the Bearer — the header is the identity', async () => {
    const { codeA, codeB } = await world();
    await intake('ord-r-smuggle-1', PV_B); // B's order
    // A authenticates with A's code but smuggles B's code in the body: if the
    // body could win, this would accept B's order. It must refuse as NOT
    // A's — the body's code field makes the envelope 3 keys → malformed, or
    // is overridden; either way B's order is never accepted by this call.
    const res = await act('/fulfillment/accept', { orderId: 'ord-r-smuggle-1', code: codeB }, codeA);
    expect([400, 404]).toContain(res.status);
    const { orders } = await opsList();
    expect(orders.find((o) => o['orderId'] === 'ord-r-smuggle-1')?.['fulfillment']).toBeUndefined();
  });
});

describe('B6.2 — the challenge and « Produit prêt » through the code door', () => {
  it('no challenge without acceptance; the mint is srch-UUID; reissue mints a DIFFERENT secret', async () => {
    const { codeA } = await world();
    await intake('ord-r-chal-1');
    const early = await act('/fulfillment/ready/challenge', { orderId: 'ord-r-chal-1' }, codeA);
    expect(early.status).toBe(409);
    expect(early.json['reason']).toBe('not_accepted');
    await act('/fulfillment/accept', { orderId: 'ord-r-chal-1' }, codeA);
    const ch = await act('/fulfillment/ready/challenge', { orderId: 'ord-r-chal-1' }, codeA);
    expect(ch.status).toBe(200);
    const challenge = ch.json['challenge'] as string;
    expect(challenge).toMatch(/^srch-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const ch2 = await act('/fulfillment/ready/challenge', { orderId: 'ord-r-chal-1' }, codeA);
    expect(ch2.json['challenge']).not.toBe(challenge);
  });

  it('THE HONEST ROAD reaches ready — and the ops list shows both clocks but NEVER the evidence or the challenge', async () => {
    const { codeA, challenge } = await acceptAndChallenge('ord-r-happy-1');
    const res = await act('/fulfillment/ready', readyPayload('ord-r-happy-1', challenge), codeA);
    expect(res.status, res.text).toBe(200);
    expect(res.json['status']).toBe('ready');
    const confirmedAt = res.json['confirmedAt'] as string;
    const { orders } = await opsList();
    const row = orders.find((o) => o['orderId'] === 'ord-r-happy-1');
    expect((row?.['fulfillment'] as { readyAt?: string }).readyAt).toBe(confirmedAt);
    const bytes = JSON.stringify(orders);
    expect(bytes.includes('photoRef')).toBe(false);
    expect(bytes.includes('srch-')).toBe(false);
  });

  it('B’s code cannot confirm A’s order EVEN WITH A’s live challenge — ownership refuses before any state is revealed', async () => {
    const { challenge } = await acceptAndChallenge('ord-r-cross-1');
    const { codeB } = await world();
    const res = await act('/fulfillment/ready', readyPayload('ord-r-cross-1', challenge), codeB);
    expect(res.status).toBe(404);
    expect(res.json['reason']).toBe('not_yours_or_unknown');
    // and the road is intact for its true owner — nothing was consumed
    const { codeA } = await world();
    const ok = await act('/fulfillment/ready', readyPayload('ord-r-cross-1', challenge), codeA);
    expect(ok.json['status']).toBe('ready');
  });

  it('a REPLAY of the confirmed act (same challenge) is absorbed as already_ready; a DIFFERENT confirmation is refused', async () => {
    const { codeA, challenge } = await acceptAndChallenge('ord-r-replay-1');
    const payload = readyPayload('ord-r-replay-1', challenge);
    const first = await act('/fulfillment/ready', payload, codeA);
    expect(first.json['status']).toBe('ready');
    const replay = await act('/fulfillment/ready', payload, codeA);
    expect(replay.status).toBe(200);
    expect(replay.json['status']).toBe('already_ready');
    expect(replay.json['confirmedAt']).toBe(first.json['confirmedAt']);
    const different = await act('/fulfillment/ready', readyPayload('ord-r-replay-1', 'srch-autre'), codeA);
    expect(different.status).toBe(409);
    expect(different.json['reason']).toBe('already_ready');
  });

  it('A FOREIGN SECRET IN THE EVIDENCE IS A PARSE FAILURE — a smuggled buyerDropCode never reaches any check (Ten Laws #3)', async () => {
    const { codeA, challenge } = await acceptAndChallenge('ord-r-foreign-1');
    const res = await act('/fulfillment/ready', readyPayload('ord-r-foreign-1', challenge, { buyerDropCode: '1234' }), codeA);
    expect(res.status).toBe(400);
    expect(res.json['reason']).toBe('not_canonical_or_foreign_secret');
    const ok = await act('/fulfillment/ready', readyPayload('ord-r-foreign-1', challenge), codeA);
    expect(ok.json['status']).toBe('ready');
  });

  it('EVERY refusal answers BY NAME: no acceptance · mismatched · locked-terms', async () => {
    const { codeA } = await world();
    await intake('ord-r-refuse-1');
    const noAcc = await act('/fulfillment/ready', readyPayload('ord-r-refuse-1', 'srch-jamais'), codeA);
    expect(noAcc.json['reason']).toBe('not_accepted');
    const { challenge } = await acceptAndChallenge('ord-r-refuse-2');
    const wrong = await act('/fulfillment/ready', readyPayload('ord-r-refuse-2', 'srch-pas-le-bon'), codeA);
    expect(wrong.status).toBe(409);
    expect(wrong.json['reason']).toBe('challenge_missing_or_mismatched');
    for (const over of [{ qty: 2 }, { variant: 'pv-autre' }, { availableConfirmed: false }]) {
      const res = await act('/fulfillment/ready', readyPayload('ord-r-refuse-2', challenge, over), codeA);
      expect(res.status, JSON.stringify(over)).toBe(409);
      expect(res.json['reason']).toBe('locked_terms_mismatch');
    }
    const ok = await act('/fulfillment/ready', readyPayload('ord-r-refuse-2', challenge), codeA);
    expect(ok.json['status']).toBe('ready');
  });

  it('AN EXPIRED CHALLENGE REFUSES BY NAME — real clock, 300 ms TTL — and a fresh challenge revives the road', async () => {
    const { codeA, challenge } = await acceptAndChallenge('ord-r-expire-1');
    await new Promise((r) => setTimeout(r, TTL_MS + 150));
    const res = await act('/fulfillment/ready', readyPayload('ord-r-expire-1', challenge), codeA);
    expect(res.status).toBe(409);
    expect(res.json['reason']).toBe('challenge_expired');
    const fresh = await act('/fulfillment/ready/challenge', { orderId: 'ord-r-expire-1' }, codeA);
    const ok = await act('/fulfillment/ready', readyPayload('ord-r-expire-1', fresh.json['challenge'] as string), codeA);
    expect(ok.json['status']).toBe('ready');
  });
});

describe('the record’s bytes and the TTL ceiling', () => {
  it('acceptance + readiness NEVER touch the paid-order record — whole-record equality', async () => {
    const { codeA } = await world();
    await intake('ord-r-bytes-1');
    const before = (await opsList()).orders.find((o) => o['orderId'] === 'ord-r-bytes-1');
    const { challenge } = await acceptAndChallenge('ord-r-bytes-1');
    await act('/fulfillment/ready', readyPayload('ord-r-bytes-1', challenge), codeA);
    const afterRaw = (await opsList()).orders.find((o) => o['orderId'] === 'ord-r-bytes-1');
    const { fulfillment: _f, ...after } = afterRaw as Record<string, unknown>;
    expect(after).toEqual(before);
  });

  it('a TTL knob larger than canon clamps to canon — a 31-year challenge is unexpressible by construction (verifier A9)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fulfillment-ttlclamp-'));
    const hostile = new Miniflare({
      modules: true, scriptPath: SCRIPT,
      durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
      durableObjectsPersist: dir,
      bindings: {
        OFFER_WRITE_SECRET: WRITE_SECRET, FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
        FULFILLMENT_OPS_SECRET: OPS_SECRET, READINESS_TTL_MS: '999999999999',
      },
    });
    try {
      // MINT BEFORE SEED (LISTER-POUR-1a'): the create names SUPPLIER_A, so
      // his code exists in this world first.
      const minted = await hostile.dispatchFetch('http://o/fulfillment/supplier-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_SECRET}` },
        body: JSON.stringify({ supplierId: SUPPLIER_A }),
      });
      const code = ((await minted.json()) as { code: string }).code;
      const seedRes = await hostile.dispatchFetch('http://o/offers', {
        method: 'POST', headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
        body: JSON.stringify(seedFor(PV_A, SUPPLIER_A, '1')),
      });
      if (seedRes.status !== 200) throw new Error(await seedRes.text());
      await hostile.dispatchFetch('http://o/fulfillment/order-confirmed', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULFILL_SECRET}` },
        body: JSON.stringify(confirmedEvent('ord-r-clamp-1')),
      });
      const doAct = async (path: string, body: unknown) => {
        const res = await hostile.dispatchFetch(`http://o${path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` },
          body: JSON.stringify(body),
        });
        return (await res.json()) as Record<string, unknown>;
      };
      await doAct('/fulfillment/accept', { orderId: 'ord-r-clamp-1' });
      const before = Date.now();
      const ch = await doAct('/fulfillment/ready/challenge', { orderId: 'ord-r-clamp-1' });
      const expiresMs = Date.parse(ch['expiresAt'] as string);
      expect(expiresMs - before).toBeLessThanOrEqual(READINESS_CHALLENGE_TTL_MS + 60_000);
      expect(expiresMs - before).toBeGreaterThan(0);
    } finally {
      await hostile.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the coverage the rewrite dropped — re-pinned (verifier M1/M2/M3)', () => {
  it('a smuggled extra field on /accept is REFUSED malformed — the exact-key check is pinned again', async () => {
    const { codeA } = await world();
    await intake('ord-r-repin-1');
    const res = await act('/fulfillment/accept', { orderId: 'ord-r-repin-1', acceptedAt: '2020-01-01T00:00:00.000Z' }, codeA);
    expect(res.status).toBe(400);
    expect(res.json['reason']).toBe('malformed');
    // …and the honest act still works after the refusal
    const ok = await act('/fulfillment/accept', { orderId: 'ord-r-repin-1' }, codeA);
    expect(ok.json['status']).toBe('accepted');
  });

  it('/ready and /mine are IN the credential matrix: write key (both forms), ops key, intake secret — all 401', async () => {
    const { codeA, challenge } = await acceptAndChallenge('ord-r-repin-2');
    for (const bearer of [WRITE_SECRET, OPS_SECRET, FULFILL_SECRET]) {
      const ready = await act('/fulfillment/ready', readyPayload('ord-r-repin-2', challenge), bearer);
      expect(ready.status, `ready ${bearer.slice(0, 12)}`).toBe(401);
      const res = await mine(bearer);
      expect(res.status, `mine ${bearer.slice(0, 12)}`).toBe(401);
    }
    const asHeader = await mf.dispatchFetch('http://o/fulfillment/ready', {
      method: 'POST',
      headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify(readyPayload('ord-r-repin-2', challenge)),
    });
    expect(asHeader.status).toBe(401);
    // nothing was consumed by any refused attempt — the true owner still readies
    const ok = await act('/fulfillment/ready', readyPayload('ord-r-repin-2', challenge), codeA);
    expect(ok.json['status']).toBe('ready');
  });

  it('a smuggled extra field on MINT is REFUSED malformed — the ops door keeps the same discipline', async () => {
    const res = await opsPost('/fulfillment/supplier-code', { supplierId: 'supplier-x', note: 'smuggled' });
    expect(res.status).toBe(400);
    expect(res.json['reason']).toBe('malformed');
  });

  it('and on REVOKE too — the exact-key check guards both admin doors (verifier MINOR-7)', async () => {
    const res = await opsPost('/fulfillment/supplier-code/revoke', { supplierId: 'supplier-x', note: 'smuggled' });
    expect(res.status).toBe(400);
    expect(res.json['reason']).toBe('malformed');
  });
});

/* ═══════════ CONSOLE-3 — the code INVENTORY (who holds a door) ═══════════ */

describe('CONSOLE-3 — GET /fulfillment/supplier-codes: the founder sees every active door, and NOTHING secret', () => {
  const INV_A = 'supplier-inv-00a';
  const INV_B = 'supplier-inv-00b';

  async function inventory(bearer: string | null = OPS_SECRET) {
    const res = await mf.dispatchFetch('http://o/fulfillment/supplier-codes', {
      headers: bearer !== null ? { Authorization: `Bearer ${bearer}` } : {},
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
    return { status: res.status, json };
  }

  it('the door matrix: no key, the intake secret, and the write key all refuse; ONLY the ops key reads', async () => {
    for (const bearer of [null, FULFILL_SECRET, WRITE_SECRET, 'wrong']) {
      const res = await inventory(bearer);
      expect(res.status, String(bearer)).toBe(401);
    }
    const ok = await inventory();
    expect(ok.status).toBe(200);
    expect(ok.json['ok']).toBe(true);
  });

  it('every row is EXACTLY {supplierId, mintedAt} — the hash never leaves the book, on ANY row', async () => {
    await opsPost('/fulfillment/supplier-code', { supplierId: INV_A });
    const res = await inventory();
    const codes = res.json['codes'] as Record<string, unknown>[];
    expect(codes.length).toBeGreaterThan(0);
    for (const row of codes) {
      expect(Object.keys(row).sort(), JSON.stringify(row)).toEqual(['mintedAt', 'supplierId']);
    }
  });

  it('lifecycle: mint appears (sorted by supplierId) → re-mint keeps ONE row with a NEW mintedAt → revoke removes it', async () => {
    const mintB = await opsPost('/fulfillment/supplier-code', { supplierId: INV_B });
    expect(mintB.json['ok']).toBe(true);
    const first = await inventory();
    const rows = (first.json['codes'] as { supplierId: string; mintedAt: string }[]).filter((r) =>
      r.supplierId.startsWith('supplier-inv-'),
    );
    expect(rows.map((r) => r.supplierId)).toEqual([INV_A, INV_B]); // sorted, both present, once each
    const before = rows.find((r) => r.supplierId === INV_B)!.mintedAt;

    await new Promise((r) => setTimeout(r, 5)); // a distinct clock instant
    const remint = await opsPost('/fulfillment/supplier-code', { supplierId: INV_B });
    expect(remint.json['ok']).toBe(true);
    const second = await inventory();
    const rowsB = (second.json['codes'] as { supplierId: string; mintedAt: string }[]).filter(
      (r) => r.supplierId === INV_B,
    );
    expect(rowsB.length).toBe(1); // ONE active door per supplier, always
    expect(rowsB[0]!.mintedAt > before, 'mintedAt must advance on re-mint').toBe(true);

    const revoke = await opsPost('/fulfillment/supplier-code/revoke', { supplierId: INV_B });
    expect(revoke.json['status']).toBe('revoked');
    const third = await inventory();
    const after = (third.json['codes'] as { supplierId: string }[]).map((r) => r.supplierId);
    expect(after.includes(INV_B)).toBe(false);
    expect(after.includes(INV_A)).toBe(true); // the neighbour's door untouched
  });

  it('the inventory never interferes with the doors it lists: a code minted before the read still opens /mine', async () => {
    const mint = await opsPost('/fulfillment/supplier-code', { supplierId: INV_A });
    const code = mint.json['code'] as string;
    await inventory();
    const res = await mine(code);
    expect(res.status).toBe(200);
    expect(res.json['ok']).toBe(true);
  });
});

/** RB-1 — a GET through the founder's door. */
async function opsGet(path: string, bearer: string | null = OPS_SECRET) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    headers: bearer !== null ? { Authorization: `Bearer ${bearer}` } : {},
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

describe('RB-1 — the readiness evidence reaches the FOUNDER alone, one order at a time', () => {
  it('the whole road: not ready is honest, ready serves the photo, the challenge never leaves, the list still carries nothing', async () => {
    const orderId = 'ord-rb1-evidence-1';

    // ── before anything: the order is unknown even to the founder’s read ───
    const unknown = await opsGet(`/fulfillment/order-evidence?orderId=${orderId}`);
    expect(unknown.status, unknown.text).toBe(404);
    expect(unknown.json['reason']).toBe('unknown_order');

    // ── paid but not ready: honest « pas prêt », never an empty photo ──────
    const { codeA, challenge } = await acceptAndChallenge(orderId);
    const notReady = await opsGet(`/fulfillment/order-evidence?orderId=${orderId}`);
    expect(notReady.status).toBe(404);
    expect(notReady.json['reason']).toBe('not_ready');

    // ── the supplier confirms with the photo ───────────────────────────────
    const payload = readyPayload(orderId, challenge);
    const ready = await act('/fulfillment/ready', payload, codeA);
    expect(ready.json['ok'], ready.text).toBe(true);

    // ── the founder sees the proof — the exact photoRef the supplier sent ──
    const ev = await opsGet(`/fulfillment/order-evidence?orderId=${orderId}`);
    expect(ev.status, ev.text).toBe(200);
    expect(ev.json['photoRef']).toEqual(payload.photoRef);
    expect(ev.json['qty']).toBe(1);
    expect(typeof ev.json['readyAt']).toBe('string');
    // ⚠ THE CHALLENGE NEVER LEAVES (B+I-06): it is a secret of the readiness
    // ritual, not part of what proof looks like on a screen. Raw bytes, so a
    // renamed field cannot hide it.
    expect(ev.text).not.toContain(challenge);
    expect(ev.text).not.toContain('readinessChallenge');

    // ── the DOOR: founder key only ─────────────────────────────────────────
    expect((await opsGet(`/fulfillment/order-evidence?orderId=${orderId}`, 'wrong-key')).status).toBe(401);
    expect((await opsGet(`/fulfillment/order-evidence?orderId=${orderId}`, null)).status).toBe(401);

    // ── and the LIST still never carries the evidence — the deliberate
    //    boundary this per-order read exists to respect, held on raw bytes ──
    const list = await opsGet('/fulfillment/orders');
    expect(list.status).toBe(200);
    expect(list.text).not.toContain('photoRef');
    expect(list.text).not.toContain('media/readiness/');
  });
});

describe('RB-1 — the founder’s supplier contact card (name + phone, his decision 2026-08-08)', () => {
  it('saved, listed, replaced — and a name with no number is a valid card', async () => {
    await world();
    const card = { supplierId: SUPPLIER_A, name: 'Aïcha Ouédraogo', phone: '70 00 00 01' };
    const saved = await opsPost('/fulfillment/supplier-contact', card);
    expect(saved.status, saved.text).toBe(200);

    const listed = await opsGet('/fulfillment/supplier-contacts');
    expect(listed.status).toBe(200);
    expect(listed.json['contacts']).toEqual([card]);

    // Last write wins — his own address book, not an audit log.
    const moved = { ...card, phone: '76 99 99 99' };
    await opsPost('/fulfillment/supplier-contact', moved);
    const after = await opsGet('/fulfillment/supplier-contacts');
    expect(after.json['contacts']).toEqual([moved]);

    // A name without a number: the call button’s honest empty state, not a 400.
    const nameOnly = { supplierId: SUPPLIER_B, name: 'Moussa Kaboré', phone: '' };
    expect((await opsPost('/fulfillment/supplier-contact', nameOnly)).status).toBe(200);
    const both = await opsGet('/fulfillment/supplier-contacts');
    expect((both.json['contacts'] as unknown[]).length).toBe(2);
  });

  it('malformed refuses BY SHAPE, and the door is the founder’s alone on both verbs', async () => {
    for (const bad of [
      { supplierId: SUPPLIER_A, name: 'X' },                                   // phone missing
      { supplierId: SUPPLIER_A, name: '', phone: '70' },                       // empty name
      { supplierId: '', name: 'X', phone: '70' },                              // empty id
      { supplierId: SUPPLIER_A, name: 'X', phone: '70', extra: 'smuggled' },   // foreign key
    ]) {
      expect((await opsPost('/fulfillment/supplier-contact', bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await opsPost('/fulfillment/supplier-contact', { supplierId: SUPPLIER_A, name: 'X', phone: '70' }, 'wrong-key')).status).toBe(401);
    expect((await opsGet('/fulfillment/supplier-contacts', 'wrong-key')).status).toBe(401);
    expect((await opsGet('/fulfillment/supplier-contacts', null)).status).toBe(401);
  });
});
