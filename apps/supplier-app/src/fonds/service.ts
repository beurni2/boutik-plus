/**
 * FONDS-CONSOLE-B+ — the founder's client to the LIVE Protection Fund book
 * (`protection-service` in the platform repo — one singleton FondsDO; founder
 * order 2026-08-06: « i do not want a separate url for that, put in boutik+'s
 * ops console »). The BOOK stays where canon D22 put it; this console is a
 * second client of the same key-gated door — no fund authority moves here.
 *
 * ═══ THE KEY IS TYPED BY THE FOUNDER, NEVER BUNDLED ═══
 *
 * `PROTECTION_OPS_SECRET` is the founder's alone — the same law as the ops
 * key and key C (`operations/service.ts` states it in full): NO
 * `EXPO_PUBLIC_*` for it, ever. The resolver takes the key as an argument
 * from the screen that asked him for it; the only persistence is his own
 * browser's localStorage, his device, his choice. The BASE is config, not a
 * credential: `EXPO_PUBLIC_PROTECTION_BASE` is a public workers.dev URL.
 *
 * UNSET RESOLVES TO NOTHING, NEVER TO DEMO — the standing law of this app's
 * outbound ports. There is no demo fund and no import of one: a console
 * showing invented money figures would be worse than no console.
 *
 * MONEY DISCIPLINE: every amount is INPUT-COPIED from the wire — the Worker
 * computes committed/solvency (its own domain, founder-ruled coverage-list
 * policy); this client displays and NEVER recomputes (Ten Laws #2).
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). Wire shapes are
 * mirrored locally; the SERVICE canon-validates at its door, so what this
 * port reads is already refused-or-true.
 */

import { fetchBorne } from '../reseau';

export const FONDS_TIMEOUT_MS = 12_000;

/**
 * A money field REFUSES what it cannot read — it never coerces. `Number('')`
 * is 0, and a 0-franc declaration in an append-only book is a false money
 * fact no one can delete (verifier round 1 BLOCKER). Digits only; anything
 * else answers null and the screen says the refusal.
 */
export function montantEntier(saisie: string): number | null {
  const s = saisie.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

const CLE_FONDS_STORAGE = 'boutik.fonds.cle';

export function readStoredCleFonds(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(CLE_FONDS_STORAGE);
    return v === null || v.trim() === '' ? null : v;
  } catch {
    return null;
  }
}

export function storeCleFonds(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CLE_FONDS_STORAGE, key);
  } catch {
    // storage refused (private mode) — the session keeps the key in memory only.
  }
}

export function clearStoredCleFonds(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CLE_FONDS_STORAGE);
  } catch {
    // nothing to clear
  }
}

/** The local claim-state vocabulary — mirrors protection-claim-states.v2. */
export type EtatReclamation = 'opened' | 'under_review' | 'resolved' | 'closed_no_payout';

/** Canon fault classes the fund book admits (sera routes to the custody instrument). */
export type FauteFonds = 'seller' | 'buyer' | 'payment_provider' | 'platform_system' | 'unresolved';

export interface ReclamationRow {
  readonly orderId: string;
  readonly faute: FauteFonds;
  readonly etat: EtatReclamation;
  readonly montantFcfa: number;
  readonly motif: string;
  readonly preuve: string;
  /** Present iff resolved — the offline payment's reference. */
  readonly reglementRef?: string;
  /** Present iff closed_no_payout — why the fund owes nothing. */
  readonly motifClassement?: string;
  readonly ouverteLe: string;
  /** A seller-fault claim (the book keeps its refund record). The buyer's
   *  refund itself is Shop+'s, on its own road, never this claim (B+I-13). */
  readonly clienteDabord: boolean;
}

export interface FondsFigures {
  readonly soldeFcfa: number | null;
  readonly declareLe: string | null;
  readonly engagesFcfa: number;
  readonly resteFcfa: number | null;
  readonly etatFonds: 'HEALTHY' | 'CRITICAL' | null;
}

export interface LivreFonds {
  readonly figures: FondsFigures;
  /** Every open claim, then the closed ones read so far, newest closed first
   *  (the book still live before paging answers its full list instead). */
  readonly reclamations: readonly ReclamationRow[];
  /** Wire rows this client did not recognize — shown, never silently dropped. */
  readonly nonReconnues: number;
  /** Where the next older page of closed claims starts; null when none is left
   *  (or when the book answered everything at once). */
  readonly plusAnciennes: number | null;
}

export type LectureFonds =
  | { readonly ok: true; readonly livre: LivreFonds }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type PageFonds =
  | { readonly ok: true; readonly reclamations: readonly ReclamationRow[]; readonly nonReconnues: number; readonly plusAnciennes: number | null }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type SignaleesFonds =
  | { readonly ok: true; readonly orderIds: ReadonlySet<string> }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type ActeFondsResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'bad_key'
        | 'duplicate'
        | 'not_forward'
        | 'settlement_ref_required'
        | 'close_reason_required'
        | 'sera_routing'
        | 'invalid'
        | 'zero_amount'
        | 'unreachable';
    };

export interface OuvrirReclamationInput {
  readonly orderId: string;
  readonly motif: string;
  readonly faute: FauteFonds;
  readonly montantFcfa: number;
  readonly preuve: string;
}

export interface FondsServicePort {
  /** The figures, every open claim and the newest page of closed ones. */
  lire(cle: string): Promise<LectureFonds>;
  /** The next older page of closed claims, from a `plusAnciennes` mark. */
  lirePlusAnciennes(cle: string, avant: number): Promise<PageFonds>;
  /** The orders with a claim the Commandes tab files under « Incidents »:
   *  every open claim and the 100 most recently closed. */
  lireSignalees(cle: string): Promise<SignaleesFonds>;
  ouvrir(cle: string, input: OuvrirReclamationInput): Promise<ActeFondsResult>;
  /** `detail` = the offline payment ref (resolved) or the close reason (closed_no_payout). */
  avancer(cle: string, orderId: string, vers: EtatReclamation, detail?: string): Promise<ActeFondsResult>;
  declarer(cle: string, input: { soldeFcfa: number; capitalFcfa?: number; commandId: string }): Promise<ActeFondsResult>;
}

const ETATS: readonly string[] = ['opened', 'under_review', 'resolved', 'closed_no_payout'];

/** The desk's page of closed claims, and the Commandes tab's single page. */
export const PAGE_FERMEES = 20;
export const FERMEES_SIGNALEES = 100;
const FAUTES: readonly string[] = ['seller', 'buyer', 'payment_provider', 'platform_system', 'unresolved'];

function readRow(raw: unknown): ReclamationRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const stored = raw as {
    claim?: {
      orderId?: unknown; reason?: unknown; amount?: unknown; faultClass?: unknown;
      evidenceBundleId?: unknown; state?: unknown;
    };
    openedAt?: unknown;
    refundRequired?: unknown;
    advanced?: unknown;
  };
  const c = stored.claim;
  if (typeof c !== 'object' || c === null) return null;
  if (typeof c.orderId !== 'string' || typeof c.reason !== 'string') return null;
  if (typeof c.amount !== 'number' || typeof c.evidenceBundleId !== 'string') return null;
  if (typeof c.state !== 'string' || !ETATS.includes(c.state)) return null;
  if (typeof c.faultClass !== 'string' || !FAUTES.includes(c.faultClass)) return null;
  if (typeof stored.openedAt !== 'string') return null;
  const advanced = Array.isArray(stored.advanced) ? stored.advanced : [];
  let reglementRef: string | undefined;
  let motifClassement: string | undefined;
  for (const a of advanced) {
    if (typeof a === 'object' && a !== null) {
      const rec = a as { settlementRef?: unknown; closedReason?: unknown };
      if (typeof rec.settlementRef === 'string') reglementRef = rec.settlementRef;
      if (typeof rec.closedReason === 'string') motifClassement = rec.closedReason;
    }
  }
  return {
    orderId: c.orderId,
    faute: c.faultClass as FauteFonds,
    etat: c.state as EtatReclamation,
    montantFcfa: c.amount,
    motif: c.reason,
    preuve: c.evidenceBundleId,
    ...(reglementRef !== undefined ? { reglementRef } : {}),
    ...(motifClassement !== undefined ? { motifClassement } : {}),
    ouverteLe: stored.openedAt,
    clienteDabord: stored.refundRequired !== undefined && stored.refundRequired !== null,
  };
}

/** The service's refusal codes → this port's named reasons (verbatim map, no guessing). */
const RAISONS: Record<string, Exclude<ActeFondsResult, { ok: true }>['reason']> = {
  duplicate: 'duplicate',
  not_forward: 'not_forward',
  settlement_ref_required: 'settlement_ref_required',
  close_reason_required: 'close_reason_required',
  not_a_fund_claim: 'sera_routing',
  invalid_body: 'invalid',
  invalid_amount: 'invalid',
  invalid_fault_class: 'invalid',
  invalid_state: 'invalid',
  claim_unknown: 'invalid',
  command_id_required: 'invalid',
  zero_claim_amount: 'zero_amount',
};

export function resolveFondsService(): FondsServicePort | null {
  const base = process.env.EXPO_PUBLIC_PROTECTION_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/+$/, '');

  async function call(
    cle: string,
    path: string,
    init?: { method?: string; body?: Record<string, unknown> },
  ): Promise<{ status: number; body: unknown } | { status: 0 }> {
    try {
      const res = await fetchBorne(`${trimmed}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${cle}`,
          ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      }, FONDS_TIMEOUT_MS);
      const body: unknown = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch {
      // refused connection, blocked CORS answer, or our own abort — the same
      // honest sentence: we could not reach the book, try again
      return { status: 0 };
    }
  }

  type Liste = { ok: true; claims: unknown[]; nextBefore: number | null | undefined } | { ok: false; reason: 'bad_key' | 'unreachable' };

  /** One list of claims. `nextBefore` is undefined when the answer has none —
   *  the book still live before paging, which ignores the page and answers
   *  its full list; a mark that is neither null nor a page number is not read. */
  function listeOf(r: { status: number; body?: unknown } | { status: 0 }): Liste {
    if (r.status === 0) return { ok: false, reason: 'unreachable' };
    if (r.status === 401) return { ok: false, reason: 'bad_key' };
    const body = (r as { body?: unknown }).body as { claims?: unknown; nextBefore?: unknown } | null | undefined;
    if (r.status !== 200 || typeof body !== 'object' || body === null || !Array.isArray(body.claims)) {
      return { ok: false, reason: 'unreachable' };
    }
    if (!('nextBefore' in body)) return { ok: true, claims: body.claims, nextBefore: undefined };
    const n = body.nextBefore;
    if (n === null || (typeof n === 'number' && Number.isSafeInteger(n) && n >= 2)) return { ok: true, claims: body.claims, nextBefore: n };
    return { ok: false, reason: 'unreachable' };
  }

  function acteOf(r: { status: number; body?: unknown } | { status: 0 }): ActeFondsResult {
    if (r.status === 0) return { ok: false, reason: 'unreachable' };
    if (r.status === 401) return { ok: false, reason: 'bad_key' };
    if (r.status >= 200 && r.status < 300) return { ok: true };
    const code =
      typeof (r as { body?: unknown }).body === 'object' && (r as { body: { error?: unknown } }).body !== null
        ? String((r as { body: { error?: unknown } }).body.error ?? '')
        : '';
    return { ok: false, reason: RAISONS[code] ?? 'unreachable' };
  }

  return {
    async lire(cle: string): Promise<LectureFonds> {
      const [fundRes, ouvertesRes, fermeesRes] = await Promise.all([
        call(cle, '/fund'),
        call(cle, '/claims?part=open'),
        call(cle, `/claims?part=closed&limit=${PAGE_FERMEES}`),
      ]);
      const reponses = [fundRes, ouvertesRes, fermeesRes];
      if (reponses.some((r) => r.status === 0)) return { ok: false, reason: 'unreachable' };
      if (reponses.some((r) => r.status === 401)) return { ok: false, reason: 'bad_key' };
      const ouvertes = listeOf(ouvertesRes);
      const fermees = listeOf(fermeesRes);
      if (!ouvertes.ok || !fermees.ok || fundRes.status !== 200) return { ok: false, reason: 'unreachable' };

      const fundBody = fundRes.body as {
        declaration?: { balanceFcfa?: unknown; declaredAt?: unknown } | null;
        committedClaimsAmountFcfa?: unknown;
        solvency?: { state?: unknown; availableAfterCommitmentsFcfa?: unknown };
      };
      if (typeof fundBody !== 'object' || fundBody === null) return { ok: false, reason: 'unreachable' };
      // The book still live before paging answers both reads with its full
      // list: that list alone, once, in its own order, with no older page.
      const ancien = fermees.nextBefore === undefined;
      const lignesOuvertes = ancien ? [] : ouvertes.claims.map(readRow);
      const lignesFermees = fermees.claims.map(readRow);
      const valides = (lignes: readonly (ReclamationRow | null)[]): ReclamationRow[] =>
        lignes.filter((r): r is ReclamationRow => r !== null);
      // A claim closed between the two reads is in both: kept once, closed.
      const fermeesIds = new Set(valides(lignesFermees).map((r) => r.orderId));
      const reclamations = [...valides(lignesOuvertes).filter((r) => !fermeesIds.has(r.orderId)), ...valides(lignesFermees)];
      const nonReconnues = [...lignesOuvertes, ...lignesFermees].filter((r) => r === null).length;
      const decl = fundBody.declaration ?? null;
      const engages = fundBody.committedClaimsAmountFcfa;
      const etat = fundBody.solvency?.state;
      const reste = fundBody.solvency?.availableAfterCommitmentsFcfa;
      if (typeof engages !== 'number') return { ok: false, reason: 'unreachable' };
      return {
        ok: true,
        livre: {
          figures: {
            soldeFcfa: typeof decl?.balanceFcfa === 'number' ? decl.balanceFcfa : null,
            declareLe: typeof decl?.declaredAt === 'string' ? decl.declaredAt : null,
            engagesFcfa: engages,
            resteFcfa: typeof reste === 'number' ? reste : null,
            etatFonds: etat === 'HEALTHY' || etat === 'CRITICAL' ? etat : null,
          },
          reclamations,
          nonReconnues,
          plusAnciennes: fermees.nextBefore ?? null,
        },
      };
    },

    async lirePlusAnciennes(cle: string, avant: number): Promise<PageFonds> {
      const page = listeOf(await call(cle, `/claims?part=closed&limit=${PAGE_FERMEES}&before=${avant}`));
      if (!page.ok) return page;
      const lues = page.claims.map(readRow);
      const reclamations = lues.filter((r): r is ReclamationRow => r !== null);
      return { ok: true, reclamations, nonReconnues: lues.length - reclamations.length, plusAnciennes: page.nextBefore ?? null };
    },

    async lireSignalees(cle: string): Promise<SignaleesFonds> {
      const reponses = await Promise.all([call(cle, '/claims?part=open'), call(cle, `/claims?part=closed&limit=${FERMEES_SIGNALEES}`)]);
      if (reponses.some((r) => r.status === 0)) return { ok: false, reason: 'unreachable' };
      if (reponses.some((r) => r.status === 401)) return { ok: false, reason: 'bad_key' };
      const [ouvertes, fermees] = reponses.map(listeOf) as [Liste, Liste];
      if (!ouvertes.ok || !fermees.ok) return { ok: false, reason: 'unreachable' };
      const orderIds = new Set(
        [...ouvertes.claims, ...fermees.claims].flatMap((raw) => {
          const r = readRow(raw);
          return r === null ? [] : [r.orderId];
        }),
      );
      return { ok: true, orderIds };
    },

    async ouvrir(cle: string, input: OuvrirReclamationInput): Promise<ActeFondsResult> {
      return acteOf(
        await call(cle, '/claims', {
          method: 'POST',
          body: {
            orderId: input.orderId,
            reason: input.motif,
            faultClass: input.faute,
            amountFcfa: input.montantFcfa,
            evidenceBundleId: input.preuve,
          },
        }),
      );
    },

    async avancer(cle: string, orderId: string, vers: EtatReclamation, detail?: string): Promise<ActeFondsResult> {
      return acteOf(
        await call(cle, `/claims/${encodeURIComponent(orderId)}/advance`, {
          method: 'POST',
          body: {
            to: vers,
            ...(vers === 'resolved' && detail !== undefined ? { settlementRef: detail } : {}),
            ...(vers === 'closed_no_payout' && detail !== undefined ? { closedReason: detail } : {}),
          },
        }),
      );
    },

    async declarer(cle: string, input: { soldeFcfa: number; capitalFcfa?: number; commandId: string }): Promise<ActeFondsResult> {
      return acteOf(
        await call(cle, '/fund', {
          method: 'PUT',
          body: {
            commandId: input.commandId,
            balanceFcfa: input.soldeFcfa,
            ...(input.capitalFcfa !== undefined ? { openingFundCapitalFcfa: input.capitalFcfa } : {}),
          },
        }),
      );
    },
  };
}
