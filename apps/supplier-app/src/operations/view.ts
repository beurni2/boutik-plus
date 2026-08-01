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
 * HONESTY ABOUT WHAT « sign of preparation » MEANS TODAY: no supplier
 * acceptance action exists yet, so nothing can clear an order off the chase
 * list — every paid order older than ten minutes chases. That is the true
 * state of the platform, and the screen says so in its own words rather than
 * inventing a « préparé » it cannot know. The acceptance slice will make this
 * list quiet down for real.
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
      /** Paid ≥ 10 min ago — the founder calls these suppliers, oldest first. */
      readonly relancer: readonly OperationsRow[];
      /** Paid < 10 min ago — fresh, no action yet, newest first. */
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
  const relancer = rows.filter((r) => r.ageMin >= CHASE_AFTER_MIN).sort((a, b) => b.ageMin - a.ageMin);
  const recentes = rows.filter((r) => r.ageMin < CHASE_AFTER_MIN).sort((a, b) => a.ageMin - b.ageMin);
  const anomalies = rows.filter((r) => !r.supplierResolved);
  return { kind: 'board', relancer, recentes, anomalies };
}
