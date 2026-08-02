import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * LISTER-POUR-1a — A SUPPLIER WATCHES HIS OWN PRODUCTS, on real workerd.
 *
 * FOUNDER ORDER (2026-08-02): the founder lists FOR suppliers; each supplier
 * sees, through his own webapp, ONLY the products listed for him — and can
 * edit nothing. This suite proves the three legs of that sentence against the
 * deployed bundle's actual bytes:
 *
 *   · ONLY HIS — `GET /offers/mine` scopes by the supplierId DERIVED from the
 *     presented personal code. Two suppliers exist in this world precisely
 *     because the legacy route's header warns its filter-not-authorization
 *     hazard is "real the day there are two." Isolation is asserted BOTH
 *     directions, on the RAW response text (a neighbour's price must not be
 *     present as bytes, not merely unparsed).
 *   · ONE DOOR — missing, unknown and revoked codes answer ONE identical 401,
 *     byte-for-byte, so the door is not an oracle for which part was wrong.
 *   · NO PEN — a personal code presented to every offer WRITE route answers
 *     401. The write key opens writes; the code opens exactly this read and
 *     the fulfillment acts, nothing else.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'offers-mine-'));
const WRITE_SECRET = 'test-offer-write-secret-0004';
const OPS_SECRET = 'test-fulfillment-ops-secret-0004';
const T0 = '2026-08-02T08:00:00.000Z';

const SUPPLIER_A = 'supplier-mine-alpha';
const SUPPLIER_B = 'supplier-mine-beta';
/** B's figures are chosen to be UNIQUE BYTE STRINGS in this world, so a raw
 *  scan on A's response proves absence of B's cost structure, not luck. */
const PRICE_B = 13_777;
const COMMISSION_B = 1_377;
const NAME_B = 'Écharpe indigo (voisine)';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: {
    OFFER_WRITE_SECRET: WRITE_SECRET,
    FULFILLMENT_OPS_SECRET: OPS_SECRET,
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function seedFor(supplierId: string, pv: string, offerId: string, name: string, basePrice: number, commission: number) {
  return {
    commandId: `seed-${offerId}`,
    offerId,
    product: {
      id: pv, supplierId, version: 1, name,
      productCode: `FASO-${pv.slice(-4)}`, facts: {}, category: 'fashion_bags_fabrics',
      zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: pv, basePrice, resellerCommission: commission,
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 3,
    asOf: T0,
  };
}

async function call(path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(init.headers ?? {}) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function mint(supplierId: string): Promise<string> {
  const res = await call('/fulfillment/supplier-code', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPS_SECRET}` },
    body: { supplierId },
  });
  expect(res.status, `mint for ${supplierId}: ${res.text}`).toBe(200);
  return res.json['code'] as string;
}

describe('LISTER-POUR-1a — his own products, through his own door, and no pen', () => {
  let codeA = '';
  let codeB = '';

  it('sets the stage: codes are minted FIRST, then the FOUNDER lists for both suppliers', async () => {
    // MINT BEFORE SEED — the order is now load-bearing (LISTER-POUR-1a',
    // founder-approved): a create may only name a supplier the book knows,
    // and « known » is « currently holds an active code ». The founder's
    // operational sequence is therefore mint → list, including for himself.
    codeA = await mint(SUPPLIER_A);
    codeB = await mint(SUPPLIER_B);
    expect(codeA).not.toBe(codeB);
    // The write key — the founder's seed path — attributes each offer to its
    // supplier. This is the "I am the one listing" half of the order.
    for (const seed of [
      seedFor(SUPPLIER_A, 'pv-mine-a1', 'offer-mine-a1', 'Bogolan du fondateur', 8_000, 800),
      seedFor(SUPPLIER_A, 'pv-mine-a2', 'offer-mine-a2', 'Panier tressé', 5_500, 550),
      seedFor(SUPPLIER_B, 'pv-mine-b1', 'offer-mine-b1', NAME_B, PRICE_B, COMMISSION_B),
    ]) {
      const res = await call('/offers', { method: 'POST', headers: { 'X-Write-Key': WRITE_SECRET }, body: seed });
      // A 200 IS NOT A CREATION: the command path answers 200 for its own
      // refusals too (status in the body). Asserting the decision is what
      // caught this suite's first ghost fixture pricing below the category
      // floor — a « passing » create that created nothing.
      expect(res.status, res.text).toBe(200);
      expect(res.json['status'], res.text).toBe('created');
    }
  });

  it('a GHOST supplier cannot be listed for — and becomes listable the moment his code exists', async () => {
    // The typo scenario the guard exists for: one wrong character in the id
    // and the product would land where `/offers/mine` can never show it — a
    // paid-for listing invisible to the very supplier it was meant for.
    const ghost = seedFor('supplier-mine-ghost', 'pv-mine-g1', 'offer-mine-g1', 'Produit fantôme', 6_000, 600);
    const refused = await call('/offers', { method: 'POST', headers: { 'X-Write-Key': WRITE_SECRET }, body: ghost });
    expect(refused.status, refused.text).toBe(400);
    expect(refused.json['error']).toBe('unknown_supplier');
    expect(refused.json['supplierId']).toBe('supplier-mine-ghost');
    // …and the refusal REFUSED: the ghost owns nothing.
    const ghostCode = await mint('supplier-mine-ghost');
    const empty = await call('/offers/mine', { headers: { Authorization: `Bearer ${ghostCode}` } });
    expect(empty.status).toBe(200);
    expect((empty.json['items'] as unknown[]).length).toBe(0);
    // The SAME create, after the mint: the gate keys on the registry, not
    // on anything about the body.
    const accepted = await call('/offers', { method: 'POST', headers: { 'X-Write-Key': WRITE_SECRET }, body: ghost });
    expect(accepted.status, accepted.text).toBe(200);
    expect(accepted.json['status'], accepted.text).toBe('created');
    const now = await call('/offers/mine', { headers: { Authorization: `Bearer ${ghostCode}` } });
    expect((now.json['items'] as Array<Record<string, unknown>>).map((i) => i['productVersionId'])).toEqual(['pv-mine-g1']);
  });

  it('a REVOKED supplier can no longer be listed for — cut off cuts the pen too', async () => {
    await mint('supplier-mine-delta');
    const revoke = await call('/fulfillment/supplier-code/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
      body: { supplierId: 'supplier-mine-delta' },
    });
    expect(revoke.status, revoke.text).toBe(200);
    const res = await call('/offers', {
      method: 'POST',
      headers: { 'X-Write-Key': WRITE_SECRET },
      body: seedFor('supplier-mine-delta', 'pv-mine-d1', 'offer-mine-d1', 'Après révocation', 6_500, 650),
    });
    expect(res.status).toBe(400);
    expect(res.json['error']).toBe('unknown_supplier');
  });

  it('A sees BOTH his offers and ONLY his — the neighbour is absent as BYTES', async () => {
    const res = await call('/offers/mine', { headers: { Authorization: `Bearer ${codeA}` } });
    expect(res.status, res.text).toBe(200);
    const items = res.json['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['productVersionId']).sort()).toEqual(['pv-mine-a1', 'pv-mine-a2']);
    // The row shape the webapp will consume, pinned on real bytes.
    const a1 = items.find((i) => i['productVersionId'] === 'pv-mine-a1')!;
    expect(a1['name']).toBe('Bogolan du fondateur');
    expect(a1['basePrice']).toBe(8_000);
    expect(a1['available']).toBe(3);
    expect(Array.isArray(a1['assetRefs'])).toBe(true);
    // THE PROPERTY ABOVE ALL OTHERS — the neighbour's cost structure is not
    // in the response AT ALL. Raw text, unique byte strings.
    for (const banned of ['pv-mine-b1', String(PRICE_B), String(COMMISSION_B), NAME_B, SUPPLIER_B]) {
      expect(res.text.includes(banned), `A's response carries the neighbour's « ${banned} »`).toBe(false);
    }
  });

  it('…and B sees only HIS — the isolation is symmetric, not an artifact of who seeded first', async () => {
    const res = await call('/offers/mine', { headers: { Authorization: `Bearer ${codeB}` } });
    expect(res.status, res.text).toBe(200);
    const items = res.json['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['productVersionId'])).toEqual(['pv-mine-b1']);
    expect(items[0]!['basePrice']).toBe(PRICE_B);
    for (const banned of ['pv-mine-a1', 'pv-mine-a2', SUPPLIER_A, 'Bogolan du fondateur']) {
      expect(res.text.includes(banned), `B's response carries A's « ${banned} »`).toBe(false);
    }
  });

  it('a NAMED scope is REFUSED, never stripped — the code is the identity', async () => {
    const res = await call(`/offers/mine?supplierId=${encodeURIComponent(SUPPLIER_B)}`, {
      headers: { Authorization: `Bearer ${codeA}` },
    });
    expect(res.status).toBe(400);
    expect(res.json['error']).toBe('scope_is_derived');
    // and the refusal leaks nothing of B either
    expect(res.text.includes(String(PRICE_B))).toBe(false);
  });

  it('ONE uniform 401: missing, garbage, and revoked codes are byte-identical', async () => {
    const revokedCode = await mint('supplier-mine-gamma');
    const revoke = await call('/fulfillment/supplier-code/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
      body: { supplierId: 'supplier-mine-gamma' },
    });
    expect(revoke.status, revoke.text).toBe(200);

    const missing = await call('/offers/mine');
    const garbage = await call('/offers/mine', { headers: { Authorization: 'Bearer BF-NOT-A-REAL-CODE-0000' } });
    const revoked = await call('/offers/mine', { headers: { Authorization: `Bearer ${revokedCode}` } });
    for (const res of [missing, garbage, revoked]) expect(res.status).toBe(401);
    expect(garbage.text).toBe(missing.text);
    expect(revoked.text).toBe(missing.text);
  });

  it('NO PEN — the personal code opens no offer write, and the write key still does', async () => {
    // Every write route, with a VALID personal code and no write key: 401.
    // This is the founder's « they can't edit », as a pinned invariant.
    const attempt = seedFor(SUPPLIER_A, 'pv-mine-a3', 'offer-mine-a3', 'Tentative interdite', 1_000, 100);
    for (const [path, body] of [
      ['/offers', attempt],
      ['/offers/assets', { offerId: 'offer-mine-a1', assets: [] }],
      ['/offers/delete', { offerId: 'offer-mine-a1' }],
    ] as const) {
      const res = await call(path, { method: 'POST', headers: { Authorization: `Bearer ${codeA}` }, body });
      expect(res.status, `${path} accepted a personal code — a supplier can write`).toBe(401);
    }
    // …and A's list is unchanged: the refused create really created nothing.
    const after = await call('/offers/mine', { headers: { Authorization: `Bearer ${codeA}` } });
    expect((after.json['items'] as unknown[]).length).toBe(2);
    expect(after.text.includes('pv-mine-a3')).toBe(false);
  });

  it('the founder’s admin list is untouched by this slice — same key, same scoped answer', async () => {
    const res = await call(`/offers?supplierId=${encodeURIComponent(SUPPLIER_A)}`, {
      headers: { 'X-Write-Key': WRITE_SECRET },
    });
    expect(res.status, res.text).toBe(200);
    expect((res.json['items'] as Array<Record<string, unknown>>).length).toBe(2);
  });
});
