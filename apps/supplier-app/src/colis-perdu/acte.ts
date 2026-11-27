import type { ColisEnMain, Montant, ReponseColis } from './service';

/**
 * The declaration he has open, kept OUTSIDE the screen: Opérations unmounts
 * when he switches tab, and a declaration in flight must survive that, its
 * command id with it. Séra's answer lands here even if no screen is mounted,
 * so coming back shows it, and « Réessayer » still sends the same id.
 *
 * One per console page: a reload starts empty, as every console state does.
 */

/** Séra's answer, or no key on this browser at the moment he pressed: nothing was sent. */
export type Issue = ReponseColis | { kind: 'sans_cle' };

export type Acte =
  | { etape: 'montants'; colis: ColisEnMain; saisies: Readonly<Record<string, string>> }
  | { etape: 'confirmer'; colis: ColisEnMain; montants: readonly Montant[] }
  | { etape: 'envoi'; colis: ColisEnMain; montants: readonly Montant[]; commandId: string }
  | { etape: 'issue'; colis: ColisEnMain; montants: readonly Montant[]; commandId: string; reponse: Issue };

let courant: Acte | null = null;
const abonnes = new Set<() => void>();

export function lireActe(): Acte | null {
  return courant;
}

export function poserActe(a: Acte | null): void {
  courant = a;
  for (const f of abonnes) f();
}

/** Séra's answer to one send: kept only if that send is still the one open. */
export function poserIssue(commandId: string, reponse: Issue): void {
  if (courant === null || courant.etape !== 'envoi' || courant.commandId !== commandId) return;
  poserActe({ ...courant, etape: 'issue', reponse });
}

export function abonnerActe(f: () => void): () => void {
  abonnes.add(f);
  return () => { abonnes.delete(f); };
}
