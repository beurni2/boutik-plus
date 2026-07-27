import { describe, expect, it } from 'vitest';
import worker from '../worker/index.js';
import type { R2BucketLike, R2ObjectBodyLike } from '../src/media-store.js';

/**
 * BOUTIK-WEB-W4 — CORS at media-service's deployed entry. The route's own old
 * comment said "NO CORS, deliberately: this is called by the supplier app, not
 * a browser" — and the founder's web ruling overturned that premise: the
 * supplier app IS a browser now, and a browser preflights a POST carrying
 * `X-Write-Key` and refuses any response without Access-Control-Allow-Origin.
 * Same three properties the offer-service CORS tests pin: the preflight
 * answers, the real response is stamped, and NEITHER weakens the write gate.
 */
const SECRET = 'test-media-write-secret';

function png(w = 800, h = 600): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const be32 = (v: number, at: number) => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(w, 16); be32(h, 20);
  return b;
}

const memoryBucket = (): R2BucketLike => {
  const objects = new Map<string, Uint8Array>();
  return {
    put: async (key, value) => { objects.set(key, value); return undefined; },
    delete: async (key) => { objects.delete(key); },
    get: async (key): Promise<R2ObjectBodyLike | null> => {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return { body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) };
    },
  };
};

describe('CORS — the browser can ask, the media write key still gates (BOUTIK-WEB-W4)', () => {
  it('a bare OPTIONS preflight (no key — browsers strip custom headers) answers 204 with the grants and touches no storage', async () => {
    const res = await worker.fetch(
      new Request('http://m/media', {
        method: 'OPTIONS',
        headers: { Origin: 'https://boutik.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-write-key' },
      }),
      {}, // NO bucket, NO secret — a fall-through to handle() would answer 200/404 (health), never 204, so the 204 pins the dedicated preflight path
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Write-Key');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('an authed upload is 201 AND stamped — without the stamp the browser discards the ref and the publish path dies', async () => {
    const res = await worker.fetch(
      new Request('http://m/media', { method: 'POST', headers: { 'X-Write-Key': SECRET }, body: png() }),
      { MEDIA_WRITE_SECRET: SECRET, BUCKET: memoryBucket() },
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('CORS does NOT weaken the gate: the unkeyed POST is still 401 — and stamped, so the app renders its designed refusal instead of an opaque network error', async () => {
    const res = await worker.fetch(
      new Request('http://m/media', { method: 'POST', body: png() }),
      { MEDIA_WRITE_SECRET: SECRET, BUCKET: memoryBucket() },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('the read route is stamped on a cache MISS (Node has no edge cache, so this is the no-cache path)', async () => {
    const env = { MEDIA_WRITE_SECRET: SECRET, BUCKET: memoryBucket() };
    const up = await worker.fetch(
      new Request('http://m/media', { method: 'POST', headers: { 'X-Write-Key': SECRET }, body: png() }),
      env,
    );
    const { ref } = (await up.json()) as { ref: string };
    const read = await worker.fetch(new Request(`http://m/${ref}`), env);
    expect(read.status).toBe(200);
    expect(read.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('a cache HIT is stamped too, exactly once, and the hit never re-puts — the cache stores UNSTAMPED copies and the wrapper stamps every exit (W4 verifier finding: the old test NAME claimed this without asserting it)', async () => {
    // a caches.default fake so the edge path runs in Node — installed for this
    // test only and removed in finally, so no other file inherits an edge cache.
    const stored = new Map<string, Response>();
    let putCount = 0;
    const fakeCache = {
      match: async (req: Request) => {
        const hit = stored.get(req.url);
        return hit === undefined ? undefined : hit.clone();
      },
      put: async (req: Request, res: Response) => {
        putCount += 1;
        stored.set(req.url, res);
      },
    };
    const g = globalThis as { caches?: unknown };
    g.caches = { default: fakeCache };
    try {
      const env = { MEDIA_WRITE_SECRET: SECRET, BUCKET: memoryBucket() };
      const up = await worker.fetch(
        new Request('http://m/media', { method: 'POST', headers: { 'X-Write-Key': SECRET }, body: png() }),
        env,
      );
      const { ref } = (await up.json()) as { ref: string };

      const miss = await worker.fetch(new Request(`http://m/${ref}`), env);
      expect(miss.status).toBe(200);
      expect(miss.headers.get('Access-Control-Allow-Origin')).toBe('*');
      // THE PROPERTY: the CACHED copy is unstamped — the stamp never poisons the cache
      expect(putCount).toBe(1);
      expect(stored.get(`http://m/${ref}`)?.headers.get('Access-Control-Allow-Origin')).toBeNull();

      const hit = await worker.fetch(new Request(`http://m/${ref}`), env);
      expect(hit.status).toBe(200);
      expect(hit.headers.get('Access-Control-Allow-Origin')).toBe('*'); // exactly '*', never '*, *'
      expect(putCount).toBe(1); // the hit never re-put
    } finally {
      delete g.caches;
    }
  });
});
