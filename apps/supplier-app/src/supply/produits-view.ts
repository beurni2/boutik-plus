import type { SupplierOfferRow } from './service';

/**
 * WHAT PRODUITS SHOWS, decided PURELY (PRODUITS-READ-1).
 *
 * WHY THIS IS A FUNCTION AND NOT JSX BRANCHES: the founder's condition on this
 * slice is that `produits.vide` and `produits.lecture_echec` must never be
 * reachable from the same state — a failed read must NEVER say « vous n'avez pas
 * encore de produit », because that is a claim about his shop derived from a
 * fact about the network.
 *
 * My first attempt asserted that with source-position checks, and a planted
 * fall-through defect walked straight past them — structure again, not
 * substance. So the decision lives here, where a test can put a state IN and
 * read the sentence OUT.
 */

/** What the read seam knows. */
export type ProduitsRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ok'; readonly rows: readonly SupplierOfferRow[] }
  | { readonly kind: 'failed' }
  | { readonly kind: 'not_configured' };

/** What the screen renders. `message` is a catalog KEY — never a literal. */
export type ProduitsView =
  | { readonly kind: 'loading'; readonly message: 'produits.chargement' }
  | { readonly kind: 'not_configured'; readonly message: 'produits.non_configure' }
  | {
      readonly kind: 'failed';
      readonly message: 'produits.lecture_echec';
      /** A previously-read list, or null. NEVER shown unlabelled. */
      readonly staleRows: readonly SupplierOfferRow[] | null;
      /** The label that must accompany `staleRows` whenever it is non-null. */
      readonly staleMessage: 'produits.lecture_echec_cache' | null;
    }
  | { readonly kind: 'empty'; readonly message: 'produits.vide' }
  | { readonly kind: 'list'; readonly rows: readonly SupplierOfferRow[] };

/**
 * THE ONE DECISION. `cached` is the in-memory list from an earlier successful
 * read in this process — never persisted, because a list of offers that no
 * longer exist is a fabrication with a timestamp.
 */
export function produitsView(read: ProduitsRead, cached: readonly SupplierOfferRow[] | null): ProduitsView {
  switch (read.kind) {
    case 'not_configured':
      return { kind: 'not_configured', message: 'produits.non_configure' };
    case 'loading':
      return { kind: 'loading', message: 'produits.chargement' };
    case 'failed':
      // A FAILURE IS A FAILURE, whatever is cached. It never becomes `empty`.
      return {
        kind: 'failed',
        message: 'produits.lecture_echec',
        staleRows: cached,
        staleMessage: cached === null ? null : 'produits.lecture_echec_cache',
      };
    case 'ok':
      // Only a SUCCESSFUL read may say his shop is empty.
      return read.rows.length === 0 ? { kind: 'empty', message: 'produits.vide' } : { kind: 'list', rows: read.rows };
  }
}
