import type { CourseRow, CoursierRow } from './service';
import type { RetraitResult } from '../operations/service';

/**
 * SE-LIVE-4e-B+ — the rider-code desk's PURE decisions, the same shapes the
 * supplier-code desk uses (`operations/view.ts`, CONSOLE-3). Deliberately the
 * same grammar: the two desks do the same job and the founder should not have
 * to learn two. No DOM, no fetch, no timer; every string is a CATALOG KEY.
 */

/**
 * PURGE-ESSAI-COURSES — this desk's answers, translated into the SAME retire
 * grammar the Commandes tab already uses (`operations/view.ts`). Deliberately
 * a mapping and not a second state machine: the two-tap guard, the keyed
 * failures and the sweep accounting are already proven there, and a
 * destructive control is the last place to grow a second dialect.
 *
 * A named refusal from the book (`refused`) reads as unreachable ON PURPOSE:
 * the retire door answers `inconnu` with `ok:true`, so the only refusals that
 * can arrive here are ones this screen cannot act on — « we do not know that
 * it happened » is the honest sentence, and the row stays.
 */
export function retraitDepuisAnswer(answer: { readonly kind: string }): RetraitResult {
  if (answer.kind === 'ok') return { ok: true };
  if (answer.kind === 'bad_key') return { ok: false, reason: 'bad_key' };
  return { ok: false, reason: 'unreachable' };
}

/** The course list, as the desk reads it. Same three honest states as the
 *  roster beside it — a board that cannot be read never renders as empty. */
export type CoursesRead =
  | { kind: 'chargement' }
  | { kind: 'echec' }
  | { kind: 'ok'; courses: readonly CourseRow[] };

export type CoursiersRead =
  | { readonly kind: 'chargement' }
  /** Never rendered as a section — the ZONE escalates whole to one sentence. */
  | { readonly kind: 'cle_refusee' }
  | { readonly kind: 'echec' }
  | { readonly kind: 'ok'; readonly coursiers: readonly CoursierRow[] };

export type CoursiersVue =
  | { readonly kind: 'chargement'; readonly message: string }
  | { readonly kind: 'echec'; readonly message: string }
  | { readonly kind: 'vide'; readonly message: string }
  | { readonly kind: 'liste'; readonly coursiers: readonly CoursierRow[] };

export function coursiersVue(read: CoursiersRead): CoursiersVue | null {
  if (read.kind === 'cle_refusee') return null;
  if (read.kind === 'chargement') return { kind: 'chargement', message: 'coursiers.chargement' };
  if (read.kind === 'echec') return { kind: 'echec', message: 'coursiers.echec' };
  if (read.coursiers.length === 0) return { kind: 'vide', message: 'coursiers.vide' };
  return { kind: 'liste', coursiers: read.coursiers };
}

/**
 * The honest pre-flight, before the tap:
 *   · `remplace` — this rider HAS a code; a new one kills the old one NOW, and
 *     a rider mid-course is locked out of their own custody acts.
 *   · `inconnu` — not registered; the mint route answers `unknown_rider`.
 *   · `pret`     — registered, no code: the plain case.
 */
export type AvisCode = 'pret' | 'remplace' | 'inconnu';

export function avisCode(coursiers: readonly CoursierRow[], riderId: string): AvisCode {
  const found = coursiers.find((c) => c.riderId === riderId.trim());
  if (found === undefined) return 'inconnu';
  return found.hasCode ? 'remplace' : 'pret';
}

export function avisCodeKey(avis: AvisCode): string {
  if (avis === 'remplace') return 'coursiers.avis_remplace';
  if (avis === 'inconnu') return 'coursiers.avis_inconnu';
  return 'coursiers.avis_pret';
}

/** One pill per row, so the desk answers « who can get in » at a glance. */
export function codePillule(row: CoursierRow): { readonly label: string; readonly ton: 'ok' | 'attente' } {
  return row.hasCode
    ? { label: 'coursiers.a_un_code', ton: 'ok' }
    : { label: 'coursiers.pas_de_code', ton: 'attente' };
}

/**
 * The SECOND pill — can this rider be given a course? (SE1: certified AND
 * on-shift.) Named in the ORDER the founder can act on it: certification is
 * HIS act on this desk; the shift is the rider's act in their own app. The
 * founder hit « aucun coursier libre » with no reason anywhere on screen —
 * this pill is where the reason lives from now on.
 */
export function etatPillule(row: CoursierRow): { readonly label: string; readonly ton: 'ok' | 'attente' } {
  if (!row.certified) return { label: 'coursiers.pas_certifie', ton: 'attente' };
  if (!row.enService) return { label: 'coursiers.pas_en_service', ton: 'attente' };
  return { label: 'coursiers.pret_course', ton: 'ok' };
}

/**
 * A LIVE ONE-TIME CODE BLOCKS EVERY OTHER ACT. The plaintext exists nowhere
 * but that card — the server mints it once and never returns it. A tap that
 * silently destroyed it mid-handover is the finding the supplier-code desk
 * already paid for (verifier MAJOR-1 there). He taps « C'est noté » first.
 */
export interface CoursiersUi {
  readonly busy: 'mint' | `revoke:${string}` | `certify:${string}` | `reveal:${string}` | `retire:${string}` | null;
  readonly nouveau: { readonly riderId: string; readonly code: string; readonly revele?: boolean } | null;
  /** Namespaced like `busy`, so a rider literally named « mint » cannot light
   *  the wrong sentence. */
  readonly echec: 'mint' | `revoke:${string}` | `certify:${string}` | `reveal:${string}` | `retire:${string}` | null;
  /** The rider whose removal question is on screen — the two-tap guard. */
  readonly demandeRetrait: string | null;
  /** The server's NAMED refusal for the last removal, or null. */
  readonly motifRetrait: string | null;
}

/**
 * RETIRER-COURSIER (founder, 2026-08-12) — the roster removal's own two fields.
 *
 * `demandeRetrait` is the SAME two-tap the Commandes retire already uses, in
 * the same grammar, because « a destructive control is the last place to grow a
 * second dialect » (this file's own rule, kept).
 *
 ⚠ * `motifRetrait` exists because this act can be refused FOR A REASON HE CAN ACT
 * ON. A rider carrying a parcel answers `rider_carrying`, and « ça n'a pas
 * marché » would send him back to tap again forever. The named sentence tells
 * him to end the course first.
 */
export const COURSIERS_IDLE: CoursiersUi = {
  busy: null,
  nouveau: null,
  echec: null,
  demandeRetrait: null,
  motifRetrait: null,
};

/** Arm the question for ONE rider. Refused while another act is in flight or a
 *  code card is unread — the same guard every act on this desk answers to. */
export function retraitCoursierDemande(ui: CoursiersUi, riderId: string): CoursiersUi | null {
  if (refuserActe(ui) !== null) return null;
  return { ...ui, demandeRetrait: riderId, motifRetrait: null };
}

export function retraitCoursierAnnule(ui: CoursiersUi): CoursiersUi {
  return { ...ui, demandeRetrait: null, motifRetrait: null };
}

/**
 * The refusal, as a sentence he can act on. `rider_carrying` is the one that
 * matters: the parcel keeps its custodian and the fix is HIS — end the course,
 * or hand the custody over, then remove.
 */
export function motifRefusRetrait(motif: string): string {
  if (motif === 'rider_carrying') return 'coursiers.retrait_en_course';
  if (motif === 'unknown_rider') return 'coursiers.retrait_inconnu';
  return 'coursiers.retrait_echec';
}

export function refuserActe(ui: CoursiersUi): string | null {
  if (ui.nouveau !== null) return 'coursiers.notez_dabord';
  if (ui.busy !== null) return 'coursiers.un_acte';
  return null;
}

export function acteDemarre(ui: CoursiersUi, acte: 'mint' | `revoke:${string}` | `certify:${string}` | `reveal:${string}` | `retire:${string}`): CoursiersUi | null {
  if (refuserActe(ui) !== null) return null;
  return {
    busy: acte,
    nouveau: null,
    echec: null,
    /**
     * ⚠ THE REMOVAL'S OWN QUESTION CLOSES THE MOMENT ITS ACT STARTS (verifier
     * MAJOR). Leaving it armed kept « Oui, le retirer » on screen, pressable,
     * and SILENTLY DEAD in flight — a second tap returned nothing and said
     * nothing. That is the ghost button this desk already paid for once
     * (2026-08-08). ANOTHER rider's armed question is not this act's business
     * and survives untouched.
     */
    demandeRetrait: ui.demandeRetrait !== null && acte === `retire:${ui.demandeRetrait}` ? null : ui.demandeRetrait,
    motifRetrait: null,
  };
}

export type ActeResultat =
  | { readonly ok: true; readonly code?: string | undefined; readonly riderId: string; readonly revele?: boolean }
  /** `motif` is the server's own word (`rider_carrying`, `unknown_rider`) when
   *  it said no BY NAME — a refusal is a fact, not a failure. */
  | { readonly ok: false; readonly motif?: string | undefined };

export function acteRegle(
  ui: CoursiersUi,
  acte: 'mint' | `revoke:${string}` | `certify:${string}` | `reveal:${string}` | `retire:${string}`,
  r: ActeResultat,
): CoursiersUi {
  // A late answer for an act no longer in flight changes nothing — it must not
  // resurrect a card he already dismissed.
  if (ui.busy !== acte) return ui;
  if (!r.ok) {
    return {
      busy: null,
      nouveau: null,
      echec: acte,
      demandeRetrait: null,
      motifRetrait: acte.startsWith('retire:') ? (r.motif ?? null) : null,
    };
  }
  const code = r.code;
  return {
    busy: null,
    nouveau:
      typeof code === 'string' && code !== ''
        ? { riderId: r.riderId, code, ...(r.revele === true ? { revele: true } : {}) }
        : null,
    echec: null,
    demandeRetrait: null,
    motifRetrait: null,
  };
}

export function oublierCode(ui: CoursiersUi): CoursiersUi {
  return { ...ui, nouveau: null };
}

/**
 * ⚠ `retraitCoursierStart` WAS HERE AND IS GONE (verifier MAJOR). It claimed to
 * clear the armed question, the screen threw its return value away, and
 * `lancer` then re-armed the question from its own render closure — so the
 * claim was false as wired. The rule now lives in `acteDemarre`, which is the
 * ONE place every act on this desk actually starts from, and cannot be
 * bypassed by a caller that forgets to use it.
 */
