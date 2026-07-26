import type { HiddenReason, SupplierOfferRow } from './service';

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

export type { HiddenReason };

/**
 * WHY RESELLERS DO NOT SEE THIS OFFER — the sentence, chosen PURELY.
 *
 * CORRECTED after a verifier finding: the first version mapped
 * `offer_not_effective` to « Cette offre a dépassé sa date », **which is false
 * for half of its own trigger.** `projection.ts` refuses with that one reason
 * for BOTH `now < effective` AND `now > expiry`, and the near end is not
 * hypothetical — `authoring.ts` backdates `effective` by
 * `CLOCK_SKEW_ALLOWANCE_DAYS` precisely because a phone whose clock runs fast
 * writes an `effective` in the future. A seller on a 3-days-fast phone would
 * have been told his minutes-old product had "passed its date".
 *
 * The wire gives one reason, so the app says the one thing that is TRUE of both
 * halves: resellers are not seeing it. **The precise sentence needs the offer's
 * `effective`/`expiry`, which the row does not carry — and carrying them is
 * exactly the visible-expiry half of the open 365-day gap. Flagged, not
 * invented.**
 */
export function hiddenSentence(reason: HiddenReason): string {
  switch (reason) {
    case 'offer_not_effective':
      // TRUE whether the window has passed or has not yet opened. States the
      // fact, offers nothing — there is no renewal path to offer.
      return 'produits.hors_fenetre';
    case 'product_not_active':
    case 'product_not_approved':
    case 'offer_not_active':
      return 'produits.retiree';
  }
}

/**
 * WHAT THE TILE SHOWS WHERE A PHOTOGRAPH GOES. Three different facts, and the
 * first two were collapsed into one sentence (verifier finding): « Sans photo »
 * was also what an app with an UNSET `EXPO_PUBLIC_MEDIA_BASE` said about a
 * product that HAS photographs. An absence claimed on the strength of a missing
 * config is the same family as the demo glyph this slice removed.
 */
export type PhotoSlot =
  | { readonly kind: 'photo'; readonly uri: string }
  | { readonly kind: 'none'; readonly message: 'produits.sans_photo' }
  | { readonly kind: 'unavailable'; readonly message: 'produits.photo_non_configure' };

export function photoSlot(assetRefs: readonly string[], mediaBase: string | null): PhotoSlot {
  const ref = assetRefs[0];
  // No refs is an honest absence WHATEVER the config: he uploaded none.
  if (ref === undefined || ref.trim() === '') return { kind: 'none', message: 'produits.sans_photo' };
  // He HAS photographs and we cannot fetch them — never call that "sans photo".
  if (mediaBase === null) return { kind: 'unavailable', message: 'produits.photo_non_configure' };
  return { kind: 'photo', uri: `${mediaBase}/${ref}` };
}

/**
 * THE FICHE'S PHOTO GALLERY (founder device ruling 2026-07-26: tap a product,
 * see ALL its photographs). Pure — refs in, labelled URIs out.
 *
 * `assetRefs` is WIRE ORDER by construction: [heroSquare, heroVertical, proof,
 * ...detail]. The labels follow that order and never guess: a list longer than
 * three numbers its details, a list shorter simply has fewer photographs. The
 * master is excluded UPSTREAM by `wireAssetRefs`; the guard here is
 * belt-and-braces so a service regression cannot render a private ref.
 */
export interface GalleryPhoto {
  readonly label: string;
  readonly uri: string;
}
const GALLERY_LABELS = ['Héro', 'Héro (vertical)', 'Preuve'] as const;
export function galleryPhotos(assetRefs: readonly string[], mediaBase: string | null): readonly GalleryPhoto[] {
  if (mediaBase === null) return [];
  return assetRefs
    .filter((ref) => ref.trim() !== '' && !ref.startsWith('private/'))
    .map((ref, i) => ({
      label: GALLERY_LABELS[i] ?? `Détail ${i - GALLERY_LABELS.length + 1}`,
      uri: `${mediaBase}/${ref}`,
    }));
}
