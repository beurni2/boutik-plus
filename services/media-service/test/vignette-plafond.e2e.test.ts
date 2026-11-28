import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { THUMB_MAX_BYTES } from '../src/media.js';

/**
 * ═══ THE VIGNETTE'S CEILING IS THE CANON THUMBNAIL ROW: 15 KB ═══
 *
 * PERF-BUDGETS « Image sizes »: thumbnail ≤ 15 KB. Every buyer tile, basket
 * card and list row downloads the vignette (`?v=thumb`), so the media Worker
 * is the wall: the supplier app aims under it, and the Worker refuses what is
 * over it, with the same typed `too_large` as every other door.
 *
 * Driven against the REAL bundle (`dist/worker/worker.mjs`, built by
 * `pretest`) on workerd with an R2 binding, under the deployed
 * compatibility date; the outcome is asked of the read route and of the
 * bucket, never only of the write's answer.
 *
 * The photograph's own ceiling is NOT lowered here: this same door takes the
 * riders' proof photos and the suppliers' readiness proofs.
 */

const BUNDLE = fileURLToPath(new URL('../dist/worker/worker.mjs', import.meta.url));
const COMPAT = ((): string => {
  const toml = readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8');
  const found = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(toml);
  if (found === null) throw new Error('wrangler.toml has no compatibility_date');
  return found[1]!;
})();
const WRITE = 'test-media-write-plafond';
const LIMITE = 30_000;
const PLAFOND = 15 * 1024;

/** A baseline JPEG frame of exactly `total` bytes declaring `width`×`height`. */
function jpeg(width: number, height: number, total: number, remplissage = 0x12): Uint8Array {
  const seg = (marker: number, body: readonly number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const tete = [
    0xff, 0xd8,
    ...seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
    ...seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
  ];
  const out = new Uint8Array(total);
  out.set(tete, 0);
  out.fill(remplissage, tete.length, total - 2);
  out[total - 2] = 0xff;
  out[total - 1] = 0xd9;
  return out;
}

let mf!: Miniflare;
const dirs: string[] = [];

beforeAll(async () => {
  const d = mkdtempSync(join(tmpdir(), 'vignette-plafond-'));
  dirs.push(d);
  mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(BUNDLE, 'utf8') }],
    compatibilityDate: COMPAT,
    r2Buckets: { BUCKET: 'vignette-plafond-bucket' },
    r2Persist: d,
    bindings: { MEDIA_WRITE_SECRET: WRITE },
  });
  await mf.ready;
}, LIMITE);
afterAll(async () => {
  await mf?.dispose();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A photograph through the real upload door: its ref and its one-time vignette token. */
async function photographie(remplissage: number): Promise<{ ref: string; jeton: string; octets: Uint8Array }> {
  const octets = jpeg(1280, 1280, 2_000, remplissage);
  const res = await mf.dispatchFetch('http://media/media', { method: 'POST', headers: { 'X-Write-Key': WRITE }, body: octets });
  expect(res.status).toBe(201);
  const corps = (await res.json()) as { ref: string; thumbToken: string };
  return { ref: corps.ref, jeton: corps.thumbToken, octets };
}

async function vignette(ref: string, jeton: string, octets: Uint8Array): Promise<Response> {
  return mf.dispatchFetch(`http://media/media/thumb?for=${encodeURIComponent(ref)}`, {
    method: 'POST',
    headers: { 'X-Write-Key': WRITE, 'X-Thumb-Token': jeton },
    body: octets,
  });
}

describe('the vignette door holds the canon thumbnail row', () => {
  it('its ceiling is 15 KB, to the byte', () => {
    expect(THUMB_MAX_BYTES).toBe(15_360);
  });

  it('a vignette of exactly 15 KB is stored, and the read route answers those bytes', async () => {
    const { ref, jeton } = await photographie(0x21);
    const petite = jpeg(320, 320, PLAFOND, 0x31);

    const res = await vignette(ref, jeton, petite);

    expect(res.status).toBe(201);
    const lue = new Uint8Array(await (await mf.dispatchFetch(`http://media/${ref}?v=thumb`)).arrayBuffer());
    expect(lue).toEqual(petite);
  }, LIMITE);

  it('one byte more is refused with the same `too_large`, the slot stays empty, and the tile is answered the photograph', async () => {
    const { ref, jeton, octets } = await photographie(0x22);

    const res = await vignette(ref, jeton, jpeg(320, 320, PLAFOND + 1, 0x32));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'rejected', reason: 'too_large' });
    const seau = await mf.getR2Bucket('BUCKET');
    expect(await seau.head(`${ref}~t`), 'ASK THE BUCKET: no vignette was written').toBeNull();
    const lue = new Uint8Array(await (await mf.dispatchFetch(`http://media/${ref}?v=thumb`)).arrayBuffer());
    expect(lue, 'the fallback: the photograph itself').toEqual(octets);
  }, LIMITE);
});
