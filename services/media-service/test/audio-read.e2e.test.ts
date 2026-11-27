import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Response as MfResponse } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ A BUYER'S VOICE NOTE IS NOT A PRODUCT PHOTOGRAPH ═══
 *
 * Her note says how to find her home. It is stored in the same bucket as the
 * product photographs, so the open read must never answer it — not from the
 * bucket, not from a slice, not under `?v=thumb`, and not from an edge entry
 * written before this rule existed. It is played only through `AudioRead`, a
 * named entrypoint with no URL: only a Worker that declares the binding can
 * reach it, and its answer is `private, no-store`.
 *
 * Driven against the REAL bundle (`dist/worker/worker.mjs`, built by
 * `pretest`) on workerd, with an R2 binding and the real `caches.default`;
 * the outcome is asked of the bucket and of the cache, never only of the
 * answer.
 */

const BUNDLE = fileURLToPath(new URL('../dist/worker/worker.mjs', import.meta.url));
const WRITE = 'test-media-write-audio-read';
const LIMITE = 30_000;

const webmNote = (): Uint8Array => {
  const b = new Uint8Array(68).fill(0x42);
  b.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return b;
};
function png(w = 800, h = 600): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const be32 = (v: number, at: number) => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(w, 16); be32(h, 20);
  return b;
}

/** A caller Worker that holds the binding — the shape Séra's and offer-service's use. */
const APPELANT = `
export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    return env.MEDIA_AUDIO.fetch(new Request('https://media' + u.pathname + u.search, { method: request.method, headers: request.headers }));
  },
};`;

const bundle = readFileSync(BUNDLE, 'utf8');
const MEDIA = {
  name: 'media-service',
  modules: [{ type: 'ESModule' as const, path: 'media.mjs', contents: bundle }],
  compatibilityDate: '2025-07-05',
  r2Buckets: { BUCKET: 'audio-read-bucket' },
  bindings: { MEDIA_WRITE_SECRET: WRITE },
};

/** The open read alone — the media Worker as the web sees it. */
let ouvert!: Miniflare;
/** The media Worker plus a caller bound to its `AudioRead` entrypoint. */
let lie!: Miniflare;
const dirs: string[] = [];
const persist = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'audio-read-'));
  dirs.push(d);
  return d;
};

beforeAll(async () => {
  const d = persist();
  ouvert = new Miniflare({ ...MEDIA, r2Persist: d, cachePersist: join(d, 'cache') });
  await ouvert.ready;
}, LIMITE);
afterAll(async () => {
  await ouvert?.dispose();
  await lie?.dispose();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const ouvrirLie = async (): Promise<Miniflare> => {
  if (lie === undefined) {
    const d = persist();
    lie = new Miniflare({
      r2Persist: d,
      cachePersist: join(d, 'cache'),
      workers: [
        MEDIA,
        {
          name: 'appelant',
          modules: [{ type: 'ESModule', path: 'appelant.mjs', contents: APPELANT }],
          compatibilityDate: '2025-07-05',
          serviceBindings: { MEDIA_AUDIO: { name: 'media-service', entrypoint: 'AudioRead' } },
        },
      ],
    });
    await lie.ready;
  }
  return lie;
};

const sur = (mf: Miniflare) => ({
  media: (path: string, init?: RequestInit): Promise<Response> =>
    mf.dispatchFetch(`http://media${path}`, init as never) as unknown as Promise<Response>,
  deposer: async (path: string, bytes: Uint8Array): Promise<string> => {
    const res = (await mf.dispatchFetch(`http://media${path}`, { method: 'POST', headers: { 'X-Write-Key': WRITE }, body: bytes })) as unknown as Response;
    expect(res.status).toBe(201);
    return ((await res.json()) as { ref: string }).ref;
  },
  enCache: async (path: string): Promise<boolean> =>
    (await (await mf.getCaches()).default.match(`http://media${path}`)) !== undefined,
});
const ouv = () => sur(ouvert);
const viaPorte = async (path: string, init?: RequestInit): Promise<Response> =>
  (await (await ouvrirLie()).getWorker('appelant')).fetch(`http://appelant${path}`, init as never) as unknown as Promise<Response>;
const deposerLie = async (path: string, bytes: Uint8Array): Promise<string> => sur(await ouvrirLie()).deposer(path, bytes);
const enCacheLie = async (path: string): Promise<boolean> => sur(await ouvrirLie()).enCache(path);
const ETRANGER = { Origin: 'https://ailleurs.example' };
const UNIFORME = { service: 'media-service', status: 'not_found', reason: 'unknown_media_key' };

describe('the open read never answers a voice note — asked of the bucket and the cache', () => {
  it('a stored note: no key, a foreign origin → the same 404 as an unknown key, and nothing is cached', async () => {
    const ref = await ouv().deposer('/media/audio', webmNote());
    const r2 = await ouvert.getR2Bucket('BUCKET');
    expect((await r2.head(ref))?.httpMetadata?.contentType, 'ASK THE BUCKET: the note is stored').toBe('audio/webm');

    const lu = await ouv().media(`/${ref}`, { headers: ETRANGER });
    expect(lu.status).toBe(404);
    expect(await lu.json()).toEqual(UNIFORME);
    expect(lu.headers.get('Cache-Control')).toBeNull();
    expect(await ouv().enCache(`/${ref}`), 'ASK THE CACHE: no edge copy of her voice').toBe(false);

    const inconnu = await ouv().media('/media/00000000-0000-4000-8000-000000000000');
    expect(inconnu.status).toBe(404);
    expect(await inconnu.json(), 'one uniform answer: a note is indistinguishable from nothing').toEqual(UNIFORME);
  }, LIMITE);

  it('a slice, a probe past the end, and ?v=thumb on a note → the same 404', async () => {
    const ref = await ouv().deposer('/media/audio', webmNote());
    for (const [path, headers] of [
      [`/${ref}`, { Range: 'bytes=0-1' }],
      [`/${ref}`, { Range: 'bytes=999-' }],
      [`/${ref}?v=thumb`, {}],
      [`/${ref}?v=thumb`, { Range: 'bytes=0-1' }],
    ] as const) {
      const res = await ouv().media(path, { headers });
      expect(res.status, `${path} ${JSON.stringify(headers)}`).toBe(404);
      expect(await res.json()).toEqual(UNIFORME);
    }
    expect(await ouv().enCache(`/${ref}?v=thumb`)).toBe(false);
  }, LIMITE);

  it('an audio entry already in the edge before the rule: deleted, and answered the same 404', async () => {
    // A key the bucket does NOT hold: any 200 here can only come from the edge.
    const ref = 'media/5eed0000-0000-4000-8000-0000000000a1';
    expect(await (await ouvert.getR2Bucket('BUCKET')).head(ref), 'ASK THE BUCKET: nothing stored here').toBeNull();
    const caches = await ouvert.getCaches();
    await caches.default.put(
      `http://media/${ref}`,
      new MfResponse(webmNote(), {
        headers: { 'Content-Type': 'audio/webm', 'Cache-Control': 'public, max-age=300, s-maxage=3600', 'Accept-Ranges': 'bytes' },
      }),
    );
    expect(await ouv().enCache(`/${ref}`), 'the seed landed in the edge').toBe(true);

    const lu = await ouv().media(`/${ref}`, { headers: ETRANGER });
    expect(lu.status).toBe(404);
    expect(await lu.json()).toEqual(UNIFORME);
    expect(await ouv().enCache(`/${ref}`), 'ASK THE CACHE: the old copy is gone').toBe(false);
  }, LIMITE);

  it('a photograph is unchanged: 200 public, cached for the next reader', async () => {
    const ref = await ouv().deposer('/media', png());
    const lu = await ouv().media(`/${ref}`, { headers: ETRANGER });
    expect(lu.status).toBe(200);
    expect(lu.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
    expect(lu.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(new Uint8Array(await lu.arrayBuffer())).toEqual(png());
    expect(await ouv().enCache(`/${ref}`), 'ASK THE CACHE: the photograph is still cached').toBe(true);
  }, LIMITE);
});

describe('AudioRead — the note plays only through a binding', () => {
  it('a note → 200 with its bytes, its type, private no-store; nothing written to the edge', async () => {
    const note = webmNote();
    const ref = await deposerLie('/media/audio', note);
    const res = await viaPorte(`/${ref}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/webm');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(note);
    expect(await enCacheLie(`/${ref}`), 'ASK THE CACHE: the door never writes the edge').toBe(false);
  }, LIMITE);

  it('the AVPlayer probe: bytes=0-1 → 206 two bytes and the total; past the end → 416 with the total', async () => {
    const note = webmNote();
    const ref = await deposerLie('/media/audio', note);
    const probe = await viaPorte(`/${ref}`, { headers: { Range: 'bytes=0-1' } });
    expect(probe.status).toBe(206);
    expect(probe.headers.get('Content-Range')).toBe(`bytes 0-1/${note.length}`);
    expect(probe.headers.get('Content-Length')).toBe('2');
    expect(probe.headers.get('Accept-Ranges')).toBe('bytes');
    expect(probe.headers.get('Content-Type')).toBe('audio/webm');
    expect(probe.headers.get('Cache-Control')).toBe('private, no-store');
    expect(new Uint8Array(await probe.arrayBuffer())).toEqual(note.slice(0, 2));

    const tail = await viaPorte(`/${ref}`, { headers: { Range: 'bytes=-4' } });
    expect(tail.status).toBe(206);
    expect(tail.headers.get('Content-Range')).toBe(`bytes ${note.length - 4}-${note.length - 1}/${note.length}`);

    const beyond = await viaPorte(`/${ref}`, { headers: { Range: 'bytes=999-' } });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get('Content-Range')).toBe(`bytes */${note.length}`);
    expect(beyond.headers.get('Cache-Control')).toBe('private, no-store');
  }, LIMITE);

  it('a photograph, an unknown key, a malformed key, a POST → one uniform 404', async () => {
    const photo = await deposerLie('/media', png());
    const note = await deposerLie('/media/audio', webmNote());
    for (const [path, init] of [
      [`/${photo}`, {}],
      [`/${photo}`, { headers: { Range: 'bytes=0-1' } }],
      ['/media/00000000-0000-4000-8000-000000000000', {}],
      ['/media/../etc', {}],
      ['/media/pas-une-cle', {}],
      [`/${note}`, { method: 'POST', body: 'x' }],
      [`/${note}`, { method: 'HEAD' }],
    ] as const) {
      const res = await viaPorte(path, init);
      expect(res.status, `${path} ${JSON.stringify(init)}`).toBe(404);
      if ((init as { method?: string }).method !== 'HEAD') expect(await res.json()).toEqual({ error: 'not_found' });
    }
  }, LIMITE);
});

describe('the deployed module: exactly two exports, workerd starts it, cloudflare:workers stays external', () => {
  it('the bundle exports default and AudioRead, nothing else', () => {
    const last = [...bundle.matchAll(/export\s*\{([^}]*)\}\s*;?/g)].at(-1);
    expect(last, 'the bundle ends with one export list').toBeDefined();
    const noms = last![1]!.split(',').map((s) => s.trim().split(/\s+as\s+/).at(-1)!).filter(Boolean).sort();
    expect(noms).toEqual(['AudioRead', 'default']);
  });

  it('cloudflare:workers is imported by the bundle, never inlined', () => {
    expect(bundle).toMatch(/from\s*["']cloudflare:workers["']/);
  });

  it('workerd started it: the open read and the binding both answer', async () => {
    expect((await sur(await ouvrirLie()).media('/health')).status).toBe(200);
    expect((await viaPorte('/media/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  }, LIMITE);
});
