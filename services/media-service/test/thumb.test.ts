import { describe, expect, it } from 'vitest';
import worker, { THUMB_UPLOAD_PATH, handleThumbUpload, FALLBACK_CACHE_CONTROL, CACHE_CONTROL } from '../worker/index.js';
import { InMemoryMediaStore, type R2BucketLike, type R2ObjectBodyLike } from '../src/media-store.js';
import { ProductMediaService, THUMB_MAX_BYTES, THUMB_MAX_DIM, THUMB_MIN_DIM, thumbKeyFor } from '../src/media.js';
import { isOpaqueMediaKey } from '../src/media-key.js';

/**
 * THUMB-PRODUIT-1 — the vignette door, at the unit level.
 *
 * The END-TO-END proof lives elsewhere and deliberately so:
 * `apps/supplier-app/test/vignette-media.e2e.test.ts` drives the APP's own port
 * against this Worker on real workerd with a real R2 binding, and asks the READ
 * ROUTE for the outcome. What is here is what a unit is good at — the bounds,
 * the refusal shapes, and the two key properties that a seam test would pass
 * over without noticing.
 */

const SECRET = 'test-media-write-secret';
/** The parent's upload time, and a WRITE five seconds later — what the app does. */
const UPLOADED_AT = new Date('2026-08-11T09:00:00.000Z');
const AT = '2026-08-11T09:00:05.000Z';
/** Past `THUMB_WRITE_WINDOW_MS` — a ref harvested off a page, days later. */
const TROP_TARD = '2026-08-13T09:00:00.000Z';
const PARENT = 'media/11111111-1111-4111-8111-111111111111';

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

async function withParent(): Promise<{ store: InMemoryMediaStore; service: ProductMediaService }> {
  // The store's clock is INJECTED so the freshness window can be aged without
  // sleeping — the window is a time decision and must be tested as one.
  const store = new InMemoryMediaStore('https://media.boutik.test', () => UPLOADED_AT);
  await store.put(PARENT, png(1280, 1280), 'image/png');
  return { store, service: new ProductMediaService(store) };
}

describe('THUMB-PRODUIT-1 — the derived key', () => {
  it('is derived from the parent and is NOT independently addressable', () => {
    const key = thumbKeyFor(PARENT);
    expect(key).toBe(`${PARENT}~t`);
    // THE PROPERTY THAT MAKES THE WHOLE DESIGN SAFE: the read and revoke routes
    // gate on `isOpaqueMediaKey`, so a caller can never name the vignette
    // object directly — it exists only as a variant of its parent.
    expect(isOpaqueMediaKey(key)).toBe(false);
    // …and it carries no identity material of its own: parent + a constant.
    expect(key.slice(PARENT.length)).toBe('~t');
  });

  it('refuses to derive from anything that is not an opaque parent key', () => {
    for (const bad of ['', 'media/hero', 'media/../secret', 'private/device/abc', `${PARENT}~t`]) {
      expect(() => thumbKeyFor(bad), bad).toThrow();
    }
  });
});

describe('THUMB-PRODUIT-1 — putThumb, the four checks in order', () => {
  it('stores a real vignette at the derived key, and only there', async () => {
    const { store, service } = await withParent();
    const out = await service.putThumb(PARENT, png(320, 320, 8_000), AT);
    expect(out.ok && out.key).toBe(`${PARENT}~t`);
    expect(store.objects.has(`${PARENT}~t`)).toBe(true);
    // The photograph is untouched — a vignette write is never a replace.
    expect(store.objects.get(PARENT)?.bytes.byteLength).toBe(64);
  });

  it('WRITE-ONCE: a filled slot is refused and the FIRST vignette survives', async () => {
    const { store, service } = await withParent();
    await service.putThumb(PARENT, png(320, 320, 8_000), AT);
    const again = await service.putThumb(PARENT, png(320, 320, 9_000), AT);
    expect(again.ok).toBe(false);
    expect(!again.ok && again.reason).toBe('already_set');
    // Asserted by CONTENT: a refusal that had still written would be worse than
    // no check at all.
    expect(store.objects.get(`${PARENT}~t`)?.bytes.byteLength).toBe(8_000);
  });

  it('a vignette for a photograph that does not exist is refused, never a write to nowhere', async () => {
    const store = new InMemoryMediaStore();
    const out = await new ProductMediaService(store).putThumb(PARENT, png(320, 320, 8_000), AT);
    expect(!out.ok && out.reason).toBe('no_parent');
    expect(store.objects.size).toBe(0);
  });

  it('the BOUNDS are this service’s, never the caller’s claim', async () => {
    const { service } = await withParent();
    const cases: [string, Uint8Array][] = [
      ['empty', new Uint8Array(0)],
      ['too_large', png(320, 320, THUMB_MAX_BYTES + 1)],
      ['unsupported_type', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])],
      ['bad_dimensions', png(THUMB_MAX_DIM + 1, 320)],
      ['bad_dimensions', png(320, THUMB_MAX_DIM + 1)],
      ['bad_dimensions', png(THUMB_MIN_DIM - 1, 320)],
    ];
    for (const [reason, bytes] of cases) {
      const out = await service.putThumb(PARENT, bytes, AT);
      expect(out.ok, reason).toBe(false);
      expect(!out.ok && out.reason, reason).toBe(reason);
    }
  });

  it('THE FRESHNESS WINDOW is what closes the defacement primitive', async () => {
    // ⚠ THE VERIFIER'S BLOCKER. The write key ships in app bundles and a
    // published product's refs are public, so « bundled key + a ref off a page »
    // must not be able to put an image on his board. It cannot: by the time a
    // ref is public, the parent is long past the window.
    const { store, service } = await withParent();
    const tard = await service.putThumb(PARENT, png(320, 320, 8_000), TROP_TARD);
    expect(!tard.ok && tard.reason).toBe('window_closed');
    expect(store.objects.has(`${PARENT}~t`), 'nothing was written').toBe(false);
    // …and the same bytes, seconds after the upload, are accepted.
    expect((await service.putThumb(PARENT, png(320, 320, 8_000), AT)).ok).toBe(true);
  });

  it('a clock that cannot be read is treated as CLOSED, never as open', async () => {
    const { store, service } = await withParent();
    const out = await service.putThumb(PARENT, png(320, 320, 8_000), 'pas une date');
    expect(!out.ok && out.reason).toBe('window_closed');
    expect(store.objects.has(`${PARENT}~t`)).toBe(false);
  });

  it('a parent uploaded in the FUTURE is refused too — a negative age is not a fresh one', async () => {
    const store = new InMemoryMediaStore('https://media.boutik.test', () => new Date('2026-08-12T00:00:00.000Z'));
    await store.put(PARENT, png(1280, 1280), 'image/png');
    const out = await new ProductMediaService(store).putThumb(PARENT, png(320, 320, 8_000), AT);
    expect(!out.ok && out.reason).toBe('window_closed');
  });

  it('VALIDATION RUNS BEFORE THE STORAGE QUESTIONS — a malformed body never learns whether a ref exists', async () => {
    // Same body, absent parent: the answer must be the VALIDATOR's, not
    // `no_parent`, or the door becomes an existence oracle for anyone with the
    // bundled write key.
    const out = await new ProductMediaService(new InMemoryMediaStore()).putThumb(PARENT, new Uint8Array(0), AT);
    expect(!out.ok && out.reason).toBe('empty');
  });
});

describe('THUMB-PRODUIT-1 — a revoked photograph takes its vignette', () => {
  it('revoke removes both objects', async () => {
    const { store, service } = await withParent();
    await service.putThumb(PARENT, png(320, 320, 8_000), AT);
    await service.revoke(PARENT);
    expect(store.objects.has(PARENT)).toBe(false);
    expect(store.objects.has(`${PARENT}~t`), 'a 320px copy of a taken-down image is still that image').toBe(false);
  });

  it('replace removes the OLD photograph’s vignette, so the new one starts empty', async () => {
    const { store, service } = await withParent();
    await service.putThumb(PARENT, png(320, 320, 8_000), AT);
    const out = await service.replace(PARENT, png(1280, 1280, 1_000), AT);
    expect(out.ok).toBe(true);
    expect(store.objects.has(`${PARENT}~t`)).toBe(false);
  });
});

describe('THUMB-PRODUIT-1 — the route', () => {
  const url = (parent: string): string => `https://media.test${THUMB_UPLOAD_PATH}?for=${encodeURIComponent(parent)}`;

  it('a non-opaque `for` is a 400 BEFORE any storage touch — never an existence oracle', async () => {
    for (const bad of ['', 'media/hero', 'media/../secret', `${PARENT}~t`]) {
      const res = await handleThumbUpload(new Request(url(bad), { method: 'POST', body: png(320, 320) }), {});
      expect(res.status, bad).toBe(400);
      expect(((await res.json()) as { param?: string }).param).toBe('for');
    }
  });

  it('maps the typed refusals onto honest statuses', async () => {
    const bucket = stubBucket();
    await bucket.store.put(PARENT, png(1280, 1280), { httpMetadata: { contentType: 'image/png' } });
    const env = { BUCKET: bucket.bucket };
    const ok = await handleThumbUpload(new Request(url(PARENT), { method: 'POST', body: png(320, 320, 8_000) }), env);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ status: 'stored', for: PARENT, byteLength: 8_000 });

    const dup = await handleThumbUpload(new Request(url(PARENT), { method: 'POST', body: png(320, 320, 8_000) }), env);
    expect(dup.status, 'a slot already filled is 409, not an error to shout about').toBe(409);

    const ABSENT = 'media/22222222-2222-4222-8222-222222222222';
    const none = await handleThumbUpload(new Request(url(ABSENT), { method: 'POST', body: png(320, 320, 8_000) }), env);
    expect(none.status).toBe(404);

    const bad = await handleThumbUpload(new Request(url(PARENT), { method: 'POST', body: png(1280, 1280, 8_000) }), env);
    expect(bad.status).toBe(400);
  });

  it('is BEHIND THE WRITE GATE at the deployed entry — no key, no vignette', async () => {
    const res = await worker.fetch(
      new Request(url(PARENT), { method: 'POST', body: png(320, 320) }),
      { BUCKET: stubBucket().bucket, MEDIA_WRITE_SECRET: SECRET },
    );
    expect(res.status).toBe(401);
  });
});

describe('THUMB-PRODUIT-1 — the read route’s variant', () => {
  it('answers the VIGNETTE when one exists, and the PHOTOGRAPH when none does', async () => {
    const bucket = stubBucket();
    await bucket.store.put(PARENT, png(1280, 1280, 300_000), { httpMetadata: { contentType: 'image/png' } });
    const env = { BUCKET: bucket.bucket, MEDIA_WRITE_SECRET: SECRET };

    const avant = await worker.fetch(new Request(`https://media.test/${PARENT}?v=thumb`), env);
    expect(avant.status, 'a ref with no vignette must fall back, never 404').toBe(200);
    expect((await avant.arrayBuffer()).byteLength).toBe(300_000);

    await bucket.store.put(`${PARENT}~t`, png(320, 320, 8_000), { httpMetadata: { contentType: 'image/png' } });
    const apres = await worker.fetch(new Request(`https://media.test/${PARENT}?v=thumb`), env);
    expect((await apres.arrayBuffer()).byteLength).toBe(8_000);

    // The bare url is untouched — the fiche and the vitrine still get the photograph.
    const grand = await worker.fetch(new Request(`https://media.test/${PARENT}`), env);
    expect((await grand.arrayBuffer()).byteLength).toBe(300_000);
  });

  it('the SHORT ttl is only for a FRESH parent — an OLD one keeps the full ttl it always had', async () => {
    // ⚠ THE VERIFIER'S MAJOR, pinned. Shortening every fallback would have made
    // the founder's CURRENT board five times more expensive: every photograph he
    // owns falls back, and each would be re-fetched every 60 s instead of 300 s.
    const frais = stubBucket(new Date());
    await frais.store.put(PARENT, png(1280, 1280, 300_000), { httpMetadata: { contentType: 'image/png' } });
    const fell = await worker.fetch(new Request(`https://media.test/${PARENT}?v=thumb`), { BUCKET: frais.bucket, MEDIA_WRITE_SECRET: SECRET });
    expect(fell.headers.get('Cache-Control'), 'a vignette could still arrive').toBe(FALLBACK_CACHE_CONTROL);
    expect(FALLBACK_CACHE_CONTROL).not.toBe(CACHE_CONTROL);

    const vieux = stubBucket(new Date(Date.now() - 30 * 24 * 3600 * 1000));
    await vieux.store.put(PARENT, png(1280, 1280, 300_000), { httpMetadata: { contentType: 'image/png' } });
    const ancien = await worker.fetch(new Request(`https://media.test/${PARENT}?v=thumb`), { BUCKET: vieux.bucket, MEDIA_WRITE_SECRET: SECRET });
    expect(ancien.headers.get('Cache-Control'), 'no vignette can ever arrive — do not make his board worse').toBe(CACHE_CONTROL);

    await frais.store.put(`${PARENT}~t`, png(320, 320, 8_000), { httpMetadata: { contentType: 'image/png' } });
    const hit = await worker.fetch(new Request(`https://media.test/${PARENT}?v=thumb`), { BUCKET: frais.bucket, MEDIA_WRITE_SECRET: SECRET });
    expect(hit.headers.get('Cache-Control'), 'a real vignette is as cacheable as any object').toBe(CACHE_CONTROL);
  });
});

/** An R2-shaped stub that records what was written — the house pattern here. */
function stubBucket(uploadedAt: Date = new Date()): { bucket: R2BucketLike; store: R2BucketLike } {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const bucket: R2BucketLike = {
    put: async (key, value, options) => {
      objects.set(key, {
        bytes: value,
        ...(options?.httpMetadata?.contentType !== undefined ? { contentType: options.httpMetadata.contentType } : {}),
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
        ...(o.contentType !== undefined ? { httpMetadata: { contentType: o.contentType } } : {}),
      };
    },
    head: async (key) => (objects.has(key) ? { uploaded: uploadedAt } : null),
  };
  return { bucket, store: bucket };
}
