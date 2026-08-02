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

/** The hint under the picker/field, one per read state — every state named. */
export function pourFournisseurHintKey(read: FournisseursRead): string {
  switch (read.kind) {
    case 'sans_cle':
      return 'publier.pour_sans_cle_hint';
    case 'chargement':
      return 'publier.pour_chargement_hint';
    case 'echec':
      return 'publier.pour_echec_hint';
    case 'liste':
      return 'publier.pour_fournisseur_hint';
  }
}
