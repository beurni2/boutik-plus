import { describe, expect, it } from 'vitest';
import {
  FOUNDER_001_PRODUCT_VERSION_ID,
  SupplyReadModelSchema,
  SupplyRegistry,
  founderOneSupply,
  serveProjection,
} from '../src/supply-endpoint.js';

/**
 * WO-READ-MODEL-KIT migration proof (canon v1.2.0). The local
 * `SupplyReadModel` interface was replaced by the canon envelope from
 * `makeReadModelSchema(SupplyProjectionSchema)`. This is a DEFINITION swap, not
 * a behaviour change: the served 200 body must be BYTE-IDENTICAL to what SW-1
 * shipped for the same projection. The frozen envelope below is exactly SW-1's
 * `{version, asOf, value}` output for founder-#001 (three fields, same values);
 * the test refuses any field add/drop/rename or reorder (JSON byte compare) and
 * proves the canon envelope schema accepts that same body unchanged.
 */

const FIXED_ASOF = '2026-07-15T08:00:00.000Z';

// SW-1's served body for founder-#001, captured pre-migration — the frozen
// ground truth. founderOneSupply mints offer version 1 through OfferBook.create
// (basePrice 10 000, resellerCommission 1 000, available 5); the projection is
// the strict 5-field SupplyProjection.
const SW1_FROZEN_BODY = {
  version: 1,
  asOf: FIXED_ASOF,
  value: {
    productVersionId: FOUNDER_001_PRODUCT_VERSION_ID,
    offerVersion: '1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 5,
  },
};

describe('read-model kit migration — served body is byte-identical pre/post', () => {
  const registry = new SupplyRegistry();
  registry.register(founderOneSupply(FIXED_ASOF));
  const outcome = serveProjection('offer-service', registry, FOUNDER_001_PRODUCT_VERSION_ID, FIXED_ASOF);

  it('the 200 body equals SW-1’s frozen envelope, field-for-field and byte-for-byte', () => {
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(200);
    if (!outcome.ok) return;
    // deep value equality — same three fields, same values
    expect(outcome.body).toEqual(SW1_FROZEN_BODY);
    // byte equality — canonical key order, no added/renamed key, no coercion
    expect(JSON.stringify(outcome.body)).toBe(JSON.stringify(SW1_FROZEN_BODY));
    // the envelope keys are EXACTLY the canon three, in order
    expect(Object.keys(outcome.body)).toEqual(['version', 'asOf', 'value']);
    // version stays a NUMBER (canon: z.number().int().min(1)) — not stringified
    expect(typeof outcome.body.version).toBe('number');
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
