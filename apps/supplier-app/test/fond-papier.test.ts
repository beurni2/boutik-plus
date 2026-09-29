import { afterEach, describe, expect, it } from 'vitest';
import { sharedColour } from '@platform/ui-tokens';
import { ImageManipulator, armerManipulateur, journalManipulateur } from './doubles/expo-image-manipulator';
import { FOND_PAPIER, derivativeActions, fondPapier } from '../src/studio/normalization';
import { nativeImageSource } from '../src/studio/pick-native';
import { renderCropDerivative } from '../src/studio/capture';
import { surPapier as surPapierNatif } from '../src/studio/papier';
import { shotFromAsset } from '../src/studio/pick';
import { surPapier as surPapierWeb } from '../src/studio/papier.web';

/**
 * MEDIA-PORTE-1 (AUDIT-B+2 F-49) — A SEE-THROUGH PICTURE IS LAID ON PAPER, ON
 * THE WEB; ON A PHONE NOTHING REACHES FOR A VERB THE PHONE LACKS.
 *
 * JPEG has no transparency. On the web the image library draws the picture on
 * an unfilled canvas and encodes a JPEG, so every clear pixel of a PNG or WebP
 * cut-out came out BLACK — and the preview showed it before « Publier ».
 *
 * The library's `extent` exists on the WEB only. The double is certified to
 * that (its bounds are at its top): armed `'native'` it has no `extent`, as a
 * phone has none. Vitest resolves `papier.ts` — the phone's half — so the
 * app's own renderers below run as they run on a phone; the web half is
 * driven through its own file. The pixels were checked once in a real
 * Chromium on the web resolution (journal); a stand-in cannot claim them.
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

describe('the double is the platform’s — a phone has no `extent`', () => {
  it('armed native, calling `extent` throws as a phone does; armed web, it answers', () => {
    armerManipulateur({ base64: JPEG_B64, width: 10, height: 10 });
    const natif = ImageManipulator.manipulate('x') as Record<string, unknown>;
    expect(natif['extent']).toBeUndefined();
    armerManipulateur({ base64: JPEG_B64, width: 10, height: 10 }, 'web');
    expect(typeof (ImageManipulator.manipulate('x') as Record<string, unknown>)['extent']).toBe('function');
  });
});

describe('ON A PHONE — the picked picture and the hero crop reach no web-only verb (verifier BLOCKER)', () => {
  it('a gallery pick encodes: resize → render → JPEG, nothing else', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 1280, height: 853 });
    const out = await nativeImageSource.encode('decoded-image', derivativeActions(4000, 2666));
    expect(out).toEqual({ base64: JPEG_B64, width: 1280, height: 853 });
    expect(journalManipulateur()).toEqual([
      ['manipulate'],
      ['resize', { width: 1280 }],
      ['renderAsync'],
      ['saveAsync', { compress: 0.8, format: 'jpeg', base64: true }],
    ]);
  });

  it('a hero crop (a camera shot included) renders: crop → resize → render → JPEG', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 1280, height: 1280 });
    const rect = { originX: 0, originY: 500, width: 3000, height: 3000 };
    const out = await renderCropDerivative('file:///master.jpg', rect);
    expect(out.width).toBe(1280);
    expect(journalManipulateur()).toEqual([
      ['manipulate'],
      ['crop', rect],
      ['resize', { width: 1280 }],
      ['renderAsync'],
      ['saveAsync', { compress: 0.8, format: 'jpeg', base64: true }],
    ]);
  });

  it('THE VERIFIER’S CASE — a gallery JPEG on a phone is PICKED, never refused as unreadable', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 1280, height: 853 });
    const out = await shotFromAsset(nativeImageSource, { uri: 'file:///galerie/sac.jpg', mimeType: 'image/jpeg' });
    expect(out.kind).toBe('picked');
  });

  it('the phone’s half hands the picture back as it is and asks the library for nothing', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 1280, height: 853 });
    const image = { width: 1280, height: 853 } as never;
    expect(await surPapierNatif(image)).toBe(image);
    expect(journalManipulateur()).toEqual([]);
  });
});

describe('ON THE WEB — `papier.web.ts` lays the picture on paper at its rendered size', () => {
  it('manipulate → paper at the image’s OWN size → render', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 1280, height: 853 }, 'web');
    const rendu = { width: 1280, height: 853, uri: 'data:image/png;base64,AAAA' } as never;
    const pose = (await surPapierWeb(rendu)) as unknown as { width: number; height: number };
    expect(pose.width).toBe(1280);
    expect(journalManipulateur()).toEqual([['manipulate'], ['extent', fondPapier(1280, 853).extent], ['renderAsync']]);
  });

  it('frees the input render’s blob once the paper version exists — the fill adds no blob per photograph', async () => {
    armerManipulateur({ base64: JPEG_B64, width: 320, height: 240 }, 'web');
    const liberes: string[] = [];
    const avant = globalThis.URL.revokeObjectURL;
    globalThis.URL.revokeObjectURL = (u: string) => {
      liberes.push(u);
    };
    try {
      await surPapierWeb({ width: 320, height: 240, uri: 'blob:page/abc' } as never);
      await surPapierWeb({ width: 320, height: 240, uri: 'data:image/png;base64,AAAA' } as never);
    } finally {
      globalThis.URL.revokeObjectURL = avant;
    }
    expect(liberes, 'only the blob, never a data URI').toEqual(['blob:page/abc']);
  });
});
