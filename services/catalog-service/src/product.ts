import { ProductVersionSchema, VariantSchema, type ProductVersion, type Variant, type PlatformEvent } from '@platform/contracts';
import {
  type CommandContext,
  type ModerationDecision,
  isApproved,
  isModerationOperator,
  moderationEvent,
} from './moderation.js';

/**
 * B3.1 + B2.2 · A1 — one product + variant + ProductVersion on the pinned
 * schemas, now carrying the REAL moderation state machine (moderation.ts).
 * Versions are IMMUTABLE: any change creates a NEW version (version+1) that
 * re-enters moderation (`submitted`) — a change NEVER inherits the prior
 * approval (B+I-01/B+I-04). supplyMode is SELLER_HELD only — PLATFORM_OWNED is
 * build-gated (B+9) and unrepresentable here.
 *
 * The supplier surface can create, revise, and activate — it can NEVER decide
 * moderation. The decision (`decide`) is Ops-only by actor-provenance
 * (Desk 3: "no self-moderation"); there is no supplier-callable approve lever.
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
  | { ok: true; version: ProductVersion; variant: Variant; events: PlatformEvent[] }
  | { ok: false; reason: 'publisher_not_eligible' };

export type DecideOutcome =
  | { ok: true; version: ProductVersion; events: PlatformEvent[] }
  | { ok: false; reason: 'not_a_moderation_operator' | 'unknown_version' | 'not_under_review' };

export type ModerationTimeoutOutcome =
  | { ok: true; version: ProductVersion }
  | { ok: false; reason: 'unknown_version' | 'not_under_review' };

export type ActivateOutcome =
  | { ok: true; version: ProductVersion }
  | { ok: false; reason: 'publisher_not_eligible' | 'unknown_version' | 'not_approved' };

/** Awaiting a moderation decision — the only states a decision/timeout may act on. */
function isUnderReview(state: string): boolean {
  return state === 'submitted' || state === 'pending';
}

export class ProductCatalog {
  private readonly versions = new Map<string, ProductVersion>();
  private readonly variants = new Map<string, Variant>();
  private counter = 0;

  /**
   * canPublish comes from supplier-service (B0.2) — unverified cannot publish.
   * Creation SUBMITS the version for moderation: moderationState `submitted`,
   * emitting catalog.product_submitted.v1. It is NOT approved (the E1
   * `approved_e1_sandbox` stub is gone — a new listing is never born approved).
   */
  create(draft: ProductDraft, canPublish: boolean, ctx: CommandContext, at: string): CreateOutcome {
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
      moderationState: 'submitted',
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
    const events = [
      moderationEvent('catalog.product_submitted.v1', ctx, version.version, { productVersionId: version.id, supplierId: version.supplierId }, at),
    ];
    return { ok: true, version, variant, events };
  }

  /**
   * The Ops moderation decision (Desk 3 — "the queue for facts, media, and
   * categories"). REFUSED for any non-operator actor — a supplier can never
   * decide his own listing (no self-moderation). One decision covers the
   * product and its media:
   *  - approved            → moderationState `approved`; emits media.derivative_approved.v1
   *  - changes_requested   → moderationState `changes_requested`; emits
   *                          catalog.blocked.v1 + media.asset_rejected.v1, BOTH
   *                          carrying the SPECIFIC reasons (never silent).
   * A decision may only act on a version that is under review (submitted/pending).
   */
  decide(versionId: string, decision: ModerationDecision, ctx: CommandContext, at: string): DecideOutcome {
    if (!isModerationOperator(ctx.actor)) return { ok: false, reason: 'not_a_moderation_operator' };
    const version = this.versions.get(versionId);
    if (!version) return { ok: false, reason: 'unknown_version' };
    if (!isUnderReview(version.moderationState)) return { ok: false, reason: 'not_under_review' };

    if (decision.verdict === 'approved') {
      const approved = ProductVersionSchema.parse({ ...version, moderationState: 'approved' });
      this.versions.set(versionId, approved);
      const events = [
        moderationEvent('media.derivative_approved.v1', ctx, approved.version, { productVersionId: versionId }, at),
      ];
      return { ok: true, version: approved, events };
    }
    // changes_requested — carries the specific reasons on BOTH events (Desk 3).
    const changed = ProductVersionSchema.parse({ ...version, moderationState: 'changes_requested' });
    this.versions.set(versionId, changed);
    const payload = { productVersionId: versionId, reasons: decision.reasons };
    const events = [
      moderationEvent('catalog.blocked.v1', ctx, changed.version, payload, at),
      moderationEvent('media.asset_rejected.v1', ctx, changed.version, payload, at),
    ];
    return { ok: true, version: changed, events };
  }

  /**
   * B2.2: "Moderation timeout = pending." A submitted version whose review
   * window elapses becomes `pending` — it MAY NEVER become approved. Only a
   * submitted version can time out (a decided version has already resolved).
   */
  timeoutModeration(versionId: string): ModerationTimeoutOutcome {
    const version = this.versions.get(versionId);
    if (!version) return { ok: false, reason: 'unknown_version' };
    if (version.moderationState !== 'submitted') return { ok: false, reason: 'not_under_review' };
    const pending = ProductVersionSchema.parse({ ...version, moderationState: 'pending' });
    this.versions.set(versionId, pending);
    return { ok: true, version: pending };
  }

  /**
   * Activation requires BOTH publisher eligibility AND an APPROVED moderation
   * decision (B+I-01 — structural, not a warning). An unapproved version
   * (submitted/pending/changes_requested) CANNOT activate.
   */
  activate(versionId: string, canPublish: boolean): ActivateOutcome {
    if (!canPublish) return { ok: false, reason: 'publisher_not_eligible' };
    const version = this.versions.get(versionId);
    if (!version) return { ok: false, reason: 'unknown_version' };
    if (!isApproved(version.moderationState)) return { ok: false, reason: 'not_approved' };
    const active = ProductVersionSchema.parse({ ...version, status: 'active' });
    this.versions.set(versionId, active);
    return { ok: true, version: active };
  }

  /**
   * A change NEVER mutates: it creates version+1 as a new draft that RE-ENTERS
   * moderation (`submitted`) — the changed version can never inherit the prior
   * approval (B+I-01/B+I-04); the prior is retired once the new one activates.
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
      moderationState: 'submitted',
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
