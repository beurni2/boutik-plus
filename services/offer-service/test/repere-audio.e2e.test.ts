import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ THE FOUNDER HEARS HER NOTE THROUGH HIS OWN KEY, AND NOWHERE ELSE ═══
 *
 * The buyer's voice note says how to find her home. His console used to play
 * it from the open media link; now it asks `GET /fulfillment/repere-audio`
 * here, with his operations key, and this Worker fetches the bytes from the
 * media Worker's `AudioRead` entrypoint over a service binding (no URL, no
 * new secret). The answer is never cached anywhere.
 *
 * Both Workers are the REAL bundles on workerd: this service's
 * `dist/worker/worker.mjs` (built by `pretest`), and media-service's
 * deployed entry built here the same way its `bundle:worker` builds it, with
 * an R2 binding. The note is put in through media's own upload door.
 */

const OFFER = 'dist/worker/worker.mjs';
const MEDIA_DIR = fileURLToPath(new URL('../../media-service/', import.meta.url));
const OPS = 'test-fulfillment-ops-secret-b7';
const WRITE = 'test-media-write-secret-b7';
const LIMITE = 30_000;

const webmNote = (): Uint8Array => {
  const b = new Uint8Array(68).fill(0x42);
  b.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return b;
};
function png(): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  b.set([0, 0, 3, 32, 0, 0, 2, 88], 16); // 800 × 600
  return b;
}

const dirs: string[] = [];
const dossier = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'repere-audio-'));
  dirs.push(d);
  return d;
};

let mf!: Miniflare;
/** The same offer Worker deployed without its media binding. */
let sansMedia!: Miniflare;

beforeAll(async () => {
  const sortie = join(dossier(), 'media.mjs');
  // media-service's `bundle:worker`, as an API call (its flags, its entry).
  buildSync({
    entryPoints: [join(MEDIA_DIR, 'worker/entry.ts')],
    absWorkingDir: MEDIA_DIR,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    conditions: ['import'],
    external: ['cloudflare:workers'],
    define: { __BOUTIK_RELEASE__: "'dev'", __BOUTIK_CANON__: "'dev'" },
    outfile: sortie,
    logLevel: 'silent',
  });
  const d = dossier();
  mf = new Miniflare({
    r2Persist: d,
    durableObjectsPersist: d,
    workers: [
      {
        name: 'offer-service',
        modules: true,
        scriptPath: OFFER,
        compatibilityDate: '2025-07-05',
        durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
        bindings: { FULFILLMENT_OPS_SECRET: OPS },
        serviceBindings: { MEDIA_AUDIO: { name: 'media-service', entrypoint: 'AudioRead' } },
      },
      {
        name: 'media-service',
        modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(sortie, 'utf8') }],
        compatibilityDate: '2025-07-05',
        r2Buckets: { BUCKET: 'repere-audio-bucket' },
        bindings: { MEDIA_WRITE_SECRET: WRITE },
      },
    ],
  });
  await mf.ready;
  sansMedia = new Miniflare({
    modules: true,
    scriptPath: OFFER,
    compatibilityDate: '2025-07-05',
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: dossier(),
    bindings: { FULFILLMENT_OPS_SECRET: OPS },
  });
  await sansMedia.ready;
}, LIMITE);
afterAll(async () => {
  await mf?.dispose();
  await sansMedia?.dispose();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const deposer = async (path: string, bytes: Uint8Array): Promise<string> => {
  const media = await mf.getWorker('media-service');
  const res = (await media.fetch(`http://media${path}`, { method: 'POST', headers: { 'X-Write-Key': WRITE }, body: bytes })) as unknown as Response;
  expect(res.status).toBe(201);
  return ((await res.json()) as { ref: string }).ref;
};
const porte = (ref: string, headers: Record<string, string> = {}, sur: Miniflare = mf): Promise<Response> =>
  sur.dispatchFetch(`http://o/fulfillment/repere-audio?ref=${encodeURIComponent(ref)}`, { headers }) as unknown as Promise<Response>;
const cle = { Authorization: `Bearer ${OPS}` };

describe('GET /fulfillment/repere-audio — his key, the media door, nothing cached', () => {
  it('with his key → 200 the very bytes, her type, private no-store, readable by his console', async () => {
    const note = webmNote();
    const ref = await deposer('/media/audio', note);
    const res = await porte(ref, { ...cle, Origin: 'https://boutik-plus-web.pages.dev' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/webm');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(note);
  }, LIMITE);

  it('no key, a wrong key, his key in the URL → 401, and the bytes never leave', async () => {
    const ref = await deposer('/media/audio', webmNote());
    for (const headers of [{}, { Authorization: 'Bearer pas-la-bonne' }, { Authorization: OPS }]) {
      const res = await porte(ref, headers);
      expect(res.status, JSON.stringify(headers)).toBe(401);
      expect(res.headers.get('Content-Type') ?? '').not.toMatch(/^audio\//);
    }
    const dansUrl = (await mf.dispatchFetch(`http://o/fulfillment/repere-audio?ref=${encodeURIComponent(ref)}&key=${OPS}`)) as unknown as Response;
    expect(dansUrl.status).toBe(401);
  }, LIMITE);

  it('a malformed ref, an unknown ref, a photograph → one uniform 404', async () => {
    const photo = await deposer('/media', png());
    const reponses: string[] = [];
    for (const ref of ['', 'media/pas-une-cle', 'media/../media/x', 'autre/00000000-0000-4000-8000-000000000000', 'media/00000000-0000-4000-8000-000000000000', photo]) {
      const res = await porte(ref, cle);
      expect(res.status, ref).toBe(404);
      reponses.push(await res.text());
    }
    expect(new Set(reponses).size, 'one answer for every refusal').toBe(1);
    expect(JSON.parse(reponses[0]!)).toEqual({ error: 'not_found' });
  }, LIMITE);

  it('deployed without its media binding → 502 by name with his key, still 401 without', async () => {
    const ref = 'media/00000000-0000-4000-8000-000000000000';
    const res = await porte(ref, cle, sansMedia);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'media_indisponible' });
    expect((await porte(ref, {}, sansMedia)).status).toBe(401);
  }, LIMITE);

  it('the preflight lets his console send its key header', async () => {
    const pre = (await mf.dispatchFetch('http://o/fulfillment/repere-audio', {
      method: 'OPTIONS',
      headers: { Origin: 'https://boutik-plus-web.pages.dev', 'Access-Control-Request-Headers': 'authorization' },
    })) as unknown as Response;
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Headers') ?? '').toMatch(/Authorization/);
  }, LIMITE);
});
