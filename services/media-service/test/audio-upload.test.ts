import { describe, expect, it } from 'vitest';
import worker, { AUDIO_UPLOAD_PATH } from '../worker/index.js';
import { isOpaqueMediaKey } from '../src/media-key.js';
import { AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, ProductMediaService, sniffAudio } from '../src/media.js';
import { resolveMediaStore } from '../src/media-store.js';
import type { R2BucketLike, R2ObjectBodyLike } from '../src/media-store.js';

/**
 * REPERE-AUDIO-REEL — the voice-note door (founder order 2026-08-08).
 *
 * What matters: the TYPE comes from magic bytes, never a claim (WebM's EBML
 * head, Ogg's capture pattern, the MP4 family's ftyp); the byte ceiling is the
 * wall for the containers that carry no cheap clock; the MP4 family's clock IS
 * read and bounded; the same write gate stands in front; and a stored note
 * reads back through the public media route with the DERIVED content type —
 * the whole road the founder's Commandes player will drive.
 */

const SECRET = 'test-media-write-secret';
const AT = '2026-08-08T00:00:00.000Z';

/* ------------------------------------------------------------- fixtures -- */

const w32 = (b: Uint8Array, at: number, v: number): void => {
  b[at] = (v >>> 24) & 255; b[at + 1] = (v >>> 16) & 255; b[at + 2] = (v >>> 8) & 255; b[at + 3] = v & 255;
};

function boxOf(type: string, payload: Uint8Array): Uint8Array {
  const b = new Uint8Array(8 + payload.length);
  w32(b, 0, b.length);
  for (let i = 0; i < 4; i += 1) b[4 + i] = type.charCodeAt(i);
  b.set(payload, 8);
  return b;
}
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
function mvhdV0(timescale: number, duration: number): Uint8Array {
  const p = new Uint8Array(100);
  w32(p, 12, timescale);
  w32(p, 16, duration);
  return boxOf('mvhd', p);
}
const FTYP = boxOf('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]));
const m4aOf = (seconds: number): Uint8Array =>
  concat(FTYP, boxOf('moov', mvhdV0(1_000, Math.round(seconds * 1_000))));

/** A WebM note: the EBML head phones actually emit, padded like real Opus data. */
const webmNote = (extra = 64): Uint8Array => {
  const b = new Uint8Array(4 + extra).fill(0x42);
  b[0] = 0x1a; b[1] = 0x45; b[2] = 0xdf; b[3] = 0xa3;
  return b;
};
/** An Ogg note: the 'OggS' capture pattern. */
const oggNote = (): Uint8Array => {
  const b = new Uint8Array(64).fill(0x01);
  b[0] = 0x4f; b[1] = 0x67; b[2] = 0x67; b[3] = 0x53;
  return b;
};
/** JPEG magic — a photo pushed at the audio door. */
const jpeg = (): Uint8Array => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

/* ---------------------------------------------------------------- stubs -- */

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

const service = (bucket: R2BucketLike) => new ProductMediaService(resolveMediaStore({ BUCKET: bucket }));

const audioReq = (body: BodyInit, headers: Record<string, string> = {}): Request =>
  new Request(`https://media.boutik.test${AUDIO_UPLOAD_PATH}`, { method: 'POST', body, headers });

/* ---------------------------------------------------------------- tests -- */

describe('sniffAudio — magic bytes decide, never a claim', () => {
  it('recognises the three containers phones emit, refuses a photo and silence', () => {
    expect(sniffAudio(webmNote())).toBe('webm');
    expect(sniffAudio(oggNote())).toBe('ogg');
    expect(sniffAudio(m4aOf(5))).toBe('mp4');
    expect(sniffAudio(jpeg())).toBeNull();
    expect(sniffAudio(new Uint8Array(0))).toBeNull();
  });
});

describe('uploadAudio — every refusal named, the MP4 clock bounded, WebM/Ogg on the byte wall', () => {
  it('accepts a WebM note: opaque key, audio/webm derived from bytes, no invented duration', async () => {
    const { bucket, objects } = stubBucket();
    const out = await service(bucket).uploadAudio(webmNote(), AT);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(isOpaqueMediaKey(out.audio.key)).toBe(true);
    expect(out.audio.contentType).toBe('audio/webm');
    expect(out.audio.durationSeconds).toBeNull(); // no cheap honest clock — null, never a guess
    expect(objects.get(out.audio.key)?.contentType).toBe('audio/webm');
  });

  it('accepts Ogg and the MP4 family; the MP4 clock is MEASURED and bounded', async () => {
    const { bucket } = stubBucket();
    const svc = service(bucket);
    const ogg = await svc.uploadAudio(oggNote(), AT);
    expect(ogg.ok && ogg.audio.contentType === 'audio/ogg').toBe(true);
    const m4a = await svc.uploadAudio(m4aOf(29), AT);
    expect(m4a.ok).toBe(true);
    if (!m4a.ok) throw new Error('unreachable');
    expect(m4a.audio.contentType).toBe('audio/mp4');
    expect(m4a.audio.durationSeconds).toBeCloseTo(29, 3);
    expect(await svc.uploadAudio(m4aOf(AUDIO_MAX_SECONDS + 1), AT)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('empty · oversize · a photo — refused with their own names', async () => {
    const { bucket } = stubBucket();
    const svc = service(bucket);
    expect(await svc.uploadAudio(new Uint8Array(0), AT)).toEqual({ ok: false, reason: 'empty' });
    expect(await svc.uploadAudio(webmNote(AUDIO_MAX_BYTES), AT)).toEqual({ ok: false, reason: 'too_large' });
    expect(await svc.uploadAudio(jpeg(), AT)).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});

describe('POST /media/audio — the deployed door, gate first, then the whole read-back road', () => {
  it('no key and a wrong key are the uniform 401 — nothing reaches the bucket', async () => {
    const { bucket, objects } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    expect((await worker.fetch(audioReq(webmNote()), env)).status).toBe(401);
    expect((await worker.fetch(audioReq(webmNote(), { 'X-Write-Key': 'wrong' }), env)).status).toBe(401);
    expect(objects.size).toBe(0);
  });

  it('SEAM: a keyed WebM note stores 201 {ref}, and the PUBLIC read route serves the very bytes back as audio/webm', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const note = webmNote(200);
    const res = await worker.fetch(audioReq(note, { 'X-Write-Key': SECRET }), env);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ref: string; contentType: string; durationSeconds: number | null; byteLength: number };
    expect(isOpaqueMediaKey(body.ref)).toBe(true);
    expect(body.contentType).toBe('audio/webm');
    expect(body.byteLength).toBe(note.length);
    // The founder's player drives exactly this: GET /{ref}, open by design.
    const read = await worker.fetch(new Request(`https://media.boutik.test/${body.ref}`), env);
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('audio/webm');
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(note);
  });

  it('a refusal names its reason on the wire — a photo at the audio door', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const res = await worker.fetch(audioReq(jpeg(), { 'X-Write-Key': SECRET }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'rejected', reason: 'unsupported_type' });
  });
});
