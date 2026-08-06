import { describe, expect, it } from 'vitest';
import { FulfillmentBook, FULFILLMENT_AGING_POLICY_V2 } from '../src/fulfillment.js';
import { ProtectionDesk, PROTECTION_CLAIM_STATES_V1 } from '../src/protection.js';
import { SeraRefusalEmitterMock } from '../mocks/sera-refusal-emitter-mock.js';
import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * WO-2.6 — fulfillment failure flows + Protection Fund routing.
 * Every clock is CONTROLLED: both sides of both aging deadlines, and the
 * never-after-resolution law. Every seller-fault refund_required carries the
 * B+I-13 buyer-priority marker. The seller is never touched in money — only
 * in access.
 */

const T0 = '2026-07-10T09:00:00.000Z';
const minutesAfter = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const DECISION_MIN = FULFILLMENT_AGING_POLICY_V2.acceptanceDecisionMin;
const READY_MIN = FULFILLMENT_AGING_POLICY_V2.readyPackageNoTaskMin;
const SHA = 'a3f5c9d21e8b47061234567890abcdef1234567890abcdef1234567890abcdef';

const acceptance = { orderId: 'order-e2-0001', variant: 'taille unique', qty: 1, sellerNetFcfa: 8_500, deadline: '2026-07-10T18:00:00.000Z' };
const registration = { orderId: 'order-e2-0001', sellerId: 'sup-1', paidAt: T0, amountFcfa: 11_000, evidenceBundleId: 'eb-pay-0001' };

function readyPayload(challenge: string, at: string) {
  return {
    orderId: 'order-e2-0001',
    photoRef: { ref: 'media/pkg-e2.jpg', sha256: SHA, mimeType: 'image/jpeg' },
    readinessChallenge: challenge,
    qty: 1,
    variant: 'taille unique',
    availableConfirmed: true,
    at,
  };
}

function paidDesk() {
  const book = new FulfillmentBook();
  const desk = new ProtectionDesk(book);
  desk.registerPaidOrder(registration);
  return { book, desk };
}

function readyDesk(at = T0) {
  const { book, desk } = paidDesk();
  book.accept(acceptance);
  const issued = book.issueChallenge('order-e2-0001', at);
  if (!issued.ok) throw new Error('setup');
  const ready = book.confirmReady(readyPayload(issued.challenge as string, at), at);
  if (!ready.ok) throw new Error('setup');
  return { book, desk };
}

describe('paid-order-no-supplier-decision aging (Contract E2 exit; B+I-12/B+I-13)', () => {
  it('UNDER the deadline: silent — no alert, no claim, no refund record', () => {
    const { desk } = paidDesk();
    const swept = desk.sweepDecisionAging(minutesAfter(DECISION_MIN - 1));
    expect(swept.alerted).toEqual([]);
    expect(desk.allEvents()).toEqual([]);
    expect(desk.allRefundsRequired()).toEqual([]);
    expect(desk.claimFor('order-e2-0001')).toBeUndefined();
  });

  it('PAST the deadline: ONE reconciliation.alert.v1 + refund_required(faultClass=seller, buyerPriority) + canonical claim + access impact', () => {
    const { desk } = paidDesk();
    const swept = desk.sweepDecisionAging(minutesAfter(DECISION_MIN));
    expect(swept.alerted).toEqual(['order-e2-0001']);

    const alerts = desk.allEvents().filter((e) => e.name === 'reconciliation.alert.v1');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.payload).toMatchObject({
      kind: 'paid_order_no_supplier_decision',
      order_id: 'order-e2-0001',
      aged_min: DECISION_MIN,
      policy_version: 'fulfillment-aging-policy.v2',
    });

    // B+I-13: the trigger record — buyer first, marker present, amount COPIED.
    expect(desk.allRefundsRequired()).toEqual([
      {
        orderId: 'order-e2-0001',
        reason: 'paid_order_no_supplier_decision',
        faultClass: 'seller',
        buyerPriority: true,
        amountFcfa: 11_000,
        recordedAt: minutesAfter(DECISION_MIN),
      },
    ]);

    const entry = desk.claimFor('order-e2-0001');
    expect(entry?.state).toBe('opened');
    expect(entry?.claim).toEqual({
      orderId: 'order-e2-0001',
      reason: 'paid_order_no_supplier_decision',
      amount: 11_000,
      faultClass: 'seller',
      evidenceBundleId: 'eb-pay-0001',
      state: 'opened',
    });

    // Access-based impact ONLY: a count and (below threshold) no restriction.
    expect(desk.trustStateFor('sup-1')).toEqual({
      sellerId: 'sup-1',
      tier: 'provisional',
      faultCount: 1,
      restrictions: [],
      probationLimits: { maxActiveOrders: 3 },
    });
  });

  it('idempotent: a second sweep past the deadline adds NOTHING', () => {
    const { desk } = paidDesk();
    desk.sweepDecisionAging(minutesAfter(DECISION_MIN));
    const again = desk.sweepDecisionAging(minutesAfter(DECISION_MIN + 60));
    expect(again.alerted).toEqual([]);
    expect(desk.allEvents().filter((e) => e.name === 'reconciliation.alert.v1')).toHaveLength(1);
    expect(desk.allRefundsRequired()).toHaveLength(1);
  });

  it('NEVER after resolution: the supplier decides before the sweep runs → silence forever, even far past the deadline', () => {
    const { book, desk } = paidDesk();
    book.accept(acceptance); // the decision lands (in time or late — it landed)
    const swept = desk.sweepDecisionAging(minutesAfter(DECISION_MIN + 600));
    expect(swept.alerted).toEqual([]);
    expect(desk.allEvents()).toEqual([]);
    expect(desk.allRefundsRequired()).toEqual([]);
  });
});

describe('ready-package-no-task aging (Contract E2 exit)', () => {
  const noTask = () => false;
  const hasTask = () => true;

  it('UNDER the window: silent; PAST it: ONE alert, no claim and no refund record (platform plumbing, not seller fault)', () => {
    const { desk } = readyDesk();
    expect(desk.sweepReadyNoTask(noTask, minutesAfter(READY_MIN - 1)).alerted).toEqual([]);
    expect(desk.allEvents()).toEqual([]);

    const swept = desk.sweepReadyNoTask(noTask, minutesAfter(READY_MIN));
    expect(swept.alerted).toEqual(['order-e2-0001']);
    const alerts = desk.allEvents().filter((e) => e.name === 'reconciliation.alert.v1');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.payload).toMatchObject({ kind: 'ready_package_no_task', order_id: 'order-e2-0001' });
    expect(desk.allRefundsRequired()).toEqual([]);
    expect(desk.claimFor('order-e2-0001')).toBeUndefined();

    // Idempotent thereafter.
    expect(desk.sweepReadyNoTask(noTask, minutesAfter(READY_MIN + 30)).alerted).toEqual([]);
    expect(desk.allEvents().filter((e) => e.name === 'reconciliation.alert.v1')).toHaveLength(1);
  });

  it('NEVER after resolution: a dispatch task exists → no alert however old the readiness is', () => {
    const { desk } = readyDesk();
    expect(desk.sweepReadyNoTask(hasTask, minutesAfter(READY_MIN + 600)).alerted).toEqual([]);
    expect(desk.allEvents()).toEqual([]);
  });
});

describe('challenge single-use + re-issue discipline (WO-2.6 corrective flow prerequisite)', () => {
  it('a CONSUMED challenge refuses forever; re-readiness needs a fresh, DISTINCT challenge', () => {
    const book = new FulfillmentBook();
    book.accept(acceptance);
    const first = book.issueChallenge('order-e2-0001', T0);
    if (!first.ok) throw new Error('setup');
    expect(book.confirmReady(readyPayload(first.challenge as string, T0), T0).ok).toBe(true);

    // Corrective reopen, then attempt re-use of the consumed challenge: REFUSED.
    expect(book.reopenForCorrection('order-e2-0001')).toEqual({ ok: true });
    expect(book.isPickupEligible('order-e2-0001')).toBe(false); // honest stock
    expect(book.confirmReady(readyPayload(first.challenge as string, minutesAfter(1)), minutesAfter(1)))
      .toEqual({ ok: false, reason: 'challenge_already_used' });

    // A fresh issue is a NEW branded secret, distinct from the consumed one.
    const second = book.issueChallenge('order-e2-0001', minutesAfter(1));
    if (!second.ok) throw new Error('setup');
    expect(second.challenge).not.toBe(first.challenge);
    expect(book.confirmReady(readyPayload(second.challenge as string, minutesAfter(2)), minutesAfter(2)).ok).toBe(true);
    expect(book.isPickupEligible('order-e2-0001')).toBe(true);
  });

  it('an EXPIRED challenge refuses; the re-issued one works — expiry and consumption are separate refusals', () => {
    const book = new FulfillmentBook();
    book.accept(acceptance);
    const first = book.issueChallenge('order-e2-0001', T0);
    if (!first.ok) throw new Error('setup');
    expect(book.confirmReady(readyPayload(first.challenge as string, minutesAfter(11)), minutesAfter(11)))
      .toEqual({ ok: false, reason: 'challenge_expired' });
    const second = book.issueChallenge('order-e2-0001', minutesAfter(11));
    if (!second.ok) throw new Error('setup');
    expect(book.confirmReady(readyPayload(second.challenge as string, minutesAfter(12)), minutesAfter(12)).ok).toBe(true);
  });
});

describe('pickup-refusal consumption → claim + corrective flow (sera signal, §3-certified mock)', () => {
  // The mock's seed 'e2' yields order_e2 — register the desk under that id.
  const mockRegistration = { orderId: 'order_e2', sellerId: 'sup-1', paidAt: T0, amountFcfa: 11_000, evidenceBundleId: 'eb-pay-e2' };
  const mockAcceptance = { orderId: 'order_e2', variant: 'taille unique', qty: 1, sellerNetFcfa: 8_500, deadline: '2026-07-10T18:00:00.000Z' };
  const mockReadyPayload = (challenge: string, at: string) => ({ ...readyPayload(challenge, at), orderId: 'order_e2' });

  function refusalScene() {
    const book = new FulfillmentBook();
    const desk = new ProtectionDesk(book);
    desk.registerPaidOrder(mockRegistration);
    book.accept(mockAcceptance);
    const issued = book.issueChallenge('order_e2', T0);
    if (!issued.ok) throw new Error('setup');
    const ready = book.confirmReady(mockReadyPayload(issued.challenge as string, T0), T0);
    if (!ready.ok) throw new Error('setup');
    return { book, desk, mock: new SeraRefusalEmitterMock(), firstChallenge: issued.challenge as string };
  }

  it('E2E: refusal consumed → canonical seller-fault claim + dignified structured reason + readiness reopened + NEW challenge re-readies', () => {
    const { book, desk, mock, firstChallenge } = refusalScene();
    const signal = mock.emitRefusalSignal('e2', ['colour', 'qty']);
    const outcome = desk.consumePickupRefusalSignal(signal, minutesAfter(5));
    expect(outcome).toMatchObject({
      accepted: true,
      duplicate: false,
      corrective: { orderId: 'order_e2', failedChecks: ['colour', 'qty'], readinessReopened: true },
    });
    if (!outcome.accepted || outcome.duplicate) throw new Error('unexpected');

    // The canonical claim: fault attributed, amount COPIED, structured reason.
    expect(outcome.claim).toEqual({
      orderId: 'order_e2',
      reason: 'pickup_refusal:colour,qty',
      amount: 11_000,
      faultClass: 'seller',
      evidenceBundleId: 'eb-pay-e2',
      state: 'opened',
    });

    // Honest stock: readiness cleared, pickup no longer eligible.
    expect(book.isPickupEligible('order_e2')).toBe(false);

    // The consumed challenge is dead; the corrective path issues a NEW one.
    expect(book.confirmReady(mockReadyPayload(firstChallenge, minutesAfter(6)), minutesAfter(6)))
      .toEqual({ ok: false, reason: 'challenge_already_used' });
    const fresh = book.issueChallenge('order_e2', minutesAfter(6));
    if (!fresh.ok) throw new Error('setup');
    expect(fresh.challenge).not.toBe(firstChallenge);
    expect(book.confirmReady(mockReadyPayload(fresh.challenge as string, minutesAfter(7)), minutesAfter(7)).ok).toBe(true);
    expect(book.isPickupEligible('order_e2')).toBe(true);

    // Access impact recorded; refusal alone does NOT trigger a buyer refund
    // record — the corrective flow re-delivers the same order.
    expect(desk.trustStateFor('sup-1')?.faultCount).toBe(1);
    expect(desk.allRefundsRequired()).toEqual([]);
  });

  it('at-least-once: the SAME command_id redelivered absorbs as duplicate — one claim, one fault', () => {
    const { desk, mock } = refusalScene();
    const signal = mock.emitRefusalSignal('e2', ['colour']);
    expect(desk.consumePickupRefusalSignal(signal, minutesAfter(5))).toMatchObject({ accepted: true, duplicate: false });
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['colour']), minutesAfter(6)))
      .toEqual({ accepted: true, duplicate: true });
    expect(desk.trustStateFor('sup-1')?.faultCount).toBe(1);
  });

  it('refuses closed: non-event, non-refusal name, MISSING fault attribution, non-seller fault, unknown order', () => {
    const { desk, mock } = refusalScene();
    expect(desk.consumePickupRefusalSignal({ garbage: true }, T0)).toEqual({ accepted: false, reason: 'not_a_platform_event' });

    const signal = mock.emitRefusalSignal('e2', ['colour']);
    expect(desk.consumePickupRefusalSignal({ ...signal, name: 'fulfillment.ready.v1' }, T0))
      .toEqual({ accepted: false, reason: 'not_a_refusal_signal' });

    // A claim with NO fault attribution cannot open anything (verifier attack).
    const { faultClass: _dropped, ...unattributed } = signal.payload as Record<string, unknown>;
    expect(desk.consumePickupRefusalSignal({ ...signal, payload: unattributed }, T0))
      .toEqual({ accepted: false, reason: 'fault_not_attributed' });

    expect(desk.consumePickupRefusalSignal({ ...signal, payload: { ...(signal.payload as object), faultClass: 'sera' } }, T0))
      .toEqual({ accepted: false, reason: 'not_seller_fault' });

    const foreign = mock.emitRefusalSignal('unknown', ['colour']);
    expect(desk.consumePickupRefusalSignal(foreign, T0)).toEqual({ accepted: false, reason: 'order_unknown' });
    expect(desk.claimFor('order_e2')).toBeUndefined();
    expect(desk.trustStateFor('sup-1')).toBeUndefined();
  });

  /**
   * AUDIT-B+1 F20 — A DOOR INSPECTION MUST NOT BE EATEN AS A PICKUP REFUSAL.
   *
   * Séra emits `protection.claim_opened.v1` from two different phases. Before
   * this fix the consumer read only `faultClass`, so a buyer's valid refusal
   * AT THE DOOR opened a *pickup* claim against the seller, reopened readiness
   * on a package already out of his hands, and armed the correction clock —
   * which can mint a second refund trigger against one paid amount.
   *
   * The payload below is the REAL emitted shape, copied from
   * sera/services/custody-service/src/custody-spine.ts:470. It carries
   * faultClass 'seller', so it clears every check that existed before.
   */
  const doorInspectionSignal = (): PlatformEvent =>
    PlatformEventSchema.parse({
      name: 'protection.claim_opened.v1',
      envelope: {
        command_id: 'door-claim-order_e2',
        correlation_id: 'corr_e2',
        aggregateVersion: 9,
        actor: 'mock:sera-refusal-emitter',
        serverTime: T0,
        version: 'v1',
      },
      payload: {
        order_id: 'order_e2',
        faultClass: 'seller',
        source: 'door_inspection',
        rejection_reason: 'refused_valid',
      },
    });

  it('F20: a DOOR-INSPECTION claim is refused BY NAME, and nothing at all moves', () => {
    const { book, desk } = refusalScene();
    expect(desk.consumePickupRefusalSignal(doorInspectionSignal(), minutesAfter(5)))
      .toEqual({ accepted: false, reason: 'not_a_pickup_source' });

    // Nothing moved: no claim, no seller fault, readiness intact, no refund.
    expect(desk.claimFor('order_e2'), 'a pickup claim was opened from a DOOR refusal').toBeUndefined();
    expect(desk.trustStateFor('sup-1'), 'the seller was faulted for a buyer door refusal').toBeUndefined();
    expect(book.isPickupEligible('order_e2'), 'readiness was reopened on a package already collected').toBe(true);
    expect(desk.allRefundsRequired(), 'a refund trigger armed off a door inspection').toEqual([]);
  });

  it('F20 CONTROL: the SAME payload with `source` removed IS consumed — the refusal is caused by `source`, nothing else', () => {
    const { desk } = refusalScene();
    const signal = doorInspectionSignal();
    const { source: _dropped, ...sansSource } = signal.payload as Record<string, unknown>;
    const outcome = desk.consumePickupRefusalSignal({ ...signal, payload: sansSource }, minutesAfter(5));
    expect(outcome, 'without `source` this payload must still be consumed — otherwise the test above proves nothing').toMatchObject({
      accepted: true,
      duplicate: false,
    });
  });

  it('F20 REGRESSION: the REAL pickup refusal carries NO `source` key and stays accepted', () => {
    const { desk, mock } = refusalScene();
    const reel = mock.emitRefusalSignal('e2', ['colour', 'qty']);
    expect(
      Object.prototype.hasOwnProperty.call(reel.payload as object, 'source'),
      'the real pickup emitter grew a `source` key — re-read custody-spine.ts:166 before trusting this gate',
    ).toBe(false);
    expect(desk.consumePickupRefusalSignal(reel, minutesAfter(5))).toMatchObject({
      accepted: true,
      duplicate: false,
      corrective: { orderId: 'order_e2', readinessReopened: true },
    });
  });

  it('F20: an EXPLICIT pickup_verification source is accepted (the discriminator names one phase, not one shape)', () => {
    const { desk, mock } = refusalScene();
    const signal = mock.emitRefusalSignal('e2', ['colour']);
    const explicite = { ...(signal.payload as object), source: 'pickup_verification' };
    expect(desk.consumePickupRefusalSignal({ ...signal, payload: explicite }, minutesAfter(5)))
      .toMatchObject({ accepted: true, duplicate: false });
  });

  // Verifier finding 3 CLOSED upstream (sera WO-2.7 item 3): the real sera
  // emission now keys the fault command per ATTEMPT — the round-2 signal
  // below is the mock's faithful attempt-2 shape, not a hand-crafted id.
  it('second seller fault crosses the policy threshold → access pauses (restriction), still ZERO money surface', () => {
    const { book, desk, mock } = refusalScene();
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['colour']), minutesAfter(5)))
      .toMatchObject({ accepted: true, duplicate: false });
    // Correct, re-ready, second refusal — sera re-emits after the corrective
    // round-trip with the NEXT attempt number (a new countable command_id).
    const fresh = book.issueChallenge('order_e2', minutesAfter(6));
    if (!fresh.ok) throw new Error('setup');
    book.confirmReady(mockReadyPayload(fresh.challenge as string, minutesAfter(7)), minutesAfter(7));
    const second = mock.emitRefusalSignal('e2', ['damage'], 2);
    expect(second.envelope.command_id).toBe('fault-order_e2-a2');
    expect(desk.consumePickupRefusalSignal(second, minutesAfter(8))).toMatchObject({ accepted: true, duplicate: false });

    const trust = desk.trustStateFor('sup-1');
    expect(trust).toEqual({
      sellerId: 'sup-1',
      tier: 'provisional',
      faultCount: 2,
      restrictions: ['new_offers_paused'],
      probationLimits: { maxActiveOrders: 3 },
    });
    // The canonical strict shape holds NO money field — parse proved it; the
    // record contains exactly the access keys above and nothing else.
    expect(Object.keys(trust as object).sort()).toEqual(['faultCount', 'probationLimits', 'restrictions', 'sellerId', 'tier']);
  });
});

describe('LOCAL claim-state vocabulary (canon state is spec-bare — flagged)', () => {
  it('opened → under_review → resolved, forward only; unknown claim refuses', () => {
    expect(PROTECTION_CLAIM_STATES_V1.states).toEqual(['opened', 'under_review', 'resolved']);
    const { desk } = paidDesk();
    desk.sweepDecisionAging(minutesAfter(DECISION_MIN));
    expect(desk.advanceClaim('order-e2-0001', 'resolved')).toEqual({ ok: false, reason: 'not_forward' });
    expect(desk.advanceClaim('order-e2-0001', 'under_review')).toEqual({ ok: true, state: 'under_review' });
    expect(desk.advanceClaim('order-e2-0001', 'resolved')).toEqual({ ok: true, state: 'resolved' });
    expect(desk.advanceClaim('order-e2-0001', 'opened')).toEqual({ ok: false, reason: 'not_forward' });
    expect(desk.advanceClaim('order-none', 'under_review')).toEqual({ ok: false, reason: 'claim_unknown' });
    expect(desk.claimFor('order-e2-0001')?.claim.state).toBe('resolved');
  });
});

describe('WO-2.7 item 5 — the THIRD aging clock: refused-never-corrected (founder ruling ② on WO-2.6)', () => {
  const CORRECTION_MIN = FULFILLMENT_AGING_POLICY_V2.correctionDeadlineMin;
  const mockRegistration = { orderId: 'order_e2', sellerId: 'sup-1', paidAt: T0, amountFcfa: 11_000, evidenceBundleId: 'eb-pay-e2' };
  const mockAcceptance = { orderId: 'order_e2', variant: 'taille unique', qty: 1, sellerNetFcfa: 8_500, deadline: '2026-07-10T18:00:00.000Z' };
  const mockReady = (challenge: string, at: string) => ({
    orderId: 'order_e2',
    photoRef: { ref: 'media/pkg-e2.jpg', sha256: SHA, mimeType: 'image/jpeg' },
    readinessChallenge: challenge,
    qty: 1,
    variant: 'taille unique',
    availableConfirmed: true,
    at,
  });

  function refusedScene() {
    const book = new FulfillmentBook();
    const desk = new ProtectionDesk(book);
    const mock = new SeraRefusalEmitterMock();
    desk.registerPaidOrder(mockRegistration);
    book.accept(mockAcceptance);
    const issued = book.issueChallenge('order_e2', T0);
    if (!issued.ok) throw new Error('setup');
    if (!book.confirmReady(mockReady(issued.challenge as string, T0), T0).ok) throw new Error('setup');
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['colour']), T0)).toMatchObject({ accepted: true, duplicate: false });
    return { book, desk, mock };
  }

  const reReady = (book: FulfillmentBook, at: string) => {
    const fresh = book.issueChallenge('order_e2', at);
    if (!fresh.ok) throw new Error('setup');
    expect(book.confirmReady(mockReady(fresh.challenge as string, at), at).ok).toBe(true);
  };

  it('UNDER the deadline: silent — the refusal alone triggers no refund', () => {
    const { desk } = refusedScene();
    expect(desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN - 1)).alerted).toEqual([]);
    expect(desk.allEvents().filter((e) => (e.payload as Record<string, unknown>)['kind'] === 'refused_never_corrected')).toHaveLength(0);
    expect(desk.allRefundsRequired()).toEqual([]);
  });

  it('PAST the deadline uncorrected: ONE alert + FROZEN refund_required(seller, buyerPriority) LINKED to the refusal claim; idempotent', () => {
    const { desk } = refusedScene();
    const swept = desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN));
    expect(swept.alerted).toEqual(['order_e2']);
    const alerts = desk.allEvents().filter((e) => (e.payload as Record<string, unknown>)['kind'] === 'refused_never_corrected');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.payload).toMatchObject({
      order_id: 'order_e2',
      refused_at: T0,
      aged_min: CORRECTION_MIN,
      linked_claim_reason: 'pickup_refusal:colour', // linkage to the claim the refusal opened
      policy_version: 'fulfillment-aging-policy.v2',
    });
    const records = desk.allRefundsRequired();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ orderId: 'order_e2', reason: 'refused_never_corrected', faultClass: 'seller', buyerPriority: true, amountFcfa: 11_000 });
    expect(Object.isFrozen(records[0])).toBe(true);
    // Idempotent within the episode.
    expect(desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN + 120)).alerted).toEqual([]);
    expect(desk.allRefundsRequired()).toHaveLength(1);
  });

  it('NEVER after correction: re-readied before the deadline → silence forever, however late the sweep', () => {
    const { book, desk } = refusedScene();
    reReady(book, minutesAfter(30));
    expect(desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN + 600)).alerted).toEqual([]);
    expect(desk.allRefundsRequired()).toEqual([]);
    // And the stop is permanent, not just late: a second sweep stays silent.
    expect(desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN + 1200)).alerted).toEqual([]);
  });

  it('verifier attack A4 replayed: a correction stays DURABLE — readiness cleared again (no refusal) before any sweep → silence forever', () => {
    const { book, desk } = refusedScene();
    reReady(book, minutesAfter(30)); // genuine correction — NO sweep observes it
    expect(book.reopenForCorrection('order_e2')).toEqual({ ok: true }); // readiness wiped before the first sweep
    expect(desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN + 100)).alerted).toEqual([]);
    expect(desk.allRefundsRequired()).toEqual([]); // no FALSE refund — the correction record outlives the wipe
  });

  it('verifier finding 2, ⚠ safest default: a post-fire re-arm ALERTS again but never mints a SECOND refund_required for the order', () => {
    const { book, desk, mock } = refusedScene();
    // Episode 1 fires: one alert, one money trigger.
    expect(desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN)).alerted).toEqual(['order_e2']);
    expect(desk.allRefundsRequired()).toHaveLength(1);
    // Late correction, then a genuine attempt-2 refusal re-arms episode 2.
    reReady(book, minutesAfter(CORRECTION_MIN + 10));
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['damage'], 2), minutesAfter(CORRECTION_MIN + 20)))
      .toMatchObject({ accepted: true, duplicate: false });
    const swept = desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN + 20 + CORRECTION_MIN));
    expect(swept.alerted).toEqual(['order_e2']); // ops sees episode 2
    expect(desk.allEvents().filter((e) => (e.payload as Record<string, unknown>)['kind'] === 'refused_never_corrected')).toHaveLength(2);
    expect(desk.allRefundsRequired()).toHaveLength(1); // ONE trigger per order — reconciles to the franc
  });

  it('verifier finding 3, ⚠ safest reading: a repeat refusal with NO correction keeps the ORIGINAL clock — the buyer trigger never slides later', () => {
    const { desk, mock } = refusedScene(); // refusal #1 at T0, never corrected
    // A second genuine refusal arrives at T+300 — but nothing was corrected.
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['damage'], 2), minutesAfter(300)))
      .toMatchObject({ accepted: true, duplicate: false });
    // The clock still runs from T0: it fires at the ORIGINAL deadline.
    const swept = desk.sweepCorrectionAging(minutesAfter(CORRECTION_MIN));
    expect(swept.alerted).toEqual(['order_e2']);
    const alert = desk.allEvents().find((e) => (e.payload as Record<string, unknown>)['kind'] === 'refused_never_corrected');
    expect(alert?.payload).toMatchObject({ refused_at: T0 }); // not the T+300 restart
  });

  it('RE-ARM: correction lands, then a GENUINE second refusal (sera attempt-2 command_id) restarts the clock — fires once for episode 2', () => {
    const { book, desk, mock } = refusedScene();
    reReady(book, minutesAfter(30));
    expect(desk.sweepCorrectionAging(minutesAfter(40)).alerted).toEqual([]); // episode 1 corrected — disarmed
    // The second refusal arrives as sera's NEW per-attempt event, NOT a duplicate.
    const secondRefusalAt = minutesAfter(60);
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['damage'], 2), secondRefusalAt))
      .toMatchObject({ accepted: true, duplicate: false });
    // Under episode-2's deadline: silent. Past it: fires once.
    expect(desk.sweepCorrectionAging(minutesAfter(60 + CORRECTION_MIN - 1)).alerted).toEqual([]);
    const swept = desk.sweepCorrectionAging(minutesAfter(60 + CORRECTION_MIN));
    expect(swept.alerted).toEqual(['order_e2']);
    const alerts = desk.allEvents().filter((e) => (e.payload as Record<string, unknown>)['kind'] === 'refused_never_corrected');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.payload).toMatchObject({ refused_at: secondRefusalAt, linked_claim_reason: 'pickup_refusal:damage' });
    // A REPLAY of the same attempt-2 event stays a duplicate — no third clock.
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['damage'], 2), minutesAfter(61)))
      .toEqual({ accepted: true, duplicate: true });
  });
});

describe('verifier attacks replayed as regressions (WO-2.6 findings 2/4/5)', () => {
  it('finding 2: refund_required records are FROZEN — mutation through the getter cannot flip the B+I-13 marker', () => {
    const { desk } = paidDesk();
    desk.sweepDecisionAging(minutesAfter(DECISION_MIN));
    const record = desk.allRefundsRequired()[0]!;
    expect(() => {
      (record as { buyerPriority: boolean }).buyerPriority = false;
    }).toThrow(TypeError);
    expect(desk.allRefundsRequired()[0]!.buyerPriority).toBe(true);
  });

  it('finding 4: the decision clock is FIRST-WINS — re-registering with a later paidAt cannot evade the deadline', () => {
    const { book, desk } = paidDesk();
    // The verifier's evasion: push paidAt forward through the book directly.
    book.registerPaidOrder('order-e2-0001', minutesAfter(DECISION_MIN - 1));
    const swept = desk.sweepDecisionAging(minutesAfter(DECISION_MIN));
    expect(swept.alerted).toEqual(['order-e2-0001']);
    const alert = desk.allEvents().find((e) => e.name === 'reconciliation.alert.v1');
    expect(alert?.payload).toMatchObject({ paid_at: T0 }); // the ORIGINAL clock
  });

  it('finding 5: ready-no-task alerts are once-per-EPISODE — a corrective reopen arms a fresh episode that can alert again', () => {
    const { book, desk, mock } = (() => {
      const book = new FulfillmentBook();
      const desk = new ProtectionDesk(book);
      desk.registerPaidOrder({ orderId: 'order_e2', sellerId: 'sup-1', paidAt: T0, amountFcfa: 11_000, evidenceBundleId: 'eb-pay-e2' });
      book.accept({ orderId: 'order_e2', variant: 'taille unique', qty: 1, sellerNetFcfa: 8_500, deadline: '2026-07-10T18:00:00.000Z' });
      const issued = book.issueChallenge('order_e2', T0);
      if (!issued.ok) throw new Error('setup');
      const payload = {
        orderId: 'order_e2',
        photoRef: { ref: 'media/pkg-e2.jpg', sha256: SHA, mimeType: 'image/jpeg' },
        readinessChallenge: issued.challenge,
        qty: 1,
        variant: 'taille unique',
        availableConfirmed: true,
        at: T0,
      };
      if (!book.confirmReady(payload, T0).ok) throw new Error('setup');
      return { book, desk, mock: new SeraRefusalEmitterMock() };
    })();
    const noTask = () => false;

    // Episode 1 stalls and alerts once.
    expect(desk.sweepReadyNoTask(noTask, minutesAfter(READY_MIN)).alerted).toEqual(['order_e2']);
    // The refusal reopens readiness — a NEW episode begins.
    expect(desk.consumePickupRefusalSignal(mock.emitRefusalSignal('e2', ['colour']), minutesAfter(READY_MIN + 5)))
      .toMatchObject({ accepted: true, duplicate: false });
    const reReadyAt = minutesAfter(READY_MIN + 6);
    const fresh = book.issueChallenge('order_e2', reReadyAt);
    if (!fresh.ok) throw new Error('setup');
    const reReady = book.confirmReady({
      orderId: 'order_e2',
      photoRef: { ref: 'media/pkg-e2.jpg', sha256: SHA, mimeType: 'image/jpeg' },
      readinessChallenge: fresh.challenge,
      qty: 1,
      variant: 'taille unique',
      availableConfirmed: true,
      at: reReadyAt,
    }, reReadyAt);
    expect(reReady.ok).toBe(true);
    // Episode 2 stalls too — it MUST alert again (once).
    expect(desk.sweepReadyNoTask(noTask, minutesAfter(READY_MIN + 6 + READY_MIN)).alerted).toEqual(['order_e2']);
    expect(desk.allEvents().filter((e) => e.name === 'reconciliation.alert.v1' && (e.payload as Record<string, unknown>)['kind'] === 'ready_package_no_task')).toHaveLength(2);
  });
});

describe('B+I-13 — every seller-fault refund_required carries the buyer-priority marker', () => {
  it('the marker is on EVERY record, and the record type makes it unconstructable without', () => {
    const { desk } = paidDesk();
    const laterOrder = { orderId: 'order-e2-0002', sellerId: 'sup-2', paidAt: T0, amountFcfa: 4_500, evidenceBundleId: 'eb-pay-0002' };
    desk.registerPaidOrder(laterOrder);
    desk.sweepDecisionAging(minutesAfter(DECISION_MIN));
    const records = desk.allRefundsRequired();
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.faultClass).toBe('seller');
      expect(record.buyerPriority).toBe(true);
    }
    // Amounts are the COPIED payment figures, per order, to the franc.
    expect(records.map((r) => r.amountFcfa).sort((a, b) => a - b)).toEqual([4_500, 11_000]);
  });
});
