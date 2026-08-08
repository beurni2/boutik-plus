import type { PaidOrderRow } from '../operations/service';
import type { SupplierOfferRow } from '../supply/service';

/**
 * RB-4 — the Accueil's pure decisions (founder direction 2026-08-08:
 * « de-mock all of it and make real data flow into them »).
 *
 * Every row in and out is a REAL service row; nothing here invents, counts
 * are exact, and both orders are deterministic (ties by id) so the home
 * never reshuffles between reads.
 */

/**
 * Offers whose remaining quantity is low — the demo screen's own threshold
 * (≤ 4), kept: it is a display nudge, not a business rule, and no spec names
 * a different number. Scarcest first.
 */
export function stockBas(rows: readonly SupplierOfferRow[]): SupplierOfferRow[] {
  return rows
    .filter((r) => r.available <= 4)
    .sort((a, b) => a.available - b.available || (a.offerId < b.offerId ? -1 : 1));
}

/** The sales that have waited LONGEST for their supplier, capped — the home
 *  shows the head of the queue, the Commandes tab holds the whole of it. */
export function plusAnciennes(rows: readonly PaidOrderRow[], n: number): PaidOrderRow[] {
  return [...rows]
    .sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || (a.orderId < b.orderId ? -1 : 1))
    .slice(0, n);
}
