import { describe, expect, it } from 'vitest';
import worker, { VIDEO_UPLOAD_PATH } from '../worker/index.js';
import { isOpaqueMediaKey } from '../src/media-key.js';
import {
  mp4DurationSeconds,
  ProductMediaService,
  sniffMp4,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
} from '../src/media.js';
import { resolveMediaStore } from '../src/media-store.js';
import type { R2BucketLike, R2ObjectBodyLike } from '../src/media-store.js';

/**
 * VIDEO-PRODUIT-1b — the founder's 6-second bound, MEASURED at the door.
 *
 * The properties that matter: the duration comes from the container's own
 * `mvhd` box, never a claim; an unreadable container REFUSES (a bound you can
 * dodge by malforming a header is a suggestion); a photo on the video route
 * refuses; and the same write gate stands in front — with the fixtures below
 * built byte-by-byte in this file, so what is parsed is exactly what is known.
 */

const SECRET = 'test-media-write-secret';
const AT = '2026-08-03T00:00:00.000Z';

/* ----------------------------------------------------- mp4 fixture forge -- */

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

/** mvhd v0: version(1)+flags(3)+creation(4)+modification(4)+timescale(4)+duration(4)+rest. */
function mvhdV0(timescale: number, duration: number): Uint8Array {
  const p = new Uint8Array(100);
  w32(p, 12, timescale);
  w32(p, 16, duration);
  return boxOf('mvhd', p);
}

/** mvhd v1: version(1)+flags(3)+creation(8)+modification(8)+timescale(4)+duration(8)+rest. */
function mvhdV1(timescale: number, duration: number): Uint8Array {
  const p = new Uint8Array(112);
  p[0] = 1;
  w32(p, 20, timescale);
  w32(p, 24, Math.floor(duration / 2 ** 32));
  w32(p, 28, duration >>> 0);
  return boxOf('mvhd', p);
}

const FTYP = boxOf('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])); // brand "isom"

/** A minimal true-to-spec container: ftyp, then moov carrying the mvhd. */
const mp4Of = (seconds: number, v: 0 | 1 = 0): Uint8Array =>
  concat(FTYP, boxOf('moov', (v === 0 ? mvhdV0 : mvhdV1)(1_000, Math.round(seconds * 1_000))));

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

const videoReq = (body: BodyInit, headers: Record<string, string> = {}): Request =>
  new Request(`https://media.boutik.test${VIDEO_UPLOAD_PATH}`, { method: 'POST', body, headers });

/* ---------------------------------------------------------------- tests -- */

describe('mp4DurationSeconds — the container’s OWN clock, pure JS', () => {
  it('reads v0 and v1 mvhd layouts to the millisecond', () => {
    expect(mp4DurationSeconds(mp4Of(5.8, 0))).toBeCloseTo(5.8, 3);
    expect(mp4DurationSeconds(mp4Of(5.8, 1))).toBeCloseTo(5.8, 3);
  });

  it('a malformed container answers null, never a guess: no moov · no mvhd · zero timescale · truncated', () => {
    expect(mp4DurationSeconds(FTYP)).toBeNull();
    expect(mp4DurationSeconds(concat(FTYP, boxOf('moov', boxOf('trak', new Uint8Array(20)))))).toBeNull();
    expect(mp4DurationSeconds(concat(FTYP, boxOf('moov', mvhdV0(0, 6_000))))).toBeNull();
    expect(mp4DurationSeconds(mp4Of(5.8).slice(0, 30))).toBeNull();
  });
});

describe('uploadVideo — the founder’s bound is MEASURED, every refusal named', () => {
  it('accepts a 5,8 s clip: opaque key, video/mp4 derived from bytes, measured duration returned', async () => {
    const { bucket, objects } = stubBucket();
    const out = await service(bucket).uploadVideo(mp4Of(5.8), AT);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(isOpaqueMediaKey(out.video.key)).toBe(true);
    expect(out.video.contentType).toBe('video/mp4');
    expect(out.video.durationSeconds).toBeCloseTo(5.8, 3);
    expect(objects.get(out.video.key)?.contentType).toBe('video/mp4'); // the STORE holds the derived type
  });

  it('exactly 6,0 s passes; encoder jitter (6,04 s) passes; 6,2 s is too_long — the bound is real', async () => {
    const { bucket } = stubBucket();
    const svc = service(bucket);
    expect((await svc.uploadVideo(mp4Of(6.0), AT)).ok).toBe(true);
    expect((await svc.uploadVideo(mp4Of(6.04), AT)).ok).toBe(true);
    const long = await svc.uploadVideo(mp4Of(6.2), AT);
    expect(long).toEqual({ ok: false, reason: 'too_long' });
    expect(VIDEO_MAX_SECONDS).toBeLessThan(6.2); // the jitter window never stretches to a real 7th second
  });

  it('a PHOTO on the video route refuses as unsupported_type — the sniff decides, not the route name', async () => {
    const { bucket } = stubBucket();
    const jpeg = new Uint8Array(64);
    jpeg.set([0xff, 0xd8, 0xff], 0);
    expect(await service(bucket).uploadVideo(jpeg, AT)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('an UNREADABLE duration refuses — a bound you can dodge by malforming a header is a suggestion', async () => {
    const { bucket, objects } = stubBucket();
    const out = await service(bucket).uploadVideo(FTYP, AT); // ftyp with no moov at all
    expect(out).toEqual({ ok: false, reason: 'unreadable_duration' });
    expect(objects.size).toBe(0); // nothing stored on any refusal
  });

  it('empty and oversized refuse by name', async () => {
    const { bucket } = stubBucket();
    const svc = service(bucket);
    expect(await svc.uploadVideo(new Uint8Array(0), AT)).toEqual({ ok: false, reason: 'empty' });
    const fat = new Uint8Array(VIDEO_MAX_BYTES + 1);
    fat.set(FTYP, 0);
    expect(await svc.uploadVideo(fat, AT)).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('the route — same write gate as the image upload, and the ref reads back as video', () => {
  it('401 with no key / wrong key, and the bytes never reach the store', async () => {
    const { bucket, objects } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    expect((await worker.fetch(videoReq(mp4Of(5)), env)).status).toBe(401);
    expect((await worker.fetch(videoReq(mp4Of(5), { 'X-Write-Key': 'wrong' }), env)).status).toBe(401);
    expect(objects.size).toBe(0);
  });

  it('201 with the ref + measured duration — the DECLARED content type is ignored; then GET serves video/mp4', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const res = await worker.fetch(
      videoReq(mp4Of(4.5), { 'X-Write-Key': SECRET, 'Content-Type': 'image/png' }), // lying content-type
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ref: string; contentType: string; durationSeconds: number };
    expect(isOpaqueMediaKey(body.ref)).toBe(true);
    expect(body.contentType).toBe('video/mp4');
    expect(body.durationSeconds).toBeCloseTo(4.5, 3);
    const read = await worker.fetch(new Request(`https://media.boutik.test/${body.ref}`), env);
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('video/mp4'); // the read route serves the derived type
  });

  it('a too-long clip is refused ON THE ROUTE with its named reason', async () => {
    const { bucket } = stubBucket();
    const env = { BUCKET: bucket, MEDIA_WRITE_SECRET: SECRET };
    const res = await worker.fetch(videoReq(mp4Of(9), { 'X-Write-Key': SECRET }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'rejected', reason: 'too_long' });
  });
});

describe('sniffMp4 — the magic is positional, never a substring accident', () => {
  it('ftyp at offset 4 is a video; ftyp anywhere else is not', () => {
    expect(sniffMp4(mp4Of(3))).toBe(true);
    const misplaced = new Uint8Array(24);
    misplaced.set([0x66, 0x74, 0x79, 0x70], 8);
    expect(sniffMp4(misplaced)).toBe(false);
  });
});
