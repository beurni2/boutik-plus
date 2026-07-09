import { makeHealthFetch } from '@boutik/observability';
import type { User, SellerTrustState } from '@platform/contracts';

/**
 * supplier-service stub (WO-B0.1): supplier onboarding/verification views (Risk/Moderation owns SellerTrustState).
 * Boutik+ is the authoring surface only (§5.2) — it does not own the domain DB,
 * and canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'supplier-service';

/** The canonical shapes this service will serve views of. */
export type SupplierServiceShapes = { user: User; sellerTrustState: SellerTrustState };

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
