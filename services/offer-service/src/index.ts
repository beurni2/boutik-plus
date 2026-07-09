import { makeHealthFetch } from '@boutik/observability';
import type { SupplierOffer, CommissionAgreement } from '@platform/contracts';

/**
 * offer-service stub (WO-B0.1): Offer&Pricing authoring surface.
 * Boutik+ is the authoring surface only (§5.2) — it does not own the domain DB,
 * and canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'offer-service';

/** The canonical shapes this service will serve views of. */
export type OfferServiceShapes = { supplierOffer: SupplierOffer; commissionAgreement: CommissionAgreement };

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
