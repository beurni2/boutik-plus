import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The console's web bundle resolves `papier.web.ts` where vitest resolves
// `papier.ts`. This file asks for the web half, exactly as Metro does on the
// web: the real file, nothing stubbed, every other module as it is.
vi.mock('../src/studio/papier', async () => await import('../src/studio/papier.web'));

import { armerManipulateur, armerManipulateurMesure, jpegDeTaille, urlsWebDonnees } from './doubles/expo-image-manipulator';
import { bytesToBase64 } from '../src/studio/normalization';
import { captureShot, renderCropDerivative, renderThumbDerivative } from '../src/studio/capture';
import { nativeImageSource } from '../src/studio/pick-native';
import { shotFromAsset } from '../src/studio/pick';
import { heroSquareCrop } from '../src/studio/crops';

/**
 * ═══ PHOTOS LÉGÈRES, ON THE WEB — the ladder frees what it is done with ═══
 *
 * The web image library makes an object URL for every render and every save,
 * and keeps it for the tab's life unless someone frees it. The budget ladder
 * saves a photo up to sixteen times; each refused save is freed, and so is
 * each smaller image it made, once it is done with it. The save that ships is
 * NEVER freed, nor the image the ladder was handed.
 *
 * Driven through the app's own capture and pick functions, with the image
 * library doubled in measured mode on the web (each render and save carries
 * its own numbered `blob:` URL, as the library's do). The double makes no
 * pixels; the bound on its bytes is stated at its top.
 */

const MASTER = { width: 4000, height: 3000 } as const;

/** Every URL the app freed, with how many URLs had been handed out by then. */
let liberes: { uri: string; donnees: number }[] = [];
const avant = globalThis.URL.revokeObjectURL;
beforeEach(() => {
  liberes = [];
  globalThis.URL.revokeObjectURL = (uri: string) => {
    liberes.push({ uri, donnees: urlsWebDonnees().length });
  };
});
afterEach(() => {
  globalThis.URL.revokeObjectURL = avant;
  armerManipulateur(null);
});

const r = (n: number): string => `blob:double/rendu-${n}`;
const s = (n: number): string => `blob:double/sauvegarde-${n}`;

describe('on the web, the ladder frees every save it refused and every image it made — never the save that ships', () => {
  it('a hero that steps down to its floor: fifteen refused saves and its three smaller images freed; the sixteenth save, which ships, is not', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 20 }, 'web');

    const out = await renderCropDerivative('file:///maitre.jpg', heroSquareCrop(MASTER.width, MASTER.height));

    expect([out.width, out.height], 'precondition: it reached the 720 px floor').toEqual([720, 720]);
    // 1 crop render · 2 paper · 3–6 saves at 1280 · 7 the 1080 image · 8–11 · 12 the 900 image · 13–16 · 17 the 720 image · 18–21
    expect(urlsWebDonnees()).toHaveLength(21);
    expect(liberes.map((l) => l.uri)).toEqual([
      r(1), // the paper fill frees its input, as before
      s(3), s(4), s(5), s(6), s(8), s(9), s(10),
      r(7),
      s(11), s(13), s(14), s(15),
      r(12),
      s(16), s(18), s(19), s(20),
      r(17), // the 720 image, once the save it ships exists
    ]);
    expect(liberes.map((l) => l.uri), 'the save that ships').not.toContain(s(21));
    expect(liberes.map((l) => l.uri), 'the image the ladder was handed').not.toContain(r(2));
    expect(liberes.find((l) => l.uri === r(7))!.donnees, 'the 1080 image is freed only once the 900 one exists').toBeGreaterThanOrEqual(12);
    expect(liberes.find((l) => l.uri === r(12))!.donnees, 'the 900 image is freed only once the 720 one exists').toBeGreaterThanOrEqual(17);
    expect(liberes.find((l) => l.uri === r(17))!.donnees, 'the 720 image is freed only once its kept save exists').toBeGreaterThanOrEqual(21);
  });

  it('a hero that fits at its second edge: the refused saves and its 1080 image are freed, the save that fits is not', async () => {
    armerManipulateurMesure({ source: MASTER }, 'web');

    await renderCropDerivative('file:///maitre.jpg', heroSquareCrop(MASTER.width, MASTER.height));

    // 1 crop · 2 paper · 3–6 at 1280 · 7 the 1080 image · 8, 9 refused · 10 fits
    expect(urlsWebDonnees()).toHaveLength(10);
    expect(liberes.map((l) => l.uri)).toEqual([r(1), s(3), s(4), s(5), s(6), s(8), s(9), r(7)]);
  });

  it('a vignette: seven refused saves and its 280 px image freed; the eighth save, which uploads, is not', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 2 }, 'web');
    const derivee = `data:image/jpeg;base64,${bytesToBase64(jpegDeTaille(1280, 1280, 400))}`;

    await renderThumbDerivative(derivee, 1280, 1280);

    // 1 the 320 render · 2–5 refused · 6 the 280 image · 7–9 refused · 10 fits
    expect(urlsWebDonnees()).toHaveLength(10);
    expect(liberes.map((l) => l.uri)).toEqual([s(2), s(3), s(4), s(5), s(7), s(8), s(9), r(6)]);
  });

  it('a gallery photo (the console’s pick): two refused saves freed; the third, which ships, is not', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 2 }, 'web');

    const out = await shotFromAsset(nativeImageSource, { uri: 'blob:page/galerie-sac', mimeType: 'image/jpeg' });

    expect(out.kind).toBe('picked');
    // 1 the decode · 2 the 1280 render · 3 paper · 4, 5 refused · 6 fits
    expect(urlsWebDonnees()).toHaveLength(6);
    expect(liberes.map((l) => l.uri)).toEqual([r(2), s(4), s(5)]);
  });

  it('a camera shot: two refused saves freed; the third, which ships, is not', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 2 }, 'web');
    const camera = { takePictureAsync: async () => ({ uri: 'file:///camera/maitre.jpg', ...MASTER }) };

    await captureShot(camera as never);

    // 1 the derivative render · 2, 3 refused · 4 fits · 5, 6 the guidance frame
    expect(urlsWebDonnees()).toHaveLength(6);
    expect(liberes.map((l) => l.uri)).toEqual([s(2), s(3)]);
  });
});
