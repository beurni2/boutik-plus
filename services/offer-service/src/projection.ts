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
 * The projection carries EXACTLY the pinned payload contract — five fields,
 * no supplier identity, no contact, no pickup location, nothing else. The
 * strict-schema gate + leaking negative fixture enforce it in CI; the
 * certification tests parse every emitted projection against the pinned
 * schema itself.
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
  // supplier id or pickup point is not even expressible here.
  const projection: SupplyProjection = {
    productVersionId: product.id,
    offerVersion: String(offer.version),
    basePrice: offer.basePrice,
    resellerCommission: offer.resellerCommission,
    available,
  };
  return { ok: true, projection };
}
