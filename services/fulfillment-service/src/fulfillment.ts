import {
  PackageReadinessConfirmationSchema,
  SellerReadinessChallengeSchema,
  type PackageReadinessConfirmation,
  type SellerReadinessChallenge,
} from '@platform/contracts';

/**
 * B6.1/B6.2 thin — fulfillment acceptance + « Produit prêt » readiness.
 * Acceptance LOCKS {variant, qty, sellerNet, deadline} — immutable once
 * accepted. Readiness requires the short-TTL sellerReadinessChallenge (a
 * distinct branded secret — never any other secret; a buyerDropCode in the
 * payload is refused by the canonical STRICT PackageReadinessConfirmation)
 * plus photo + qty/variant/availability. ONLY a confirmed readiness makes
 * an order pickup-eligible: "no pickup task before readiness" is enforced
 * here and by the CI gate beside it. sellerNet is COPIED from the quote
 * that funded the order — never computed here.
 */

export const READINESS_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface FulfillmentAcceptance {
  orderId: string;
  variant: string;
  qty: number;
  /** COPIED from the immutable Quote — this service never computes money. */
  sellerNetFcfa: number;
  deadline: string;
}

interface IssuedChallenge {
  challenge: SellerReadinessChallenge;
  expiresAt: string;
}

export type ReadinessOutcome =
  | { ok: true; confirmation: PackageReadinessConfirmation; pickupEligible: true }
  | {
      ok: false;
      reason:
        | 'not_accepted'
        | 'not_canonical_or_foreign_secret'
        | 'challenge_missing_or_mismatched'
        | 'challenge_expired'
        | 'locked_terms_mismatch';
    };

export class FulfillmentBook {
  private readonly accepted = new Map<string, FulfillmentAcceptance>();
  private readonly challenges = new Map<string, IssuedChallenge>();
  private readonly ready = new Map<string, PackageReadinessConfirmation>();
  private counter = 0;

  accept(acceptance: FulfillmentAcceptance): { ok: true; locked: FulfillmentAcceptance } | { ok: false; reason: 'already_accepted' } {
    if (this.accepted.has(acceptance.orderId)) return { ok: false, reason: 'already_accepted' };
    const locked = Object.freeze({ ...acceptance });
    this.accepted.set(acceptance.orderId, locked);
    return { ok: true, locked };
  }

  /** Short-TTL challenge — a NEW branded secret each issue, never any other secret. */
  issueChallenge(orderId: string, nowIso: string): { ok: true; challenge: SellerReadinessChallenge; expiresAt: string } | { ok: false; reason: 'not_accepted' } {
    if (!this.accepted.has(orderId)) return { ok: false, reason: 'not_accepted' };
    this.counter += 1;
    const challenge = SellerReadinessChallengeSchema.parse(`srch-${orderId}-${this.counter}`);
    const expiresAt = new Date(Date.parse(nowIso) + READINESS_CHALLENGE_TTL_MS).toISOString();
    this.challenges.set(orderId, { challenge, expiresAt });
    return { ok: true, challenge, expiresAt };
  }

  /**
   * « Produit prêt » — the canonical STRICT PackageReadinessConfirmation is
   * the ONLY accepted shape (foreign secrets like buyerDropCode are a parse
   * failure), the challenge must match and be unexpired, and qty/variant
   * must equal the LOCKED acceptance terms.
   */
  confirmReady(payload: unknown, nowIso: string): ReadinessOutcome {
    const parsed = PackageReadinessConfirmationSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, reason: 'not_canonical_or_foreign_secret' };
    const confirmation = parsed.data;

    const acceptance = this.accepted.get(confirmation.orderId);
    if (!acceptance) return { ok: false, reason: 'not_accepted' };

    const issued = this.challenges.get(confirmation.orderId);
    if (!issued || issued.challenge !== confirmation.readinessChallenge) {
      return { ok: false, reason: 'challenge_missing_or_mismatched' };
    }
    if (nowIso > issued.expiresAt) return { ok: false, reason: 'challenge_expired' };

    if (confirmation.qty !== acceptance.qty || confirmation.variant !== acceptance.variant || !confirmation.availableConfirmed) {
      return { ok: false, reason: 'locked_terms_mismatch' };
    }

    this.ready.set(confirmation.orderId, confirmation);
    return { ok: true, confirmation, pickupEligible: true };
  }

  /** "No pickup task before readiness" — the single pickup-eligibility rule. */
  isPickupEligible(orderId: string): boolean {
    return this.ready.has(orderId);
  }

  acceptance(orderId: string): FulfillmentAcceptance | undefined {
    return this.accepted.get(orderId);
  }
}
