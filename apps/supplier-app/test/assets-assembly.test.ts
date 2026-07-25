import { describe, expect, it } from 'vitest';
import { assembleAssets, type AssemblyInput, type RoleUpload } from '../src/supply/assets';
import { heroSquareCrop, heroVerticalCrop, HERO_VERTICAL_ASPECT } from '../src/studio/crops';
import { readUploadResult } from '../src/supply/media-wire';

/**
 * COMBINED SLICE — assembly (the longest-complete-prefix rule), the hero crop
 * geometry, and the upload-response boundary. All pure; the founder rulings
 * under test are: a missing hero means NO hero (never a promotion), a failed
 * detail cuts the suffix (never a reorder), and no malformed ref ever ships.
 */

const okRef = (r: string): RoleUpload => ({ ok: true, ref: { ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' } });
const FAILED: RoleUpload = { ok: false };

const complete: AssemblyInput = {
  master: okRef('media/master-1'),
  heroSquare: okRef('media/hs-1'),
  heroVertical: okRef('media/hv-1'),
  proof: okRef('media/proof-1'),
  detail: [okRef('media/d-1'), okRef('media/d-2')],
  processingVersion: 'premium-frame.v1',
};

describe('the longest-complete-prefix rule', () => {
  it('every required role present → assets, with every detail that arrived', () => {
    const out = assembleAssets(complete);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.assets.heroSquare.ref).toBe('media/hs-1');
    expect(out.assets.detail.map((d) => d.ref)).toEqual(['media/d-1', 'media/d-2']);
    // hashes: the PROVENANCE ROOT — the master's hash alone, matching the only
    // established producer (media-service premium-frame: hashes:[input.sha256]).
    // Every shipped ref carries its OWN sha256 on its MediaRef; a parallel index
    // here, zipped against assetRefs (master excluded from the wire), would be
    // off by one — a hash claiming to be something it is not (verifier finding).
    expect(out.assets.hashes).toEqual([out.assets.masterRef.sha256]);
  });

  it('A MISSING HERO MEANS NO HERO — a detail is never promoted, the whole set is honestly absent', () => {
    const out = assembleAssets({ ...complete, heroSquare: FAILED });
    expect(out).toEqual({ ok: false, missing: ['heroSquare'] });
    // and nothing partial leaked out to become assetRefs
    expect('assets' in out).toBe(false);
  });

  it('any required role missing is named — the completion path knows exactly what to re-upload', () => {
    const out = assembleAssets({ ...complete, master: FAILED, proof: FAILED });
    expect(out).toEqual({ ok: false, missing: ['master', 'proof'] });
  });

  it('a FAILED DETAIL cuts the suffix — later successes do not ship out of order', () => {
    const out = assembleAssets({ ...complete, detail: [okRef('media/d-1'), FAILED, okRef('media/d-3')] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.assets.detail.map((d) => d.ref)).toEqual(['media/d-1']); // d-3 arrived but does not jump the gap
  });

  it('a malformed sha256 makes a ref UNUSABLE — required role fails the set; detail cuts the suffix', () => {
    const badHash: RoleUpload = { ok: true, ref: { ref: 'media/x', sha256: 'NOT-HEX', mimeType: 'image/jpeg' } };
    expect(assembleAssets({ ...complete, proof: badHash })).toEqual({ ok: false, missing: ['proof'] });
    const out = assembleAssets({ ...complete, detail: [badHash, okRef('media/d-2')] });
    if (!out.ok) return;
    expect(out.assets.detail).toEqual([]);
  });
});

describe('hero crop geometry — two crops of ONE capture, never a fourth shot', () => {
  it('square: centred, side = shorter edge, inside the source', () => {
    expect(heroSquareCrop(4000, 3000)).toEqual({ originX: 500, originY: 0, width: 3000, height: 3000 });
    expect(heroSquareCrop(3000, 4000)).toEqual({ originX: 0, originY: 500, width: 3000, height: 3000 });
    expect(heroSquareCrop(3000, 3000)).toEqual({ originX: 0, originY: 0, width: 3000, height: 3000 });
  });

  it('vertical: 4:5, centred, never out of bounds — property-checked across odd sizes', () => {
    for (const [w, h] of [[4000, 3000], [3000, 4000], [1, 1], [999, 1001], [5000, 1000], [1000, 5000], [1281, 1279]]) {
      const r = heroVerticalCrop(w!, h!);
      expect(r.originX, `${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(r.originY, `${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(r.originX + r.width, `${w}x${h}`).toBeLessThanOrEqual(w!);
      expect(r.originY + r.height, `${w}x${h}`).toBeLessThanOrEqual(h!);
      expect(r.width, `${w}x${h}`).toBeGreaterThan(0);
      expect(r.height, `${w}x${h}`).toBeGreaterThan(0);
      // aspect within a pixel of 4:5 wherever 4:5 is expressible; a degenerate
      // source (too small for integer 4:5) yields the whole source instead of a
      // zero rect the manipulator would throw on — totality over exactness there.
      if (Math.min(w!, h!) >= 100) {
        expect(Math.abs(r.width / r.height - HERO_VERTICAL_ASPECT), `${w}x${h}`).toBeLessThan(0.01);
      }
    }
  });
});

describe('the upload response boundary — validated, never cast', () => {
  it('accepts exactly the media worker 201 shape and refuses everything near it', () => {
    const good = { ref: 'media/abc', contentType: 'image/jpeg', width: 100, height: 80, byteLength: 999 };
    expect(readUploadResult(good)).toEqual(good);
    for (const bad of [
      null, [], 'ok',
      { ...good, ref: 'not-a-media-key' }, // a ref outside the media/ namespace never ships
      { ...good, ref: undefined },
      { ...good, width: 'wide' },
      { ...good, byteLength: NaN },
    ]) {
      expect(readUploadResult(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('THE ROUND-VS-FLOOR LATENT DIVERGENCE — pinned so it bites loudly, never silently (verifier finding #7)', () => {
  /**
   * The frozen V2 demo math (`money.ts:26`, WO-FP-PIXEL §3.4 EXACT) computes
   * `fee = Math.round(B × 0.05)`. Canon RoundingLaw v1 mandates FLOOR — the
   * fraction of a franc stays with the participant.
   *
   * CORRECTED 2026-07-25 (founder rounding ruling — the paragraph here used to
   * say "the wizard's step-2/step-4 preview uses the demo math on what is now
   * the REAL publish flow", and that is no longer true): the real flow's
   * preview now goes through `supply/preview.ts` → the canon waterfall, so the
   * wizard FLOORS. What survives on the demo math is the DEMO BOARD — seed
   * products, the machine's board-write, the Argent screens.
   *
   * This test is kept (founder: "keep your pinning test either way") because
   * the board and the real flow still render side by side in one app, and they
   * agree today ONLY because the stepper moves B in ±500 steps from a ×500
   * base, where 0.05·B is always integral. Changing the frozen formula or the
   * stepper granularity is a FOUNDER ruling; this test makes that day arrive as
   * a red test naming the law, not as two silently different figures.
   * The real flow's own floor behaviour is asserted by value in
   * `test/preview-rounding.test.ts`.
   */
  it('every stepper-reachable B keeps round(0.05·B) === floor(0.05·B) — the demo preview cannot diverge from canon today', () => {
    for (let B = 1_000; B <= 200_000; B += 500) {
      expect(Math.round(B * 0.05), `B=${B}`).toBe(Math.floor(B * 0.05));
    }
    // and the divergence is REAL off-grid — this is why the grid is load-bearing
    expect(Math.round(1_010 * 0.05)).not.toBe(Math.floor(1_010 * 0.05));
  });
});
