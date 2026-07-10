import { makeHealthFetch } from '@boutik/observability';
import type { Variant } from '@platform/contracts';

/**
 * inventory-service stub (WO-B0.1): Inventory authoring surface (availability service-derived, never client-set).
 * Boutik+ is the authoring surface only (§5.2) — it does not own the domain DB,
 * and canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'inventory-service';

/** The canonical shapes this service will serve views of. */
export type InventoryServiceShapes = { variant: Variant };

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
export * from './stock-reservation.js';
