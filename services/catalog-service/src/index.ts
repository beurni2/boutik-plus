import { makeHealthFetch } from '@boutik/observability';
import type { ProductVersion, Variant } from '@platform/contracts';

/**
 * catalog-service stub (WO-B0.1): Catalog authoring surface.
 * Boutik+ is the authoring surface only (§5.2) — it does not own the domain DB,
 * and canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'catalog-service';

/** The canonical shapes this service will serve views of. */
export type CatalogServiceShapes = { productVersion: ProductVersion; variant: Variant };

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
export * from './product.js';
