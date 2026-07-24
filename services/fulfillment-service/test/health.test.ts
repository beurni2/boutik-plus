import { describe, expect, it } from 'vitest';
import { UNSTAMPED } from '@boutik/observability';
import worker, { SERVICE_NAME } from '../src/index.js';

describe(SERVICE_NAME, () => {
  it('serves /health and names itself', async () => {
    const res = worker.fetch(new Request('https://fulfillment-service.boutik.internal/health'));
    expect(res.status).toBe(200);
    // SERVICE-PROVENANCE-1: unbundled (no esbuild --define) → the honest `dev`.
    expect(await res.json()).toEqual({ service: SERVICE_NAME, status: 'ok', release: UNSTAMPED, canon: UNSTAMPED });
  });

  it('unknown routes are 404 — no features at this slice', () => {
    const res = worker.fetch(new Request('https://fulfillment-service.boutik.internal/anything'));
    expect(res.status).toBe(404);
  });
});
