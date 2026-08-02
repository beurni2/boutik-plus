import type { CodeRow, CodesResult, MintResult, PaidOrderRow, RelanceResult, RevokeResult } from './service';

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

/* ──────────── CONSOLE-3 — the code inventory, as PURE decisions ──────────── */

/**
 * The founder's door registry: who holds an active code, since when — and the
 * mint form with the one guard the footgun demanded. A supplierId the paid-
 * order book has NEVER seen gets a WARNING, not a block (safest default,
 * flagged in JOURNAL): pre-provisioning a door before a first sale is
 * legitimate; silently arming a typo is not. The warning names the exact
 * situation in plain words and the founder decides.
 */
export type CodesRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'bad_key' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly codes: readonly CodeRow[] };

export type CodesView =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'liste'; readonly codes: readonly CodeRow[] };

/** `bad_key` never renders its own section — the caller escalates the WHOLE
 *  board to its bad-key surface (one door, one sentence, never two). */
export function codesView(read: CodesRead): CodesView | null {
  if (read.kind === 'bad_key') return null;
  if (read.kind === 'loading') return { kind: 'loading', message: 'operations.codes_chargement' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'operations.codes_echec' };
  if (read.codes.length === 0) return { kind: 'empty', message: 'operations.codes_vide' };
  return { kind: 'liste', codes: read.codes };
}

/** The mint form's honest pre-flight, from data the board already holds:
 *  · `remplace` — this supplier HAS a code; minting kills the old one now.
 *  · `inconnu` — no paid order has ever named this supplier; a typo would
 *    arm a phantom door (the footgun this slice exists to close).
 *  · `pret` — known supplier, no active code: the plain case. */
export type MintAvis = 'pret' | 'remplace' | 'inconnu';

export function mintAvis(
  orders: readonly PaidOrderRow[],
  codes: readonly CodeRow[],
  supplierId: string,
): MintAvis {
  if (codes.some((c) => c.supplierId === supplierId)) return 'remplace';
  if (orders.some((o) => o.supplierResolved && o.supplierId === supplierId)) return 'pret';
  return 'inconnu';
}

/**
 * The interaction, one act at a time (the relance reducer's shape): a mint or
 * a revoke is in flight, or a fresh code is ON SCREEN (shown once — this app
 * never stores it), or a failure names its order. Law-7 honest: nothing
 * renders as done before the book answers.
 */
export interface CodesUi {
  /** 'mint' or the supplierId being revoked — one write at a time. */
  readonly busy: 'mint' | `revoke:${string}` | null;
  /** The one-time plaintext answer, until the founder dismisses it. */
  readonly nouveau: { readonly supplierId: string; readonly code: string } | null;
  /** Which act failed (mint → 'mint', revoke → the supplierId). */
  readonly echec: string | null;
}

export const CODES_IDLE: CodesUi = { busy: null, nouveau: null, echec: null };

export function mintStart(ui: CodesUi): CodesUi | null {
  if (ui.busy !== null) return null;
  return { busy: 'mint', nouveau: null, echec: null };
}

export function revokeStart(ui: CodesUi, supplierId: string): CodesUi | null {
  if (ui.busy !== null) return null;
  return { busy: `revoke:${supplierId}`, nouveau: null, echec: null };
}

export type CodesSettlement =
  | { readonly ui: CodesUi; readonly then: 'refresh' }
  | { readonly ui: CodesUi; readonly then: 'bad_key' }
  | { readonly ui: CodesUi; readonly then: 'none' };

export function mintSettled(result: MintResult): CodesSettlement {
  if (result.ok) {
    // The list refreshes (the row must be the STORED truth) while the
    // plaintext stays on screen until dismissed — the founder is mid-handover.
    return { ui: { busy: null, nouveau: { supplierId: result.supplierId, code: result.code }, echec: null }, then: 'refresh' };
  }
  if (result.reason === 'bad_key') return { ui: CODES_IDLE, then: 'bad_key' };
  return { ui: { busy: null, nouveau: null, echec: 'mint' }, then: 'none' };
}

export function revokeSettled(supplierId: string, result: RevokeResult): CodesSettlement {
  // `no_code` re-reads too: the list claimed a code the book no longer holds —
  // the row must leave the screen, and the stored truth is how.
  if (result.ok) return { ui: CODES_IDLE, then: 'refresh' };
  if (result.reason === 'bad_key') return { ui: CODES_IDLE, then: 'bad_key' };
  return { ui: { busy: null, nouveau: null, echec: supplierId }, then: 'none' };
}

export function codesReadOf(result: CodesResult): CodesRead {
  if (result.ok) return { kind: 'ok', codes: result.codes };
  return { kind: result.reason === 'bad_key' ? 'bad_key' : 'failed' };
}
