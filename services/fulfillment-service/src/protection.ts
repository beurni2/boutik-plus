import {
  PlatformEventSchema,
  ProtectionClaimSchema,
  SellerTrustStateSchema,
  type PlatformEvent,
  type ProtectionClaim,
  type SellerTrustState,
} from '@platform/contracts';
import { FULFILLMENT_AGING_POLICY_V2, type FulfillmentBook } from './fulfillment.js';

/**
 * WO-2.6 — Protection Fund ROUTING (the seller-fault spine, B+I-12/B+I-13).
 * This desk RECORDS and ROUTES: refund_required trigger records, canonical
 * ProtectionClaims, access-based SellerTrustState impacts, and
 * reconciliation.alert.v1 emissions. It moves NO money — refund/payout
 * EXECUTION is E3, provider webhooks stay the only payment truth, and every
 * amount here is INPUT-COPIED from the payment record, never computed.
 * Seller consequences are ACCESS-based only: this desk writes nothing but
 * access data into the strict canonical SellerTrustState, and the B+I-12
 * seller-money scan gate bans the vocabulary a money consequence would need.
 */

/**
 * ⚠ LOCAL claim-state vocabulary — canon v0.5.0 leaves ProtectionClaim.state
 * a bare string (deliberately unenumerated). This is the versioned LOCAL
 * vocabulary, journal-flagged as a candidate for a future founder-owned
 * canon enumeration. Never written into the pinned package from here.
 */
export const PROTECTION_CLAIM_STATES_V1 = {
  version: 'protection-claim-states.v1',
  states: ['opened', 'under_review', 'resolved'],
} as const;
export type LocalClaimState = (typeof PROTECTION_CLAIM_STATES_V1.states)[number];

/**
 * ⚠ SAFEST DEFAULTS FLAGGED (founder-tunable, like the aging minutes): the
 * specs make seller-fault consequences access-based (B+I-12: "losses are
 * absorbed by the Protection Fund; consequences for the seller are
 * access-based") but name no thresholds. Versioned policy DATA, no code
 * change to tune. Tier stays 'provisional' — verification tiers beyond
 * provisional are D10 ⏳, not ours to open.
 */
export const SELLER_FAULT_CONSEQUENCE_POLICY_V1 = {
  version: 'seller-fault-consequence-policy.v1',
  /** faultCount at which new-offer access pauses (access, never money). */
  pauseNewOffersAtFaultCount: 2,
  pausedRestriction: 'new_offers_paused',
  probationLimits: { maxActiveOrders: 3 },
} as const;

/**
 * B+I-13 trigger RECORD (local, not a canonical event): "a seller fault
 * never delays the buyer's refund". `buyerPriority` is the literal-typed
 * marker E3's executor must honor — a seller-fault refund_required without
 * it cannot be constructed. Execution is E3; this record is the E2 trigger.
 */
export interface RefundRequiredRecord {
  readonly orderId: string;
  readonly reason: string;
  readonly faultClass: 'seller';
  /** Buyer first, always — never gated on the Protection Fund (B+I-13). */
  readonly buyerPriority: true;
  /** INPUT-COPIED from the provider-confirmed payment. Never computed. */
  readonly amountFcfa: number;
  readonly recordedAt: string;
}

export interface PaidOrderRegistration {
  orderId: string;
  sellerId: string;
  paidAt: string;
  /** COPIED from the provider-confirmed payment record. */
  amountFcfa: number;
  /** The payment/order evidence reference the claim will carry. */
  evidenceBundleId: string;
}

export type RefusalConsumption =
  | {
      accepted: true;
      duplicate: false;
      claim: ProtectionClaim;
      /** Dignified, structured — what the seller sees and can FIX. */
      corrective: { orderId: string; failedChecks: readonly string[]; readinessReopened: boolean };
    }
  | { accepted: true; duplicate: true }
  | {
      accepted: false;
      reason:
        | 'not_a_platform_event'
        | 'not_a_refusal_signal'
        | 'not_a_pickup_source'
        | 'fault_not_attributed'
        | 'not_seller_fault'
        | 'order_unknown';
    };

interface TrackedOrder extends PaidOrderRegistration {
  decisionAlerted: boolean;
  readyNoTaskAlerted: boolean;
  /** WO-2.7 item 5 — the THIRD aging clock (founder ruling ② on WO-2.6):
   * armed by a consumed pickup refusal, disarmed by the corrective
   * re-readiness, re-armed by a genuine post-correction second refusal. */
  refusedAt?: string;
  correctionAlerted: boolean;
}

export class ProtectionDesk {
  private readonly orders = new Map<string, TrackedOrder>();
  private readonly claims = new Map<string, { claim: ProtectionClaim; state: LocalClaimState }>();
  private readonly refundsRequired: RefundRequiredRecord[] = [];
  private readonly trust = new Map<string, SellerTrustState>();
  private readonly events: PlatformEvent[] = [];
  private readonly consumedCommandIds = new Set<string>();
  private eventCounter = 0;

  constructor(private readonly book: FulfillmentBook) {}

  /**
   * AUDIT-B+1 F1 — ONE MONEY TRIGGER PER ORDER, ACROSS EVERY CLOCK.
   *
   * Both aging clocks mint a `refund_required`. Each deduped only against
   * ITSELF — the decision clock via `tracked.decisionAlerted`, the correction
   * clock via a `reason === 'refused_never_corrected'` filter — so neither
   * could see the other, and one paid order could carry TWO triggers:
   *
   *   reasons = ["paid_order_no_supplier_decision","refused_never_corrected"]
   *   total claimed = 22 000 FCFA against ONE paid 11 000
   *
   * Reachable without any exotic input: no supplier decision for 120 min →
   * clock 1 fires → the supplier accepts LATE (lateness is not refused) →
   * readiness → pickup refusal → 360 min uncorrected → clock 2 fires.
   *
   * This is NOT a new policy. The correction clock's own comment already
   * records the safest default — « ONE money trigger per order … two triggers
   * against one paid amount cannot reconcile to the franc at E3 » — it was
   * simply scoped « from this clock » instead of to the order. Extending the
   * same rule across both clocks is applying the documented default, not
   * closing an open Decision. Law 1 (reconciles to the franc) and B+I-13 (the
   * buyer's refund, once) both point the same way.
   *
   * The ALERT is deliberately NOT deduped by this: ops still see every aging
   * episode. Only the money trigger is once-per-order.
   */
  private hasRefundTrigger(orderId: string): boolean {
    return this.refundsRequired.some((r) => r.orderId === orderId);
  }

  /** Payment truth arrives from the provider webhook consumer — everything
   * here is copied from that record. Registers the decision clock too. */
  registerPaidOrder(input: PaidOrderRegistration): void {
    this.book.registerPaidOrder(input.orderId, input.paidAt);
    if (!this.orders.has(input.orderId)) {
      this.orders.set(input.orderId, { ...input, decisionAlerted: false, readyNoTaskAlerted: false, correctionAlerted: false });
    }
  }

  /**
   * Contract E2 exit "paid-order-no-supplier-decision": past the versioned
   * deadline with no decision → ONE reconciliation.alert.v1 + the B+I-13
   * refund_required trigger record + a canonical ProtectionClaim + the
   * access-based trust impact. Resolution (the supplier deciding) removes
   * the order from the book's aging view, so this can NEVER fire after it.
   */
  sweepDecisionAging(nowIso: string): {
    alerted: readonly string[];
  } {
    const alerted: string[] = [];
    for (const aged of this.book.ordersPastDecisionDeadline(nowIso)) {
      const tracked = this.orders.get(aged.orderId);
      if (tracked === undefined || tracked.decisionAlerted) continue;
      tracked.decisionAlerted = true;
      this.emit('reconciliation.alert.v1', `recon-decision-${aged.orderId}`, {
        kind: 'paid_order_no_supplier_decision',
        order_id: aged.orderId,
        paid_at: aged.paidAt,
        aged_min: aged.agedMin,
        policy_version: FULFILLMENT_AGING_POLICY_V2.version,
      }, nowIso);
      // Frozen: the B+I-13 marker must survive any reader — TS readonly is
      // compile-time only (WO-2.6 verifier finding 2, mutation through the
      // getter, replayed as a regression test).
      // AUDIT-B+1 F1: once per ORDER, not once per clock — see hasRefundTrigger.
      if (!this.hasRefundTrigger(aged.orderId)) {
        this.refundsRequired.push(Object.freeze({
          orderId: aged.orderId,
          reason: 'paid_order_no_supplier_decision',
          faultClass: 'seller' as const,
          buyerPriority: true as const,
          amountFcfa: tracked.amountFcfa,
          recordedAt: nowIso,
        }));
      }
      this.openClaim({
        orderId: aged.orderId,
        reason: 'paid_order_no_supplier_decision',
        amount: tracked.amountFcfa,
        faultClass: 'seller',
        evidenceBundleId: tracked.evidenceBundleId,
        state: 'opened',
      });
      this.recordSellerFault(tracked.sellerId);
      alerted.push(aged.orderId);
    }
    return { alerted };
  }

  /**
   * Contract E2 exit "ready-package-no-task": readiness confirmed, no
   * dispatch task past the window → ONE reconciliation.alert.v1. No claim,
   * no refund record — the fault here is the PLATFORM's task plumbing, not
   * the seller's. A task appearing (or a corrective reopen) resolves it.
   */
  sweepReadyNoTask(taskExistsFor: (orderId: string) => boolean, nowIso: string): { alerted: readonly string[] } {
    const alerted: string[] = [];
    for (const orderId of this.book.readyPackagesWithoutTask(taskExistsFor, nowIso)) {
      const tracked = this.orders.get(orderId);
      if (tracked === undefined || tracked.readyNoTaskAlerted) continue;
      tracked.readyNoTaskAlerted = true;
      this.emit('reconciliation.alert.v1', `recon-ready-${orderId}`, {
        kind: 'ready_package_no_task',
        order_id: orderId,
        policy_version: FULFILLMENT_AGING_POLICY_V2.version,
      }, nowIso);
      alerted.push(orderId);
    }
    return { alerted };
  }

  /**
   * Séra's pickup-refusal signal (protection.claim_opened.v1,
   * faultClass=seller — the WO-1.3 emission shape) consumed: canonical claim
   * opened here + the supplier CORRECTIVE flow. Readiness is cleared so
   * stock stays honest; re-ready requires a freshly issued challenge (the
   * consumed one refuses forever). Duplicates absorb on command_id.
   */
  consumePickupRefusalSignal(raw: unknown, nowIso: string): RefusalConsumption {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, reason: 'not_a_platform_event' };
    const event = parsed.data;
    if (event.name !== 'protection.claim_opened.v1') return { accepted: false, reason: 'not_a_refusal_signal' };
    const payload = event.payload as Record<string, unknown>;

    /* AUDIT-B+1 F20 — A DOOR INSPECTION IS NOT A PICKUP REFUSAL.
     *
     * Séra emits `protection.claim_opened.v1` from TWO phases, and until now
     * this method read only `faultClass`, so it consumed both as a pickup
     * refusal. A buyer's valid refusal AT THE DOOR therefore opened a pickup
     * claim against the seller, called `reopenForCorrection` on an order whose
     * package is already out of the seller's hands, and armed the correction
     * clock — a second refund trigger against one paid amount.
     *
     * The two producers, read in sera/services/custody-service/src:
     *   custody-spine.ts:166  pickup refusal  { order_id, faultClass,
     *                                           failed_checks, attempt }
     *                         — carries NO `source` key at all.
     *   custody-spine.ts:470  door inspection { order_id, faultClass,
     *                                           source: 'door_inspection',
     *                                           rejection_reason }
     *
     * So the discriminator is written in the direction the producers actually
     * use: absent `source` is the pickup path and MUST keep working; a
     * `source` that says anything other than pickup verification is refused
     * BY NAME (Law 3 — no generic "failed" terminal). The audit's suggested
     * fix, « reject any claim whose payload carries source !==
     * 'pickup_verification' », would have refused every real pickup refusal,
     * because the real one sends no source. Verified against both emitters
     * before writing this.
     *
     * WHAT THIS DELIBERATELY DOES NOT DO: route the door-inspection claim
     * anywhere. Séra's own comment at :468 flags that arm's canonical
     * reasonCode as a canon v0.5.0 GAP ("derivations/door-inspection-fault-
     * mapping.md"). Inventing a destination here would be closing an open
     * question that is the founder's. Refusing to mis-consume it is not.
     */
    const source = payload['source'];
    if (typeof source === 'string' && source !== 'pickup_verification') {
      return { accepted: false, reason: 'not_a_pickup_source' };
    }

    const faultClass = payload['faultClass'];
    if (typeof faultClass !== 'string' || faultClass.length === 0) {
      return { accepted: false, reason: 'fault_not_attributed' };
    }
    if (faultClass !== 'seller') return { accepted: false, reason: 'not_seller_fault' };
    const orderId = typeof payload['order_id'] === 'string' ? payload['order_id'] : '';
    const tracked = this.orders.get(orderId);
    if (tracked === undefined) return { accepted: false, reason: 'order_unknown' };
    if (this.consumedCommandIds.has(event.envelope.command_id)) return { accepted: true, duplicate: true };
    this.consumedCommandIds.add(event.envelope.command_id);

    const failedChecks = Array.isArray(payload['failed_checks'])
      ? (payload['failed_checks'] as unknown[]).filter((c): c is string => typeof c === 'string')
      : [];
    const claim = this.openClaim({
      orderId,
      reason: failedChecks.length > 0 ? `pickup_refusal:${[...failedChecks].sort().join(',')}` : 'pickup_refusal',
      amount: tracked.amountFcfa,
      faultClass: 'seller',
      evidenceBundleId: tracked.evidenceBundleId,
      state: 'opened',
    });
    this.recordSellerFault(tracked.sellerId);
    const reopened = this.book.reopenForCorrection(orderId);
    // New readiness episode: a fresh ready-no-task stall may alert again
    // (verifier finding 5 — flags were once-ever, not once-per-episode).
    if (reopened.ok) tracked.readyNoTaskAlerted = false;
    // WO-2.7 item 5 — the THIRD clock arms; RE-arm ONLY POST-CORRECTION
    // (verifier finding 3, ⚠ safest reading of the founder's ruling wording
    // "a post-correction second refusal re-arms it", flagged for
    // ratification): a repeat refusal with NO intervening correction keeps
    // the ORIGINAL clock start — the buyer's B+I-13 trigger never slides
    // later on the seller's repeat failures.
    const lastReady = this.book.lastReadyAtOf(orderId);
    if (tracked.refusedAt === undefined || (lastReady !== undefined && lastReady > tracked.refusedAt)) {
      tracked.refusedAt = nowIso;
      tracked.correctionAlerted = false;
    }
    return {
      accepted: true,
      duplicate: false,
      claim,
      corrective: { orderId, failedChecks, readinessReopened: reopened.ok },
    };
  }

  /**
   * WO-2.7 item 5 — the THIRD aging clock (founder ruling ② on WO-2.6):
   * "the refused-never-corrected limbo closes at E2 assembly by name: a
   * versioned correctionDeadline ages into refund_required(faultClass=
   * seller)". Corrective completion (re-readiness confirmed) STOPS the
   * clock — silence forever unless a genuine second refusal re-arms it.
   * Past the deadline uncorrected: ONE reconciliation.alert.v1 + the frozen
   * B+I-13 refund_required record, LINKED to the claim the refusal opened.
   */
  sweepCorrectionAging(nowIso: string): { alerted: readonly string[] } {
    const alerted: string[] = [];
    for (const tracked of this.orders.values()) {
      if (tracked.refusedAt === undefined || tracked.correctionAlerted) continue;
      // DURABLE disarm (verifier BLOCKING finding 1): the correction is the
      // confirmed re-readiness itself, recorded at write time in the book
      // and never erased — NOT the transient pickup-eligibility, which any
      // later readiness clearing could wipe before a sweep observed it.
      const lastReady = this.book.lastReadyAtOf(tracked.orderId);
      if (lastReady !== undefined && lastReady > tracked.refusedAt) {
        // Corrected — the clock stops and never fires for this episode.
        delete tracked.refusedAt;
        continue;
      }
      const agedMin = (Date.parse(nowIso) - Date.parse(tracked.refusedAt)) / 60_000;
      if (agedMin < FULFILLMENT_AGING_POLICY_V2.correctionDeadlineMin) continue;
      tracked.correctionAlerted = true;
      const linkedClaim = this.claims.get(tracked.orderId);
      this.emit('reconciliation.alert.v1', `recon-correction-${tracked.orderId}-${tracked.refusedAt}`, {
        kind: 'refused_never_corrected',
        order_id: tracked.orderId,
        refused_at: tracked.refusedAt,
        aged_min: Math.floor(agedMin),
        linked_claim_reason: linkedClaim?.claim.reason ?? 'claim_missing',
        policy_version: FULFILLMENT_AGING_POLICY_V2.version,
      }, nowIso);
      // ⚠ SAFEST DEFAULT (verifier finding 2 — spec-silent money semantics,
      // founder ruling requested): ONE money trigger per order. A re-fired
      // episode alerts (ops visibility above) but never mints a second
      // refund_required — two triggers against one paid amount cannot
      // reconcile to the franc at E3.
      // AUDIT-B+1 F1: this filter was `&& r.reason === 'refused_never_corrected'`,
      // which deduped this clock against ITSELF only — so the decision clock's
      // trigger was invisible here and one order could carry both. Scoped to
      // the ORDER now, which is what the sentence above always meant.
      if (!this.hasRefundTrigger(tracked.orderId)) {
        this.refundsRequired.push(Object.freeze({
          orderId: tracked.orderId,
          reason: 'refused_never_corrected',
          faultClass: 'seller' as const,
          buyerPriority: true as const,
          amountFcfa: tracked.amountFcfa,
          recordedAt: nowIso,
        }));
      }
      alerted.push(tracked.orderId);
    }
    return { alerted };
  }

  /** LOCAL state machine: opened → under_review → resolved, forward only. */
  advanceClaim(orderId: string, to: LocalClaimState): { ok: true; state: LocalClaimState } | { ok: false; reason: 'claim_unknown' | 'not_forward' } {
    const entry = this.claims.get(orderId);
    if (entry === undefined) return { ok: false, reason: 'claim_unknown' };
    const order = PROTECTION_CLAIM_STATES_V1.states;
    if (order.indexOf(to) !== order.indexOf(entry.state) + 1) return { ok: false, reason: 'not_forward' };
    entry.state = to;
    entry.claim = ProtectionClaimSchema.parse({ ...entry.claim, state: to });
    return { ok: true, state: to };
  }

  /** Access-based ONLY (B+I-12): faultCount up, offer access pauses at the
   * policy threshold. The strict canonical shape names no money field and
   * this code writes only access data — but probationLimits is an open
   * record upstream (canon note flagged in JOURNAL.md), so the structural
   * guarantee is partial and the B+I-12 seller-money scan gate runs besides. */
  private recordSellerFault(sellerId: string): SellerTrustState {
    const prev = this.trust.get(sellerId);
    const faultCount = (prev?.faultCount ?? 0) + 1;
    const restrictions =
      faultCount >= SELLER_FAULT_CONSEQUENCE_POLICY_V1.pauseNewOffersAtFaultCount
        ? [SELLER_FAULT_CONSEQUENCE_POLICY_V1.pausedRestriction]
        : [];
    const next = SellerTrustStateSchema.parse({
      sellerId,
      tier: prev?.tier ?? 'provisional',
      faultCount,
      restrictions,
      probationLimits: SELLER_FAULT_CONSEQUENCE_POLICY_V1.probationLimits,
    });
    this.trust.set(sellerId, next);
    return next;
  }

  private openClaim(shape: unknown): ProtectionClaim {
    const claim = ProtectionClaimSchema.parse(shape);
    this.claims.set(claim.orderId, { claim, state: claim.state as LocalClaimState });
    return claim;
  }

  private emit(name: string, key: string, payload: Record<string, unknown>, at: string): void {
    this.eventCounter += 1;
    this.events.push(
      PlatformEventSchema.parse({
        name,
        envelope: {
          command_id: `cmd_${key}`,
          correlation_id: key,
          aggregateVersion: this.eventCounter,
          actor: 'boutik:protection-desk',
          serverTime: at,
          version: 'v1',
        },
        payload,
      }),
    );
  }

  allEvents(): readonly PlatformEvent[] {
    return [...this.events];
  }

  allRefundsRequired(): readonly RefundRequiredRecord[] {
    return [...this.refundsRequired];
  }

  claimFor(orderId: string): { claim: ProtectionClaim; state: LocalClaimState } | undefined {
    const entry = this.claims.get(orderId);
    return entry === undefined ? undefined : { claim: entry.claim, state: entry.state };
  }

  trustStateFor(sellerId: string): SellerTrustState | undefined {
    return this.trust.get(sellerId);
  }
}
