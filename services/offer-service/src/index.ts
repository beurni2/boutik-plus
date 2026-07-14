import type { SupplierOffer, CommissionAgreement } from '@platform/contracts';
import { SupplyRegistry, founderOneSupply, makeSupplyFetch } from './supply-endpoint.js';

/**
 * offer-service (WO-B0.1 stub → SW-1): Offer&Pricing authoring surface + the
 * supply READ-MODEL endpoint (founder ruling 2026-07-15: Option B, HTTP pull).
 * Boutik+ is the authoring surface only (§5.2) — it does not own the domain
 * DB, and canonical shapes are imported from the pin, never redefined. The
 * pilot registry holds Founder-as-Supplier-#001 (a normal SELLER_HELD
 * account), minted through the REAL command path; GET /supply-projection/:pv
 * serves the pinned projection, /health and unknown routes fall through to the
 * shared health door.
 */

/** The canonical shapes this service serves views of. */
export type OfferServiceShapes = { supplierOffer: SupplierOffer; commissionAgreement: CommissionAgreement };

// The pilot's single-supplier state — founder-#001's supply written at startup.
const pilotRegistry = new SupplyRegistry();
pilotRegistry.register(founderOneSupply(new Date().toISOString()));

export const handleRequest = makeSupplyFetch(pilotRegistry);

export default { fetch: handleRequest };
export * from './offer.js';
export * from './projection.js';
export * from './supply-endpoint.js';
