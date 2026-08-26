import { describe, expect, it } from 'vitest';
import { SupplierOfferSchema, computeWaterfall } from '@platform/contracts';
import { CATEGORY_FLOOR_FCFA, OfferBook, previewSellerNet } from '../src/offer.js';

const draft = {
  productVersionId: 'pv-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  eligibleVariants: ['var-1'],
  zones: ['Gounghin'],
  effective: '2026-07-10T00:00:00.000Z',
  expiry: '2026-08-10T00:00:00.000Z',
};

describe('offer + net preview — B4.1, reconciliation on EVERY preview', () => {
  it('§5.4 baseline through the OFFER path: « Vous recevrez 9 000 F » — sellerNet from the pinned waterfall, literally (FRAIS-ZERO)', () => {
    const preview = previewSellerNet(10_000, 1_000);
    expect(preview.sellerNetFcfa).toBe(9_000);
    expect(preview.sellerPlatformFeeFcfa).toBe(0); // FRAIS-ZERO (founder 2026-08-25): rate 0
    // 9,000 = B − 0 − C, asserted against the pin, not re-derived here.
    const w = computeWaterfall({ sellerBasePrice: 10_000, sellerFundedCommission: 1_000, resellerMarkup: 0, deliveryFee: 0, paymentMode: 'FULL_PREPAY' });
    expect(preview.sellerNetFcfa).toBe(w.sellerNet);
  });

  it('non-divisible case through the OFFER path reconciles and matches the pin exactly (B 10,001 · C 333)', () => {
    const preview = previewSellerNet(10_001, 333);
    const w = computeWaterfall({ sellerBasePrice: 10_001, sellerFundedCommission: 333, resellerMarkup: 0, deliveryFee: 0, paymentMode: 'FULL_PREPAY' });
    expect(preview.sellerNetFcfa).toBe(w.sellerNet);
    expect(preview.sellerPlatformFeeFcfa).toBe(w.sellerPlatformFee);
    // previewSellerNet runs assertQuoteReconciles internally; reaching here
    // with pin-identical figures IS the runtime reconciliation proof.
  });

  it('CATEGORY FLOOR: an offer below 5,000 FCFA is blocked closed with the floor named', () => {
    const book = new OfferBook();
    expect(book.create({ ...draft, basePrice: 4_999 }, true)).toEqual({
      ok: false,
      reason: 'below_category_floor',
      floor: CATEGORY_FLOOR_FCFA,
    });
    expect(book.create({ ...draft, basePrice: 5_000 }, true).ok).toBe(true); // the floor itself passes
  });

  it('ineligible publisher refused; offers are canonical and versioned — a price change bumps the version', () => {
    const book = new OfferBook();
    expect(book.create(draft, false)).toEqual({ ok: false, reason: 'publisher_not_eligible' });
    const created = book.create(draft, true);
    if (!created.ok) throw new Error('setup');
    expect(SupplierOfferSchema.safeParse(created.offer).success).toBe(true);
    expect(created.offer.version).toBe(1);
    const revised = book.revise(created.offer.id, 12_000, 1_000, true);
    expect(revised.ok && revised.offer.version).toBe(2);
    const below = book.revise(created.offer.id, 4_000, 1_000, true);
    expect(below).toMatchObject({ ok: false, reason: 'below_category_floor' });
  });
});
