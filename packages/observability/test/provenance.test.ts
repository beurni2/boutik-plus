import { describe, expect, it } from 'vitest';
import { UNSTAMPED, makeHealthFetch, provenance } from '../src/index.js';

/**
 * SERVICE-PROVENANCE-1 — the stamp's UNBUNDLED behaviour. The bundled/stamped
 * path (esbuild `--define` actually substituting) is proven separately against a
 * real artifact in media-service's `provenance-bundle.test.ts` — a fallback test
 * alone would pass even if the define plumbing were broken, which is precisely
 * the failure this slice exists to prevent.
 */

describe('provenance — unstamped builds answer honestly', () => {
  it('falls back to `dev` for both fields when no --define ran', () => {
    expect(provenance()).toEqual({ release: UNSTAMPED, canon: UNSTAMPED });
    expect(UNSTAMPED).toBe('dev');
  });

  it('carries BOTH fields — canon is the one that catches wire-shape drift, so it is never optional', () => {
    const p = provenance();
    expect(Object.keys(p).sort()).toEqual(['canon', 'release']);
    expect(typeof p.release).toBe('string');
    expect(typeof p.canon).toBe('string');
  });
});

describe('the health door carries the stamp', () => {
  it('/health 200 includes service, status, release and canon — and nothing else', async () => {
    const res = makeHealthFetch('probe-service')(new Request('https://probe.test/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      service: 'probe-service',
      status: 'ok',
      release: UNSTAMPED,
      canon: UNSTAMPED,
    });
  });

  it('the 404 branch is UNCHANGED — the stamp is a health answer, not a fingerprint on every response', async () => {
    const res = makeHealthFetch('probe-service')(new Request('https://probe.test/nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ service: 'probe-service', status: 'not_found' });
  });
});
