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

/**
 * Aging policy — versioned DATA, founder-tunable at E4 telemetry, never
 * silently. v2 (WO-2.7 item 5, founder ruling ② on WO-2.6): the THIRD aging
 * clock — a refused-never-corrected order ages into the seller-fault refund
 * trigger. The v1 values (120/60) were ACCEPTED as CTO defaults by the
 * founder's WO-2.6 ruling ① and carry forward unchanged. ⚠ SAFEST DEFAULT
 * FLAGGED: correctionDeadlineMin 360 is a CTO default pending the founder's
 * number.
 */
export const FULFILLMENT_AGING_POLICY_V2 = {
  version: 'fulfillment-aging-policy.v2',
  /** Paid order awaiting the supplier's accept/decline decision. */
  acceptanceDecisionMin: 120,
  /** Readiness confirmed but no dispatch task appeared. */
  readyPackageNoTaskMin: 60,
  /** Refused at pickup, never corrected/re-readied (the third clock). */
  correctionDeadlineMin: 360,
} as const;

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
  /** WO-2.6: single-use discipline — a consumed challenge refuses forever. */
  consumedAt?: string;
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
        | 'challenge_already_used'
        | 'locked_terms_mismatch';
    };

export class FulfillmentBook {
  private readonly accepted = new Map<string, FulfillmentAcceptance>();
  private readonly challenges = new Map<string, IssuedChallenge>();
  private readonly ready = new Map<string, PackageReadinessConfirmation>();
  /** WO-2.6: paid orders awaiting the supplier's DECISION (Contract E2
   * "paid-order-no-supplier-decision"). */
  private readonly awaitingDecision = new Map<string, { paidAt: string }>();
  private counter = 0;

  registerPaidOrder(orderId: string, paidAt: string): void {
    // First-wins: a redelivery (or a crafted later paidAt) must never reset
    // the decision clock (WO-2.6 verifier finding 4, replayed as a test).
    if (!this.accepted.has(orderId) && !this.awaitingDecision.has(orderId)) {
      this.awaitingDecision.set(orderId, { paidAt });
    }
  }

  /** Clock-controlled aging: paid past the decision deadline and still
   * undecided. Resolution (acceptance) removes it — an alert can never fire
   * after the decision landed. */
  ordersPastDecisionDeadline(nowIso: string): readonly { orderId: string; paidAt: string; agedMin: number }[] {
    const out: { orderId: string; paidAt: string; agedMin: number }[] = [];
    for (const [orderId, rec] of this.awaitingDecision) {
      const agedMin = (Date.parse(nowIso) - Date.parse(rec.paidAt)) / 60_000;
      if (agedMin >= FULFILLMENT_AGING_POLICY_V2.acceptanceDecisionMin) {
        out.push({ orderId, paidAt: rec.paidAt, agedMin: Math.floor(agedMin) });
      }
    }
    return out;
  }

  /** Readiness confirmed, no dispatch task yet, past the aging window. */
  readyPackagesWithoutTask(taskExistsFor: (orderId: string) => boolean, nowIso: string): readonly string[] {
    const out: string[] = [];
    for (const [orderId, confirmation] of this.ready) {
      if (taskExistsFor(orderId)) continue;
      const agedMin = (Date.parse(nowIso) - Date.parse(confirmation.at)) / 60_000;
      if (agedMin >= FULFILLMENT_AGING_POLICY_V2.readyPackageNoTaskMin) out.push(orderId);
    }
    return out;
  }

  accept(acceptance: FulfillmentAcceptance): { ok: true; locked: FulfillmentAcceptance } | { ok: false; reason: 'already_accepted' } {
    if (this.accepted.has(acceptance.orderId)) return { ok: false, reason: 'already_accepted' };
    const locked = Object.freeze({ ...acceptance });
    this.accepted.set(acceptance.orderId, locked);
    this.awaitingDecision.delete(acceptance.orderId); // decided — aging stops
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
    // WO-2.6: single-use — a consumed challenge refuses; re-readiness needs
    // a freshly issued (distinct) challenge.
    if (issued.consumedAt !== undefined) return { ok: false, reason: 'challenge_already_used' };
    if (nowIso > issued.expiresAt) return { ok: false, reason: 'challenge_expired' };

    if (confirmation.qty !== acceptance.qty || confirmation.variant !== acceptance.variant || !confirmation.availableConfirmed) {
      return { ok: false, reason: 'locked_terms_mismatch' };
    }

    issued.consumedAt = nowIso;
    this.ready.set(confirmation.orderId, confirmation);
    return { ok: true, confirmation, pickupEligible: true };
  }

  /** WO-2.6 corrective flow: a refused pickup clears the stale readiness so
   * stock state stays honest; the seller corrects and re-readies with a NEW
   * challenge (the old one is consumed/expired — refused). */
  reopenForCorrection(orderId: string): { ok: true } | { ok: false; reason: 'not_ready' } {
    if (!this.ready.has(orderId)) return { ok: false, reason: 'not_ready' };
    this.ready.delete(orderId);
    return { ok: true };
  }

  /** "No pickup task before readiness" — the single pickup-eligibility rule. */
  isPickupEligible(orderId: string): boolean {
    return this.ready.has(orderId);
  }

  acceptance(orderId: string): FulfillmentAcceptance | undefined {
    return this.accepted.get(orderId);
  }
}
