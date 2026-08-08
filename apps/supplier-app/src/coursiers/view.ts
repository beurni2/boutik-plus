import type { CoursierRow } from './service';

/**
 * SE-LIVE-4e-B+ — the rider-code desk's PURE decisions, the same shapes the
 * supplier-code desk uses (`operations/view.ts`, CONSOLE-3). Deliberately the
 * same grammar: the two desks do the same job and the founder should not have
 * to learn two. No DOM, no fetch, no timer; every string is a CATALOG KEY.
 */

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
 * ⚠ A LIVE ONE-TIME CODE BLOCKS EVERY OTHER ACT. The plaintext exists nowhere
 * but that card — the server mints it once and never returns it. A tap that
 * silently destroyed it mid-handover is the finding the supplier-code desk
 * already paid for (verifier MAJOR-1 there). He taps « C'est noté » first.
 */
export interface CoursiersUi {
  readonly busy: 'mint' | `revoke:${string}` | null;
  readonly nouveau: { readonly riderId: string; readonly code: string } | null;
  /** Namespaced like `busy`, so a rider literally named « mint » cannot light
   *  the wrong sentence. */
  readonly echec: 'mint' | `revoke:${string}` | null;
}

export const COURSIERS_IDLE: CoursiersUi = { busy: null, nouveau: null, echec: null };

export function refuserActe(ui: CoursiersUi): string | null {
  if (ui.nouveau !== null) return 'coursiers.notez_dabord';
  if (ui.busy !== null) return 'coursiers.un_acte';
  return null;
}

export function acteDemarre(ui: CoursiersUi, acte: 'mint' | `revoke:${string}`): CoursiersUi | null {
  if (refuserActe(ui) !== null) return null;
  return { busy: acte, nouveau: null, echec: null };
}

export type ActeResultat =
  | { readonly ok: true; readonly code?: string | undefined; readonly riderId: string }
  | { readonly ok: false };

export function acteRegle(
  ui: CoursiersUi,
  acte: 'mint' | `revoke:${string}`,
  r: ActeResultat,
): CoursiersUi {
  // A late answer for an act no longer in flight changes nothing — it must not
  // resurrect a card he already dismissed.
  if (ui.busy !== acte) return ui;
  if (!r.ok) return { busy: null, nouveau: null, echec: acte };
  const code = r.code;
  return {
    busy: null,
    nouveau: typeof code === 'string' && code !== '' ? { riderId: r.riderId, code } : null,
    echec: null,
  };
}

export function oublierCode(ui: CoursiersUi): CoursiersUi {
  return { ...ui, nouveau: null };
}
