import { afterEach, describe, expect, it } from 'vitest';
import {
  armerManipulateur,
  armerManipulateurMesure,
  journalManipulateur,
  jpegDeTaille,
  octetsBornes,
} from './doubles/expo-image-manipulator';
import {
  DERIVATIVE_SPEC_V1,
  HERO_BUDGET_BYTES,
  PHOTO_BUDGET_BYTES,
  PHOTO_EDGE_STEPS,
  QUALITY_STEPS,
  THUMB_EDGE_PX,
  VIGNETTE_BUDGET_BYTES,
  VIGNETTE_EDGE_STEPS,
  ExifLeakError,
  HERO_LADDER,
  PHOTO_LADDER,
  VIGNETTE_LADDER,
  bytesToBase64,
  saveWithinBudget,
  stripJpegMetadata,
} from '../src/studio/normalization';
import { IMAGE_MIN_DIM, THUMB_MAX_BYTES, THUMB_MAX_DIM, THUMB_MIN_DIM } from '../../../services/media-service/src/media';
import { captureShot, derivativeBytesFromUri, renderCropDerivative, renderThumbDerivative } from '../src/studio/capture';
import { nativeImageSource } from '../src/studio/pick-native';
import { shotFromAsset } from '../src/studio/pick';
import { heroSquareCrop, heroVerticalCrop } from '../src/studio/crops';

/**
 * ═══ PHOTOS LÉGÈRES — every photograph that leaves the phone fits its budget ═══
 *
 * PERF-BUDGETS « Image sizes »: thumbnail ≤ 15 KB · hero ≤ 80 KB · full view
 * ≤ 150 KB, on the reference 3G network (1.5 Mbps). The buyer site shows the
 * hero crop large (« À la une », the product page) and the vignette on every
 * tile; every other photograph opens full size in the gallery.
 *
 * Driven through the app's OWN capture and pick functions, with the image
 * library doubled in MEASURED mode: each save hands back a JPEG whose length
 * is the bound a real encoder was measured under (see the double's header).
 * `densite` 2 stands for a photograph twice as busy as the measured frame.
 *
 * The law each test holds: a save over budget is saved again — quality first,
 * then a smaller long edge — and what uploads is the ladder's last save. A
 * gallery photo and a camera shot are previewed from those same bytes; the
 * hero crops and the vignette are not previewed at all. At the floor the
 * photograph ships anyway: a byte budget never blocks a publish on the phone.
 */

/** The canon rows, in bytes (KB = 1024, as every gate in these repositories). */
const VIGNETTE = 15 * 1024;
const HERO = 80 * 1024;
const PLEINE = 150 * 1024;

const MASTER = { width: 4000, height: 3000 } as const;

afterEach(() => armerManipulateur(null));

const sauvegardes = (): number[] =>
  journalManipulateur()
    .filter((e) => e[0] === 'saveAsync')
    .map((e) => (e[1] as { compress: number }).compress);
/** The long edge each resize asked for, in order. */
const bords = (): number[] =>
  journalManipulateur()
    .filter((e) => e[0] === 'resize')
    .map((e) => {
      const r = e[1] as { width?: number; height?: number };
      return r.width ?? r.height ?? 0;
    });

describe('each budget is the canon row it holds', () => {
  it('vignette 15 KB · hero 80 KB · full view 150 KB, to the byte', () => {
    expect(VIGNETTE_BUDGET_BYTES).toBe(15_360);
    expect(HERO_BUDGET_BYTES).toBe(81_920);
    expect(PHOTO_BUDGET_BYTES).toBe(153_600);
  });

  it('the ladder starts where the derivative spec starts, and its floors are named', () => {
    expect(QUALITY_STEPS).toEqual([0.8, 0.7, 0.6, 0.5]);
    expect(QUALITY_STEPS[0]).toBe(DERIVATIVE_SPEC_V1.compress);
    expect(PHOTO_EDGE_STEPS).toEqual([1280, 1080, 900, 720]);
    expect(PHOTO_EDGE_STEPS[0]).toBe(DERIVATIVE_SPEC_V1.maxEdgePx);
    expect(VIGNETTE_EDGE_STEPS).toEqual([320, 280, 240]);
    expect(VIGNETTE_EDGE_STEPS[0]).toBe(THUMB_EDGE_PX);
  });
});

describe('a hero crop too heavy at 0.8 is saved again until it fits — largest edge first, then quality', () => {
  it('the square hero: four qualities at 1280, then 1080 from the top, and what uploads is the last save, ≤ 80 KB', async () => {
    armerManipulateurMesure({ source: MASTER });
    expect(octetsBornes(1280, 1280, 0.8), 'precondition: the first save is over budget').toBeGreaterThan(HERO);

    const out = await renderCropDerivative('file:///maitre.jpg', heroSquareCrop(MASTER.width, MASTER.height));

    expect(out.bytes.byteLength, 'the hero that ships').toBeLessThanOrEqual(HERO);
    expect(sauvegardes()).toEqual([0.8, 0.7, 0.6, 0.5, 0.8, 0.7, 0.6]);
    expect([...new Set(bords())]).toEqual([1280, 1080]);
    expect([out.width, out.height]).toEqual([1080, 1080]);
    // The publish uploads what it decodes from this URI (lister-real's pending source).
    const envoyes = derivativeBytesFromUri(out.uri);
    expect(envoyes, 'what uploads is the ladder’s last save — 1080 px at 0.6 — byte for byte').toEqual(jpegDeTaille(1080, 1080, octetsBornes(1080, 1080, 0.6)));
    expect(envoyes.byteLength).toBeLessThanOrEqual(HERO);
  });

  it('the vertical hero (4:5) is held to the same 80 KB', async () => {
    armerManipulateurMesure({ source: MASTER });
    expect(octetsBornes(1024, 1280, 0.8)).toBeGreaterThan(HERO);

    const out = await renderCropDerivative('file:///maitre.jpg', heroVerticalCrop(MASTER.width, MASTER.height));

    expect(out.bytes.byteLength).toBeLessThanOrEqual(HERO);
    expect(sauvegardes()).toEqual([0.8, 0.7, 0.6]);
    expect([out.width, out.height]).toEqual([1024, 1280]);
    const envoyes = derivativeBytesFromUri(out.uri);
    expect(envoyes, 'what uploads is the ladder’s last save — 0.6 — byte for byte').toEqual(jpegDeTaille(1024, 1280, octetsBornes(1024, 1280, 0.6)));
    expect(envoyes.byteLength).toBeLessThanOrEqual(HERO);
  });
});

describe('every other photograph that ships is held to the full-view 150 KB', () => {
  it('a gallery photo (the console’s path, and the supplier’s readiness proof): saved again, ≤ 150 KB, and the preview is those bytes', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 2 });
    expect(octetsBornes(1280, 960, 0.8, 2), 'precondition: the first save is over budget').toBeGreaterThan(PLEINE);

    const out = await shotFromAsset(nativeImageSource, { uri: 'file:///galerie/sac.jpg', mimeType: 'image/jpeg' });

    expect(out.kind).toBe('picked');
    if (out.kind !== 'picked') throw new Error('asserted above');
    const expedies = derivativeBytesFromUri(out.shot.derivative.uri);
    expect(expedies.byteLength, 'the photo that ships').toBeLessThanOrEqual(PLEINE);
    expect(sauvegardes()).toEqual([0.8, 0.7, 0.6]);
    expect([out.shot.derivative.width, out.shot.derivative.height]).toEqual([1280, 960]);
  });

  it('a camera shot is held to the same 150 KB', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 2 });
    const camera = { takePictureAsync: async () => ({ uri: 'file:///camera/maitre.jpg', ...MASTER }) };

    const out = await captureShot(camera as never);

    expect(derivativeBytesFromUri(out.derivative.uri).byteLength).toBeLessThanOrEqual(PLEINE);
    expect(sauvegardes().slice(0, 3), 'the derivative’s saves, before the guidance frame').toEqual([0.8, 0.7, 0.6]);
  });

  it('a photo already light enough is saved once, at the spec’s 0.8, as before', async () => {
    armerManipulateurMesure({ source: MASTER });
    expect(octetsBornes(1280, 960, 0.8)).toBeLessThanOrEqual(PLEINE);

    const out = await shotFromAsset(nativeImageSource, { uri: 'file:///galerie/sac.jpg', mimeType: 'image/jpeg' });

    expect(out.kind).toBe('picked');
    expect(sauvegardes()).toEqual([0.8]);
  });
});

describe('the vignette is held to 15 KB', () => {
  it('saved again — quality, then 280 px — and what uploads is the last save, ≤ 15 KB', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 2 });
    expect(octetsBornes(320, 320, 0.8, 2), 'precondition: the first save is over budget').toBeGreaterThan(VIGNETTE);
    const derivee = `data:image/jpeg;base64,${bytesToBase64(jpegDeTaille(1280, 1280, 400))}`;

    const out = await renderThumbDerivative(derivee, 1280, 1280);

    expect(out.bytes.byteLength, 'the vignette that ships').toBeLessThanOrEqual(VIGNETTE);
    expect(sauvegardes()).toEqual([0.8, 0.7, 0.6, 0.5, 0.8, 0.7, 0.6, 0.5]);
    expect([...new Set(bords())]).toEqual([320, 280]);
    // The vignette uploads these bytes as they are (upload-role's `petite.bytes`).
    expect(out.bytes, 'what uploads is the ladder’s last save — 280 px at 0.5 — byte for byte').toEqual(jpegDeTaille(280, 280, octetsBornes(280, 280, 0.5, 2)));
  });
});

describe('a photograph that cannot fit still ships, at the floor — a byte budget never blocks a publish', () => {
  it('the hero stops at 720 px and quality 0.5, and ships those bytes', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 20 });

    const out = await renderCropDerivative('file:///maitre.jpg', heroSquareCrop(MASTER.width, MASTER.height));

    expect([...new Set(bords())]).toEqual([1280, 1080, 900, 720]);
    expect(Math.min(...bords()), 'never below the 720 px floor').toBe(720);
    expect(sauvegardes().at(-1)).toBe(0.5);
    expect(sauvegardes()).toHaveLength(16);
    expect([out.width, out.height]).toEqual([720, 720]);
    expect(out.bytes.byteLength).toBe(octetsBornes(720, 720, 0.5, 20));
  });

  it('the vignette stops at 240 px and quality 0.5', async () => {
    armerManipulateurMesure({ source: MASTER, densite: 50 });
    const derivee = `data:image/jpeg;base64,${bytesToBase64(jpegDeTaille(1280, 1280, 400))}`;

    const out = await renderThumbDerivative(derivee, 1280, 1280);

    expect([...new Set(bords())]).toEqual([320, 280, 240]);
    expect(sauvegardes()).toHaveLength(12);
    expect(sauvegardes().at(-1)).toBe(0.5);
    expect([out.width, out.height]).toEqual([240, 240]);
  });

  it('a narrow photo never steps under the media service’s 200 px short edge', async () => {
    // 4000×800 → 1280×256; 1080 keeps 216 px, 900 would leave 180.
    armerManipulateurMesure({ source: { width: 4000, height: 800 }, densite: 20 });

    const out = await shotFromAsset(nativeImageSource, { uri: 'file:///galerie/banniere.jpg', mimeType: 'image/jpeg' });

    expect(out.kind).toBe('picked');
    if (out.kind !== 'picked') throw new Error('asserted above');
    expect([...new Set(bords())]).toEqual([1280, 1080]);
    expect(sauvegardes()).toHaveLength(8);
    expect([out.shot.derivative.width, out.shot.derivative.height]).toEqual([1080, 216]);
  });
});

describe('bytes the strip cannot read still fail closed, where they always have', () => {
  it('a gallery save that is not a JPEG is refused by the strip after one save — never stepped down, never read as « illisible »', async () => {
    const pasUnJpeg = bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]));
    armerManipulateur({ base64: pasUnJpeg, width: 1280, height: 960 });

    await expect(shotFromAsset(nativeImageSource, { uri: 'file:///galerie/sac.jpg', mimeType: 'image/jpeg' })).rejects.toBeInstanceOf(ExifLeakError);
    expect(sauvegardes()).toEqual([0.8]);
  });
});

describe('fit is judged on the bytes that upload — after our strip, never on the encoder’s raw save', () => {
  it('a save whose metadata alone puts it over budget is kept, after ONE save', async () => {
    const cadre = jpegDeTaille(1280, 960, PLEINE - 1_000);
    // An APP1 (Exif) segment of 10 000 bytes after SOI: the strip drops it whole.
    const app1 = new Uint8Array(10_002);
    app1.set([0xff, 0xe1, 10_000 >> 8, 10_000 & 0xff, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
    const brut = new Uint8Array(cadre.byteLength + app1.byteLength);
    brut.set(cadre.subarray(0, 2), 0);
    brut.set(app1, 2);
    brut.set(cadre.subarray(2), 2 + app1.byteLength);
    expect(brut.byteLength, 'precondition: the raw save is over the full-view budget').toBeGreaterThan(PLEINE);
    expect(stripJpegMetadata(brut), 'precondition: once stripped it is the frame, under budget').toEqual(cadre);

    const qualites: number[] = [];
    const out = await saveWithinBudget(
      { width: 1280, height: 960 },
      PHOTO_LADDER,
      async (_image, compress) => {
        qualites.push(compress);
        return { base64: bytesToBase64(brut) };
      },
      async (image, step) => {
        const w = step.resize.width!;
        return { width: w, height: Math.round((image.height * w) / image.width) };
      },
      () => undefined,
    );

    expect(qualites, 'one save: its stripped length fits').toEqual([0.8]);
    expect(out.base64).toBe(bytesToBase64(brut));
  });
});

describe('the app’s floors and budget sit inside the media service’s own limits', () => {
  it('each ladder’s short-edge floor is at or above the door’s, the vignette budget under its cap, and its largest edge within its size', () => {
    expect(HERO_LADDER.minShortEdgePx).toBeGreaterThanOrEqual(IMAGE_MIN_DIM);
    expect(PHOTO_LADDER.minShortEdgePx).toBeGreaterThanOrEqual(IMAGE_MIN_DIM);
    expect(VIGNETTE_LADDER.minShortEdgePx).toBeGreaterThanOrEqual(THUMB_MIN_DIM);
    expect(VIGNETTE_BUDGET_BYTES).toBeLessThanOrEqual(THUMB_MAX_BYTES);
    expect(Math.max(...VIGNETTE_EDGE_STEPS)).toBeLessThanOrEqual(THUMB_MAX_DIM);
  });
});
