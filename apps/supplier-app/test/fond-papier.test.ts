import { afterEach, describe, expect, it } from 'vitest';
import { sharedColour } from '@platform/ui-tokens';
import { armerManipulateur, journalManipulateur } from './doubles/expo-image-manipulator';
import { FOND_PAPIER, derivativeActions, fondPapier } from '../src/studio/normalization';
import { nativeImageSource } from '../src/studio/pick-native';
import { renderCropDerivative } from '../src/studio/capture';

/**
 * MEDIA-PORTE-1 (AUDIT-B+2 F-49) — A SEE-THROUGH PICTURE IS LAID ON PAPER.
 *
 * JPEG has no transparency. On the web the image library draws the picture on
 * an unfilled canvas and encodes a JPEG, so every clear pixel of a PNG or WebP
 * cut-out came out BLACK — and the preview showed it before « Publier ».
 *
 * What these tests hold, against the library's native boundary (the double
 * records the verbs it is asked for and makes no pixels — its bounds are at
 * its top): both renderers that start from a file he picked lay the result on
 * the paper token, at the rendered image's OWN size and origin, AFTER the
 * resize and BEFORE the JPEG. The pixels themselves were checked once in a
 * real Chromium (journal); a stand-in cannot claim them.
 */

// A JPEG the app's own strip and EXIF assert accept: SOI · APP0 JFIF · EOI.
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]).toString('base64');

afterEach(() => armerManipulateur(null));

describe('the paper fill is a fill — never a geometry change', () => {
  it('is the Boutik+ paper token, at origin 0,0, at exactly the size it is given', () => {
    expect(FOND_PAPIER).toBe(sharedColour.paper);
    for (const [w, h] of [[1280, 960], [960, 1280], [1, 1], [1280, 1280]] as const) {
      expect(fondPapier(w, h)).toStrictEqual({
        extent: { backgroundColor: sharedColour.paper, originX: 0, originY: 0, width: w, height: h },
      });
    }
  });

  it('the derivative spec itself is untouched: still resize-only', () => {
    for (const a of derivativeActions(4000, 3000)) expect(Object.keys(a)).toEqual(['resize']);
  });
});

describe('the picked picture — `nativeImageSource.encode`', () => {
  it('resize → render → paper at the RENDERED size → render → JPEG', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 1280, height: 853 });
    const out = await nativeImageSource.encode('decoded-image', derivativeActions(4000, 2666));
    expect(out).toEqual({ base64: JPEG_B64, width: 1280, height: 853 });
    expect(journalManipulateur()).toEqual([
      ['manipulate'],
      ['resize', { width: 1280 }],
      ['renderAsync'],
      ['manipulate'],
      ['extent', fondPapier(1280, 853).extent],
      ['renderAsync'],
      ['saveAsync', { compress: 0.8, format: 'jpeg', base64: true }],
    ]);
  });

  it('a picture already within the box is still laid on paper', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 800, height: 600 });
    await nativeImageSource.encode('decoded-image', derivativeActions(800, 600));
    const verbes = journalManipulateur().map((e) => e[0]);
    expect(verbes).toEqual(['manipulate', 'renderAsync', 'manipulate', 'extent', 'renderAsync', 'saveAsync']);
    expect(journalManipulateur().find((e) => e[0] === 'extent')?.[1]).toStrictEqual(fondPapier(800, 600).extent);
  });
});

describe('the hero crops — `renderCropDerivative` starts from the file he picked too', () => {
  it('crop → resize → render → paper at the RENDERED size → render → JPEG', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 1280, height: 1280 });
    const rect = { originX: 0, originY: 500, width: 3000, height: 3000 };
    const out = await renderCropDerivative('blob:master', rect);
    expect(out.width).toBe(1280);
    expect(journalManipulateur()).toEqual([
      ['manipulate'],
      ['crop', rect],
      ['resize', { width: 1280 }],
      ['renderAsync'],
      ['manipulate'],
      ['extent', fondPapier(1280, 1280).extent],
      ['renderAsync'],
      ['saveAsync', { compress: 0.8, format: 'jpeg', base64: true }],
    ]);
  });
});
