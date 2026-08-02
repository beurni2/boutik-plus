import type { PaidOrderRow, RelanceResult } from './service';

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
 * that lets a Séra pickup be requested at all. READINESS-WIRE-1a wired that
 * machinery to the book: the row's `fulfillment` mark (acceptedAt/readyAt,
 * server clocks) is the REAL signal, and it supersedes both the chase queue
 * and the call log. « Relancé » still means only « vous avez appelé ».
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
      /** Paid ≥ 10 min ago, NO preparation signal, NOT yet called — the
       *  founder's queue, oldest first. */
      readonly relancer: readonly OperationsRow[];
      /** THE REAL SIGNAL (READINESS-WIRE-1a): the supplier accepted and/or
       *  confirmed « Produit prêt ». Supersedes both the chase and the call
       *  log — his 10-minute rule was « no sign of preparation », and this IS
       *  the sign. Most recent signal first. */
      readonly preparation: readonly OperationsRow[];
      /** Called, no preparation signal YET — most recently called first. */
      readonly relances: readonly OperationsRow[];
      /** Paid < 10 min ago, no signal, not called — fresh, newest first. */
      readonly recentes: readonly OperationsRow[];
      /** Rows whose product this platform could not resolve — always shown,
       *  never buried: a paid order without a supplier is the board's loudest
       *  anomaly. (Also present in one of the two lists above.) */
      readonly anomalies: readonly OperationsRow[];
    };

/* ───────────────── the relance interaction, as a PURE decision ───────────────── */

/**
 * CONSOLE-2 r2 — lifted out of the screen because a verifier proved the point:
 * replacing the component's whole write handler with a no-op left the suite
 * green. The screen now owns only the impure substance (call the port, feed
 * the result back); every decision about what the founder SEES lives here and
 * is asserted by value.
 */
export interface RelanceUi {
  /** The order whose call is being recorded right now — one at a time. */
  readonly busy: string | null;
  /** The order whose call could NOT be recorded. Keyed, so one card's failure
   *  can never appear on another's. */
  readonly echec: string | null;
}

export const RELANCE_IDLE: RelanceUi = { busy: null, echec: null };

/** Returns null when the tap must be IGNORED (a write is already in flight) —
 *  the caller then does nothing at all, port included. */
export function relanceStart(ui: RelanceUi, orderId: string): RelanceUi | null {
  if (ui.busy !== null) return null;
  return { busy: orderId, echec: null };
}

export type RelanceSettlement =
  /** Re-read the board: the « Appelé » the founder sees must be the STORED
   *  mark, never this screen's hope. */
  | { readonly ui: RelanceUi; readonly then: 'refresh' }
  /** The key was refused mid-session — the board escalates to its own
   *  bad-key surface rather than blaming the phone call. */
  | { readonly ui: RelanceUi; readonly then: 'bad_key' }
  | { readonly ui: RelanceUi; readonly then: 'none' };

export function relanceSettled(orderId: string, result: RelanceResult): RelanceSettlement {
  if (result.ok) return { ui: RELANCE_IDLE, then: 'refresh' };
  if (result.reason === 'bad_key') return { ui: RELANCE_IDLE, then: 'bad_key' };
  // `unknown_order` lands here too: the board is stale rather than the call
  // lost — either way NOTHING is claimed, and the honest line invites a retry.
  return { ui: { busy: null, echec: orderId }, then: 'none' };
}

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
  // THE REAL SIGNAL FIRST: an order the supplier has accepted or readied
  // needs neither chasing nor a call reminder — whatever its age, and even
  // if he already called about it.
  const signalOf = (r: OperationsRow): string | undefined =>
    r.fulfillment?.readyAt ?? r.fulfillment?.acceptedAt;
  const preparation = rows
    .filter((r) => signalOf(r) !== undefined)
    .sort((a, b) => (signalOf(a)! < signalOf(b)! ? 1 : -1));
  const unprepared = rows.filter((r) => signalOf(r) === undefined);
  // A called order leaves the queue WHATEVER its age — the founder does not
  // need to be told twice about a supplier he has already phoned.
  const called = unprepared.filter((r) => r.relance !== undefined);
  const uncalled = unprepared.filter((r) => r.relance === undefined);
  const relancer = uncalled.filter((r) => r.ageMin >= CHASE_AFTER_MIN).sort((a, b) => b.ageMin - a.ageMin);
  const recentes = uncalled.filter((r) => r.ageMin < CHASE_AFTER_MIN).sort((a, b) => a.ageMin - b.ageMin);
  const relances = [...called].sort((a, b) => (a.relance!.at < b.relance!.at ? 1 : -1));
  const anomalies = rows.filter((r) => !r.supplierResolved);
  return { kind: 'board', relancer, preparation, relances, recentes, anomalies };
}
