/**
 * FONDS-CONSOLE-B+ — the pure decision layer for the fund zone. The screen
 * owns the impure substance (resolved service, reads, retries); THIS module
 * answers only « given what was read, what does the founder see? » — so every
 * honest state and every grouping is a unit-testable fact, not a JSX branch.
 *
 * THE 5-SECOND TEST for its owner: the zone answers ONE question first —
 * « le fonds peut-il couvrir ce qui est engagé ? » — with the declared solde
 * large, the engaged figure beside it, and the state said as one pill. The
 * buyer-first law (B+I-13) renders BEFORE any figure, always: no solvency
 * state may ever read as a condition on a client's refund.
 */

import type { EtatReclamation, FauteFonds, LectureFonds, LivreFonds, ReclamationRow } from './service';

export type FondsRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'lecture'; readonly lecture: LectureFonds };

export interface GroupeFaute {
  readonly faute: FauteFonds;
  readonly titreKey: string;
  readonly rows: readonly ReclamationRow[];
}

export type FondsVue =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_configured'; readonly message: string }
  | { readonly kind: 'bad_key'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | {
      readonly kind: 'livre';
      readonly livre: LivreFonds;
      readonly groupes: readonly GroupeFaute[];
      /** true when the book holds no claim at all — the encouraging empty. */
      readonly vide: boolean;
    };

/** Canon order (Desk 2 routing order): seller · buyer · provider · platform · à classer. */
const ORDRE_FAUTES: ReadonlyArray<{ faute: FauteFonds; titreKey: string }> = [
  { faute: 'seller', titreKey: 'fonds.faute_vendeur' },
  { faute: 'buyer', titreKey: 'fonds.faute_cliente' },
  { faute: 'payment_provider', titreKey: 'fonds.faute_operateur' },
  { faute: 'platform_system', titreKey: 'fonds.faute_plateforme' },
  { faute: 'unresolved', titreKey: 'fonds.faute_a_classer' },
];

export function fondsVue(read: FondsRead): FondsVue {
  if (read.kind === 'loading') return { kind: 'loading' };
  if (read.kind === 'not_configured') return { kind: 'not_configured', message: 'fonds.non_configure' };
  const lecture = read.lecture;
  if (!lecture.ok) {
    return lecture.reason === 'bad_key'
      ? { kind: 'bad_key', message: 'fonds.cle_refusee' }
      : { kind: 'failed', message: 'fonds.injoignable' };
  }
  const groupes: GroupeFaute[] = [];
  for (const { faute, titreKey } of ORDRE_FAUTES) {
    const rows = lecture.livre.reclamations.filter((r) => r.faute === faute);
    if (rows.length > 0) groupes.push({ faute, titreKey, rows });
  }
  return {
    kind: 'livre',
    livre: lecture.livre,
    groupes,
    vide: lecture.livre.reclamations.length === 0,
  };
}

/** State → pill label key + tone (the console's own three tones). */
export function etatPillule(etat: EtatReclamation): { labelKey: string; tone: 'ok' | 'attente' | 'pause' } {
  switch (etat) {
    case 'opened':
      return { labelKey: 'fonds.etat_ouverte', tone: 'attente' };
    case 'under_review':
      return { labelKey: 'fonds.etat_examen', tone: 'attente' };
    case 'resolved':
      return { labelKey: 'fonds.etat_reglee', tone: 'ok' };
    case 'closed_no_payout':
      return { labelKey: 'fonds.etat_classee', tone: 'pause' };
  }
}

/** Fund state → pill (unknown = pause tone with its own honest sentence). */
export function fondsPillule(etat: 'HEALTHY' | 'CRITICAL' | null): {
  labelKey: string;
  tone: 'ok' | 'attente' | 'pause';
} {
  if (etat === 'HEALTHY') return { labelKey: 'fonds.solide', tone: 'ok' };
  if (etat === 'CRITICAL') return { labelKey: 'fonds.sous_tension', tone: 'attente' };
  return { labelKey: 'fonds.a_declarer', tone: 'pause' };
}
