import { ProductVersionSchema, VariantSchema, type ProductVersion, type Variant } from '@platform/contracts';

/**
 * B3.1 thin — one product + variant + ProductVersion on the pinned schemas.
 * Versions are IMMUTABLE: any change creates a NEW version (version+1);
 * activation flips status on the new version and retires the prior one.
 * supplyMode is SELLER_HELD only — PLATFORM_OWNED behavior is build-gated
 * (B+9) and unrepresentable here. Publishing (activation) requires the
 * supplier-service publish rule; the caller passes that verdict in — this
 * module never re-implements it.
 */

export interface ProductDraft {
  supplierId: string;
  name: string;
  productCode: string;
  category: string;
  zone: string;
  facts?: Record<string, unknown>;
  variantAttributes: Record<string, string>;
}

export type CreateOutcome =
  | { ok: true; version: ProductVersion; variant: Variant }
  | { ok: false; reason: 'publisher_not_eligible' };

export type ActivateOutcome =
  | { ok: true; version: ProductVersion }
  | { ok: false; reason: 'publisher_not_eligible' | 'unknown_version' };

export class ProductCatalog {
  private readonly versions = new Map<string, ProductVersion>();
  private readonly variants = new Map<string, Variant>();
  private counter = 0;

  /** canPublish comes from supplier-service (B0.2) — unverified cannot publish. */
  create(draft: ProductDraft, canPublish: boolean): CreateOutcome {
    if (!canPublish) return { ok: false, reason: 'publisher_not_eligible' };
    this.counter += 1;
    const version = ProductVersionSchema.parse({
      id: `pv-${this.counter}`,
      supplierId: draft.supplierId,
      version: 1,
      name: draft.name,
      productCode: draft.productCode,
      facts: draft.facts ?? {},
      category: draft.category,
      zone: draft.zone,
      moderationState: 'approved_e1_sandbox',
      status: 'draft',
      supplyMode: 'SELLER_HELD',
    });
    const variant = VariantSchema.parse({
      id: `var-${this.counter}`,
      productVersionId: version.id,
      attributes: draft.variantAttributes,
      stableSku: `${draft.productCode}-${this.counter}`,
    });
    this.versions.set(version.id, version);
    this.variants.set(variant.id, variant);
    return { ok: true, version, variant };
  }

  activate(versionId: string, canPublish: boolean): ActivateOutcome {
    if (!canPublish) return { ok: false, reason: 'publisher_not_eligible' };
    const version = this.versions.get(versionId);
    if (!version) return { ok: false, reason: 'unknown_version' };
    const active = ProductVersionSchema.parse({ ...version, status: 'active' });
    this.versions.set(versionId, active);
    return { ok: true, version: active };
  }

  /**
   * A change NEVER mutates: it creates version+1 as a new draft; the prior
   * version is retired (status 'superseded') once the new one activates.
   */
  revise(versionId: string, changes: Partial<Pick<ProductVersion, 'name' | 'facts' | 'zone'>>): ActivateOutcome {
    const prior = this.versions.get(versionId);
    if (!prior) return { ok: false, reason: 'unknown_version' };
    this.counter += 1;
    const next = ProductVersionSchema.parse({
      ...prior,
      ...changes,
      id: `pv-${this.counter}`,
      version: prior.version + 1,
      status: 'draft',
    });
    this.versions.set(next.id, next);
    return { ok: true, version: next };
  }

  supersede(priorId: string): void {
    const prior = this.versions.get(priorId);
    if (prior) this.versions.set(priorId, ProductVersionSchema.parse({ ...prior, status: 'superseded' }));
  }

  get(versionId: string): ProductVersion | undefined {
    return this.versions.get(versionId);
  }

  variantOf(versionId: string): Variant | undefined {
    for (const v of this.variants.values()) if (v.productVersionId === versionId) return v;
    return undefined;
  }
}
