import { makeHealthFetch } from '@boutik/observability';
import type { Package, PackageReadinessConfirmation } from '@platform/contracts';

/**
 * fulfillment-service stub (WO-B0.1): Fulfillment&Package authoring surface.
 * Boutik+ is the authoring surface only (§5.2) — it does not own the domain DB,
 * and canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'fulfillment-service';

/** The canonical shapes this service will serve views of. */
export type FulfillmentServiceShapes = { package: Package; packageReadinessConfirmation: PackageReadinessConfirmation };

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
export * from './fulfillment.js';
export * from './protection.js';
