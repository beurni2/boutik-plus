import { describe, expect, it } from 'vitest';
import { ProductVersionSchema, SupplierOfferSchema, SupplyProjectionSchema } from '@platform/contracts';
import { DOMAIN_PAYLOAD_SCHEMAS } from '@platform/certification';
import { buildSupplyProjection } from '../src/projection.js';

const NOW = '2026-07-15T12:00:00.000Z';
const product = ProductVersionSchema.parse({
  id: 'pv-1', supplierId: 'supplier-1', version: 1, name: 'Pagne', productCode: 'PAG-01',
  facts: {}, category: 'textile', zone: 'Gounghin', moderationState: 'approved',
  status: 'active', supplyMode: 'SELLER_HELD',
});
const offer = SupplierOfferSchema.parse({
  id: 'offer-1', productVersionId: 'pv-1', version: 1, basePrice: 10_000, resellerCommission: 1_000,
  platformFeeVersion: 'fee-v1', eligibleVariants: ['var-1'], zones: ['Gounghin'],
  effective: '2026-07-10T00:00:00.000Z', expiry: '2026-08-10T00:00:00.000Z', status: 'active',
});

describe('supply projection — B4.2, identity-free, contract-shaped', () => {
  it('approved + active + effective → a projection that parses against the PINNED payload contract, exactly eight fields (canon v3.0.0)', () => {
    const outcome = buildSupplyProjection(product, offer, 4, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(DOMAIN_PAYLOAD_SCHEMAS['supply-projection'].safeParse(outcome.projection).success).toBe(true);
    expect(Object.keys(outcome.projection).sort()).toEqual([
      'assetRefs', 'available', 'basePrice', 'category', 'offerVersion', 'productName', 'productVersionId', 'resellerCommission',
    ]);
    // No supplier identity, contact, or pickup material — structurally. productName
    // is the product's own name (display data is not identity); assetRefs is [].
    expect(JSON.stringify(outcome.projection)).not.toMatch(/supplier|phone|contact|pickup|adresse/i);
  });

  it('carries the three display fields verbatim — productName from product.name, category from product.category, assetRefs the honest empty', () => {
    const outcome = buildSupplyProjection(product, offer, 4, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.projection.productName).toBe('Pagne'); // straight from product.name, zero transformation
    expect(outcome.projection.assetRefs).toEqual([]); // a TRUE empty, not an invented ref
    // CATEGORY-WIRE-1: the SUPPLIER'S OWN value, unmapped. This fixture says
    // 'textile', which is NOT one of the three §6.2 rows Shop+ recognises — and
    // that is deliberately left alone here. Translating it would put a guess
    // about at-door inspection rights inside the producer, which owns no such
    // policy; Shop+ allowlists what it knows and falls back to the cautious row.
    expect(outcome.projection.category).toBe('textile');
  });

  it('the REAL builder output parses against the contracts out-guard schema @3.0.0 (re-pin proof — not a hand-built 8-field fixture)', () => {
    const outcome = buildSupplyProjection(product, offer, 4, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // failure mode #5: a repo can re-pin to a required-field bump yet still emit the
    // OLD shape — it typechecks and builds, and breaks only at this .strict() parse
    // when a real payload flows. This asserts the producer's real output survives it.
    expect(() => SupplyProjectionSchema.parse(outcome.projection)).not.toThrow();
  });

  it('inactive product, unapproved product, inactive offer, out-of-window offer — each refused closed', () => {
    expect(buildSupplyProjection({ ...product, status: 'draft' }, offer, 4, NOW)).toEqual({ ok: false, reason: 'product_not_active' });
    expect(buildSupplyProjection({ ...product, moderationState: 'pending' }, offer, 4, NOW)).toEqual({ ok: false, reason: 'product_not_approved' });
    expect(buildSupplyProjection(product, { ...offer, status: 'paused' }, 4, NOW)).toEqual({ ok: false, reason: 'offer_not_active' });
    expect(buildSupplyProjection(product, offer, 4, '2026-09-01T00:00:00.000Z')).toEqual({ ok: false, reason: 'offer_not_effective' });
  });

  it('the PINNED contract itself refuses a supplier-identity field — a COMPLETE 8-field payload still fails once a supplierPhone is added (strict, undeclared key)', () => {
    const leaking = {
      productVersionId: 'pv-1', offerVersion: '1', basePrice: 10_000, resellerCommission: 1_000, available: 4,
      productName: 'Pagne', assetRefs: [], category: 'textile', // valid on their own — the ONLY defect is the identity key below
      supplierPhone: '+226 70 12 34 56',
    };
    expect(DOMAIN_PAYLOAD_SCHEMAS['supply-projection'].safeParse(leaking).success).toBe(false);
  });
});
