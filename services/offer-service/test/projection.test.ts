import { describe, expect, it } from 'vitest';
import { ProductVersionSchema, SupplierOfferSchema } from '@platform/contracts';
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
  it('approved + active + effective → a projection that parses against the PINNED payload contract, exactly five fields', () => {
    const outcome = buildSupplyProjection(product, offer, 4, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(DOMAIN_PAYLOAD_SCHEMAS['supply-projection'].safeParse(outcome.projection).success).toBe(true);
    expect(Object.keys(outcome.projection).sort()).toEqual(['available', 'basePrice', 'offerVersion', 'productVersionId', 'resellerCommission']);
    // No supplier identity, contact, or pickup material — structurally.
    expect(JSON.stringify(outcome.projection)).not.toMatch(/supplier|phone|contact|pickup|adresse/i);
  });

  it('inactive product, unapproved product, inactive offer, out-of-window offer — each refused closed', () => {
    expect(buildSupplyProjection({ ...product, status: 'draft' }, offer, 4, NOW)).toEqual({ ok: false, reason: 'product_not_active' });
    expect(buildSupplyProjection({ ...product, moderationState: 'pending' }, offer, 4, NOW)).toEqual({ ok: false, reason: 'product_not_approved' });
    expect(buildSupplyProjection(product, { ...offer, status: 'paused' }, 4, NOW)).toEqual({ ok: false, reason: 'offer_not_active' });
    expect(buildSupplyProjection(product, offer, 4, '2026-09-01T00:00:00.000Z')).toEqual({ ok: false, reason: 'offer_not_effective' });
  });

  it('the PINNED contract itself refuses a supplier-identity field — strict schema, undeclared key = parse failure', () => {
    const leaking = { productVersionId: 'pv-1', offerVersion: '1', basePrice: 10_000, resellerCommission: 1_000, available: 4, supplierPhone: '+226 70 12 34 56' };
    expect(DOMAIN_PAYLOAD_SCHEMAS['supply-projection'].safeParse(leaking).success).toBe(false);
  });
});
