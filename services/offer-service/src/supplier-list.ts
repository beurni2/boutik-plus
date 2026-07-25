import type { OfferEntry } from './offer-core.js';
import { buildSupplyProjection, wireAssetRefs } from './projection.js';

/**
 * THE SUPPLIER-FACING LIST (PRODUITS-READ-1, founder rulings 2026-07-25).
 *
 * A DIFFERENT AUDIENCE FROM THE SUPPLY WIRE, and that is the whole reason this
 * file exists rather than another branch inside `supply-endpoint.ts`:
 *   · `/supply-projection*` answers SHOP+ — a service, over `SUPPLY_READ_SECRET`,
 *     carrying reseller-facing cost data. The app must never hold that key.
 *   · this answers A SUPPLIER about the offers he NAMES, over the shared write
 *     key that already ships in his bundle.
 *
 * **THE SCOPE IS A FILTER, NOT AN AUTHORIZATION — and the difference is not
 * cosmetic** (verifier finding, demonstrated against real workerd). The caller
 * supplies `supplierId`; nothing binds it to the credential. So ANY holder of
 * the bundle-shipped write key can read ANY supplier's `basePrice` and
 * `resellerCommission` by naming their id, and `supplier-founder-001` is a
 * guessable template. `worker/index.ts` says this same class of data on
 * `/supply-projections` must be gated **more** carefully, by a secret that never
 * leaves two Workers — so the two routes disagree about how sensitive it is.
 *
 * **RESIDUAL TODAY: NIL — there is exactly one supplier. THE DAY THERE ARE TWO
 * IT IS REAL, and it is journaled as an OPEN hazard, not a closed one.** The
 * credential reuse is a founder ruling and stands; what is corrected here is the
 * CLAIM, which previously read "reading his own offers is strictly less
 * sensitive than creating them". The route does not enforce "his own".
 *
 * ONE ROTATION KILLS BOTH PUBLISHING AND THE PRODUCT LIST. Correct for a
 * bundle-shipped key — a leak should close both doors — written down here and in
 * JOURNAL.md so the next rotation does not surprise anyone with a blank tab.
 */

/** What a supplier sees for ONE of his offers. */
export interface SupplierOfferRow {
  readonly offerId: string;
  readonly productVersionId: string;
  readonly name: string;
  readonly category: string;
  readonly basePrice: number;
  readonly resellerCommission: number;
  readonly available: number;
  /**
   * The product's photographs, in WIRE ORDER (hero first, master excluded) —
   * derived by the SAME `wireAssetRefs` the supply projection uses, so the app
   * and Shop+ can never disagree about which image is the hero. `[]` is the
   * honest empty for an offer published without photographs.
   */
  readonly assetRefs: readonly string[];
  /** His variants, HIS TYPED WORDS, verbatim. Absent when he typed none. */
  readonly variantsNote?: string;
  /**
   * WHY SHOP+ IS NOT SHOWING THIS, when it is not — the refusal ladder's OWN
   * reason, not a local re-derivation. Absent means the ladder passes and the
   * offer is live to resellers right now.
   *
   * THIS FIELD IS THE POINT OF THE ROUTE'S HONESTY (founder ruling: "SHOW THEM,
   * MARKED"). The admin list reads durable entries DIRECTLY, so without this an
   * offer past its expiry would appear here as live while the vitrine had
   * already dropped it — a fresh instance of the silent-disappearance family,
   * created by this very read. Deriving it from `buildSupplyProjection` rather
   * than from a local `now > expiry` is what stops the two drifting: one ladder,
   * one home.
   */
  readonly hiddenReason?: 'product_not_active' | 'product_not_approved' | 'offer_not_active' | 'offer_not_effective';
}

/** The envelope — same `{asOf, items}` shape and SERVE clock as the supply collection. */
export interface SupplierOfferList {
  /** The SERVE clock (the asOf reversal, founder ruling 2026-07-24), never a write time. */
  readonly asOf: string;
  readonly items: readonly SupplierOfferRow[];
}

/**
 * Build one supplier's list. PURE — entries in, rows out.
 *
 * SCOPED BY CONSTRUCTION: only entries whose `product.supplierId` matches are
 * returned. The route refuses a MISSING scope rather than calling this with a
 * wildcard, because the index (`IndexRow`) carries no supplierId and so a
 * scope-less list would be every supplier's offers — correct today only because
 * there is one supplier, which is exactly the kind of fact that changes.
 */
export function buildSupplierList(
  supplierId: string,
  entries: readonly OfferEntry[],
  nowIso: string,
): SupplierOfferList {
  const items: SupplierOfferRow[] = [];
  for (const entry of entries) {
    if (entry.product.supplierId !== supplierId) continue;
    const built = buildSupplyProjection(entry.product, entry.offer, entry.available, nowIso, entry.assets);
    const row: SupplierOfferRow = {
      offerId: entry.offerId,
      productVersionId: entry.product.id,
      name: entry.product.name,
      category: entry.product.category,
      basePrice: entry.offer.basePrice,
      resellerCommission: entry.offer.resellerCommission,
      available: entry.available,
      assetRefs: wireAssetRefs(entry.assets),
      ...(entry.variantsNote === undefined ? {} : { variantsNote: entry.variantsNote }),
      ...(built.ok ? {} : { hiddenReason: built.reason }),
    };
    items.push(row);
  }
  return { asOf: nowIso, items };
}
