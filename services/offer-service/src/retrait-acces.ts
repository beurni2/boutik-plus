import type { OfferEntry } from './offer-core.js';

/**
 * ═══ RETRAIT-ACCÈS — CUTTING A SUPPLIER OFF TAKES HIS PRODUCTS WITH HIM ═══
 *
 * Founder, 2026-08-11, in two messages: « these 3 suppliers was cut access from
 * fournisseurs but they are still showing with their products on produits », then
 * « their products and their chip on boutik+ gets removed as well when they have
 * been cut access ». Asked what should happen to products already listed, he
 * chose: **cutting access retires them.**
 *
 * WHY THIS DID NOT USED TO HAPPEN, and why the fix belongs here rather than on
 * the screen: revoking a code deletes two rows in the FULFILLMENT durable
 * object. The offers live in the OFFER one. Nothing joined them, so revocation
 * closed the door and left the shelves stocked — the supplier could no longer
 * log in, and his products kept selling on Shop+ forever.
 *
 * ⚠ « RETIRED » MEANS TAKEN OFF SALE, NEVER DELETED. This is the safest reading
 * of his word and it is deliberate:
 *   · the offer's `status` becomes {@link STATUT_RETIRE}, which the refusal
 *     ladder in `projection.ts` already refuses (`offer_not_active`) — so the
 *     product leaves Shop+'s Opportunités and every vitrine in the same request;
 *   · the entry, its photographs and its history are untouched;
 *   · re-minting that supplier a code puts them all back.
 * Deleting on revocation would be irreversible, would orphan the media, and
 * would make a mis-click cost a supplier his whole catalogue.
 *
 * ⚠ AND IT MUST BE DISTINGUISHABLE FROM EVERY OTHER RETIREMENT — the reason
 * {@link OfferEntry.retraitAcces} exists rather than reading `status` alone. The
 * founder can retire an offer for his own reasons; a re-mint must NOT resurrect
 * those. Only offers this act put away are the ones it brings back.
 *
 * THE MARK IS BOUTIK-LOCAL, NOT CANON. It rides `OfferEntry`, which is this
 * service's own record — canon `SupplierOffer` (§5.6) is untouched, and its
 * `status` is a free string there, so `retiré_accès` is a legal value that the
 * ladder refuses by its existing rule. No contract changed (§7).
 */

/** The offer status a cut-off supplier's products carry. Anything that is not
 *  `active` is refused by `buildSupplyProjection` — this one says WHY. */
export const STATUT_RETIRE = 'retiré_accès';

/**
 * Retire one entry because its supplier's access was cut. `null` means NO
 * CHANGE, so a caller can skip a storage write it does not need.
 *
 * AN ALREADY-RETIRED OFFER IS LEFT EXACTLY AS IT IS, whatever retired it: if the
 * founder had put it away himself, this act must not claim it, or the re-mint
 * would resurrect a product he deliberately pulled.
 */
export function retirerPourAcces(entry: OfferEntry, at: string): OfferEntry | null {
  if (entry.offer.status !== 'active') return null;
  return { ...entry, offer: { ...entry.offer, status: STATUT_RETIRE }, retraitAcces: at };
}

/**
 * Put back what this act put away, and NOTHING else — the mark is the whole
 * test. An entry the founder retired by other means has no mark and is left
 * alone; an entry already live has no mark either. `null` means no change.
 */
export function restaurerApresAcces(entry: OfferEntry): OfferEntry | null {
  if (entry.retraitAcces === undefined) return null;
  const { retraitAcces: _oublie, ...reste } = entry;
  return { ...reste, offer: { ...entry.offer, status: 'active' } };
}

/**
 * Is this entry hidden from the founder's own screens because its supplier was
 * cut off? His instruction was that the products AND the supplier's chip
 * disappear from Produits — so the reads his screen makes drop these, and the
 * chip row, which is derived from who owns visible products, empties itself.
 *
 * NOTHING IS LOST BY HIDING THEM, which is what makes this safe: they are off
 * Shop+ too, so an invisible product is not a product still being sold. That was
 * the whole harm in the INVENTAIRE-COMPLET report, and this act removes it at
 * the source instead of relying on him to find and delete each one.
 */
export function estRetireAcces(entry: OfferEntry): boolean {
  return entry.retraitAcces !== undefined;
}
