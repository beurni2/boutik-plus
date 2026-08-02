import { describe, expect, it } from 'vitest';
import worker, { REVOKE_PATH } from '../worker/index.js';
import type { R2BucketLike, R2ObjectBodyLike } from '../src/media-store.js';

/**
 * MEDIA-REVOKE-1 — `POST /media/revoke`, the route that cleans a deleted
 * product's bytes (founder 2026-07-27: *"continue the cleaning of the bytes
 * after the delete"*). Full-stack through `worker.fetch`, so the write gate,
 * the CORS wrapper, and the dispatch are all in the frame.
 *
 * WHAT THESE TESTS DO NOT PROVE (same honesty as the upload-route file):
 * `env.BUCKET.delete` has never executed against real R2 here — every bucket is
 * a stub. The real deletion is proven by the founder deleting a product and
 * watching its photo URL die.
 */

const SECRET = 'test-media-write-secret';
const REVOKE_SECRET = 'test-media-revoke-secret';
const ORIGIN = 'https://media.boutik.test';

function png(w = 800, h = 600): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const be32 = (v: number, at: number) => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(w, 16); be32(h, 20);
  return b;
}

/** An R2-shaped stub whose map is the assertion surface for "the origin object is gone". */
function stubBucket() {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const bucket: R2BucketLike = {
    put: async (key, value, options) => {
      objects.set(key, { bytes: value, ...(options?.httpMetadata?.contentType !== undefined ? { contentType: options.httpMetadata.contentType } : {}) });
      return undefined;
    },
    delete: async (key) => { objects.delete(key); },
    get: async (key): Promise<R2ObjectBodyLike | null> => {
      const o = objects.get(key);
      if (!o) return null;
      return {
        body: new ReadableStream({ start(c) { c.enqueue(o.bytes); c.close(); } }),
        ...(o.contentType !== undefined ? { httpMetadata: { contentType: o.contentType } } : {}),
      };
    },
  };
  return { bucket, objects };
}

/** A colo-local cache stand-in (same shape the revoke-read regression uses). */
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

const env = (bucket: R2BucketLike) => ({ BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET, MEDIA_REVOKE_SECRET: REVOKE_SECRET });

async function uploadOne(bucket: R2BucketLike): Promise<string> {
  const res = await worker.fetch(
    new Request(`${ORIGIN}/media`, { method: 'POST', headers: { 'X-Write-Key': SECRET }, body: png() }),
    env(bucket),
  );
  if (res.status !== 201) throw new Error(`setup upload failed: ${res.status}`);
  return ((await res.json()) as { ref: string }).ref;
}

const revokeReq = (body: BodyInit, headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}${REVOKE_PATH}`, { method: 'POST', body, headers });

describe('MEDIA-KEY-SPLIT — destruction answers ONLY to the founder-only revoke secret', () => {
  it('an unkeyed revoke is 401, CORS-stamped, and the object SURVIVES', async () => {
    const { bucket, objects } = stubBucket();
    const ref = await uploadOne(bucket);
    const res = await worker.fetch(revokeReq(JSON.stringify({ ref })), env(bucket));
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*'); // the browser can READ its designed refusal
    expect(objects.has(ref)).toBe(true); // gate ran before any storage touch
    const read = await worker.fetch(new Request(`${ORIGIN}/${ref}`), env(bucket));
    expect(read.status).toBe(200);
  });

  it('THE SPLIT ITSELF: the UPLOAD key — the one that ships in app bundles — can no longer revoke; the object survives it', async () => {
    const { bucket, objects } = stubBucket();
    const ref = await uploadOne(bucket);
    const res = await worker.fetch(revokeReq(JSON.stringify({ ref }), { 'X-Write-Key': SECRET }), env(bucket));
    expect(res.status).toBe(401);
    expect(objects.has(ref)).toBe(true);
  });

  it('and the REVOKE key cannot upload — two capabilities, two credentials, neither implies the other', async () => {
    const { bucket, objects } = stubBucket();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/media`, { method: 'POST', headers: { 'X-Write-Key': REVOKE_SECRET }, body: png() }),
      env(bucket),
    );
    expect(res.status).toBe(401);
    expect(objects.size).toBe(0);
  });

  it('FAIL CLOSED: with no revoke secret configured, EVERY revoke is 401 — including one presenting the correct write key', async () => {
    const { bucket, objects } = stubBucket();
    const ref = await uploadOne(bucket);
    const half = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET }; // deployed before its secret exists ⇒ shut, not open
    for (const headers of [{}, { 'X-Write-Key': SECRET }, { 'X-Write-Key': REVOKE_SECRET }]) {
      const res = await worker.fetch(revokeReq(JSON.stringify({ ref }), headers), half);
      expect(res.status, JSON.stringify(headers)).toBe(401);
    }
    expect(objects.has(ref)).toBe(true);
    // and the upload path is untouched by the missing revoke secret
    const up = await worker.fetch(
      new Request(`${ORIGIN}/media`, { method: 'POST', headers: { 'X-Write-Key': SECRET }, body: png() }),
      half,
    );
    expect(up.status).toBe(201);
  });
});

describe('revoke destroys the origin object and the read dies with it', () => {
  it('upload → revoke 200 → the object is GONE from the store and the read answers 404', async () => {
    const { bucket, objects } = stubBucket();
    const ref = await uploadOne(bucket);
    expect(objects.has(ref)).toBe(true);

    const res = await worker.fetch(revokeReq(JSON.stringify({ ref }), { 'X-Write-Key': REVOKE_SECRET }), env(bucket));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'revoked', ref });

    expect(objects.has(ref)).toBe(false); // the origin copy, dead
    const read = await worker.fetch(new Request(`${ORIGIN}/${ref}`), env(bucket));
    expect(read.status).toBe(404);
  });

  it('a REPLAY answers the same 200 revoked — idempotent, so a retry after a lost response converges', async () => {
    const { bucket } = stubBucket();
    const ref = await uploadOne(bucket);
    const first = await worker.fetch(revokeReq(JSON.stringify({ ref }), { 'X-Write-Key': REVOKE_SECRET }), env(bucket));
    const second = await worker.fetch(revokeReq(JSON.stringify({ ref }), { 'X-Write-Key': REVOKE_SECRET }), env(bucket));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: 'revoked', ref });
  });

  it('NEIGHBOUR SAFETY: revoking one object leaves the other serving 200', async () => {
    const { bucket } = stubBucket();
    const doomed = await uploadOne(bucket);
    const neighbour = await uploadOne(bucket);
    await worker.fetch(revokeReq(JSON.stringify({ ref: doomed }), { 'X-Write-Key': REVOKE_SECRET }), env(bucket));
    const dead = await worker.fetch(new Request(`${ORIGIN}/${doomed}`), env(bucket));
    const alive = await worker.fetch(new Request(`${ORIGIN}/${neighbour}`), env(bucket));
    expect(dead.status).toBe(404);
    expect(alive.status).toBe(200);
  });

  it('purges the SERVING COLO: a cached read stops answering immediately, not at TTL', async () => {
    const { bucket } = stubBucket();
    const { cache, size } = fakeColo();
    await withColo(cache, async () => {
      const ref = await uploadOne(bucket);
      const first = await worker.fetch(new Request(`${ORIGIN}/${ref}`), env(bucket));
      expect(first.status).toBe(200);
      expect(size()).toBe(1); // the colo now holds it
      await worker.fetch(revokeReq(JSON.stringify({ ref }), { 'X-Write-Key': REVOKE_SECRET }), env(bucket));
      expect(size()).toBe(0); // best-effort purge fired against the SAME origin the read populated
      const after = await worker.fetch(new Request(`${ORIGIN}/${ref}`), env(bucket));
      expect(after.status).toBe(404);
    });
  });
});

describe('the shape gate refuses anything that is not an opaque minted key — before any storage touch', () => {
  it('malformed bodies and non-opaque refs are a 400 naming the param, and the store is untouched', async () => {
    const { bucket, objects } = stubBucket();
    const ref = await uploadOne(bucket);
    const bodies = [
      'not json',
      JSON.stringify(null),
      JSON.stringify({}),
      JSON.stringify({ ref: 42 }),
      JSON.stringify({ ref: 'media/not-a-uuid' }),
      JSON.stringify({ ref: '../secrets' }),
      JSON.stringify({ ref: `${ref}/../${ref}` }),
    ];
    for (const body of bodies) {
      const res = await worker.fetch(revokeReq(body, { 'X-Write-Key': REVOKE_SECRET }), env(bucket));
      expect(res.status, body).toBe(400);
      expect(((await res.json()) as { param?: string }).param, body).toBe('ref');
    }
    expect(objects.has(ref)).toBe(true); // nothing was destroyed by any refused shape
  });
});
