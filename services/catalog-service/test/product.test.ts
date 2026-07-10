import { describe, expect, it } from 'vitest';
import { ProductVersionSchema, VariantSchema } from '@platform/contracts';
import { ProductCatalog } from '../src/product.js';

const draft = {
  supplierId: 'supplier-1',
  name: 'Pagne tissé main',
  productCode: 'PAG-01',
  category: 'textile',
  zone: 'Gounghin',
  variantAttributes: { taille: 'unique' },
};

describe('product catalog — B3.1, versions immutable, publish-gated', () => {
  it('creates ProductVersion v1 + Variant on the pinned schemas; SELLER_HELD only', () => {
    const catalog = new ProductCatalog();
    const outcome = catalog.create(draft, true);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(ProductVersionSchema.safeParse(outcome.version).success).toBe(true);
    expect(VariantSchema.safeParse(outcome.variant).success).toBe(true);
    expect(outcome.version.version).toBe(1);
    expect(outcome.version.supplyMode).toBe('SELLER_HELD'); // PLATFORM_OWNED is gated (B+9)
    expect(outcome.version.status).toBe('draft');
  });

  it('an ineligible publisher (unverified) cannot create or activate — refused closed', () => {
    const catalog = new ProductCatalog();
    expect(catalog.create(draft, false)).toEqual({ ok: false, reason: 'publisher_not_eligible' });
    const created = catalog.create(draft, true);
    if (!created.ok) throw new Error('setup');
    expect(catalog.activate(created.version.id, false)).toEqual({ ok: false, reason: 'publisher_not_eligible' });
  });

  it('a CHANGE creates a NEW version (version+1) — the prior is never mutated, and supersedes on activation', () => {
    const catalog = new ProductCatalog();
    const created = catalog.create(draft, true);
    if (!created.ok) throw new Error('setup');
    catalog.activate(created.version.id, true);
    const before = catalog.get(created.version.id)!;

    const revised = catalog.revise(created.version.id, { name: 'Pagne tissé main — motif neuf' });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.version.version).toBe(2);
    expect(revised.version.id).not.toBe(created.version.id);
    expect(catalog.get(created.version.id)).toEqual(before); // untouched
    catalog.activate(revised.version.id, true);
    catalog.supersede(created.version.id);
    expect(catalog.get(created.version.id)!.status).toBe('superseded');
    expect(catalog.get(revised.version.id)!.status).toBe('active');
  });
});
