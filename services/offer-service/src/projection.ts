import type { ProductAssets, ProductVersion, SupplierOffer } from '@platform/contracts';
// Type-only: the projection payload contract lives in @platform/certification
// at E1 (promoted into contracts/ when frozen). A type-only import is erased
// at build — certification never enters the runtime graph (it is a
// devDependency; the ban-test enforces this).
import type { SupplyProjectionEventPayloadSchema } from '@platform/certification';
import type { z } from 'zod';

/**
 * B4.2 — supply-to-reseller projection: "Only approved active eligible;
 * never contact/precise pickup/mutable amount; shape matches Shop+'s read."
 * The projection carries EXACTLY the pinned payload contract — SEVEN fields
 * (canon v2.0.0, SUPPLY-DISPLAY-FIELDS-1): the five economics + `productName`
 * + `assetRefs`. No supplier identity, no contact, no pickup location, nothing
 * else. The strict-schema gate + leaking negative fixture enforce it in CI;
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
): ProjectionOutcome {
  if (product.status !== 'active') return { ok: false, reason: 'product_not_active' };
  if (!product.moderationState.startsWith('approved')) return { ok: false, reason: 'product_not_approved' };
  if (offer.status !== 'active') return { ok: false, reason: 'offer_not_active' };
  if (nowIso < offer.effective || nowIso > offer.expiry) return { ok: false, reason: 'offer_not_effective' };

  // EXACTLY the contract fields — building via explicit literals means a
  // supplier id or pickup point is not even expressible here. `productName` is
  // the product's own name (display data is not identity — the ban is on
  // supplier identity/contact/pickup). `assetRefs` is [] — the honest empty of
  // a repo with no image source, never an invented ref or demo URL.
  const projection: SupplyProjection = {
    productVersionId: product.id,
    offerVersion: String(offer.version),
    basePrice: offer.basePrice,
    resellerCommission: offer.resellerCommission,
    available,
    productName: product.name,
    assetRefs: wireAssetRefs(assets),
  };
  return { ok: true, projection };
}
