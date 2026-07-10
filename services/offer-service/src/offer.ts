import {
  SupplierOfferSchema,
  assertQuoteReconciles,
  computeWaterfall,
  type SupplierOffer,
} from '@platform/contracts';

/**
 * B4.1 — offer + commission. The seller sets B (basePrice) and C
 * (seller-funded resellerCommission); the « Vous recevrez X F » net preview
 * comes EXCLUSIVELY from the pinned waterfall — nothing is computed here —
 * and EVERY preview is reconciliation-asserted at runtime (CI: "reconciliation
 * on every quote/offer preview"). The category floor (≥ 5,000 FCFA) blocks
 * below-floor offers closed. Offers are versioned; a change is a new version.
 */

/** B4.1: "category floor ≥5,000". E1 sandbox: every category at the spec minimum. */
export const CATEGORY_FLOOR_FCFA = 5_000;

export interface OfferDraft {
  productVersionId: string;
  basePrice: number;
  resellerCommission: number;
  eligibleVariants: string[];
  zones: string[];
  effective: string;
  expiry: string;
}

export interface NetPreview {
  /** « Vous recevrez X F » — X, straight from the pinned waterfall. */
  sellerNetFcfa: number;
  sellerPlatformFeeFcfa: number;
}

export type OfferOutcome =
  | { ok: true; offer: SupplierOffer; preview: NetPreview }
  | { ok: false; reason: 'below_category_floor' | 'publisher_not_eligible'; floor?: number };

export function previewSellerNet(basePrice: number, resellerCommission: number): NetPreview {
  // ALL money via the pinned waterfall (markup/delivery belong to other
  // domains — zero here isolates the seller-side figures without local math).
  const money = computeWaterfall({
    sellerBasePrice: basePrice,
    sellerFundedCommission: resellerCommission,
    resellerMarkup: 0,
    deliveryFee: 0,
    paymentMode: 'FULL_PREPAY',
  });
  assertQuoteReconciles(money); // runtime law on EVERY preview
  return { sellerNetFcfa: money.sellerNet, sellerPlatformFeeFcfa: money.sellerPlatformFee };
}

export class OfferBook {
  private readonly offers = new Map<string, SupplierOffer>();
  private counter = 0;

  create(draft: OfferDraft, canPublish: boolean): OfferOutcome {
    if (!canPublish) return { ok: false, reason: 'publisher_not_eligible' };
    if (draft.basePrice < CATEGORY_FLOOR_FCFA) {
      return { ok: false, reason: 'below_category_floor', floor: CATEGORY_FLOOR_FCFA };
    }
    const preview = previewSellerNet(draft.basePrice, draft.resellerCommission);
    this.counter += 1;
    const offer = SupplierOfferSchema.parse({
      id: `offer-${this.counter}`,
      productVersionId: draft.productVersionId,
      version: 1,
      basePrice: draft.basePrice,
      resellerCommission: draft.resellerCommission,
      platformFeeVersion: 'fee-v1',
      eligibleVariants: draft.eligibleVariants,
      zones: draft.zones,
      effective: draft.effective,
      expiry: draft.expiry,
      status: 'active',
    });
    this.offers.set(offer.id, offer);
    return { ok: true, offer, preview };
  }

  /** A price change is a NEW offer version — the prior stays immutable. */
  revise(offerId: string, basePrice: number, resellerCommission: number, canPublish: boolean): OfferOutcome {
    const prior = this.offers.get(offerId);
    if (!prior || !canPublish) return { ok: false, reason: 'publisher_not_eligible' };
    if (basePrice < CATEGORY_FLOOR_FCFA) {
      return { ok: false, reason: 'below_category_floor', floor: CATEGORY_FLOOR_FCFA };
    }
    const preview = previewSellerNet(basePrice, resellerCommission);
    const next = SupplierOfferSchema.parse({
      ...prior,
      version: prior.version + 1,
      basePrice,
      resellerCommission,
    });
    this.offers.set(offerId, next);
    return { ok: true, offer: next, preview };
  }

  get(offerId: string): SupplierOffer | undefined {
    return this.offers.get(offerId);
  }
}
