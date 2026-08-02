/**
 * LISTER-POUR-2 — the supplier PICKER (founder order 2026-08-02: « show the
 * list of the available active fournisseur and I select the one I want »).
 *
 * WHERE THE LIST COMES FROM, and why this is lawful where a bundled secret
 * would not be: the roster is CONSOLE-3's code inventory — an ACTIVE CODE is
 * what makes a supplier active, so the inventory IS the list he asked for —
 * read with the ops key HE typed into the Opérations tab, held in his own
 * browser (`boutik.operateur.cle`), never in any bundle. No key stored in
 * this browser ⇒ no list — an honestly NAMED state with the typed field as
 * the fallback, never an empty picker pretending there are no suppliers.
 */

import { supplierPourPublication } from './lister-pour';
// TYPE-ONLY (erased at build): naming the console's result shape here must
// never drag the operations client into a bundle that does not already have it.
import type { CodesResult } from '../operations/service';

export type FournisseursRead =
  /** No ops key in this browser — the console tab has not been opened here. */
  | { readonly kind: 'sans_cle' }
  | { readonly kind: 'chargement' }
  | { readonly kind: 'echec' }
  | { readonly kind: 'liste'; readonly ids: readonly string[] };

export interface ChoixFournisseur {
  /** '' means HIMSELF — the same sentinel the session already uses. */
  readonly id: string;
  /** Catalog key for « Vous », or the raw id (ids are identifiers, not copy). */
  readonly labelKey: 'publier.pour_chips_vous' | null;
}

/**
 * The chips, pure: « Vous » first, then every OTHER active supplier, sorted.
 * His own id is folded INTO « Vous » rather than shown twice — selecting
 * himself by id and selecting « Vous » are the same publication, and two chips
 * that mean the same thing is how a picker fails the 5-second test.
 */
export function chipsFournisseurs(ids: readonly string[], sienId: string): readonly ChoixFournisseur[] {
  const autres = [...new Set(ids)].filter((id) => id !== sienId && id !== '').sort((a, b) => a.localeCompare(b, 'fr'));
  return [{ id: '', labelKey: 'publier.pour_chips_vous' }, ...autres.map((id) => ({ id, labelKey: null }))];
}

/**
 * THE READ ITSELF, BOUNDED — extracted from the effect so it can be tested
 * (verifier finding: `chargement` had no ceiling, and the missing bound was
 * the one fix in this round that no mutation could catch while it lived
 * inside a React effect).
 *
 * Three ways to fail, ONE honest destination: a refused key, an unreachable
 * service, and a body that never finishes streaming — routine on patchy data,
 * the environment Law 7 names first — all become `echec`, which the screen
 * states plainly and offers to retry. What must never happen is « Un instant… »
 * standing for ever, which is a loading sentence lying about a dead read.
 */
export async function lireFournisseurs(
  ops: { listCodes(opsKey: string): Promise<CodesResult> },
  opsKey: string,
  delaiMs = 12_000,
): Promise<FournisseursRead> {
  const echec: FournisseursRead = { kind: 'echec' };
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const borne = new Promise<FournisseursRead>((resolve) => {
    minuteur = setTimeout(() => resolve(echec), delaiMs);
  });
  const lecture = ops
    .listCodes(opsKey)
    .then((res): FournisseursRead => (res.ok ? { kind: 'liste', ids: res.codes.map((c) => c.supplierId) } : echec))
    .catch((): FournisseursRead => echec);
  try {
    return await Promise.race([lecture, borne]);
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * WHICH CHIP IS MARKED — derived from the SAME rule that decides whom the
 * publication is FOR, never from a second copy of the selection.
 *
 * THE DEFECT THIS CLOSES (verifier BLOCKER, 2026-08-02): the marking used to
 * live in a `useState` seeded once at mount, while the value that publishes
 * lived in the shell session. An id typed into the fallback field while the
 * roster was still loading updated the session only; when the list arrived the
 * screen swapped to chips and drew « Vous » active while the publish went to
 * the typed supplier. Two writers, one of them updating a single copy — so the
 * marking is now COMPUTED from the session value on every render instead.
 *
 * `supplierPourPublication` is the single rule (empty/blank ⇒ himself, else
 * the trimmed id verbatim); this maps its answer back onto a chip id, so
 * « Vous » also lights up when he typed his OWN id by hand.
 */
export function chipChoisi(valeur: string, sienId: string): string {
  const cible = supplierPourPublication(valeur, sienId);
  return cible === sienId ? '' : cible;
}

/**
 * The hint under the picker/field, one per read state — every state named.
 *
 * `autres` = how many chips other than « Vous » there are. A SUCCESSFUL read
 * with no other supplier is its own state (verifier MAJOR): telling him to
 * « touchez un fournisseur » when there is none to touch is an undesigned
 * empty state wearing the populated state's sentence.
 */
export function pourFournisseurHintKey(read: FournisseursRead, autres: number): string {
  switch (read.kind) {
    case 'sans_cle':
      return 'publier.pour_sans_cle_hint';
    case 'chargement':
      return 'publier.pour_chargement_hint';
    case 'echec':
      return 'publier.pour_echec_hint';
    case 'liste':
      return autres > 0 ? 'publier.pour_fournisseur_hint' : 'publier.pour_liste_vide_hint';
  }
}
