import type { SupplierOffer, CommissionAgreement } from '@platform/contracts';
import { InMemoryOfferStore } from './offer-store.js';
import { makeSupplyFetch, seedFounderOne } from './supply-endpoint.js';

/**
 * offer-service (WO-B0.1 stub → SW-1 → BOUTIK-OFFER-DURABLE-1): Offer&Pricing
 * authoring surface + the supply READ-MODEL endpoint. Boutik+ is the authoring
 * surface only (§5.2); canonical shapes come from the pin, never redefined.
 *
 * THIS module entry is the IN-MEMORY composition (CI / local / tests): the pilot
 * store holds Founder-as-Supplier-#001, seeded through the REAL command path
 * (`OfferBook.create` inside `decideCreateOffer`); GET /supply-projection/:pv
 * serves the pinned projection. The DEPLOYED entry is `worker/index.ts` — the
 * combined Worker with the per-offer Durable Object and the write gate. CI binds
 * no DO, so `resolveOfferStore` here can only ever be in-memory.
 */

/** The canonical shapes this service serves views of. */
export type OfferServiceShapes = { supplierOffer: SupplierOffer; commissionAgreement: CommissionAgreement };

const pilotStore = new InMemoryOfferStore();
const seeded = seedFounderOne(pilotStore, new Date().toISOString());
const supplyFetch = makeSupplyFetch(pilotStore);

export const handleRequest = async (request: Request): Promise<Response> => {
  await seeded; // founder-#001 persisted before the first read
  return supplyFetch(request);
};

export default { fetch: handleRequest };
export * from './offer.js';
export * from './offer-core.js';
export * from './offer-store.js';
export * from './projection.js';
export * from './supply-endpoint.js';
