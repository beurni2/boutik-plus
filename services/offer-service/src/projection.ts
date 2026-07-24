import type { ProductVersion, SupplierOffer } from '@platform/contracts';
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
 * `assetRefs` is emitted as an EMPTY ARRAY, and that is a TRUE statement, not a
 * placeholder: boutik has no image source at all today (no ProductAssets on the
 * create command, no durable media store), so there is no ref to emit. NAMED GAP
 * — assetRefs stays [] until boutik's media service is durable, R2-backed and
 * deployed AND the offer create command carries assets. `productName` comes
 * straight from `product.name` (name-class, zero transformation).
 */

export type SupplyProjection = z.infer<typeof SupplyProjectionEventPayloadSchema>;

export type ProjectionOutcome =
  | { ok: true; projection: SupplyProjection }
  | { ok: false; reason: 'product_not_active' | 'product_not_approved' | 'offer_not_active' | 'offer_not_effective' };

export function buildSupplyProjection(
  product: ProductVersion,
  offer: SupplierOffer,
  available: number,
  nowIso: string,
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
    assetRefs: [],
  };
  return { ok: true, projection };
}
