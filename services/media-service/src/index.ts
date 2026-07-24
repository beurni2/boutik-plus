import { makeHealthFetch } from '@boutik/observability';
import type { ProductAssets } from '@platform/contracts';

/**
 * media-service stub (WO-B0.1): Media authoring surface.
 * Boutik+ is the authoring surface only (§5.2) — it does not own the domain DB,
 * and canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'media-service';

/** The canonical shapes this service will serve views of. */
export type MediaServiceShapes = { productAssets: ProductAssets };

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
export * from './premium-frame.js';
// BOUTIK-MEDIA-1 — the real byte path: the R2-backed store boundary, the opaque
// object key, and the validate→store→revoke pipeline.
export * from './media-store.js';
export * from './media-key.js';
export * from './media.js';
