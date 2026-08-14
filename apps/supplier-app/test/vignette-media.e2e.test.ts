import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { HttpMediaService } from '../src/supply/media';

/**
 * ═══ THUMB-PRODUIT-1 · THE SEAM: this app's OWN media port against the REAL
 *     media Worker, on real workerd, with a real R2 binding ═══
 *
 * Founder, 2026-08-11: « fix the full size photograph. » His « À traiter » board
 * paints 54 px squares and each one pulled the whole `heroSquare`.
 *
 * WHY THIS IS A SEAM TEST AND NOT A UNIT: the fix is only real if the READ ROUTE
 * hands back the small object — and that crosses the app's port, the Worker's
 * write gate, the vignette door, the derived key, R2, and the read route's
 * variant branch. A fake at any one of those hops proves nothing about the
 * bytes his phone actually downloads. So it runs on real workerd and it ASKS THE
 * READ ROUTE for the outcome rather than believing the write's own answer.
 *
 * ⚠ THE FALLBACK IS TESTED AS HARD AS THE HIT. Every photograph he already owns
 * has an empty vignette slot and nothing server-side can fill one (this Worker
 * has no decoder — see the bounds block in `src/media.ts`). If `?v=thumb` 404'd
 * on those, this slice would blank the very board it was written to fix.
 *
 * ⚠ MINIFLARE IS RESOLVED FROM A SERVICE PACKAGE, not added as a dependency of
 * this app — an app bundle must not grow a Workers runtime to satisfy a test.
 */

/**
 * ⚠ REPO-RELATIVE, AND IT FAILS RATHER THAN SKIPS (verifier MAJOR). The first
 * version hard-coded `/home/user/boutik-plus/…`, so on CI — which checks out to
 * `/home/runner/work/…` — this file's `skipIf` silenced the slice's ONLY
 * end-to-end proof and the board went green with zero seam coverage. §9.8
 * exactly. `apps/supplier-app`'s `pretest` builds this bundle, so an absent one
 * is a broken setup and must be loud, not quiet.
 */
const MEDIA_BUNDLE = fileURLToPath(new URL('../../../services/media-service/dist/worker/worker.mjs', import.meta.url));
const WRITE = 'test-media-write-vignette';
/**
 * ⚠ THE DEPLOY'S OWN COMPATIBILITY DATE, read from `services/media-service/
 * wrangler.toml` — not a default. Running the bundle under a NEWER date than
 * production uses would be testing a Worker the founder does not have, and it
 * fails loudly for a real reason: this entry module exports route-path constants
 * and handler functions beside its default handler, and workerd's newer
 * entrypoint validation refuses a named export that is not a handler
 * («Incorrect type for map entry 'AUDIO_UPLOAD_PATH'»). Under 2025-07-05 — what
 * is deployed — it starts. NAMED FOR THE FOUNDER rather than papered over: the
 * day this service's compatibility_date is bumped, those exports have to move
 * out of the entry module first, or the deploy breaks.
 */
const MEDIA_COMPAT = ((): string => {
  const toml = readFileSync(fileURLToPath(new URL('../../../services/media-service/wrangler.toml', import.meta.url)), 'utf8');
  const found = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(toml);
  if (found === null) throw new Error('media-service wrangler.toml has no compatibility_date');
  return found[1]!;
})();

type MiniflareCtor = new (opts: Record<string, unknown>) => {
  dispatchFetch(url: string, init?: unknown): Promise<Response>;
  dispose(): Promise<void>;
};
function loadMiniflare(): MiniflareCtor | null {
  try {
    const req = createRequire(fileURLToPath(new URL('../../../services/offer-service/package.json', import.meta.url)));
    return (req('miniflare') as { Miniflare: MiniflareCtor }).Miniflare;
  } catch {
    return null;
  }
}
const Miniflare = loadMiniflare();

/**
 * A REAL PNG header with real dimensions and a real byte length — the service
 * reads all three (magic sniff · IHDR · length bounds), so a fixture that
 * cheated on any of them would be testing a different service. `fill` makes two
 * images of the same size distinguishable, which is how the read route's answer
 * is identified rather than assumed.
 */
function png(w: number, h: number, bytes: number, fill: number): Uint8Array {
  const b = new Uint8Array(Math.max(64, bytes));
  b.fill(fill);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const be32 = (v: number, at: number): void => b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
  be32(w, 16);
  be32(h, 20);
  return b;
}

/** What his phone uploads today: a bounded derivative, 1280 px, ~300 KB. */
const PHOTO = png(1280, 1280, 300_000, 0xa1);
/** What the vignette door is for: 320 px, ~8 KB — the whole point of the slice. */
const VIGNETTE = png(320, 320, 8_000, 0xb2);
/** A second, different vignette — so « write-once » is proven by CONTENT, not by status code alone. */
const AUTRE_VIGNETTE = png(320, 320, 9_000, 0xc3);

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('VIGNETTE-MEDIA — the 54 px row stops pulling the whole photograph', () => {
    it('the seam is RUNNABLE — miniflare resolved and the media bundle is built', () => {
      // The guard that used to be a `skipIf`. A missing bundle now reddens the
      // board instead of silently deleting the slice's only real proof.
      expect(Miniflare, 'miniflare must resolve from services/offer-service').not.toBeNull();
      expect(existsSync(MEDIA_BUNDLE), `run pnpm --filter @boutik/media-service bundle:worker — missing ${MEDIA_BUNDLE}`).toBe(true);
    });

    it('uploads a photograph and its vignette through THIS app’s port, and the READ ROUTE hands back the small one', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'vignette-seam-'));
      dirs.push(dir);
      const mf = new Miniflare!({
        modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(MEDIA_BUNDLE, 'utf8') }],
        compatibilityDate: MEDIA_COMPAT,
        r2Buckets: { BUCKET: 'vignette-seam-bucket' },
        r2Persist: dir,
        bindings: { MEDIA_WRITE_SECRET: WRITE },
      });
      const previous = globalThis.fetch;
      // NOT A FAKE — every call is ROUTED to the real Worker. The app's port
      // reaches for the global `fetch` by design, so this is how its own code
      // path (headers, query string, raw body) is exercised verbatim.
      globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
        mf.dispatchFetch(String(url), init as never)) as unknown as typeof globalThis.fetch;
      try {
        const port = new HttpMediaService('http://media', WRITE);

        // ── the photograph, through the app's own uploadImage ────────────────
        const up = await port.uploadImage(PHOTO);
        expect(up.ok, up.ok ? '' : up.reason).toBe(true);
        const ref = up.ok ? up.value.ref : '';
        expect(ref.startsWith('media/')).toBe(true);

        // BEFORE THE VIGNETTE EXISTS: `?v=thumb` must ALREADY answer — with the
        // photograph. This is the state every ref he owns today is in.
        const avant = await mf.dispatchFetch(`http://media/${ref}?v=thumb`);
        expect(avant.status, 'a ref with no vignette must FALL BACK, never 404').toBe(200);
        expect((await avant.arrayBuffer()).byteLength).toBe(PHOTO.byteLength);

        // ── the vignette, through the app's own uploadThumb ──────────────────
        const stored = await port.uploadThumb(ref, VIGNETTE);
        expect(stored.ok, stored.ok ? '' : stored.reason).toBe(true);
        expect(stored.ok && stored.value.for).toBe(ref);

        // ── AND THE READ ROUTE AGREES — the ledger, not the write's answer ───
        const petit = await mf.dispatchFetch(`http://media/${ref}?v=thumb`);
        expect(petit.status).toBe(200);
        const petitBytes = new Uint8Array(await petit.arrayBuffer());
        expect(petitBytes.byteLength, 'the row must get the VIGNETTE').toBe(VIGNETTE.byteLength);
        expect(petitBytes[64], 'and it must be the vignette’s OWN bytes').toBe(0xb2);
        // The founder's actual complaint, measured: the row costs a fraction.
        expect(petitBytes.byteLength * 10).toBeLessThan(PHOTO.byteLength);

        // …and the PHOTOGRAPH is still the photograph. The fiche and the vitrine
        // read the bare url and must be untouched by any of this.
        const grand = await mf.dispatchFetch(`http://media/${ref}`);
        expect(grand.status).toBe(200);
        const grandBytes = new Uint8Array(await grand.arrayBuffer());
        expect(grandBytes.byteLength).toBe(PHOTO.byteLength);
        expect(grandBytes[64]).toBe(0xa1);

        // ── PORTÉE-MEDIA — the AVPlayer probe, ON REAL workerd R2. The read
        //    route's unit suite certifies its fake bucket to R2's ranged
        //    bounds; THIS is where those bounds are proven for this worker:
        //    R2 natively slices, reports the total, and refuses past-the-end.
        expect(grand.headers.get('Accept-Ranges'), 'the full read must SAY ranges are welcome').toBe('bytes');
        const probe = await mf.dispatchFetch(`http://media/${ref}`, { headers: { Range: 'bytes=0-1' } });
        expect(probe.status, 'a ranged ask must be 206, never 200-full — iOS refuses the media otherwise').toBe(206);
        expect(probe.headers.get('Content-Range')).toBe(`bytes 0-1/${PHOTO.byteLength}`);
        const probeBytes = new Uint8Array(await probe.arrayBuffer());
        expect([...probeBytes], 'the PNG signature’s first two bytes — a REAL slice, not a re-labelled body').toEqual([0x89, 0x50]);
        const beyond = await mf.dispatchFetch(`http://media/${ref}`, { headers: { Range: 'bytes=999999999-' } });
        expect(beyond.status).toBe(416);
        expect(beyond.headers.get('Content-Range')).toBe(`bytes */${PHOTO.byteLength}`);

        // ── WRITE-ONCE, the whole anti-defacement story ──────────────────────
        const encore = await port.uploadThumb(ref, AUTRE_VIGNETTE);
        expect(encore.ok, 'a filled slot must be refused').toBe(false);
        expect(!encore.ok && encore.reason).toContain('409');
        // Proven by CONTENT, because a 409 that had still written would be worse
        // than no check at all.
        const apres = new Uint8Array(await (await mf.dispatchFetch(`http://media/${ref}?v=thumb`)).arrayBuffer());
        expect(apres.byteLength).toBe(VIGNETTE.byteLength);
        expect(apres[64]).toBe(0xb2);

        // ── a vignette for a photograph that does not exist is a 404, never a
        //    write to nowhere (the parent check, at the real store) ───────────
        const orphelin = await port.uploadThumb('media/00000000-0000-4000-8000-999999999999', VIGNETTE);
        expect(orphelin.ok).toBe(false);
        expect(!orphelin.ok && orphelin.reason).toContain('404');

        // ── the door is BEHIND THE WRITE GATE, like every other write ────────
        const sansCle = await mf.dispatchFetch(`http://media/media/thumb?for=${encodeURIComponent(ref)}`, {
          method: 'POST',
          body: VIGNETTE,
        });
        expect(sansCle.status, 'no key, no vignette').toBe(401);

        // ── a key outside the minted namespace never addresses anything ──────
        for (const mauvais of ['media/../secret', 'media/hero', '', 'private/device/abc']) {
          const res = await mf.dispatchFetch(`http://media/media/thumb?for=${encodeURIComponent(mauvais)}`, {
            method: 'POST',
            headers: { 'X-Write-Key': WRITE },
            body: VIGNETTE,
          });
          expect(res.status, mauvais).toBe(400);
        }

        // ── the BOUNDS are the service's, not the caller's claim ────────────
        // ⚠ SMALL BYTES, OVERSIZED DIMENSIONS (verifier MINOR): the first
        // version used a 300 KB fixture, so it was refused by the BYTE ceiling
        // and the label « a full photograph is not a vignette » was proven by
        // the wrong bound entirely.
        const tropGrand = await port.uploadThumb(ref, png(1280, 1280, 4_000, 0xd4));
        expect(tropGrand.ok, 'a full-size FRAME is not a vignette, whatever it weighs').toBe(false);
        expect(!tropGrand.ok && tropGrand.reason).toContain('bad_dimensions');
      } finally {
        globalThis.fetch = previous;
        await mf.dispose();
      }
    });

    it('a revoked photograph takes its vignette with it — no 320 px copy survives a takedown', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'vignette-revoke-'));
      dirs.push(dir);
      const REVOKE = 'test-media-revoke-vignette';
      const mf = new Miniflare!({
        modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(MEDIA_BUNDLE, 'utf8') }],
        compatibilityDate: MEDIA_COMPAT,
        r2Buckets: { BUCKET: 'vignette-revoke-bucket' },
        r2Persist: dir,
        bindings: { MEDIA_WRITE_SECRET: WRITE, MEDIA_REVOKE_SECRET: REVOKE },
      });
      const previous = globalThis.fetch;
      globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
        mf.dispatchFetch(String(url), init as never)) as unknown as typeof globalThis.fetch;
      try {
        const port = new HttpMediaService('http://media', WRITE, REVOKE);
        const up = await port.uploadImage(PHOTO);
        const ref = up.ok ? up.value.ref : '';
        expect((await port.uploadThumb(ref, VIGNETTE)).ok).toBe(true);
        expect(
          new Uint8Array(await (await mf.dispatchFetch(`http://media/${ref}?v=thumb`)).arrayBuffer()).byteLength,
        ).toBe(VIGNETTE.byteLength);

        const revoked = await port.revokeImage(ref);
        expect(revoked.ok, revoked.ok ? '' : revoked.reason).toBe(true);

        // BOTH objects are gone at the ORIGIN. A vignette that outlived its
        // photograph would be a recognisable copy of an image he took down.
        expect((await mf.dispatchFetch(`http://media/${ref}`)).status).toBe(404);
        expect((await mf.dispatchFetch(`http://media/${ref}?v=thumb`)).status).toBe(404);
      } finally {
        globalThis.fetch = previous;
        await mf.dispose();
      }
    });
});
