import type { PaidOrderRow } from './service';

/**
 * CONSOLE-1 — THE ONE DECISION IS PURE (the `produits-view.ts` pattern): a
 * read state goes IN, the sentences and sections come OUT, and a test asserts
 * meaning instead of branch order inside a component.
 *
 * ═══ THE 10-MINUTE LINE IS THE FOUNDER'S, VERBATIM AND DATED ═══
 *
 * 2026-08-01: « after 10 mn if the another supplier get a product sold but
 * still not showing any sign of preparation I will notify them offline
 * myself. » This constant is that ruling — the CONSOLE's chase line, distinct
 * from `fulfillment-service`'s aging POLICY (still its 120-minute safest
 * default; re-tuning that is the fulfillment slice's own change).
 *
 * WHAT CLEARS THE LIST TODAY — AND WHAT DOES NOT (CONSOLE-2):
 * the operator's own relance clears it. He calls the supplier, taps « J'ai
 * appelé le fournisseur », and the order moves to « Déjà relancés ». That is
 * a true record of HIS act.
 *
 * It is NOT a preparation signal, and this file will not pretend otherwise.
 * Canon owns « le produit est prêt » — B+I-06 / B6.2: a
 * `PackageReadinessConfirmation` carrying a photo and the short-TTL
 * `sellerReadinessChallenge`, the supplier's own evidenced act, and the gate
 * that lets a Séra pickup be requested at all. That machinery lives in
 * `services/fulfillment-service` and is not yet wired to this book, so the
 * board cannot show a genuine preparation state and does not claim one.
 * Wiring readiness → the board is its own slice; until it lands, « relancé »
 * means « vous avez appelé », nothing more.
 */
export const CHASE_AFTER_MIN = 10;

export interface OperationsRow extends PaidOrderRow {
  /** Whole minutes since the order was paid — the chase clock the founder reads. */
  readonly ageMin: number;
}

export type OperationsRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'bad_key' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly rows: readonly PaidOrderRow[] };

export type OperationsView =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'not_configured'; readonly message: string }
  | { readonly kind: 'bad_key'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | {
      readonly kind: 'board';
      /** Paid ≥ 10 min ago and NOT yet called — the founder's queue, oldest first. */
      readonly relancer: readonly OperationsRow[];
      /** Already called, whatever their age — most recently called first. He
       *  can call again from here; nothing about preparation is claimed. */
      readonly relances: readonly OperationsRow[];
      /** Paid < 10 min ago, not yet called — fresh, no action yet, newest first. */
      readonly recentes: readonly OperationsRow[];
      /** Rows whose product this platform could not resolve — always shown,
       *  never buried: a paid order without a supplier is the board's loudest
       *  anomaly. (Also present in one of the two lists above.) */
      readonly anomalies: readonly OperationsRow[];
    };

/** Whole minutes between a stored instant and now; never negative — a clock
 *  skew that puts `paidAt` in the future reads as 0, not as a countdown. */
export function ageMinutes(paidAtIso: string, nowMs: number): number {
  const paidMs = Date.parse(paidAtIso);
  if (Number.isNaN(paidMs)) return 0;
  return Math.max(0, Math.floor((nowMs - paidMs) / 60_000));
}

export function operationsView(read: OperationsRead, nowMs: number): OperationsView {
  if (read.kind === 'loading') return { kind: 'loading', message: 'operations.chargement' };
  if (read.kind === 'not_configured') return { kind: 'not_configured', message: 'operations.non_configure' };
  if (read.kind === 'bad_key') return { kind: 'bad_key', message: 'operations.cle_refusee' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'operations.echec' };
  if (read.rows.length === 0) return { kind: 'empty', message: 'operations.vide' };

  const rows: OperationsRow[] = read.rows.map((r) => ({ ...r, ageMin: ageMinutes(r.paidAt, nowMs) }));
  // A called order leaves the queue WHATEVER its age — the founder does not
  // need to be told twice about a supplier he has already phoned.
  const called = rows.filter((r) => r.relance !== undefined);
  const uncalled = rows.filter((r) => r.relance === undefined);
  const relancer = uncalled.filter((r) => r.ageMin >= CHASE_AFTER_MIN).sort((a, b) => b.ageMin - a.ageMin);
  const recentes = uncalled.filter((r) => r.ageMin < CHASE_AFTER_MIN).sort((a, b) => a.ageMin - b.ageMin);
  const relances = [...called].sort((a, b) => (a.relance!.at < b.relance!.at ? 1 : -1));
  const anomalies = rows.filter((r) => !r.supplierResolved);
  return { kind: 'board', relancer, relances, recentes, anomalies };
}
