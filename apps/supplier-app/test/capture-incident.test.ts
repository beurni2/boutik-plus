import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExifLeakError,
  assertExifFree,
  base64ToBytes,
  failureDetailOf,
  jpegCarriesExif,
} from '../src/studio/normalization';
import { CAPTURE_CATEGORIES, SHOT_KINDS, frameGuideKey } from '../src/studio/guidance';

/**
 * WO-4.2D — the founder-device capture incident (« La photo n'a pas pu
 * être prise » on iPhone/Expo Go) + the founder UX round.
 * PART A LAW: the capture path depends on NO runtime global. WO-4.2C's
 * fail-closed guard threw when `atob` was absent — an assumption the
 * verifier flagged UNVERIFIABLE in-sandbox. The assumption is now removed
 * BY CONSTRUCTION (pure RFC 4648 decoder); fail-closed is retained for
 * genuinely invalid input.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

/** Real JPEG fixture bytes (the WO-4.2C EXIF fixtures), base64-encoded
 * through node's own encoder — the reference the pure decoder must match. */
function jpegWithExif(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x08,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0xff, 0xda,
  ]);
}
function jpegWithoutExif(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00,
    0xff, 0xda,
  ]);
}
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WO-4.2D Part A — the atob assumption is REMOVED by construction', () => {
  it('ATOB-ABSENT SIMULATION: with the global deleted, the guard path succeeds end-to-end', () => {
    vi.stubGlobal('atob', undefined);
    expect(typeof atob).not.toBe('function'); // the WO-4.2C failure condition holds…
    // …and the full pure-module capture-guard chain still works:
    const cleanBytes = base64ToBytes(b64(jpegWithoutExif()));
    expect(jpegCarriesExif(cleanBytes)).toBe(false);
    expect(() => assertExifFree(cleanBytes)).not.toThrow();
    // and the EXIF attack still trips the guard (fail-closed retained):
    const exifBytes = base64ToBytes(b64(jpegWithExif()));
    expect(jpegCarriesExif(exifBytes)).toBe(true);
    expect(() => assertExifFree(exifBytes)).toThrow(ExifLeakError);
  });

  it('the pure decoder is BYTE-IDENTICAL to the reference decoder on the EXIF fixtures (padded and unpadded)', () => {
    for (const fixture of [jpegWithExif(), jpegWithoutExif()]) {
      const encoded = b64(fixture);
      expect(base64ToBytes(encoded)).toEqual(new Uint8Array(Buffer.from(encoded, 'base64')));
      expect(base64ToBytes(encoded)).toEqual(fixture);
      expect(base64ToBytes(encoded.replace(/=+$/, ''))).toEqual(fixture); // unpadded form
    }
    // and across every 0..3 padding remainder on arbitrary bytes:
    for (let n = 1; n <= 8; n++) {
      const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37 + 5) & 0xff));
      expect(base64ToBytes(b64(bytes))).toEqual(bytes);
    }
  });

  it('WHITESPACE-WRAPPED base64 decodes (verifier NB①: the old atob path forgave it — a stricter decoder would re-refuse founder-device captures)', () => {
    const fixture = jpegWithoutExif();
    const wrapped = b64(fixture).replace(/(.{4})/g, '$1\n'); // MIME-style wrapping
    expect(base64ToBytes(wrapped)).toEqual(fixture);
    expect(base64ToBytes(` \t${b64(fixture)}\r\n`)).toEqual(fixture);
  });

  it('FAIL-CLOSED retained: empty, illegal-length, and out-of-alphabet input throw decode_failed — never a vacuous pass', () => {
    for (const bad of ['', 'A', '####', 'ABéA']) {
      let caught: unknown;
      try {
        base64ToBytes(bad);
      } catch (error) {
        caught = error;
      }
      expect(caught, `input ${JSON.stringify(bad)}`).toBeInstanceOf(ExifLeakError);
      expect((caught as ExifLeakError).detail).toBe('decode_failed');
    }
  });

  it('VERIFIER BLOCKER ① pinned: padding-only or whitespace-only input NEVER becomes a 0-byte vacuous pass through the EXIF guard', () => {
    for (const bad of ['=', '==', '===', '====', ' \n ', '\t==\n', '= =']) {
      let caught: unknown;
      try {
        base64ToBytes(bad);
      } catch (error) {
        caught = error;
      }
      expect(caught, `input ${JSON.stringify(bad)} must refuse`).toBeInstanceOf(ExifLeakError);
      expect((caught as ExifLeakError).detail).toBe('decode_failed');
    }
    // the vacuous-pass scenario itself, end to end: an empty byte array
    // would sail through the EXIF scanner — the decoder must never emit one.
    expect(jpegCarriesExif(new Uint8Array(0))).toBe(false); // why the guard alone can't save us
    expect(() => base64ToBytes('==')).toThrow(ExifLeakError); // and why the decoder must
  });

  it('no module on the capture path references atob anymore (source pin, comments stripped)', () => {
    for (const f of ['src/studio/normalization.ts', 'src/studio/capture.ts']) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, `${f} still references atob`).not.toMatch(/\batob\b/);
    }
  });

  it('classification is deterministic: guard errors carry their code; permission-shaped rejections are named; the rest is capture_failed', () => {
    expect(failureDetailOf(new ExifLeakError('exif', 'exif_leak'))).toBe('exif_leak');
    expect(failureDetailOf(new ExifLeakError('bad bytes', 'decode_failed'))).toBe('decode_failed');
    expect(failureDetailOf(new Error('Camera permission denied by user'))).toBe('permission');
    expect(failureDetailOf(new Error('User NotAuthorized for camera'))).toBe('permission'); // verifier NB②
    expect(failureDetailOf(new Error('AVFoundation: capture interrupted'))).toBe('capture_failed');
    expect(failureDetailOf('something odd')).toBe('capture_failed');
    // assertExifFree's own throw defaults to exif_leak:
    try {
      assertExifFree(jpegWithExif());
      expect.unreachable();
    } catch (error) {
      expect(failureDetailOf(error)).toBe('exif_leak');
    }
  });
});

describe('WO-4.2D Part B — the market category set (capture guidance ONLY)', () => {
  it('nine categories, each with a catalog label and a frame guide per shot', () => {
    expect(CAPTURE_CATEGORIES).toEqual([
      'mode', 'tissus', 'chaussures', 'sacs_accessoires', 'beaute_scellee',
      'maison', 'electromenager', 'enfants_bebe', 'artisanat',
    ]);
    const catalog = JSON.parse(read('i18n/catalog.json')) as Array<{ key: string }>;
    const keys = new Set(catalog.map((entry) => entry.key));
    for (const c of CAPTURE_CATEGORIES) {
      expect(keys.has(`categorie.${c}`), `catalog missing categorie.${c}`).toBe(true);
      for (const s of SHOT_KINDS) {
        expect(keys.has(frameGuideKey(c, s)), `catalog missing ${frameGuideKey(c, s)}`).toBe(true);
      }
    }
  });

  it('no policy is created here: the guidance module names the open Decision and gates no category', () => {
    const guidance = read('src/studio/guidance.ts');
    expect(guidance).toContain('CAPTURE-GUIDANCE categories only');
    expect(guidance).toContain('open Decision');
    // No allow/deny MACHINERY exists in code — comments stripped first: the
    // docblock NAMES the prohibited-list Decision it refuses to close.
    const codeOnly = guidance.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/prohibit|interdit|allowed|blocked|banned/i);
  });
});
