import type { CodeRow, CodesResult, MintResult, PaidOrderRow, RelanceResult, RevokeResult } from './service';
import type {
  AccesCodeRow,
  CodeAccesResult,
  CompteActeResult,
  CompteRow,
  ComptesResult,
  SuiviLigne,
  SuiviResult,
  AccesListResult,
  AccesMintResult,
  AccesRevokeResult,
  LivraisonRow,
} from './dispatch-service';

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
  /** Which act failed — namespaced like `busy`, so a supplier literally
   *  named « mint » can never light the wrong sentence (verifier note). */
  readonly echec: 'mint' | `revoke:${string}` | null;
}

export const CODES_IDLE: CodesUi = { busy: null, nouveau: null, echec: null };

/**
 * A LIVE one-time code BLOCKS every other act (verifier MAJOR-1): the
 * plaintext exists nowhere but that card, and « the card leaves only when he
 * says so » was a lie while any next tap silently destroyed it mid-handover.
 * Now the founder must tap « C'est noté » first — the screen says so in words
 * where the buttons were, never a dead tap.
 */
export function mintStart(ui: CodesUi): CodesUi | null {
  if (ui.busy !== null || ui.nouveau !== null) return null;
  return { busy: 'mint', nouveau: null, echec: null };
}

export function revokeStart(ui: CodesUi, supplierId: string): CodesUi | null {
  if (ui.busy !== null || ui.nouveau !== null) return null;
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
  return { ui: { busy: null, nouveau: null, echec: `revoke:${supplierId}` }, then: 'none' };
}

export function codesReadOf(result: CodesResult): CodesRead {
  if (result.ok) return { kind: 'ok', codes: result.codes };
  return { kind: result.reason === 'bad_key' ? 'bad_key' : 'failed' };
}

/* ─────── BC-1c — the dispatch view (Shop+ read, key C), PURE decisions ─────── */

/**
 * The founder's one question here: « which orders can I send a rider for,
 * right now? » A dispatchable order is CONFIRMED (the webhook's word — the
 * only word that can say paid) AND carries a contact. Everything else is
 * shown honestly in its own place, never promoted: an unconfirmed order is
 * not a course, and a confirmed one without a number is a call to make, not
 * a rider to send.
 */
export type LivraisonsRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'bad_key' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly rows: readonly LivraisonRow[] };

export type LivraisonsVue =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'not_configured'; readonly message: string }
  | { readonly kind: 'bad_key'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | {
      readonly kind: 'liste';
      /** Confirmed + contact — the riders' queue, LONGEST-WAITING first. */
      readonly aLivrer: readonly LivraisonRow[];
      /** Confirmed, no contact — dispatchable only by reaching the buyer
       *  another way; never buried under the queue. */
      readonly sansContact: readonly LivraisonRow[];
      /** Not yet confirmed — context, newest first, whispering. */
      readonly enAttente: readonly LivraisonRow[];
    };

export function livraisonsVue(read: LivraisonsRead): LivraisonsVue {
  if (read.kind === 'loading') return { kind: 'loading', message: 'livraisons.chargement' };
  if (read.kind === 'not_configured') return { kind: 'not_configured', message: 'livraisons.non_configure' };
  if (read.kind === 'bad_key') return { kind: 'bad_key', message: 'livraisons.cle_refusee' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'livraisons.echec' };
  if (read.rows.length === 0) return { kind: 'empty', message: 'livraisons.vide' };
  const confirmed = read.rows.filter((r) => r.state === 'confirmed');
  const aLivrer = confirmed.filter((r) => r.contact !== null).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const sansContact = confirmed.filter((r) => r.contact === null).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const enAttente = read.rows.filter((r) => r.state !== 'confirmed').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { kind: 'liste', aLivrer, sansContact, enAttente };
}

/* ───── ACCESS-GATE-1 — the reseller ACCESS-code inventory, PURE decisions ───── */

/**
 * FOUNDER ORDER, 2026-08-04: he mints a code on this console and hands it to a
 * new reseller, who types it once to get into Shop+.
 *
 * ═══ WHY THIS MIRRORS `CodesView` INSTEAD OF GENERALISING IT ═══
 *
 * The supplier-code machinery above is a proven, money-adjacent state machine
 * whose vocabulary is `supplierId` throughout. Widening it to « an id » would
 * touch every one of those call sites to serve a second caller — a refactor
 * across a working credential surface, for no behaviour. Sixty lines of the
 * same SHAPE, with its own names, is the cheaper and safer trade. If a third
 * kind of code ever appears, THAT is when the abstraction has earned itself.
 *
 * The one real difference, and it is why the shapes are not identical: there is
 * NO « known reseller » pre-flight. `mintAvis` warns him when a supplierId has
 * never appeared on a paid order, because a typo there arms a phantom door.
 * This console holds no list of resellers to check against, so it says nothing
 * rather than saying something it cannot know.
 */

export type AccesRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'bad_key' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly codes: readonly AccesCodeRow[] };

export type AccesVue =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'liste'; readonly codes: readonly AccesCodeRow[] };

/** `bad_key` renders NOTHING — the section's key is the Livraisons key, and one
 *  refused key must produce one sentence on the console, never two. */
export function accesVue(read: AccesRead): AccesVue | null {
  if (read.kind === 'bad_key') return null;
  if (read.kind === 'loading') return { kind: 'loading', message: 'acces.chargement' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'acces.echec' };
  if (read.codes.length === 0) return { kind: 'empty', message: 'acces.vide' };
  return { kind: 'liste', codes: read.codes };
}

export interface AccesUi {
  /** 'mint' or the resellerId being cut — ONE write at a time. */
  readonly busy: 'mint' | `revoke:${string}` | null;
  /** The one-time plaintext, until he says he has written it down. */
  readonly nouveau: { readonly resellerId: string; readonly code: string } | null;
  /** Namespaced like `busy`, so a reseller literally named « mint » cannot
   *  light the wrong sentence (the verifier's note on the supplier section). */
  readonly echec: 'mint' | `revoke:${string}` | null;
}

export const ACCES_IDLE: AccesUi = { busy: null, nouveau: null, echec: null };

/**
 * A LIVE one-time code BLOCKS every other act. The plaintext exists nowhere but
 * that card — the Worker stores only its SHA-256 — so any next tap that
 * re-rendered the section would destroy it mid-handover, while he is reading it
 * out over the phone. He must dismiss it first, and the screen says so in words
 * where the buttons were.
 */
export function accesMintStart(ui: AccesUi): AccesUi | null {
  if (ui.busy !== null || ui.nouveau !== null) return null;
  return { busy: 'mint', nouveau: null, echec: null };
}

export function accesRevokeStart(ui: AccesUi, resellerId: string): AccesUi | null {
  if (ui.busy !== null || ui.nouveau !== null) return null;
  return { busy: `revoke:${resellerId}`, nouveau: null, echec: null };
}

export type AccesSettlement =
  | { readonly ui: AccesUi; readonly then: 'refresh' }
  | { readonly ui: AccesUi; readonly then: 'bad_key' }
  | { readonly ui: AccesUi; readonly then: 'none' };

export function accesMintSettled(result: AccesMintResult): AccesSettlement {
  if (result.ok) {
    // The list refreshes (the row must be the STORED truth) while the plaintext
    // stays on screen until dismissed — he is mid-handover.
    return { ui: { busy: null, nouveau: { resellerId: result.resellerId, code: result.code }, echec: null }, then: 'refresh' };
  }
  if (result.reason === 'bad_key') return { ui: ACCES_IDLE, then: 'bad_key' };
  return { ui: { busy: null, nouveau: null, echec: 'mint' }, then: 'none' };
}

export function accesRevokeSettled(resellerId: string, result: AccesRevokeResult): AccesSettlement {
  // `no_code` RE-READS too: the list claimed a code the book no longer holds,
  // so the row must leave the screen, and the stored truth is how.
  if (result.ok || (!result.ok && result.reason === 'no_code')) return { ui: ACCES_IDLE, then: 'refresh' };
  if (result.reason === 'bad_key') return { ui: ACCES_IDLE, then: 'bad_key' };
  return { ui: { busy: null, nouveau: null, echec: `revoke:${resellerId}` }, then: 'none' };
}

export function accesReadOf(result: AccesListResult): AccesRead {
  if (result.ok) return { kind: 'ok', codes: result.codes };
  return { kind: result.reason === 'bad_key' ? 'bad_key' : 'failed' };
}

/* ── RESELLER-ACCOUNTS-1c — the roster + suivi, PURE decisions ── */

/**
 * The roster's one-write-at-a-time machine, the SAME discipline as the two
 * code inventories above and for the same reasons — with THREE verbs instead
 * of two, each namespaced by accountId so no account's act can light another
 * account's sentence.
 */

export type ComptesRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'bad_key' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly comptes: readonly CompteRow[] };

export type ComptesVue =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'liste'; readonly comptes: readonly CompteRow[] };

export function comptesVue(read: ComptesRead): ComptesVue | null {
  if (read.kind === 'bad_key') return null; // one key, one sentence — the section escalates
  if (read.kind === 'loading') return { kind: 'loading', message: 'comptes.chargement' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'comptes.echec' };
  if (read.comptes.length === 0) return { kind: 'empty', message: 'comptes.vide' };
  return { kind: 'liste', comptes: read.comptes };
}

export type ActeCompte = `code:${string}` | `pause:${string}` | `resume:${string}`;

export interface ComptesUi {
  readonly busy: ActeCompte | null;
  /** The one-time admission code, until he says he has written it down. */
  readonly nouveau: { readonly accountId: string; readonly code: string } | null;
  readonly echec: ActeCompte | null;
}

export const COMPTES_IDLE: ComptesUi = { busy: null, nouveau: null, echec: null };

/** A LIVE one-time code blocks every other act — the plaintext exists nowhere
 *  but that card, and a re-render mid-handover destroys it. */
export function acteStart(ui: ComptesUi, acte: ActeCompte): ComptesUi | null {
  if (ui.busy !== null || ui.nouveau !== null) return null;
  return { busy: acte, nouveau: null, echec: null };
}

export type ComptesSettlement =
  | { readonly ui: ComptesUi; readonly then: 'refresh' }
  | { readonly ui: ComptesUi; readonly then: 'bad_key' }
  | { readonly ui: ComptesUi; readonly then: 'none' };

export function codeAccesSettled(accountId: string, result: CodeAccesResult): ComptesSettlement {
  if (result.ok) {
    return { ui: { busy: null, nouveau: { accountId: result.accountId, code: result.code }, echec: null }, then: 'refresh' };
  }
  if (result.reason === 'bad_key') return { ui: COMPTES_IDLE, then: 'bad_key' };
  // not_pending / not_found: the LIST was stale about her state — re-read so
  // the row shows the truth; the failure sentence still names the act.
  if (result.reason === 'not_pending' || result.reason === 'not_found') {
    return { ui: { busy: null, nouveau: null, echec: `code:${accountId}` }, then: 'refresh' };
  }
  return { ui: { busy: null, nouveau: null, echec: `code:${accountId}` }, then: 'none' };
}

export function acteSettled(acte: ActeCompte, result: CompteActeResult): ComptesSettlement {
  if (result.ok) return { ui: COMPTES_IDLE, then: 'refresh' };
  if (result.reason === 'bad_key') return { ui: COMPTES_IDLE, then: 'bad_key' };
  // wrong_state re-reads TOO: the book said her state is not what the list
  // shows, and the stored truth is how the row corrects itself.
  if (result.reason === 'wrong_state' || result.reason === 'not_found') {
    return { ui: { busy: null, nouveau: null, echec: acte }, then: 'refresh' };
  }
  return { ui: { busy: null, nouveau: null, echec: acte }, then: 'none' };
}

export function comptesReadOf(result: ComptesResult): ComptesRead {
  if (result.ok) return { kind: 'ok', comptes: result.comptes };
  return { kind: result.reason === 'bad_key' ? 'bad_key' : 'failed' };
}

/* le suivi — a read-only board; its only decision is the honest shell */

export type SuiviRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'bad_key' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly lignes: readonly SuiviLigne[] };

export type SuiviVue =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'liste'; readonly lignes: readonly SuiviLigne[] };

export function suiviVue(read: SuiviRead): SuiviVue | null {
  if (read.kind === 'bad_key') return null;
  if (read.kind === 'loading') return { kind: 'loading', message: 'suivi.chargement' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'suivi.echec' };
  if (read.lignes.length === 0) return { kind: 'empty', message: 'suivi.vide' };
  return { kind: 'liste', lignes: read.lignes };
}

export function suiviReadOf(result: SuiviResult): SuiviRead {
  if (result.ok) return { kind: 'ok', lignes: result.lignes };
  return { kind: result.reason === 'bad_key' ? 'bad_key' : 'failed' };
}
