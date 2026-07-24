import { describe, expect, it } from 'vitest';
import worker, { UPLOAD_PATH, handleMediaUpload } from '../worker/index.js';
import { isOpaqueMediaKey } from '../src/media-key.js';
import type { R2BucketLike, R2ObjectBodyLike } from '../src/media-store.js';

/**
 * MEDIA-UPLOAD-ROUTE-1 — `POST /media`, the first route through which a byte can
 * enter the bucket. Before it, the service could read from a bucket nothing could
 * write to.
 *
 * WHAT THESE TESTS DO NOT PROVE, stated here so a green run is not mistaken for
 * confidence: `env.BUCKET.put` has NEVER executed against real R2. Every store
 * below is the in-memory fake or a hand-written R2-shaped stub. The real write is
 * proven only by the founder uploading a real photograph and opening the returned
 * URL on his phone.
 */

const SECRET = 'test-media-write-secret';
const AT = '2026-07-24T21:00:00.000Z';

function png(w = 800, h = 600): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const be32 = (v: number, at: number) => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(w, 16); be32(h, 20);
  return b;
}

/** An R2-shaped stub that records what was written, so "the bytes reached the store" is an assertion. */
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

const uploadReq = (body: BodyInit, headers: Record<string, string> = {}): Request =>
  new Request(`https://media.boutik.test${UPLOAD_PATH}`, { method: 'POST', body, headers });

describe('the write gate stands in front of the upload route', () => {
  it('401 with NO key — and the bytes never reach the store', async () => {
    const { bucket, objects } = stubBucket();
    const res = await worker.fetch(uploadReq(png()), { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET });
    expect(res.status).toBe(401);
    expect(objects.size).toBe(0); // gate ran BEFORE any storage touch
  });

  it('401 with a WRONG key, byte-identical to the no-key 401 (never an oracle)', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const noKey = await worker.fetch(uploadReq(png()), env);
    const badKey = await worker.fetch(uploadReq(png(), { 'X-Write-Key': 'wrong' }), env);
    expect([noKey.status, badKey.status]).toEqual([401, 401]);
    expect(await noKey.text()).toBe(await badKey.text());
  });

  it('FAILS CLOSED when no secret is configured — a correct-looking key still cannot write', async () => {
    const { bucket, objects } = stubBucket();
    const res = await worker.fetch(uploadReq(png(), { 'X-Write-Key': SECRET }), { BUCKET: bucket }); // secret unset
    expect(res.status).toBe(401);
    expect(objects.size).toBe(0);
  });

  it('READS stay open — the gate never touches GET (the wire consumer holds no key)', async () => {
    const { bucket } = stubBucket();
    const res = await worker.fetch(new Request('https://media.boutik.test/media/not-a-uuid'), { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET });
    expect(res.status).toBe(404); // refused for its SHAPE, not for auth
  });
});

describe('an authorised upload stores the real bytes and returns the opaque ref', () => {
  it('201 with the ref, the DERIVED content type, and the measured dimensions', async () => {
    const { bucket, objects } = stubBucket();
    const res = await worker.fetch(
      uploadReq(png(1024, 768), { 'X-Write-Key': SECRET, 'Content-Type': 'application/json' }), // lying content-type
      { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ref: string; contentType: string; width: number; height: number; byteLength: number };
    expect(isOpaqueMediaKey(body.ref)).toBe(true);
    // the DECLARED content-type was a lie; the sniff decided the truth
    expect(body.contentType).toBe('image/png');
    expect({ w: body.width, h: body.height }).toEqual({ w: 1024, h: 768 });
    // and the real bytes reached the store under that exact ref
    expect(objects.has(body.ref)).toBe(true);
    expect(objects.get(body.ref)!.contentType).toBe('image/png');
  });

  it('the returned ref is immediately readable back through the service (upload → read round-trip)', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const up = await worker.fetch(uploadReq(png(), { 'X-Write-Key': SECRET }), env);
    const { ref } = (await up.json()) as { ref: string };
    const read = await worker.fetch(new Request(`https://media.boutik.test/${ref}`), env);
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('image/png');
  });

  it('the response says NOTHING about the bucket — no bucket name, no storage URL, no account detail', async () => {
    const { bucket } = stubBucket();
    const up = await worker.fetch(uploadReq(png(), { 'X-Write-Key': SECRET }), { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET });
    const raw = await up.text();
    expect(raw).not.toMatch(/bucket|r2|beurni|cloudflare|account/i);
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['byteLength', 'contentType', 'height', 'ref', 'width']);
  });
});

describe('NO caller input can shape the key', () => {
  it('two uploads of the SAME bytes get DIFFERENT opaque refs — content cannot determine the name', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const a = (await (await worker.fetch(uploadReq(png(), { 'X-Write-Key': SECRET }), env)).json()) as { ref: string };
    const b = (await (await worker.fetch(uploadReq(png(), { 'X-Write-Key': SECRET }), env)).json()) as { ref: string };
    expect(a.ref).not.toBe(b.ref);
  });

  it('a filename, a supplier id or a proposed key in HEADERS or QUERY changes nothing about the ref', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const req = new Request(`https://media.boutik.test${UPLOAD_PATH}?key=media/pwned&name=hero.jpg`, {
      method: 'POST',
      body: png(),
      headers: {
        'X-Write-Key': SECRET,
        'X-File-Name': 'supplier-founder-001/hero.jpg',
        'X-Media-Key': 'media/attacker-chosen',
      },
    });
    const { ref } = (await (await worker.fetch(req, env)).json()) as { ref: string };
    expect(isOpaqueMediaKey(ref)).toBe(true); // still exactly media/{uuid}
    expect(ref).not.toContain('pwned');
    expect(ref).not.toContain('hero');
    expect(ref).not.toContain('attacker-chosen');
    expect(ref).not.toContain('supplier-founder-001'); // no identity, so the wire out-guard accepts it
  });
});

describe('validation refusals surface with a READABLE typed reason, never a bare 400', () => {
  it('a non-image body is refused as unsupported_type and stores nothing', async () => {
    const { bucket, objects } = stubBucket();
    const res = await worker.fetch(
      uploadReq(new TextEncoder().encode('<?php echo 1; ?>'), { 'X-Write-Key': SECRET }),
      { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'rejected', reason: 'unsupported_type' });
    expect(objects.size).toBe(0);
  });

  it('an empty body and an out-of-bounds image each name their own reason', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const empty = await worker.fetch(uploadReq(new Uint8Array(0), { 'X-Write-Key': SECRET }), env);
    expect(((await empty.json()) as { reason: string }).reason).toBe('empty');
    const tiny = await worker.fetch(uploadReq(png(50, 50), { 'X-Write-Key': SECRET }), env);
    expect(((await tiny.json()) as { reason: string }).reason).toBe('bad_dimensions');
  });
});

describe('no CORS on this route (it is called by an app, not a browser)', () => {
  it('the upload response carries no Access-Control-Allow-Origin', async () => {
    const { bucket } = stubBucket();
    const res = await handleMediaUpload(uploadReq(png(), { 'X-Write-Key': SECRET }), { BUCKET: bucket }, AT);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
