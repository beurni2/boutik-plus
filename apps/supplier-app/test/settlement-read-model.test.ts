import { describe, expect, it } from 'vitest';
import { SettlementObligationSchema, type PlatformEvent } from '@platform/contracts';
import { projectReceivables } from '../src/settlement/readModel';

/**
 * B1 · B7.1 (🔴 RED) — the settlement projection read model, its invariants
 * proven ADVERSARIALLY and FIRST. Governing sentences:
 *  - B7.1: "Locked/Pending/Eligible/Payable/Processing/Paid/Held/Failed;
 *    provider-confirmed ref before Paid" — and the seller pulls nothing, the app
 *    keeps no running total (the funds-holding gate guards those words in code).
 *  - B+I-05: "A supplier receivable displayed for an order MUST equal the LOCKED
 *    quote/ledger obligation (sellerNet), NEVER a live recomputation."
 * The read model is a pure reducer over the authoritative events — it consumes
 * the canon SettlementObligation shape and never recomputes an amount.
 */

const env = (command_id: string, aggregateVersion: number) => ({
  command_id,
  correlation_id: 'corr-set-1',
  aggregateVersion,
  actor: 'ledger-settlement',
  serverTime: '2026-07-13T10:00:00.000Z',
  version: 'v1',
});
const ev = (name: string, aggregateVersion: number, payload: Record<string, unknown>): PlatformEvent =>
  ({ name, envelope: env(`c${aggregateVersion}`, aggregateVersion), payload }) as PlatformEvent;

const payable = (orderId: string, amount: number, state = 'Eligible', extra: Record<string, unknown> = {}) =>
  ev('settlement.supplier_payable.v1', 1, { orderId, party: 'supplier-1', amount, state, ...extra });

describe('B+I-05 (money) — the displayed receivable EQUALS the locked obligation, NEVER recomputed', () => {
  it('takes the amount VERBATIM from settlement.supplier_payable — a value no waterfall would produce is preserved to the franc', () => {
    // 8_499 is deliberately NOT any sellerNet a 5.4 waterfall of round inputs
    // yields — if the read model recomputed, it could never emit 8_499.
    const receivables = projectReceivables([payable('o1', 8_499)]);
    const r = receivables.get('o1')!;
    expect(r.amount).toBe(8_499); // the LOCKED franc, byte-for-byte
    expect(SettlementObligationSchema.safeParse(r).success).toBe(true); // it IS the canon shape
  });

  it('a later event for the same order NEVER re-derives the amount — the locked franc is immutable across the projection', () => {
    const receivables = projectReceivables([
      payable('o1', 8_499, 'Eligible'),
      ev('payout.submitted.v1', 2, { orderId: 'o1' }),
      ev('payout.paid.v1', 3, { orderId: 'o1', payoutRef: 'PMT-777' }),
    ]);
    expect(receivables.get('o1')!.amount).toBe(8_499); // unchanged through Processing → Paid
  });
});

describe('B7.1 (money) — Paid ONLY after a provider-confirmed ref; honest « en attente » before it', () => {
  it('payout.submitted → Processing, NO payoutRef, NOT Paid', () => {
    const r = projectReceivables([payable('o1', 5_000), ev('payout.submitted.v1', 2, { orderId: 'o1' })]).get('o1')!;
    expect(r.state).toBe('Processing');
    expect(r.payoutRef).toBeUndefined();
  });

  it('payout.paid WITHOUT a payoutRef NEVER reaches Paid — a payout with no provider ref is not a payout', () => {
    const r = projectReceivables([
      payable('o1', 5_000),
      ev('payout.submitted.v1', 2, { orderId: 'o1' }),
      ev('payout.paid.v1', 3, { orderId: 'o1' }), // no payoutRef — must NOT flip to Paid
    ]).get('o1')!;
    expect(r.state).not.toBe('Paid');
    expect(r.state).toBe('Processing'); // stays honestly « en attente »
    expect(r.payoutRef).toBeUndefined();
  });

  it('payout.paid WITH a provider-confirmed payoutRef → Paid, ref recorded', () => {
    const r = projectReceivables([
      payable('o1', 5_000),
      ev('payout.submitted.v1', 2, { orderId: 'o1' }),
      ev('payout.paid.v1', 3, { orderId: 'o1', payoutRef: 'PMT-777' }),
    ]).get('o1')!;
    expect(r.state).toBe('Paid');
    expect(r.payoutRef).toBe('PMT-777');
  });

  it('payout.failed → Failed (no generic terminal collapse); a Held obligation surfaces its hold', () => {
    const failed = projectReceivables([payable('o1', 5_000), ev('payout.failed.v1', 2, { orderId: 'o1', reason: 'provider_declined' })]).get('o1')!;
    expect(failed.state).toBe('Failed');
    const held = projectReceivables([payable('o2', 5_000, 'Held', { holds: ['claim-9'] })]).get('o2')!;
    expect(held.state).toBe('Held');
    expect(held.holds).toEqual(['claim-9']);
  });
});

describe('B7.1 — the state machine walks Locked→…→Paid over the events', () => {
  it('projects each canonical state from its event, per order', () => {
    const receivables = projectReceivables([
      payable('locked', 1_000, 'Locked'),
      payable('pending', 2_000, 'Pending'),
      payable('eligible', 3_000, 'Eligible'),
      payable('payable', 4_000, 'Payable'),
    ]);
    expect([...receivables.values()].map((r) => r.state).sort()).toEqual(['Eligible', 'Locked', 'Payable', 'Pending']);
  });
});
