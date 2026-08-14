import { describe, expect, it } from 'vitest';
import worker, { handleMediaRead, type MediaWorkerEnv } from '../worker/index.js';
import { mintMediaKey } from '../src/media-key.js';
import type { R2BucketLike, R2ObjectBodyLike, R2RangeLike } from '../src/media-store.js';

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

/**
 * A fake R2 bucket that counts reads — so "the origin was spared" is an assertion, not a hope.
 *
 * PORTÉE-MEDIA — ITS RANGED READS ARE CONTRACT-CERTIFIED TO REAL R2's BOUNDS,
 * proven on real workerd by shop-plus's own PORTÉE-MEDIA e2e suite
 * (combined-worker.e2e.test.ts « PORTÉE-MEDIA ») and on a real iPhone:
 *   · an ABSENT key answers null, range or no range;
 *   · an OUT-OF-BOUNDS offset (offset ≥ size) THROWS — R2 never answers it;
 *   · a suffix or length wider than the object is CLAMPED to it;
 *   · every answered object reports `size` (the TOTAL, even on a slice) and
 *     the CLAMPED `range` it actually served.
 */
function fakeBucket(entries: Record<string, { body: string; contentType?: string }>) {
  const reads: string[] = [];
  const bucket: R2BucketLike = {
    put: async () => undefined,
    delete: async () => undefined,
    get: async (key: string, options?: { range?: R2RangeLike }): Promise<R2ObjectBodyLike | null> => {
      reads.push(key);
      const hit = entries[key];
      if (!hit) return null;
      const bytes = bytesOf(hit.body);
      let start = 0;
      let length = bytes.length;
      let served: R2RangeLike | undefined;
      const range = options?.range;
      if (range !== undefined) {
        if (range.suffix !== undefined) {
          length = Math.min(range.suffix, bytes.length); // clamped, as real R2 clamps
          start = bytes.length - length;
        } else {
          start = range.offset ?? 0;
          if (start >= bytes.length) throw new Error('get: invalid range'); // R2 THROWS out of bounds
          length = Math.min(range.length ?? bytes.length - start, bytes.length - start);
        }
        served = { offset: start, length };
      }
      const slice = bytes.slice(start, start + length);
      return {
        body: new ReadableStream({
          start(c) { c.enqueue(slice); c.close(); },
        }),
        size: bytes.length, // the TOTAL, even on a slice — real R2 reports it
        ...(served !== undefined ? { range: served } : {}),
        ...(hit.contentType !== undefined ? { httpMetadata: { contentType: hit.contentType } } : {}),
      };
    },
  };
  return { bucket, reads };
}

const req = (key: string): Request => new Request(`https://media.boutik.test/${key}`);
const reqRange = (key: string, range: string): Request =>
  new Request(`https://media.boutik.test/${key}`, { headers: { Range: range } });

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

/**
 * ═══ PORTÉE-MEDIA — THE iPHONE'S PLAYER ASKS IN RANGES ═══
 *
 * The Séra rider plays the buyer's « repère » voice note from this route, and
 * iOS AVPlayer probes any media URL with `Range: bytes=0-1`, refusing the whole
 * resource when the answer is 200-full-body with no Accept-Ranges — which is
 * exactly what this route used to give. Same bug, same semantics as shop-plus's
 * media read Worker (PORTÉE-MEDIA, proven on a real device): 206 + Content-Range
 * for a satisfiable single range, 416 + `bytes *​/total` past the end, and the
 * full 200 — advertising `Accept-Ranges: bytes` — for no header or one the
 * parser ignores. Bytes are asserted, never just status codes.
 */
describe('PORTÉE-MEDIA — the AVPlayer probe road (ranged reads, R2-native)', () => {
  const BODY = 'IMAGE-BYTES'; // 11 bytes

  it('the AVPlayer probe — Range: bytes=0-1 answers 206 with exactly two bytes and the total', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({ [key]: { body: BODY, contentType: 'audio/mp4' } });
    const probe = await handleMediaRead(reqRange(key, 'bytes=0-1'), key, { BUCKET: bucket });
    expect(probe.status, 'a ranged ask must be answered 206, never 200-full — iOS refuses the media otherwise').toBe(206);
    expect(probe.headers.get('Content-Range')).toBe('bytes 0-1/11');
    expect(probe.headers.get('Accept-Ranges')).toBe('bytes');
    expect(probe.headers.get('Content-Length')).toBe('2');
    expect(probe.headers.get('Content-Type')).toBe('audio/mp4');
    // The bounded Cache-Control rides the ranged road too — a slice of a
    // revocable object is exactly as revocable as the object.
    expect(probe.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
    expect(await probe.text()).toBe('IM'); // the range is REAL, not a re-labelled full body
  });

  it('open-ended and suffix ranges serve the right slices', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({ [key]: { body: BODY } });

    const tail = await handleMediaRead(reqRange(key, 'bytes=6-'), key, { BUCKET: bucket });
    expect(tail.status).toBe(206);
    expect(tail.headers.get('Content-Range')).toBe('bytes 6-10/11');
    expect(await tail.text()).toBe('BYTES');

    const suffix = await handleMediaRead(reqRange(key, 'bytes=-5'), key, { BUCKET: bucket });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('Content-Range')).toBe('bytes 6-10/11');
    expect(await suffix.text()).toBe('BYTES');
  });

  it('a range past the end answers 416 with the total, never a crash (R2 THROWS there)', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({ [key]: { body: BODY } });
    for (const ask of ['bytes=999-', 'bytes=11-', 'bytes=999-1000']) {
      const beyond = await handleMediaRead(reqRange(key, ask), key, { BUCKET: bucket });
      expect(beyond.status, ask).toBe(416);
      expect(beyond.headers.get('Content-Range'), ask).toBe('bytes */11');
      expect(beyond.headers.get('Accept-Ranges'), ask).toBe('bytes');
    }
  });

  it('the full GET stays a 200 full body — and now SAYS ranges are welcome', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({ [key]: { body: BODY, contentType: 'audio/mp4' } });
    const full = await handleMediaRead(req(key), key, { BUCKET: bucket });
    expect(full.status).toBe(200);
    expect(full.headers.get('Accept-Ranges')).toBe('bytes');
    expect(full.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600'); // byte-identical to before
    expect(await full.text()).toBe(BODY);
  });

  it('a malformed or multi-range header is IGNORED per RFC 7233 — the full body answers, never a 500', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({ [key]: { body: BODY } });
    for (const ask of ['zorbles=nope', 'bytes=0-1,4-5', 'bytes=-', 'bytes=5-2']) {
      const res = await handleMediaRead(reqRange(key, ask), key, { BUCKET: bucket });
      expect(res.status, ask).toBe(200);
      expect(await res.text(), ask).toBe(BODY);
    }
  });

  it('a ranged ask for a MISSING object is the same honest 404 as the full road', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({});
    expect((await handleMediaRead(reqRange(key, 'bytes=0-1'), key, { BUCKET: bucket })).status).toBe(404);
  });

  it('a ranged ?v=thumb serves the VIGNETTE’s slice when it exists, and the PHOTOGRAPH’s when it does not (the fallback, never a 404)', async () => {
    const key = mintMediaKey();
    const { bucket } = fakeBucket({
      [key]: { body: 'PHOTOGRAPH-BYTES' }, // 16 bytes
      [`${key}~t`]: { body: 'VIGNETTE' }, // 8 bytes
    });
    const reqThumb = (): Request =>
      new Request(`https://media.boutik.test/${key}?v=thumb`, { headers: { Range: 'bytes=0-1' } });
    const petit = await handleMediaRead(reqThumb(), key, { BUCKET: bucket });
    expect(petit.status).toBe(206);
    expect(petit.headers.get('Content-Range'), 'the total must be the VIGNETTE’s own').toBe('bytes 0-1/8');
    expect(await petit.text()).toBe('VI');

    const { bucket: sans } = fakeBucket({ [key]: { body: 'PHOTOGRAPH-BYTES' } });
    const fell = await handleMediaRead(reqThumb(), key, { BUCKET: sans });
    expect(fell.status, 'no vignette must FALL BACK to the photograph, exactly like the full road').toBe(206);
    expect(fell.headers.get('Content-Range')).toBe('bytes 0-1/16');
    expect(await fell.text()).toBe('PH');
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

  it('PORTÉE-MEDIA: ranged asks BYPASS the edge both ways — never stored, never answered from a stored 200', async () => {
    const key = mintMediaKey();
    const { bucket, reads } = fakeBucket({ [key]: { body: 'IMAGE-BYTES', contentType: 'audio/mp4' } });
    const { cache, size } = fakeCache();
    const globals = globalThis as { caches?: unknown };
    const saved = globals.caches;
    globals.caches = { default: cache };
    try {
      // A ranged FIRST ask never populates the edge — a 206 stored under the
      // bare URL would answer the next FULL read with a partial body.
      const probe = await handleMediaRead(reqRange(key, 'bytes=0-1'), key, { BUCKET: bucket });
      expect(probe.status).toBe(206);
      expect(size()).toBe(0);

      // A full read then populates it…
      const full = await handleMediaRead(req(key), key, { BUCKET: bucket });
      expect(full.status).toBe(200);
      expect(size()).toBe(1);

      // …and a ranged ask AFTER it still reaches R2 and answers 206 — a cached
      // 200-full answering a Range ask is the AVPlayer refusal coming back.
      const again = await handleMediaRead(reqRange(key, 'bytes=0-1'), key, { BUCKET: bucket });
      expect(again.status).toBe(206);
      expect(await again.text()).toBe('IM');
      expect(reads.length, 'every ranged ask went to the origin, natively sliced').toBe(3);
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

  it('POST to a media KEY path is still not a route — only POST /media uploads (MEDIA-UPLOAD-ROUTE-1)', async () => {
    const key = mintMediaKey();
    const SECRET = 'k';
    // authorised, so this proves ROUTING and not the gate: a keyed path is not an
    // upload target — the upload route is the bare collection path, which is what
    // makes a caller-supplied key unexpressible.
    const res = await worker.fetch(
      new Request(`https://media.boutik.test/${key}`, { method: 'POST', headers: { 'X-Write-Key': SECRET } }),
      { MEDIA_WRITE_SECRET: SECRET },
    );
    expect(res.status).toBe(404); // falls through to the health door's 404
  });

  it('an UNAUTHORISED POST anywhere is 401 — the gate precedes routing', async () => {
    const res = await worker.fetch(new Request('https://media.boutik.test/media', { method: 'POST' }), {});
    expect(res.status).toBe(401);
  });
});
