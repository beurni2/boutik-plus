import { defineConfig } from 'vitest/config';

/**
 * BOUTIK-OFFER-DURABLE-1 — the service runs two Miniflare workerd suites (the
 * OfferDO e2e and the combined Worker + auth e2e). Real workerd startup +
 * on-disk-persist restarts exceed vitest's 5 s default, so the miniflare e2e get
 * headroom. The fast unit suites are unaffected (they finish in ms).
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
