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
    /**
     * RB-3 (founder direction 2026-08-08: the Gains tab shows « the money
     * share well explained »). SAME class as BC-1c directly above: the gains
     * read is a FOUNDER-ONLY key-C read of Shop+'s `/checkout/gains` door —
     * no buyer surface, no order created, no money moves in Boutik+. The
     * client file is already carved out; these are its test's wire pins and
     * the pointer naming the Shop+ Worker e2e that contract-certifies them.
     */
    { file: 'apps/supplier-app/test/gains-view.test.ts', pattern: 'checkout-route', ruling: 'the gains client’s own wire pins (RB-3)' },
    { file: 'apps/supplier-app/test/gains-view.test.ts', pattern: 'storefront', ruling: 'names the Shop+ storefront Worker e2e as the certification source' },
    /**
     * READINESS-RETURN-1b (founder order 2026-08-02: « Yes build the return
     * signal from Boutik+ »). Boutik+ DELIVERS `fulfillment.accepted.v1` /
     * `fulfillment.ready.v1` to the Shop+ Worker, whose deployed name is
     * `storefront-service` — so the binding must say that word to address it.
     * This is the SAME class as the BC-1c carve-out above, in the other
     * direction: naming another Worker is not exposing a storefront here. No
     * buyer surface, no checkout, no cart, no order created in Boutik+ — and
     * `checkout` and `cart` remain banned in these files, so only the word
     * that names the target is excused.
     */
    { file: 'services/offer-service/worker/fulfillment-do.ts', pattern: 'storefront', ruling: 'names the Shop+ storefront Worker as the DELIVERY TARGET' },
    { file: 'services/offer-service/test/readiness-return.e2e.test.ts', pattern: 'storefront', ruling: 'the return leg’s own delivery pins' },
    /**
     * SE-LIVE-2b — the SAME class again, and the word is not ours to choose.
     * `STOREFRONT` is the wrangler SERVICE BINDING name in
     * services/offer-service/wrangler.toml (binding = "STOREFRONT", service =
     * "storefront-service"), so a miniflare `serviceBindings` key in a test
     * that exercises the outbox MUST spell it exactly to stand in for that
     * Worker. Renaming it would break the binding, not improve the boundary.
     * This test drives Boutik+'s readiness delivery to Séra and asserts the
     * storefront leg stays independent — no buyer surface, no checkout, no
     * cart, no order created in Boutik+, and `checkout`/`cart` remain banned
     * in this file.
     */
    { file: 'services/offer-service/test/sera-readiness.e2e.test.ts', pattern: 'storefront', ruling: 'names the Shop+ storefront Worker as the DELIVERY TARGET binding' },
  ],
});
