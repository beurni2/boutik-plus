import { describe, expect, it } from 'vitest';
import { InMemoryMediaStore, R2MediaStore, resolveMediaStore, type R2BucketLike } from '../src/media-store.js';
import {
  IMAGE_MAX_BYTES,
  ProductMediaService,
  imageDimensions,
  sniffImage,
} from '../src/media.js';
import { isOpaqueMediaKey } from '../src/media-key.js';

/**
 * BOUTIK-MEDIA-1 — validate → store → opaque ref, and REVOCATION (the thing that
 * makes the deferred read-route moderation gate survivable).
 */

const AT = '2026-07-24T10:00:00.000Z';

/** A real minimal PNG header: 8-byte signature + IHDR with width/height. */
function png(width: number, height: number, padTo = 64): Uint8Array {
  const b = new Uint8Array(padTo);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const be32 = (v: number, at: number) => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(width, 16);
  be32(height, 20);
  return b;
}

/** A real minimal JPEG: SOI + a SOF0 segment carrying height/width. */
function jpeg(width: number, height: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0xff, 0xd8, 0xff], 0); // SOI + marker start
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 2); // SOF0, length, precision
  b.set([(height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255], 7);
  return b;
}

describe('validation core — magic bytes and real header dimensions (ported, pure, no image library)', () => {
  it('sniffs by MAGIC BYTES, never by a declared content-type', () => {
    expect(sniffImage(png(400, 400))).toBe('png');
    expect(sniffImage(jpeg(400, 400))).toBe('jpeg');
    expect(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF refused
    expect(sniffImage(new TextEncoder().encode('<?php echo 1; ?>'))).toBeNull(); // a script named .jpg
  });

  it('reads intrinsic dimensions out of the PNG IHDR and the JPEG SOF', () => {
    expect(imageDimensions(png(1024, 768), 'png')).toEqual({ width: 1024, height: 768 });
    expect(imageDimensions(jpeg(1600, 1200), 'jpeg')).toEqual({ width: 1600, height: 1200 });
  });

  it('refuses each bound with a TYPED reason — empty, wrong type, too large, out-of-box', async () => {
    const svc = new ProductMediaService(new InMemoryMediaStore());
    expect(await svc.upload(new Uint8Array(0), AT)).toEqual({ ok: false, reason: 'empty' });
    expect(await svc.upload(new TextEncoder().encode('not an image at all'), AT)).toEqual({ ok: false, reason: 'unsupported_type' });
    const huge = png(400, 400, IMAGE_MAX_BYTES + 1);
    expect(await svc.upload(huge, AT)).toEqual({ ok: false, reason: 'too_large' });
    expect(await svc.upload(png(4000, 400), AT)).toEqual({ ok: false, reason: 'bad_dimensions' }); // over the box
    expect(await svc.upload(png(50, 50), AT)).toEqual({ ok: false, reason: 'bad_dimensions' }); // under the floor
  });
});

describe('upload — stores the real bytes under an opaque key', () => {
  it('stores exactly the bytes it was given, at an opaque key, and reports true dimensions', async () => {
    const store = new InMemoryMediaStore();
    const svc = new ProductMediaService(store);
    const bytes = png(800, 600);
    const out = await svc.upload(bytes, AT);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(isOpaqueMediaKey(out.image.key)).toBe(true);
    expect(out.image).toMatchObject({ contentType: 'image/png', width: 800, height: 600, uploadedAt: AT });
    expect(store.objects.get(out.image.key)!.bytes).toEqual(bytes); // the exact bytes round-trip
  });

  it('two uploads of the SAME bytes get DIFFERENT keys — never a content-derived, guessable key', async () => {
    const svc = new ProductMediaService(new InMemoryMediaStore());
    const bytes = png(400, 400);
    const a = await svc.upload(bytes, AT);
    const b = await svc.upload(bytes, AT);
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(a.image.key).not.toBe(b.image.key);
  });
});

describe('REVOCATION — what makes the deferred read-route gate survivable', () => {
  it('revoke deletes the object, so a leaked ref stops resolving', async () => {
    const store = new InMemoryMediaStore();
    const svc = new ProductMediaService(store);
    const out = await svc.upload(png(400, 400), AT);
    if (!out.ok) throw new Error('setup');
    expect(store.objects.has(out.image.key)).toBe(true);
    await svc.revoke(out.image.key);
    expect(store.objects.has(out.image.key)).toBe(false); // the bytes are gone, not merely unlinked
  });

  it('replace mints a NEW key and DELETES the old object — the old ref stops resolving', async () => {
    const store = new InMemoryMediaStore();
    const svc = new ProductMediaService(store);
    const first = await svc.upload(png(400, 400), AT);
    if (!first.ok) throw new Error('setup');
    const second = await svc.replace(first.image.key, png(800, 800), AT);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.image.key).not.toBe(first.image.key); // new token
    expect(store.objects.has(first.image.key)).toBe(false); // old object destroyed
    expect(store.objects.has(second.image.key)).toBe(true);
  });

  it('a REFUSED replacement leaves the old image intact — a bad upload never revokes a good one', async () => {
    const store = new InMemoryMediaStore();
    const svc = new ProductMediaService(store);
    const first = await svc.upload(png(400, 400), AT);
    if (!first.ok) throw new Error('setup');
    const bad = await svc.replace(first.image.key, new TextEncoder().encode('nope'), AT);
    expect(bad).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(store.objects.has(first.image.key)).toBe(true); // survived
  });

  it('revoke refuses a non-opaque key rather than deleting something it should not address', async () => {
    const svc = new ProductMediaService(new InMemoryMediaStore());
    await expect(svc.revoke('private/master/secret')).rejects.toThrow();
  });
});

describe('the store resolver — CI can never reach real storage', () => {
  it('no binding ⇒ the in-memory fake, by construction', () => {
    expect(resolveMediaStore({})).toBeInstanceOf(InMemoryMediaStore);
  });

  it('an R2 binding ⇒ the R2 store, and put/delete go to the binding', async () => {
    const puts: string[] = [];
    const deletes: string[] = [];
    const bucket: R2BucketLike = {
      put: async (key) => { puts.push(key); return undefined; },
      get: async () => null,
      delete: async (key) => { deletes.push(key); },
    };
    const store = resolveMediaStore({ BUCKET: bucket, MEDIA_PUBLIC_BASE: 'https://media.example' });
    expect(store).toBeInstanceOf(R2MediaStore);
    const stored = await store.put('media/k', png(400, 400), 'image/png');
    expect(puts).toEqual(['media/k']);
    // the URL points at THIS SERVICE's read route, never at the bucket
    expect(stored.url).toBe('https://media.example/media/k');
    await store.remove('media/k');
    expect(deletes).toEqual(['media/k']);
  });
});
