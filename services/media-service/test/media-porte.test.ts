import { describe, expect, it } from 'vitest';
import worker, { THUMB_UPLOAD_PATH, THUMB_TOKEN_HEADER } from '../worker/index.js';
import type { R2BucketLike, R2ObjectBodyLike } from '../src/media-store.js';

/**
 * MEDIA-PORTE-1 (AUDIT-B+2 slice 8) — the media doors, at the deployed entry.
 *
 * F-41 · a stranger holding the bundled upload key and a ref read off a public
 *        page could plant a product's buyer-tile picture inside the vignette's
 *        fifteen-minute window. The photograph's upload now answers a one-time
 *        token, and only that token opens the vignette door for that photograph.
 * F-43 · with no R2 binding the store fell back to memory: 201 and a ref that
 *        404s. Every write door now answers 503 `storage_unbound`.
 * F-44 · a malformed percent-escape threw out of the read route (uncaught, no
 *        CORS). It is now the same honest 404 as any key that is not minted.
 *
 * Driven through `worker.fetch` — the export the deployed entry re-exports —
 * so the gate order, the CORS stamp and the routing are the ones that ship.
 */

const SECRET = 'test-media-write-secret';
const REVOKE = 'test-media-revoke-secret';
const ORIGIN = 'https://media.boutik.test';

/** A real PNG header — the service sniffs magic bytes and reads the IHDR. */
function png(w: number, h: number, bytes = 64): Uint8Array {
  const b = new Uint8Array(Math.max(64, bytes));
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const be32 = (v: number, at: number): void => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(w, 16);
  be32(h, 20);
  return b;
}

/** A 1 s MP4 the video door can measure: ftyp · moov(mvhd). */
function mp4(): Uint8Array {
  const box = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + body.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(body, 8);
    return out;
  };
  const mvhd = new Uint8Array(100);
  new DataView(mvhd.buffer).setUint32(12, 1000); // timescale
  new DataView(mvhd.buffer).setUint32(16, 1000); // duration → 1 s
  const ftyp = box('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]));
  const moov = box('moov', box('mvhd', mvhd));
  const all = new Uint8Array(ftyp.length + moov.length);
  all.set(ftyp, 0);
  all.set(moov, ftyp.length);
  return all;
}

/**
 * An R2-shaped bucket that keeps what R2 keeps — bytes, content type, the
 * custom metadata and the upload time — so the token's home is the real one.
 */
function bucket(): R2BucketLike & { objects: Map<string, { bytes: Uint8Array; meta?: Record<string, string> }> } {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string; meta?: Record<string, string>; at: Date }>();
  return {
    objects,
    put: async (key, value, options) => {
      objects.set(key, {
        bytes: value,
        at: new Date(),
        ...(options?.httpMetadata?.contentType !== undefined ? { contentType: options.httpMetadata.contentType } : {}),
        ...(options?.customMetadata !== undefined ? { meta: { ...options.customMetadata } } : {}),
      });
      return undefined;
    },
    delete: async (key) => {
      objects.delete(key);
    },
    get: async (key): Promise<R2ObjectBodyLike | null> => {
      const o = objects.get(key);
      if (o === undefined) return null;
      return {
        body: new Response(o.bytes).body,
        size: o.bytes.byteLength,
        ...(o.contentType !== undefined ? { httpMetadata: { contentType: o.contentType } } : {}),
      };
    },
    head: async (key) => {
      const o = objects.get(key);
      return o === undefined ? null : { uploaded: o.at, ...(o.meta !== undefined ? { customMetadata: o.meta } : {}) };
    },
  };
}

const post = (path: string, body: BodyInit, headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', body, headers: { 'X-Write-Key': SECRET, ...headers } });

const thumbUrl = (parent: string): string => `${THUMB_UPLOAD_PATH}?for=${encodeURIComponent(parent)}`;

describe('F-41 — only the photograph’s own upload can give it a vignette', () => {
  it('the upload answers a one-time token, and the read route never gives it back', async () => {
    const b = bucket();
    const env = { BUCKET: b, MEDIA_WRITE_SECRET: SECRET };
    const up = await worker.fetch(post('/media', png(1280, 1280)), env);
    expect(up.status).toBe(201);
    const body = (await up.json()) as { ref: string; thumbToken?: unknown };
    expect(typeof body.thumbToken).toBe('string');
    expect(body.thumbToken).toMatch(/^[0-9a-f-]{36}$/);
    // Two uploads, two tokens: it is minted per photograph, never shared.
    const other = (await (await worker.fetch(post('/media', png(1280, 1280)), env)).json()) as { thumbToken: string };
    expect(other.thumbToken).not.toBe(body.thumbToken);
    // The public read serves bytes and their type — nothing of the metadata.
    const read = await worker.fetch(new Request(`${ORIGIN}/${body.ref}`), env);
    expect(read.status).toBe(200);
    for (const [, v] of read.headers) expect(v).not.toContain(body.thumbToken as string);
  });

  it('THE STRANGER: bundled key + the ref off a page, inside the window — refused, nothing stored', async () => {
    const b = bucket();
    const env = { BUCKET: b, MEDIA_WRITE_SECRET: SECRET };
    const { ref } = (await (await worker.fetch(post('/media', png(1280, 1280)), env)).json()) as { ref: string };
    const sans = await worker.fetch(post(thumbUrl(ref), png(320, 320, 8_000)), env);
    expect(sans.status).toBe(403);
    expect(await sans.json()).toEqual({ error: 'rejected', reason: 'wrong_token' });
    const faux = await worker.fetch(
      post(thumbUrl(ref), png(320, 320, 8_000), { [THUMB_TOKEN_HEADER]: '00000000-0000-4000-8000-000000000000' }),
      env,
    );
    expect(faux.status).toBe(403);
    expect(b.objects.has(`${ref}~t`), 'no stranger’s picture on the board').toBe(false);
  });

  it('the app, holding its own token, stores the vignette once', async () => {
    const b = bucket();
    const env = { BUCKET: b, MEDIA_WRITE_SECRET: SECRET };
    const { ref, thumbToken } = (await (await worker.fetch(post('/media', png(1280, 1280)), env)).json()) as {
      ref: string;
      thumbToken: string;
    };
    const ok = await worker.fetch(post(thumbUrl(ref), png(320, 320, 8_000), { [THUMB_TOKEN_HEADER]: thumbToken }), env);
    expect(ok.status).toBe(201);
    expect(b.objects.get(`${ref}~t`)?.bytes.byteLength).toBe(8_000);
    // The token opens nothing twice: the slot is write-once.
    const again = await worker.fetch(post(thumbUrl(ref), png(320, 320, 9_000), { [THUMB_TOKEN_HEADER]: thumbToken }), env);
    expect(again.status).toBe(409);
    expect(b.objects.get(`${ref}~t`)?.bytes.byteLength).toBe(8_000);
  });

  it('one photograph’s token does not open another’s door', async () => {
    const b = bucket();
    const env = { BUCKET: b, MEDIA_WRITE_SECRET: SECRET };
    const a = (await (await worker.fetch(post('/media', png(1280, 1280)), env)).json()) as { ref: string; thumbToken: string };
    const c = (await (await worker.fetch(post('/media', png(1280, 1280)), env)).json()) as { ref: string; thumbToken: string };
    const croise = await worker.fetch(post(thumbUrl(c.ref), png(320, 320, 8_000), { [THUMB_TOKEN_HEADER]: a.thumbToken }), env);
    expect(croise.status).toBe(403);
    expect(b.objects.has(`${c.ref}~t`)).toBe(false);
  });

  it('a photograph stored before the token existed can never gain a vignette', async () => {
    const b = bucket();
    const env = { BUCKET: b, MEDIA_WRITE_SECRET: SECRET };
    const PARENT = 'media/33333333-3333-4333-8333-333333333333';
    await b.put(PARENT, png(1280, 1280), { httpMetadata: { contentType: 'image/png' } }); // no customMetadata
    for (const token of ['', 'undefined', 'null']) {
      const res = await worker.fetch(post(thumbUrl(PARENT), png(320, 320, 8_000), { [THUMB_TOKEN_HEADER]: token }), env);
      expect(res.status, JSON.stringify(token)).toBe(403);
    }
    expect(b.objects.has(`${PARENT}~t`)).toBe(false);
  });

  it('the browser may send the token: the preflight allows its header', async () => {
    const pre = await worker.fetch(new Request(`${ORIGIN}${THUMB_UPLOAD_PATH}`, { method: 'OPTIONS' }), {});
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Headers')?.split(',').map((h) => h.trim())).toContain(THUMB_TOKEN_HEADER);
  });
});

describe('F-43 — no storage bound is said, never faked', () => {
  const env = { MEDIA_WRITE_SECRET: SECRET, MEDIA_REVOKE_SECRET: REVOKE }; // no BUCKET
  const PARENT = 'media/44444444-4444-4444-8444-444444444444';
  const doors: [string, () => Request][] = [
    ['photo', () => post('/media', png(1280, 1280))],
    ['video', () => post('/media/video', mp4())],
    ['audio', () => post('/media/audio', new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3, 4]))],
    ['vignette', () => post(thumbUrl(PARENT), png(320, 320, 8_000), { [THUMB_TOKEN_HEADER]: 'x' })],
    [
      'revoke',
      () =>
        new Request(`${ORIGIN}/media/revoke`, {
          method: 'POST',
          body: JSON.stringify({ ref: PARENT }),
          headers: { 'Content-Type': 'application/json', 'X-Write-Key': REVOKE },
        }),
    ],
  ];
  for (const [name, req] of doors) {
    it(`${name}: 503 storage_unbound — never a 2xx with a ref nothing holds`, async () => {
      const res = await worker.fetch(req(), env);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ service: 'media-service', status: 'unavailable', reason: 'storage_unbound' });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  }

  it('the gate still answers first: no key, no word about storage', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/media`, { method: 'POST', body: png(1280, 1280) }), env);
    expect(res.status).toBe(401);
  });
});

describe('F-44 — a broken escape is an honest 404, never a crash', () => {
  it('GET /media/%E0%A4%A answers the typed 404 with its CORS stamp', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/media/%E0%A4%A`), { BUCKET: bucket() });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ service: 'media-service', status: 'not_found', reason: 'unknown_media_key' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('the same answer as a well-formed key nobody minted — never an oracle', async () => {
    const env = { BUCKET: bucket() };
    const casse = await worker.fetch(new Request(`${ORIGIN}/media/%E0%A4%A`), env);
    const inconnu = await worker.fetch(new Request(`${ORIGIN}/media/55555555-5555-4555-8555-555555555555`), env);
    expect(casse.status).toBe(inconnu.status);
    expect(await casse.text()).toBe(await inconnu.text());
  });
});
