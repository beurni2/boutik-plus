import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * A KEY CHANGES WITH NO GAP — both keys this Worker CHECKS, on real workerd
 * (Execution Contract §11, « overlapping windows »).
 *
 * The media Worker checks two keys, both presented as `X-Write-Key`:
 *   · MEDIA_WRITE_SECRET   — the uploads (photo, video, voice note, vignette);
 *   · MEDIA_REVOKE_SECRET  — the founder's byte cleanup, `/media/revoke`.
 * Each also accepts `X_NEXT` while it is set: set X_NEXT beside X · move the
 * sender · put the new value in X · delete X_NEXT — nothing refused between.
 *
 * Same header, two keys: so the proof that matters most here is that one
 * key's next value never opens the other key's door. Driven against the REAL
 * bundle (`dist/worker/worker.mjs`, built by `pretest`) with an R2 binding,
 * under the deployed compatibility date; the outcome of an act is asked of
 * the bucket (read the photograph back, then find it gone), never believed
 * from the response.
 */

const LIMITE = 30_000;
const BUNDLE = fileURLToPath(new URL('../dist/worker/worker.mjs', import.meta.url));
const TOML = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
const COMPAT = ((): string => {
  const found = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(readFileSync(TOML, 'utf8'));
  if (found === null) throw new Error('wrangler.toml has no compatibility_date');
  return found[1]!;
})();
const UN_401 = JSON.stringify({ error: 'unauthorized' });

type NomCle = 'ecriture' | 'retrait';

const CLES: Record<NomCle, { readonly env: string; readonly ancienne: string; readonly nouvelle: string }> = {
  ecriture: { env: 'MEDIA_WRITE_SECRET', ancienne: 'test-ecriture-ancienne-b11', nouvelle: 'test-ecriture-nouvelle-b11' },
  retrait: { env: 'MEDIA_REVOKE_SECRET', ancienne: 'test-retrait-ancienne-b11', nouvelle: 'test-retrait-nouvelle-b11' },
};

interface Porte {
  readonly methode: 'POST' | 'PUT';
  readonly chemin: string;
  readonly corps: string;
}

/** Every door behind a key gate (worker/index.ts), by the key it names. */
const PORTES: Record<NomCle, readonly Porte[]> = {
  ecriture: [
    { methode: 'POST', chemin: '/media', corps: 'pas-une-image' },
    { methode: 'POST', chemin: '/media/video', corps: 'pas-une-video' },
    { methode: 'POST', chemin: '/media/audio', corps: 'pas-un-son' },
    { methode: 'POST', chemin: '/media/thumb', corps: 'pas-une-vignette' },
    { methode: 'PUT', chemin: '/media', corps: 'x' },
  ],
  retrait: [{ methode: 'POST', chemin: '/media/revoke', corps: '{}' }],
};

const NOMS: readonly NomCle[] = ['ecriture', 'retrait'];
const AUTRE: Record<NomCle, NomCle> = { ecriture: 'retrait', retrait: 'ecriture' };
const MODULES = [{ type: 'ESModule' as const, path: 'media.mjs', contents: readFileSync(BUNDLE, 'utf8') }];
const dossiers: string[] = [];

function worker(bindings: Record<string, string>): Miniflare {
  const d = mkdtempSync(join(tmpdir(), 'cle-suivante-media-'));
  dossiers.push(d);
  return new Miniflare({ modules: MODULES, compatibilityDate: COMPAT, r2Buckets: { BUCKET: 'cle-suivante-bucket' }, r2Persist: d, bindings });
}

/** During a change: both X and both X_NEXT set. */
const pendant = worker(
  Object.fromEntries(NOMS.flatMap((n) => [[CLES[n].env, CLES[n].ancienne], [`${CLES[n].env}_NEXT`, CLES[n].nouvelle]])),
);
/** After the change: the new value in X, both X_NEXT deleted. */
const apres = worker(Object.fromEntries(NOMS.map((n) => [CLES[n].env, CLES[n].nouvelle])));

afterAll(async () => {
  await pendant.dispose();
  await apres.dispose();
  for (const d of dossiers) rmSync(d, { recursive: true, force: true });
});

/** `null` = no X-Write-Key header at all. */
async function frapper(mf: Miniflare, methode: string, chemin: string, cle: string | null, corps: BodyInit) {
  const res = await mf.dispatchFetch(`http://m${chemin}`, {
    method: methode,
    headers: cle === null ? {} : { 'X-Write-Key': cle },
    body: corps,
  });
  return { status: res.status, texte: await res.text() };
}

/** A baseline JPEG frame of exactly `total` bytes declaring `width`×`height` (the upload validator's own reading). */
function jpeg(width: number, height: number, total: number): Uint8Array {
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
  out.fill(0x12, tete.length, total - 2);
  out[total - 2] = 0xff;
  out[total - 1] = 0xd9;
  return out;
}

for (const nom of NOMS) {
  const cle = CLES[nom];
  const autre = CLES[AUTRE[nom]];

  describe(`${cle.env} — during a change (${cle.env} and ${cle.env}_NEXT both set)`, () => {
    for (const porte of PORTES[nom]) {
      it(`${porte.methode} ${porte.chemin}: the next value gets exactly the answer the current value gets`, async () => {
        const actuelle = await frapper(pendant, porte.methode, porte.chemin, cle.ancienne, porte.corps);
        expect(actuelle.status, actuelle.texte).not.toBe(401);
        const suivante = await frapper(pendant, porte.methode, porte.chemin, cle.nouvelle, porte.corps);
        expect(suivante.status, suivante.texte).toBe(actuelle.status);
        expect(suivante.texte).toBe(actuelle.texte);
      }, LIMITE);

      it(`${porte.methode} ${porte.chemin}: any other value, an empty one, none, and both values of ${autre.env} get the one 401`, async () => {
        for (const [quoi, valeur] of [
          ['another value', 'test-ni-ancienne-ni-nouvelle-b11'],
          ['an empty value', ''],
          ['no header', null],
          [autre.env, autre.ancienne],
          [`${autre.env}_NEXT`, autre.nouvelle],
        ] as const) {
          const r = await frapper(pendant, porte.methode, porte.chemin, valeur, porte.corps);
          expect(r.status, `${quoi} → ${r.texte}`).toBe(401);
          expect(r.texte, quoi).toBe(UN_401);
        }
      }, LIMITE);
    }
  });

  describe(`${cle.env} — after the change (the new value in ${cle.env}, ${cle.env}_NEXT deleted)`, () => {
    for (const porte of PORTES[nom]) {
      it(`${porte.methode} ${porte.chemin}: the old value, an empty one and none get the one 401; the new value passes`, async () => {
        for (const [quoi, valeur] of [
          ['the old value', cle.ancienne],
          ['an empty value', ''],
          ['no header', null],
        ] as const) {
          const r = await frapper(apres, porte.methode, porte.chemin, valeur, porte.corps);
          expect(r.status, `${quoi} → ${r.texte}`).toBe(401);
          expect(r.texte, quoi).toBe(UN_401);
        }
        const nouvelle = await frapper(apres, porte.methode, porte.chemin, cle.nouvelle, porte.corps);
        expect(nouvelle.status, nouvelle.texte).not.toBe(401);
      }, LIMITE);
    }
  });
}

describe('the bucket, not the response: acts done with the next values', () => {
  it('a photograph uploaded with the upload NEXT value is read back; revoked with the revoke NEXT value, it is gone', async () => {
    const octets = jpeg(1280, 1280, 2_000);
    const envoi = await frapper(pendant, 'POST', '/media', CLES.ecriture.nouvelle, octets);
    expect(envoi.status, envoi.texte).toBe(201);
    const ref = (JSON.parse(envoi.texte) as { ref: string }).ref;

    const lu = await pendant.dispatchFetch(`http://m/${ref}`);
    expect(lu.status).toBe(200);
    expect(new Uint8Array(await lu.arrayBuffer())).toEqual(octets);

    const retrait = await frapper(pendant, 'POST', '/media/revoke', CLES.retrait.nouvelle, JSON.stringify({ ref }));
    expect(retrait.status, retrait.texte).toBe(200);
    const apresRetrait = await pendant.dispatchFetch(`http://m/${ref}`);
    expect(apresRetrait.status).toBe(404);
    await apresRetrait.arrayBuffer();
  }, LIMITE);
});
