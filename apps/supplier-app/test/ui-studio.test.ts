import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DERIVATIVE_SPEC_V1,
  ExifLeakError,
  base64ToBytes,
  NORMALIZATION_HOOKS_V1,
  assertExifFree,
  derivativeActions,
  jpegCarriesExif,
  metricsActions,
} from '../src/studio/normalization';
import {
  CAPTURE_CATEGORIES,
  GUIDANCE_THRESHOLDS_V1,
  SHOT_KINDS,
  bytesPerPixel,
  frameGuideKey,
  guidanceFor,
} from '../src/studio/guidance';

/**
 * WO-4.2C — B1.1 + B1.2 laws as tests. Building Plan rows (quoted):
 * B1.1 "Category-aware Hero+Proof; on-device metrics on downscaled frames;
 * in-app camera; voice notes." · B1.2 "Conservative WB/exposure (no clip);
 * safe-box crop; derivatives; EXIF strip; pHash; before/after +
 * use-original-colours; faithfulness tests." Imaging gates: "no
 * segmentation/generative/classification/inference; no server render;
 * price-free; contact-free; master≠derivative; original retained; EXIF
 * stripped; device gates."
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

/** A minimal JPEG: SOI + APP1(Exif) + SOS marker — enough for the scanner. */
function jpegWithExif(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, 0x00, 0x08, // APP1, len 8
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0xff, 0xda, // SOS
  ]);
}
/** Same shape but the APP1 carries XMP-ish bytes, not the Exif identifier. */
function jpegWithoutExif(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00, // APP0 JFIF
    0xff, 0xda,
  ]);
}

describe('B1.2 — EXIF stripped, AT CAPTURE (the guard is on the path, not only the repo scan)', () => {
  it('the pure-JS scanner detects an APP1/Exif segment and the guard throws on it', () => {
    expect(jpegCarriesExif(jpegWithExif())).toBe(true);
    expect(() => assertExifFree(jpegWithExif())).toThrow(ExifLeakError);
  });
  it('a metadata-free JPEG passes the guard', () => {
    expect(jpegCarriesExif(jpegWithoutExif())).toBe(false);
    expect(() => assertExifFree(jpegWithoutExif())).not.toThrow();
  });
  it('non-JPEG bytes never false-positive', () => {
    expect(jpegCarriesExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
  it('the guard FAILS CLOSED: empty bytes are an error, never a vacuous pass (verifier NB2)', () => {
    expect(() => base64ToBytes('')).toThrow(ExifLeakError);
  });
  it('a failed capture is a designed state carrying its CODE, never a silent rejection (WO-4.2D)', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/catch \(error\) \{\s*setFailureDetail\(failureDetailOf\(error\)\);/);
    expect(app).toMatch(/t\('studio\.erreur'\)/);
  });
  it('the capture path STRIPS then asserts — the guard is a post-condition on the shipped bytes (WO-4.2E pin)', () => {
    const capture = read('src/studio/capture.ts');
    expect(capture).toMatch(/const stripped = stripJpegMetadata\(bytes\)/);
    expect(capture).toMatch(/assertExifFree\(stripped\)/);
    expect(capture).not.toMatch(/exif:\s*true/);
  });
});

describe('B1.2 — deterministic derivatives; hooks are declared identity seams', () => {
  it('derivativeActions is deterministic and orientation-aware', () => {
    expect(derivativeActions(4000, 3000)).toEqual([{ resize: { width: DERIVATIVE_SPEC_V1.maxEdgePx } }]);
    expect(derivativeActions(3000, 4000)).toEqual([{ resize: { height: DERIVATIVE_SPEC_V1.maxEdgePx } }]);
    expect(derivativeActions(800, 600)).toEqual([]); // never upscale
    expect(derivativeActions(4000, 3000)).toEqual(derivativeActions(4000, 3000)); // same in → same out
  });
  it('ONLY resize exists in the action vocabulary — no enhancement, no filters, no generative anything', () => {
    for (const a of [...derivativeActions(4000, 3000), ...metricsActions()]) {
      expect(Object.keys(a)).toEqual(['resize']);
    }
    const capture = read('src/studio/capture.ts');
    expect(capture).toMatch(/\.resize\(/);
    expect(capture).not.toMatch(/\.rotate\(|\.flip\(|\.crop\(|\.extent\(/);
  });
  it('the B1.2 seams are identity/absent — no cleanup pipeline exists at this slice', () => {
    expect(NORMALIZATION_HOOKS_V1).toEqual({
      whiteBalance: 'identity',
      safeBoxCrop: 'identity',
      perceptualHash: 'absent',
    });
    for (const f of ['src/studio/normalization.ts', 'src/studio/capture.ts', 'src/studio/guidance.ts']) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // WO-6.5: the ML threat term is « segmentation » (Ten Laws #5), not the
      // JPEG-structural « segment » the allow-list stripper legitimately uses.
      expect(src, `${f} must carry no inference/moderation (comments stripped)`).not.toMatch(
        /tensorflow|onnx|opencv|segmentation|classif|inference|moderation/i,
      );
    }
  });
});

describe('B1.1 — category-aware Hero+Proof guidance on downscaled-frame metrics', () => {
  it('every category × shot has a frame-guide key, and every key lives in the catalog', () => {
    const catalog = JSON.parse(read('i18n/catalog.json')) as Array<{ key: string }>;
    const keys = new Set(catalog.map((e) => e.key));
    for (const c of CAPTURE_CATEGORIES) {
      for (const s of SHOT_KINDS) {
        const key = frameGuideKey(c, s);
        expect(keys.has(key), `catalog missing ${key}`).toBe(true);
      }
    }
    for (const key of ['studio.conseil.lumiere', 'studio.conseil.ok', 'studio.shot_hero', 'studio.shot_preuve']) {
      expect(keys.has(key), `catalog missing ${key}`).toBe(true);
    }
  });
  it('the metric is deterministic bytes-per-pixel on the downscaled frame; low detail INVITES a retake, never blocks', () => {
    const dark = { byteLength: 900, width: 96, height: 54 }; // 0.17 bpp
    const rich = { byteLength: 6000, width: 96, height: 54 }; // 1.16 bpp
    expect(bytesPerPixel(dark)).toBeLessThan(GUIDANCE_THRESHOLDS_V1.adviceBelowBpp);
    expect(guidanceFor(dark)).toEqual({ verdict: 'advice', key: 'studio.conseil.lumiere' });
    expect(guidanceFor(rich)).toEqual({ verdict: 'ok', key: 'studio.conseil.ok' });
    // advice never blocks: the App keeps Confirmer enabled regardless (pin)
    const app = read('App.tsx');
    expect(app).toMatch(/<PrimaryButton label=\{t\('studio\.confirmer'\)\} onPress=\{keepShot\} \/>/);
  });
});

describe('WYSIWYG — the previewed derivative IS the stored derivative (one transform, one object)', () => {
  it('capture.ts renders the derivative exactly once and ships THE STRIPPED BYTES (WO-4.2E: the saveAsync file never ships)', () => {
    const capture = read('src/studio/capture.ts');
    expect(capture.match(/renderDerivative\(/g)).toHaveLength(2); // 1 def + 1 call
    expect(capture).toMatch(/const derivative = await renderDerivative\(photo\.uri, photo\.width, photo\.height\)/);
    // The shipped uri is a data URI built from the stripped bytes — the
    // founder's device proved the file at derivative.uri can carry EXIF.
    expect(capture).toMatch(/uri: `data:image\/jpeg;base64,\$\{bytesToBase64\(stripped\)\}`/);
    expect(capture).not.toMatch(/uri: derivative\.uri/);
  });
  it('the App previews pending.derivative.uri and stores the SAME pending object (source pin)', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/source=\{\{ uri: pending\.derivative\.uri \}\}/);
    expect(app).toMatch(/setShots\(\(s\) => \(\{ \.\.\.s, \[shot\]: pending \}\)\)/);
  });
  it('master ≠ derivative and the original is retained (imaging gate)', () => {
    const capture = read('src/studio/capture.ts');
    expect(capture).toMatch(/masterUri: photo\.uri/);
    expect(capture).toMatch(/quality: 1/); // the master is the untouched full capture
  });
  it('retake is as cheap as confirm — side by side, same weight classes', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/SecondaryButton label=\{t\('studio\.reprendre'\)\}/);
    expect(app).toMatch(/styles\.retakeRow/);
  });
});

describe('scope + dependency law', () => {
  it('exactly the two ordered deps at the SDK-54 bundled versions', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['expo-camera']).toBe('~17.0.10');
    expect(pkg.dependencies['expo-image-manipulator']).toBe('~14.0.8');
  });
  it('the offline queue is honest: capture completion sets the pending notice, never « done »', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/setPendingKey\('studio\.queue_pending'\)/);
  });
  it('the studio imports stay inside the authorized world', () => {
    const BANNED = /@platform\/certification|@platform\/contracts|@platform\/i18n|^node:|expo-av|expo-audio|expo-file-system/;
    for (const f of ['src/studio/capture.ts', 'src/studio/normalization.ts', 'src/studio/guidance.ts']) {
      const specs = [...read(f).matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
      for (const spec of specs) expect(spec, `${f} imports ${spec}`).not.toMatch(BANNED);
    }
  });
});
