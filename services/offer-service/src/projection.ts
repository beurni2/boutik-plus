import type { ProductAssets, ProductVersion, SellerTrustTier, SupplierOffer } from '@platform/contracts';
// Type-only: the projection payload contract lives in @platform/certification
// at E1 (promoted into contracts/ when frozen). A type-only import is erased
// at build — certification never enters the runtime graph (it is a
// devDependency; the ban-test enforces this).
import type { SupplyProjectionEventPayloadSchema } from '@platform/certification';
import type { z } from 'zod';

/**
 * B4.2 — supply-to-reseller projection: "Only approved active eligible;
 * never contact/precise pickup/mutable amount; shape matches Shop+'s read."
 * The projection carries EXACTLY the pinned payload contract — EIGHT fields
 * (canon v3.0.0): the five economics + `productName` + `assetRefs`
 * (SUPPLY-DISPLAY-FIELDS-1, v2.0.0) + `category` (CATEGORY-WIRE-1, v3.0.0).
 * No supplier identity, no contact, no pickup location, nothing else. The strict-schema gate + leaking negative fixture enforce it in CI;
 * the certification tests parse every emitted projection against the pinned
 * schema itself.
 *
 * `productName` comes straight from `product.name` (name-class, zero
 * transformation). `assetRefs` now carries the product's REAL images
 * (BOUTIK-MEDIA-1): every ref the offer's `ProductAssets` declares EXCEPT the
 * private `masterRef`, hero first — see `wireAssetRefs` for the ordering
 * convention and `ASSET_REFS_MAX` for the cap. A product with no assets still
 * emits `[]`, and that stays a TRUE statement rather than a placeholder: an offer
 * created without images has no ref to emit, and no demo or seed image is ever
 * substituted.
 *
 * `category` comes straight from `product.category` (display string, zero
 * transformation). It is REQUIRED in canon on purpose: an optional category
 * would degrade silently on the Shop+ side — pay-at-door quietly refused, the
 * cautious inspection row quietly shown — so a producer that forgot would be
 * indistinguishable from a product that is genuinely uninspectable.
 */

export type SupplyProjection = z.infer<typeof SupplyProjectionEventPayloadSchema>;

export type ProjectionOutcome =
  | { ok: true; projection: SupplyProjection }
  | { ok: false; reason: 'product_not_active' | 'product_not_approved' | 'offer_not_active' | 'offer_not_effective' };

/**
 * THE WIRE CAP — six refs per product (founder ruling 2026-07-24). The founder's
 * product decision is 3–4 PHOTOGRAPHS; six is the ref budget that decision needs,
 * because canon's `ProductAssets` carries `heroSquare` and `heroVertical` as two
 * separate MediaRefs of ONE photograph (verified: media-service
 * `premium-frame.ts:39-48` derives both — and `proof` — from a single
 * `input.captureRef` with a single `input.sha256`). So four photographs can
 * legitimately produce five or six refs, and a cap of four would reject a real
 * product. `masterRef` is excluded from the count because it never travels.
 *
 * ENFORCED AT THE CREATE COMMAND (`offer-core.ts`), never at the wire, and NEVER
 * by truncation — dropping a supplier's photograph without telling anyone is the
 * same class of dishonesty as a silent demo fallback.
 */
export const ASSET_REFS_MAX = 6;

/**
 * ProductAssets → the flat `assetRefs` the wire carries.
 *
 * INDEX 0 IS THE HERO — a MANDATED convention, not insertion luck (founder
 * ruling). `assetRefs` is a flat `string[]`, so flattening role-structured
 * `ProductAssets` loses which ref is which; the buyer surface needs to know which
 * one is the tile art. Order is therefore the role signal and is fixed here:
 *   [0] heroSquare (THE HERO) · [1] heroVertical · [2] proof · [3…] detail
 *
 * `masterRef` NEVER TRAVELS. It is the private original by construction
 * (`premium-frame.ts:45` writes it as `private/master/…`); a naive "map all of
 * ProductAssets" would put it on the buyer wire. Everything else travels.
 *
 * NO DEDUPLICATION and no reordering: if two roles carry the same ref, both are
 * emitted. Silently collapsing a supplier's declared assets would modify their
 * data without telling them — the same objection as truncation.
 */
export function wireAssetRefs(assets: ProductAssets | undefined): string[] {
  if (assets === undefined) return [];
  return [assets.heroSquare.ref, assets.heroVertical.ref, assets.proof.ref, ...assets.detail.map((d) => d.ref)];
}

export function buildSupplyProjection(
  product: ProductVersion,
  offer: SupplierOffer,
  available: number,
  nowIso: string,
  assets?: ProductAssets,
  /**
   * SELLER-TIER-WIRE-1 — resolved by the CALLER, exactly as `available` and
   * `assets` are, so this stays a pure function with no config or I/O reach.
   * OMITTED ⇒ the field is omitted from the wire (canon v3.1.0 types it
   * optional) ⇒ Shop+'s §6.1 cannot prove « tier ≥ verified » and refuses
   * Option B. Every path where a caller forgets therefore fails CLOSED.
   */
  sellerTier?: SellerTrustTier,
): ProjectionOutcome {
  if (product.status !== 'active') return { ok: false, reason: 'product_not_active' };
  if (!product.moderationState.startsWith('approved')) return { ok: false, reason: 'product_not_approved' };
  if (offer.status !== 'active') return { ok: false, reason: 'offer_not_active' };
  if (nowIso < offer.effective || nowIso > offer.expiry) return { ok: false, reason: 'offer_not_effective' };

  // EXACTLY the contract fields — building via explicit literals means a
  // supplier id or pickup point is not expressible here AS A KEY. `productName`
  // is the product's own name (display data is not identity — the ban is on
  // supplier identity/contact/pickup). `assetRefs` carries the product's real
  // images via `wireAssetRefs` (masterRef excluded, hero first); a product with
  // no assets yields the honest empty [], never an invented ref or demo URL.
  //
  // ⚠ KEYS, NOT VALUES — the limit of that guarantee, stated because the
  // sentence above used to claim more than it delivers (verifier finding).
  // `sweepIdentityKeys` tests key NAMES; only `assetRefs` gets a value-side
  // check (`assertAssetRefsIdentityFree`), because canon states that rule on
  // `AssetRefSchema` alone. So a supplier who types their own phone number into
  // `productName` — or now into `category` — puts it on the wire, and no gate
  // here refuses it. That is the accepted `productName` precedent (canon:
  // « display data is not identity »), not a new hole; `category` widens the
  // unswept surface by one FREE-TEXT field, from ONE to TWO — `productName` and
  // `category`. (`assetRefs` is the third display field but is NOT in this set:
  // it is opaque refs, not free text, and it already HAS a value-side check.)
  // Recorded so the next person weighing a value-side sweep knows the scope.
  const projection: SupplyProjection = {
    productVersionId: product.id,
    offerVersion: String(offer.version),
    basePrice: offer.basePrice,
    resellerCommission: offer.resellerCommission,
    available,
    productName: product.name,
    assetRefs: wireAssetRefs(assets),
    // CATEGORY-WIRE-1 (canon v3.0.0) — the product's OWN category, straight
    // from `product.category`, zero transformation, exactly as `productName`
    // takes `product.name`. It is display data, not identity: the B4.2/SP-I03
    // ban is on supplier identity/contact/pickup, and a category names the
    // PRODUCT, never who supplies it.
    //
    // WHY SHOP+ NEEDS IT, so nobody later reads this as a cosmetic field:
    // Shop+ decides two things with it — whether Option B (pay at the door)
    // may be offered at all (§6.1 « category inspectable ») and which at-door
    // inspection rights the buyer is shown (§6.2's matrix). Until this line
    // existed, Shop+ had no category and read one off the buyer's own request.
    // NO MAPPING AND NO DEFAULT HERE: the supplier's own value travels
    // verbatim. Shop+ allowlists what it recognises and fails closed on the
    // rest, which is the only side that may decide what a category MEANS.
    category: product.category,
    // Spread CONDITIONALLY so an unresolved tier is an ABSENT key rather than
    // an explicit `undefined`: canon's `.strict()` accepts the omission, and an
    // absent field cannot later be misread as « we asked and the answer was
    // nothing ». There is no default here on purpose — a default would be this
    // service answering a question it cannot answer.
    ...(sellerTier !== undefined ? { sellerTier } : {}),
    // VIDEO-PRODUIT (canon v3.4.0) — the short video's bare display ref,
    // exactly as assetRefs carries the images: the ref alone, never the rich
    // MediaRef (sha256/mimeType/durationSec stay producer-side — the 6 s bound
    // was enforced at parse when the assets were STORED, so the wire needs no
    // duration to re-check). Spread conditionally: no video ⇒ ABSENT key,
    // canon's optional — never an explicit undefined. The out-guard's
    // value-side identity check covers this ref too (supply-endpoint.ts).
    ...(assets?.video !== undefined ? { videoRef: assets.video.ref } : {}),
  };
  return { ok: true, projection };
}
