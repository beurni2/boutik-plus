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

/**
 * STOCK-VRAI-1 (AUDIT-B+2 F-53) — the greeting's count: only the offers
 * resellers can see right now (no hidden reason), in a sentence made for its
 * number. It used to count frozen, lapsed and cut products too, and say
 * « 1 produits ».
 */
export function produitsEnLigne(rows: readonly SupplierOfferRow[]): { readonly key: string; readonly n: number } {
  const n = rows.filter((r) => r.hiddenReason === undefined).length;
  return { key: n === 0 ? 'accueil.greeting_sub_zero' : n === 1 ? 'accueil.greeting_sub_un' : 'accueil.greeting_sub', n };
}

/**
 * STOCK-VRAI-1 (F-53) — « Ventes payées »: the sales whose money stands. A sale
 * refused by its supplier or cancelled by the founder, refused by the rider at
 * pickup, or being refunded by Shop+ (the key-C row's own word) is not one.
 */
export function ventesPayees(rows: readonly PaidOrderRow[], remboursees: ReadonlySet<string>): number {
  return rows.filter(
    (r) => r.fulfillment?.refusedAt === undefined && r.fulfillment?.pickupRefusedAt === undefined && !remboursees.has(r.orderId),
  ).length;
}
