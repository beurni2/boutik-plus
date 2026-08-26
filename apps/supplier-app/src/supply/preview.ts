import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';

/**
 * THE SELLER-NET PREVIEW ON THE REAL FLOW — canon rounding, founder ruling
 * 2026-07-25: "The real flow computes its preview through THE CANON-CORRECT
 * ROUNDING, by whatever function already implements the RoundingLaw properly."
 *
 * WHY THIS FILE EXISTS RATHER THAN AN IMPORT OF THE SERVICE'S `previewSellerNet`
 * (services/offer-service/src/offer.ts): that function is correct — it is the
 * same five lines below — but it lives in a Cloudflare Worker service package
 * that this Expo app does not and cannot depend on. So this is a second CALL
 * SITE, not a second IMPLEMENTATION: the law itself has exactly one home,
 * `@platform/contracts` money/rounding-law.js, and both call it.
 *
 * THE LAW (RoundingLaw v1, pinned canon — rate 0 since FRAIS-ZERO, founder
 * order 2026-08-25):
 *   sellerPlatformFee = floor(rate × B)   — 0 at today's rate; the fraction of
 *                                           a franc stays with the participant
 *   sellerNet         = B − C − fee       — by subtraction, never an
 *                                           independent multiplication
 *
 * WHAT THIS REPLACES ON THIS FLOW: the frozen V2 demo math (`v2/money.ts` §3.4)
 * computes `Math.round(B × 0.05)`. Round and floor agree for every B the
 * stepper can reach today (multiples of 500), so this changes no figure the
 * founder can currently see — it removes a LATENT divergence, so that the day
 * the price grid changes, his preview does not quietly start rounding a franc
 * the wrong way on a real listing. `money.ts` is untouched; the demo board
 * still uses it.
 *
 * NO try/catch — and the reason stated precisely, because a loose version of
 * this sentence was wrong (verifier finding, MEDIUM). `computeWaterfall` throws
 * `RangeError` on non-integer or negative inputs. Today no such input is
 * reachable: `WIZ_SET` is dispatched for B/C at exactly two places
 * (`screens2.tsx` steps 2 minus-handlers), and BOTH are wrapped in
 * `!disabled.wizB(w)` / `!disabled.wizC(w)`, so B floors at 500 and C at 0.
 *
 * **THE BOUND IS ENFORCED AT THOSE CALL SITES, NOT IN THE REDUCER.**
 * `machine.ts` declares `disabled.wizB`/`wizC` as predicates but its `WIZ_SET`
 * case is a plain spread with no validation. So the guarantee is a property of
 * the current dispatchers, not of the state machine — a future dispatcher that
 * omits the guard reintroduces it.
 *
 * THAT MATTERS BECAUSE THIS CALL CHANGES THE FAILURE MODE: before, a negative B
 * rendered a wrong number; now it throws during render, and the app has no
 * error boundary, so it would be a blank screen mid-listing. Swallowing it in a
 * catch is still the wrong trade — it would hide exactly the money-law
 * violation this call exists to surface — but the risk is named here rather
 * than argued away, and is flagged to the founder as its own decision.
 */
export interface SellerPreview {
  /** « Vous recevez / vente » — B − C − fee, canon. */
  readonly sellerNetFcfa: number;
  /** floor(rate × B) — the seller platform fee, canon (0 at the FRAIS-ZERO rate). */
  readonly sellerPlatformFeeFcfa: number;
}

/**
 * WHAT THE WIZARD IS HANDED FOR THE SELLER-NET LINE — a figure, or a refusal
 * that names its own reason.
 *
 * This replaces the earlier `SellerPreview | null`. Null carried the ABSENCE,
 * which was enough while only one rule could cause it (below the price floor).
 * The commission ruling (2026-07-25) adds a second, with different words, so
 * the reason travels beside the absence rather than being inferred at the
 * render site.
 */
export type SellerNetLine =
  | { readonly kind: 'figure'; readonly net: SellerPreview }
  /** `reasonKey` is an i18n catalog key — the screen states it, never invents it. */
  | { readonly kind: 'refused'; readonly reasonKey: string };

export function previewSellerNet(basePrice: number, resellerCommission: number): SellerPreview {
  // Markup and delivery belong to other domains; zero here isolates the
  // seller-side figures without this app doing any money arithmetic of its own.
  const money = computeWaterfall({
    sellerBasePrice: basePrice,
    sellerFundedCommission: resellerCommission,
    resellerMarkup: 0,
    deliveryFee: 0,
    paymentMode: 'FULL_PREPAY',
  });
  assertQuoteReconciles(money); // the runtime law, on EVERY preview
  return { sellerNetFcfa: money.sellerNet, sellerPlatformFeeFcfa: money.sellerPlatformFee };
}
