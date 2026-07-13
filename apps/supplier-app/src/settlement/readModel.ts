import { SettlementObligationSchema, type SettlementObligation, type PlatformEvent } from '@platform/contracts';

/**
 * B1 · B7.1 (🔴 RED) — the settlement projection READ MODEL. A pure reducer over
 * the authoritative events (`settlement.supplier_payable` · `payout.*`) into the
 * current SettlementObligation per order. Boutik+ READS settlement (§5.2 domain
 * owner: Ledger&Settlement); it never owns the DB and never holds funds. It
 * accumulates no running total and offers no way to pull money out — only a
 * projection of what the authority reported.
 *
 * TWO load-bearing invariants:
 *  - B+I-05: the amount is the LOCKED obligation, taken VERBATIM from the event —
 *    NEVER recomputed. This reducer imports no waterfall and does no arithmetic on
 *    the amount.
 *  - B7.1: `Paid` is reachable ONLY on `payout.paid` carrying a provider-confirmed
 *    `payoutRef`. Absent the ref there is no transition — the obligation stays
 *    honestly « en attente » (a payout with no provider ref is not a payout).
 */
export type SettlementState = SettlementObligation['state'];
export type SupplierReceivable = SettlementObligation;

export function projectReceivables(events: readonly PlatformEvent[]): Map<string, SupplierReceivable> {
  const byOrder = new Map<string, SupplierReceivable>();
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    const orderId = p.orderId;
    if (typeof orderId !== 'string') continue;

    switch (e.name) {
      case 'settlement.supplier_payable.v1': {
        // The LOCKED obligation — `amount` copied straight from the event (B+I-05);
        // the canon parse validates the shape, it does not compute the amount.
        byOrder.set(
          orderId,
          SettlementObligationSchema.parse({
            orderId,
            party: p.party,
            amount: p.amount,
            state: p.state,
            holds: Array.isArray(p.holds) ? p.holds : [],
            ...(typeof p.payoutRef === 'string' ? { payoutRef: p.payoutRef } : {}),
          }),
        );
        break;
      }
      case 'payout.submitted.v1': {
        const cur = byOrder.get(orderId);
        if (cur) byOrder.set(orderId, SettlementObligationSchema.parse({ ...cur, state: 'Processing' }));
        break;
      }
      case 'payout.paid.v1': {
        const cur = byOrder.get(orderId);
        const ref = p.payoutRef;
        // Paid ONLY with a provider-confirmed ref. No ref → NO transition; the
        // obligation stays « en attente ». The UI never pretends a payout exists.
        if (cur && typeof ref === 'string' && ref.length > 0) {
          byOrder.set(orderId, SettlementObligationSchema.parse({ ...cur, state: 'Paid', payoutRef: ref }));
        }
        break;
      }
      case 'payout.failed.v1': {
        const cur = byOrder.get(orderId);
        if (cur) byOrder.set(orderId, SettlementObligationSchema.parse({ ...cur, state: 'Failed' }));
        break;
      }
      default:
        break;
    }
  }
  return byOrder;
}
