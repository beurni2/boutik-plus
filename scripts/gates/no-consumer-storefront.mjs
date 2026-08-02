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
  /**
   * BC-1c (founder-approved proposal, 2026-08-02: « I approve the proposal »
   * — the dispatch view lives in HIS console and reads Shop+'s
   * CHECKOUT_OPS_SECRET-gated `/checkout/dispatch`). That is a FOUNDER-ONLY
   * OPS READ of another Worker's door, not a consumer checkout in Boutik+ —
   * no buyer ever touches this surface, no order is created here, no money
   * moves here. The carve-out names exactly the client file and its test;
   * the word `checkout` anywhere else in Boutik+ still fails B+I-15.
   */
  allow: [
    { file: 'apps/supplier-app/src/operations/dispatch-service.ts', pattern: 'checkout-route', ruling: 'BC-1c founder-approved dispatch read of Shop+' },
    { file: 'apps/supplier-app/src/operations/dispatch-service.ts', pattern: 'storefront', ruling: 'names the Shop+ storefront Worker as the READ TARGET' },
    { file: 'apps/supplier-app/test/operations-console.test.ts', pattern: 'checkout-route', ruling: 'the dispatch client’s own wire pins' },
  ],
});
