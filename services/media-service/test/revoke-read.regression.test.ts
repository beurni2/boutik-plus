import { describe, expect, it } from 'vitest';
import {
  BROWSER_MAX_AGE_S,
  CACHE_CONTROL,
  EDGE_MAX_AGE_S,
  handleMediaRead,
  makeEdgeCachePurge,
} from '../worker/index.js';
import { ProductMediaService } from '../src/media.js';
import { InMemoryMediaStore, type R2BucketLike, type R2ObjectBodyLike } from '../src/media-store.js';

/**
 * REGRESSION — REVOKE → READ (founder ruling 2026-07-24; MANDATORY, because the
 * defect existed precisely because this test did not).
 *
 * THE ROOT ERROR being locked out: content-immutability was conflated with
 * authorization-permanence. New uploads mint new keys, so bytes at a key never
 * change — which made a year-long `immutable` cache look free. Revocation is not
 * the content changing, it is ACCESS BEING REVOKED, and the header was set for
 * the wrong property. A revoked image kept serving 200 forever.
 *
 * The property these tests pin is BOUNDED-LATENCY REVOCATION, not instant
 * takedown — stated honestly, including the window that remains.
 */

const ORIGIN = 'https://media.boutik.test';
const AT = '2026-07-24T10:00:00.000Z';

function png(w = 400, h = 400): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const be32 = (v: number, at: number) => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(w, 16); be32(h, 20);
  return b;
}

/** An R2 stand-in backed by the same map the InMemoryMediaStore writes, so revoke really removes the origin copy. */
function bucketOver(store: InMemoryMediaStore) {
  const reads: string[] = [];
  const bucket: R2BucketLike = {
    put: async () => undefined,
    delete: async (k) => { await store.remove(k); },
    get: async (k): Promise<R2ObjectBodyLike | null> => {
      reads.push(k);
      const o = store.objects.get(k);
      if (!o) return null;
      return {
        body: new ReadableStream({ start(c) { c.enqueue(o.bytes); c.close(); } }),
        httpMetadata: { contentType: o.contentType },
      };
    },
  };
  return { bucket, reads };
}

/** A colo-local cache stand-in with the three methods the route + purge use. */
function fakeColo() {
  const store = new Map<string, Response>();
  return {
    cache: {
      match: async (r: Request) => store.get(r.url),
      put: async (r: Request, res: Response) => { store.set(r.url, res); },
      delete: async (r: Request) => store.delete(r.url),
    } as unknown as Cache,
    size: () => store.size,
  };
}

async function withColo<T>(cache: Cache, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as { caches?: unknown };
  const saved = g.caches;
  g.caches = { default: cache };
  try { return await fn(); } finally {
    if (saved === undefined) delete g.caches; else g.caches = saved;
  }
}

describe('the cache headers are a TAKEDOWN-LATENCY BUDGET, not a performance knob', () => {
  it('no `immutable` anywhere — it forbids revalidation, which is what made the hole unclosable', () => {
    expect(CACHE_CONTROL).not.toMatch(/immutable/);
  });

  it('both layers are BOUNDED: browser 5 min, edge 1 h — neither may outlive a takedown', () => {
    expect(BROWSER_MAX_AGE_S).toBe(300);
    expect(EDGE_MAX_AGE_S).toBe(3600);
    expect(CACHE_CONTROL).toBe('public, max-age=300, s-maxage=3600');
    // the specific regression: a year-long TTL must never come back
    expect(CACHE_CONTROL).not.toMatch(/31536000/);
  });

  it('the served response carries exactly that header', async () => {
    const store = new InMemoryMediaStore();
    const svc = new ProductMediaService(store);
    const up = await svc.upload(png(), AT);
    if (!up.ok) throw new Error('setup');
    const { bucket } = bucketOver(store);
    const res = await handleMediaRead(new Request(`${ORIGIN}/${up.image.key}`), up.image.key, { BUCKET: bucket });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
  });
});

describe('REVOKE → READ: the image stops being served on the colo that served it', () => {
  it('read 200 · revoke · read 404 — the exact sequence that used to return 200 twice', async () => {
    const store = new InMemoryMediaStore();
    const { cache } = fakeColo();
    // the purge hook the Worker wires in production
    const svc = new ProductMediaService(store, makeEdgeCachePurge(ORIGIN));
    const up = await svc.upload(png(), AT);
    if (!up.ok) throw new Error('setup');
    const key = up.image.key;
    const { bucket } = bucketOver(store);
    const req = new Request(`${ORIGIN}/${key}`);

    await withColo(cache, async () => {
      const before = await handleMediaRead(req, key, { BUCKET: bucket });
      expect(before.status).toBe(200); // live, and now cached at the colo

      await svc.revoke(key); // origin object destroyed + colo purged

      const after = await handleMediaRead(req, key, { BUCKET: bucket });
      expect(after.status).toBe(404); // THE REGRESSION: this used to be 200 from cache
      expect(store.objects.has(key)).toBe(false); // and the origin copy is genuinely gone
    });
  });

  it('replace also stops the OLD ref resolving, while the new one serves', async () => {
    const store = new InMemoryMediaStore();
    const { cache } = fakeColo();
    const svc = new ProductMediaService(store, makeEdgeCachePurge(ORIGIN));
    const first = await svc.upload(png(400, 400), AT);
    if (!first.ok) throw new Error('setup');
    const { bucket } = bucketOver(store);

    await withColo(cache, async () => {
      expect((await handleMediaRead(new Request(`${ORIGIN}/${first.image.key}`), first.image.key, { BUCKET: bucket })).status).toBe(200);
      const second = await svc.replace(first.image.key, png(800, 800), AT);
      if (!second.ok) throw new Error('replace refused');
      expect((await handleMediaRead(new Request(`${ORIGIN}/${first.image.key}`), first.image.key, { BUCKET: bucket })).status).toBe(404);
      expect((await handleMediaRead(new Request(`${ORIGIN}/${second.image.key}`), second.image.key, { BUCKET: bucket })).status).toBe(200);
    });
  });
});

describe('the honest remainder — what the purge does NOT cover (bounded, not instant)', () => {
  it('a colo the purge never reached KEEPS SERVING until its TTL — this is the stated residual window, not a bug', async () => {
    const store = new InMemoryMediaStore();
    const otherColo = fakeColo(); // a different colo's cache: the purge below never touches it
    // purge points at the RIGHT origin but this colo is simply elsewhere — modelled by
    // purging a cache the read never consults.
    const svc = new ProductMediaService(store, makeEdgeCachePurge('https://another-colo.invalid'));
    const up = await svc.upload(png(), AT);
    if (!up.ok) throw new Error('setup');
    const key = up.image.key;
    const { bucket } = bucketOver(store);
    const req = new Request(`${ORIGIN}/${key}`);

    await withColo(otherColo.cache, async () => {
      expect((await handleMediaRead(req, key, { BUCKET: bucket })).status).toBe(200);
      await svc.revoke(key); // origin gone; THIS colo not purged
      const after = await handleMediaRead(req, key, { BUCKET: bucket });
      // Still 200 — the residual window. It is bounded by s-maxage=3600, where it
      // was previously a year of `immutable` with nothing able to close it.
      expect(after.status).toBe(200);
      expect(store.objects.has(key)).toBe(false); // origin really is gone
    });
    expect(EDGE_MAX_AGE_S).toBe(3600); // …and that window is one hour, by ruling
  });

  it('with no cache at all (CI/Node), revoke is immediate — nothing to outlive it', async () => {
    const store = new InMemoryMediaStore();
    const svc = new ProductMediaService(store, makeEdgeCachePurge(ORIGIN));
    const up = await svc.upload(png(), AT);
    if (!up.ok) throw new Error('setup');
    const { bucket } = bucketOver(store);
    await svc.revoke(up.image.key);
    const res = await handleMediaRead(new Request(`${ORIGIN}/${up.image.key}`), up.image.key, { BUCKET: bucket });
    expect(res.status).toBe(404);
  });
});
