import type { BoardSera } from '../commandes/sera-service';
import type { GainRow } from '../operations/dispatch-service';

/**
 * RB-3 — the Gains tab's pure decisions (founder direction 2026-08-08:
 * « the money share well explained […] and which rider delivered »).
 *
 * NOTHING HERE TOUCHES A FRANC. The split is rendered field by field off the
 * frozen Quote the Shop+ Worker served; these helpers only order rows and
 * name the rider — the two facts that are NOT money.
 */

/** Newest sale first — a deterministic order (date, then id), so the list
 *  never reshuffles between reads. */
export function ordonnerGains(rows: readonly GainRow[]): GainRow[] {
  return [...rows].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.orderId < b.orderId ? -1 : 1),
  );
}

/**
 * Who is carrying this order, by Séra's OWN book — the board's live
 * assignments joined to its roster for the display name. No assignment on
 * the board is an honest `null`, never a guess: an order confied before this
 * read, or delivered and settled, simply has no live carrier to show yet
 * (« livrée » truth arrives with SE-LIVE-5).
 */
export function nomCoursierPour(orderId: string, board: BoardSera | null): string | null {
  if (board === null) return null;
  const affectation = board.affectations.find((a) => a.orderId === orderId);
  if (affectation === undefined) return null;
  const rider = board.riders.find((r) => r.riderId === affectation.riderId);
  return rider !== undefined ? rider.displayName : affectation.riderId;
}
