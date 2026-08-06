import { describe, expect, it } from 'vitest';
import { ProductAssetsSchema } from '@platform/contracts';
import { buildPremiumFrameAssets } from '../src/premium-frame.js';

const SHA = 'a3f5c9d21e8b47061234567890abcdef1234567890abcdef1234567890abcdef';
const capture = {
  captureRef: 'cap-001.jpg',
  sha256: SHA,
  mimeType: 'image/jpeg',
  exif: { GPSLatitude: '12.37', GPSLongitude: '-1.52', Make: 'TechnoCam' },
};

describe('premium-frame image path — EXIF stripped, price-free, contact-free, no cleanup', () => {
  it('builds canonical ProductAssets: EXIF is structurally ABSENT from every derivative; master is private', () => {
    const outcome = buildPremiumFrameAssets(capture);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(ProductAssetsSchema.safeParse(outcome.assets).success).toBe(true);
    /**
     * AUDIT-B+1 F21 — THIS ASSERTION COULD NOT FAIL.
     *
     * It used to read `expect(JSON.stringify(ref)).not.toMatch(/GPS|exif|Make/i)`
     * — the NAMES of the EXIF fields. A leak carries the VALUES, not the field
     * names, so the audit smuggled the whole capture through and stayed green:
     *   media/premium-frame-square/cap-001.jpg?lat=12.37&lon=-1.52&cam=TechnoCam
     *   Test Files 11 passed (11) · Tests 83 passed (83) · EXIT=0
     * The name-grep was also strictly dominated by the `Object.keys` check
     * above it: no mutation existed that it could catch and that line could not.
     *
     * Sweeping `Object.values(capture.exif)` is what B+I-02 actually means — a
     * derivative must carry none of the capture's metadata VALUES, whatever the
     * transport spells them.
     */
    for (const ref of [outcome.assets.heroSquare, outcome.assets.heroVertical, outcome.assets.proof]) {
      expect(Object.keys(ref).sort()).toEqual(['mimeType', 'ref', 'sha256']);
      const serialise = JSON.stringify(ref);
      for (const valeur of Object.values(capture.exif)) {
        expect(serialise, `EXIF VALUE « ${valeur} » reached a derivative — B+I-02`).not.toContain(valeur);
      }
    }
    expect(outcome.assets.masterRef.ref.startsWith('private/master/')).toBe(true);
  });

  it('a PRICE overlay is refused closed — assets are price-free (B+I-02)', () => {
    for (const overlayText of ['Prix 5 000 F', 'Seulement 12500 FCFA', '3.000 francs']) {
      expect(buildPremiumFrameAssets({ ...capture, overlayText })).toEqual({ ok: false, reason: 'price_material_refused' });
    }
  });

  it('CONTACT material is refused closed — assets are contact-free', () => {
    for (const overlayText of ['Appelez le 70 12 34 56', 'WhatsApp +226 70 12 34 56']) {
      expect(buildPremiumFrameAssets({ ...capture, overlayText })).toEqual({ ok: false, reason: 'contact_material_refused' });
    }
  });

  it('a harmless overlay passes — refusals are about price/contact, not decoration', () => {
    expect(buildPremiumFrameAssets({ ...capture, overlayText: 'Fait main au Faso' }).ok).toBe(true);
  });
});

/**
 * AUDIT-B+1 F21, the second half — the module under test is UNREACHABLE from
 * every shipped path, and the tests above never said so.
 *
 * `grep -rn buildPremiumFrameAssets` returns its own definition and this file;
 * no workspace package depends on @boutik/media-service, and the deployed media
 * Worker contains zero references to premium-frame, exif or overlay. So these
 * are non-vacuous assertions ON DEAD CODE — worth keeping (the price refusal
 * genuinely bites), but they must not be mistaken for evidence that B+I-02 is
 * enforced on a live path.
 *
 * REAL enforcement today lives on the capture side, fail-closed:
 *   apps/supplier-app/src/studio/normalization.ts:65-69
 *   apps/supplier-app/src/studio/pick.ts:22-23
 *   apps/supplier-app/src/studio/capture.ts:16-17
 * Shipped images are not exposed. What does NOT exist in any live path is the
 * price/contact-overlay refusal — there is no `overlayText` concept in the app.
 *
 * ⚠ FOUNDER DECISION, deliberately NOT taken here: either wire
 * buildPremiumFrameAssets into the real capture path, or delete it and move the
 * B+I-02 claim to where enforcement actually lives. Both are product calls.
 * This test records the true reachability so the claim stops overstating itself.
 */
describe('B+I-02 reachability — recorded, not claimed', () => {
  it('buildPremiumFrameAssets is imported by NOTHING outside its own test', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const racine = join(import.meta.dirname, '..', '..', '..');
    const trouves: string[] = [];
    const ignorer = new Set(['node_modules', '.git', 'dist', 'coverage', '_evidence', '.expo']);
    const marcher = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (ignorer.has(e.name) || e.name.startsWith('.')) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) marcher(p);
        else if (/\.(ts|tsx|mts|cts)$/.test(e.name) && statSync(p).size < 2_000_000) {
          if (readFileSync(p, 'utf8').includes('buildPremiumFrameAssets')) trouves.push(p.slice(racine.length + 1));
        }
      }
    };
    marcher(join(racine, 'services'));
    marcher(join(racine, 'apps'));
    marcher(join(racine, 'packages'));

    // Its definition and this test file — nothing else. If a third file
    // appears, the module became REACHABLE and the founder decision above is
    // resolved: update this test and the B+I-02 claim together.
    expect(trouves.sort(), 'reachability changed — re-read the F21 note above').toEqual([
      'services/media-service/src/premium-frame.ts',
      'services/media-service/test/premium-frame.test.ts',
    ]);
  });
});
