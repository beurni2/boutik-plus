import { beforeAll, describe, expect, it } from 'vitest';
import { InMemoryOfferStore } from '../src/offer-store.js';
import type { OfferEntry } from '../src/offer-core.js';
import {
  FOUNDER_001_PRODUCT_VERSION_ID,
  SupplyReadModelSchema,
  founderOneCreateCommand,
  serveProjection,
  type ServeOutcome,
} from '../src/supply-endpoint.js';

/**
 * WO-READ-MODEL-KIT migration proof (canon v1.2.0), carried through
 * BOUTIK-OFFER-DURABLE-1. The served 200 body must stay BYTE-IDENTICAL to what
 * SW-1 shipped for the same projection, now that the supply state comes from the
 * OfferStore (seeded through the real command path) instead of the fixture. The
 * frozen envelope below is exactly SW-1's `{version, asOf, value}` output for
 * founder-#001 (three fields, same values); the test refuses any field
 * add/drop/rename or reorder (JSON byte compare) and proves the canon envelope
 * schema accepts that same body unchanged.
 */

const FIXED_ASOF = '2026-07-15T08:00:00.000Z';

// The served body for founder-#001 — the frozen ground truth. The seed mints
// offer version 1 through OfferBook.create (basePrice 10 000, resellerCommission
// 1 000, available 5, DECLARED on the command); the projection is the strict
// 8-field SupplyProjection (canon v3.0.0): the five economics + productName
// ('Pagne tissé Faso (démo)', from product.name) + assetRefs ([] — the honest
// empty; boutik has no image source yet) + category.
//
// `category` IS THE SEED'S OWN VALUE, CARRIED VERBATIM — no mapping, no
// substitution, here or in the producer.
//
// It read 'textile' until the founder ruled on 2026-08-01. Shop+'s §6.2 matrix
// does not know that name, so the pilot product failed CLOSED there — no
// Option B, cautious inspection row — which was correct behaviour and a poor
// demonstration of a wire that had just been built. The seed now declares
// `fashion_bags_fabrics`: §6.2's first row is « Fashion, bags, fabrics » and a
// pagne tissé is a woven fabric, so this classifies the product under an
// EXISTING row rather than inventing a name. The fail-closed path is still
// pinned — by `projection.test.ts`, which keeps an unrecognised category, and
// by shop-plus's own tests.
//
// The key ORDER matters here: this test byte-compares JSON, so `category` sits
// last because that is where `buildSupplyProjection` emits it.
const SW1_FROZEN_BODY = {
  version: 1,
  asOf: FIXED_ASOF,
  value: {
    productVersionId: FOUNDER_001_PRODUCT_VERSION_ID,
    offerVersion: '1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 5,
    productName: 'Pagne tissé Faso (démo)',
    assetRefs: [],
    category: 'fashion_bags_fabrics',
  },
};

describe('read-model kit migration — served body is byte-identical pre/post (over the durable store seed)', () => {
  let outcome: ServeOutcome;
  let entry: OfferEntry | undefined;

  beforeAll(async () => {
    const store = new InMemoryOfferStore();
    await store.create(founderOneCreateCommand(FIXED_ASOF));
    entry = await store.getEntryByProductVersion(FOUNDER_001_PRODUCT_VERSION_ID);
    outcome = serveProjection('offer-service', entry, FIXED_ASOF);
  });

  it('the 200 body equals SW-1’s frozen envelope, field-for-field and byte-for-byte', () => {
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(200);
    if (!outcome.ok) return;
    expect(outcome.body).toEqual(SW1_FROZEN_BODY);
    expect(JSON.stringify(outcome.body)).toBe(JSON.stringify(SW1_FROZEN_BODY));
    expect(Object.keys(outcome.body)).toEqual(['version', 'asOf', 'value']);
    expect(typeof outcome.body.version).toBe('number'); // canon: z.number().int().min(1) — never stringified
  });

  it('the canon envelope schema round-trips the served body with no drift', () => {
    if (!outcome.ok) return;
    const parsed = SupplyReadModelSchema.parse(outcome.body);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(SW1_FROZEN_BODY));
  });

  it('the canon envelope is strict — an extra top-level key is refused', () => {
    const withExtra = { ...SW1_FROZEN_BODY, leaked: 'x' };
    expect(() => SupplyReadModelSchema.parse(withExtra)).toThrow();
  });
});
