#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

/**
 * CI gate: no-consumer-storefront architectural check (spec §1: "Boutik+
 * MUST NOT expose a consumer storefront, buyer checkout, direct customer
 * acquisition, or supplier-created buyer orders"; B+I-15).
 * Scans the deployable surfaces (services/, apps/) only — commerce-core's
 * fixture quotes legitimately carry canonical §5.6 field names like
 * amountPaidAtCheckout (camelCase does not trip the word boundary).
 */
runScanGate({
  gateName: 'no-consumer-storefront',
  invariant: 'spec §1 / B+I-15 — no consumer storefront or checkout in Boutik+',
  defaultRoots: ['services', 'apps'],
  patterns: [
    { name: 'storefront', regex: /\bstorefront\b/i },
    { name: 'checkout-route', regex: /\bcheckout\b/i },
    { name: 'cart', regex: /\bcart\b/i },
    { name: 'buyer-order-create', regex: /create[_-]?buyer[_-]?order/i },
  ],
});
