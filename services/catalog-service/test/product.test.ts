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

const AT = '2026-07-13T10:00:00.000Z';
const supplierCtx = { command_id: 'cmd-1', correlation_id: 'corr-1', actor: 'supplier-1' };
const opCtx = { command_id: 'cmd-op', correlation_id: 'corr-1', actor: 'ops:moderation:op-7' };

describe('product catalog — B3.1, versions immutable, publish-gated', () => {
  it('creates ProductVersion v1 + Variant on the pinned schemas; SELLER_HELD only; SUBMITTED for moderation (not approved)', () => {
    const catalog = new ProductCatalog();
    const outcome = catalog.create(draft, true, supplierCtx, AT);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(ProductVersionSchema.safeParse(outcome.version).success).toBe(true);
    expect(VariantSchema.safeParse(outcome.variant).success).toBe(true);
    expect(outcome.version.version).toBe(1);
    expect(outcome.version.supplyMode).toBe('SELLER_HELD'); // PLATFORM_OWNED is gated (B+9)
    expect(outcome.version.status).toBe('draft');
    // A new listing is never born approved — the E1 stub is gone (B+I-01).
    expect(outcome.version.moderationState).toBe('submitted');
    expect(outcome.events.map((e) => e.name)).toEqual(['catalog.product_submitted.v1']);
  });

  it('an ineligible publisher (unverified) cannot create or activate — refused closed', () => {
    const catalog = new ProductCatalog();
    expect(catalog.create(draft, false, supplierCtx, AT)).toEqual({ ok: false, reason: 'publisher_not_eligible' });
    const created = catalog.create(draft, true, supplierCtx, AT);
    if (!created.ok) throw new Error('setup');
    expect(catalog.activate(created.version.id, false)).toEqual({ ok: false, reason: 'publisher_not_eligible' });
  });

  it('a CHANGE creates a NEW version (version+1) — the prior is never mutated, and supersedes on activation', () => {
    const catalog = new ProductCatalog();
    const created = catalog.create(draft, true, supplierCtx, AT);
    if (!created.ok) throw new Error('setup');
    catalog.decide(created.version.id, { verdict: 'approved' }, opCtx, AT); // moderation must pass before activation
    catalog.activate(created.version.id, true);
    const before = catalog.get(created.version.id)!;

    const revised = catalog.revise(created.version.id, { name: 'Pagne tissé main — motif neuf' });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.version.version).toBe(2);
    expect(revised.version.id).not.toBe(created.version.id);
    // the revised version RE-ENTERS moderation — it never inherits the prior approval
    expect(revised.version.moderationState).toBe('submitted');
    expect(catalog.get(created.version.id)).toEqual(before); // untouched
    catalog.decide(revised.version.id, { verdict: 'approved' }, opCtx, AT);
    catalog.activate(revised.version.id, true);
    catalog.supersede(created.version.id);
    expect(catalog.get(created.version.id)!.status).toBe('superseded');
    expect(catalog.get(revised.version.id)!.status).toBe('active');
  });
});
