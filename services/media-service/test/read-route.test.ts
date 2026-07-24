import { describe, expect, it } from 'vitest';
import worker, { handleMediaRead, type MediaWorkerEnv } from '../worker/index.js';
import { mintMediaKey } from '../src/media-key.js';
import type { R2BucketLike, R2ObjectBodyLike } from '../src/media-store.js';

/**
 * BOUTIK-MEDIA-1 — the read route: private-bucket read, immutable cache header,
 * key-shape gate, and the ORIGIN-SPARING behaviour of the edge cache.
 *
 * HONESTY NOTE (belongs in the test, not just the report): `caches.default` does
 * not exist in this Node test runtime, so the edge-cache BRANCH is exercised here
 * with an injected fake cache, and the no-cache path is exercised by its absence.
 * Whether real Cloudflare populates and serves the colo cache for this route is
 * NOT proven by any test — only by a real deploy.
 */

const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A fake R2 bucket that counts reads — so "the origin was spared" is an assertion, not a hope. */
function fakeBucket(entries: Record<string, { body: string; contentType?: string }>) {
  const reads: string[] = [];
  const bucket: R2BucketLike = {
    put: async () => undefined,
    delete: async () => undefined,
    get: async (key: string): Promise<R2ObjectBodyLike | null> => {
      reads.push(key);
      const hit = entries[key];
      if (!hit) return null;
      return {
        body: new ReadableStream({
          start(c) { c.enqueue(bytesOf(hit.body)); c.close(); },
        }),
        ...(hit.contentType !== undefined ? { httpMetadata: { contentType: hit.contentType } } : {}),
      };
    },
  };
  return { bucket, reads };
}

const req = (key: string): Request => new Request(`https://media.boutik.test/${key}`);

describe('read route — serves the private bucket through the service', () => {
  it('200s with the stored bytes, the stored content-type, and the BOUNDED cache header', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({ [key]: { body: 'IMAGE-BYTES', contentType: 'image/jpeg' } });
    const res = await handleMediaRead(req(key), key, { BUCKET: bucket });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    // BOTH layers bounded so neither outlives a takedown; no `immutable` (it forbids
    // revalidation). The takedown-latency budget itself is pinned in
    // revoke-read.regression.test.ts.
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
    expect(await res.text()).toBe('IMAGE-BYTES');
  });

  it('a MISSING object is an honest 404, never a crash', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({});
    expect((await handleMediaRead(req(key), key, { BUCKET: bucket })).status).toBe(404);
  });

  it('NO BINDING (CI/local) is an honest 404, never a crash and never a fake image', async () => {
    const key = mintMediaKey();
    expect((await handleMediaRead(req(key), key, {} as MediaWorkerEnv)).status).toBe(404);
  });
});

describe('read route — the key-shape gate runs BEFORE any storage lookup', () => {
  it('refuses traversal / identity-keyed / sequential keys WITHOUT ever touching the bucket', async () => {
    const { bucket, reads } = fakeBucket({});
    for (const key of ['media/../private/master/x', 'media/supplier-founder-001/hero.jpg', 'media/1', 'private/master/x']) {
      const res = await handleMediaRead(req(key), key, { BUCKET: bucket });
      expect(res.status, key).toBe(404);
    }
    expect(reads).toEqual([]); // the bucket was never asked — not an existence oracle
  });

  it('the 404 body is IDENTICAL for a malformed key and an absent object (no oracle)', async () => {
    const present = mintMediaKey();
    const { bucket } = fakeBucket({});
    const malformed = await handleMediaRead(req('media/1'), 'media/1', { BUCKET: bucket });
    const absent = await handleMediaRead(req(present), present, { BUCKET: bucket });
    expect(await malformed.text()).toBe(await absent.text());
  });
});

describe('EDGE CACHE — the origin-sparing property (fan-out is the whole point)', () => {
  /** A minimal Cache stand-in with the two methods the route uses. */
  function fakeCache() {
    const store = new Map<string, Response>();
    return {
      cache: {
        match: async (r: Request) => store.get(r.url),
        put: async (r: Request, res: Response) => { store.set(r.url, res); },
      } as unknown as Cache,
      size: () => store.size,
    };
  }

  it('a second read of the same key is served from the edge and NEVER re-reads R2', async () => {
    const key = mintMediaKey();
    const { bucket, reads } = fakeBucket({ [key]: { body: 'BYTES', contentType: 'image/png' } });
    const { cache, size } = fakeCache();
    const globals = globalThis as { caches?: unknown };
    const saved = globals.caches;
    globals.caches = { default: cache };
    try {
      const first = await handleMediaRead(req(key), key, { BUCKET: bucket });
      expect(first.status).toBe(200);
      expect(reads).toEqual([key]); // one origin read
      expect(size()).toBe(1); // populated the edge

      const second = await handleMediaRead(req(key), key, { BUCKET: bucket });
      expect(second.status).toBe(200);
      expect(await second.text()).toBe('BYTES'); // the cached body is intact (clone() worked)
      expect(reads).toEqual([key]); // STILL one — the origin was spared under repeat views
    } finally {
      if (saved === undefined) delete globals.caches;
      else globals.caches = saved;
    }
  });

  it('with NO edge cache present the route still serves correctly (degrades, never breaks)', async () => {
    const key = mintMediaKey();
    const { bucket, reads } = fakeBucket({ [key]: { body: 'BYTES' } });
    const a = await handleMediaRead(req(key), key, { BUCKET: bucket });
    const b = await handleMediaRead(req(key), key, { BUCKET: bucket });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(reads).toEqual([key, key]); // both hit the origin — honest about the cost
  });
});

describe('the worker composes onto the health door and exposes NO upload route', () => {
  it('/health still answers; an unknown route 404s', async () => {
    expect((await worker.fetch(new Request('https://media.boutik.test/health'), {})).status).toBe(200);
    expect((await worker.fetch(new Request('https://media.boutik.test/nope'), {})).status).toBe(404);
  });

  it('POST to the media path is NOT an upload route on this Worker (the write path is out of scope this slice)', async () => {
    const key = mintMediaKey();
    const res = await worker.fetch(new Request(`https://media.boutik.test/${key}`, { method: 'POST' }), {});
    expect(res.status).toBe(404); // falls through to the health door's 404 — no write surface exists
  });
});
