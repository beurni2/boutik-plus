/**
 * ═══ RENDU-RÉEL — expo-image-manipulator, doubled so the console can MOUNT ═══
 *
 * ONGLETS-FOURNISSEUR (2026-08-15) is the first walk to mount the supplier
 * console, and `src/studio/pick-native.ts` imports this module EAGERLY (line
 * 1). Through it comes `expo-modules-core`, which dereferences Metro's
 * `__DEV__` at module scope — so importing the console in node failed with
 * « __DEV__ is not defined » before a line of it ran.
 *
 * ⚠ ITS SIBLING ALREADY KNEW THIS. The same file requires `expo-image-picker`
 * LAZILY and says why: « a module that imports `expo-image-picker` cannot be
 * loaded in node ». Identical hazard; only the manipulator was left static.
 * This double is the test-only half of that rule — a tab reorder does not get
 * to rewrite the capture seam.
 *
 * ═══ BOUNDS (§9.8) ═══
 *
 * · NO IMAGE PROCESSING. `manipulate()` THROWS. The derivative it makes is
 *   what a buyer eventually sees and what the normalization spec is asserted
 *   against, so a double answering with a plausible fake would make the
 *   imaging pipeline look proven when nothing ran. A walk that means to
 *   exercise capture must arm this deliberately and say so.
 * · `SaveFormat` carries the REAL enum values — pinned by name at the capture
 *   sites, and a drifted string is exactly what a double must not hide.
 * · APPEARANCE: nothing. This module makes pixels; this file makes none.
 * · THE VERBS ARE THE PLATFORM'S (MEDIA-PORTE-1, verifier MAJOR). In
 *   expo-image-manipulator 57, `extent` exists on the WEB only
 *   (`src/ImageManipulatorContext.ts` tags it `@platform web`; the iOS and
 *   Android Context classes have resize, rotate, flip, crop and render, no
 *   more). So the context offers `extent` ONLY when armed as `'web'`; armed as
 *   `'native'` (the default, what vitest resolves) calling it throws the same
 *   TypeError a phone throws. A double that answered every verb everywhere
 *   proved a web-only path on the phone and hid a dead publish.
 *
 * ═══ MEASURED MODE — bytes that answer to the long edge and the quality ═══
 *
 * `armerManipulateurMesure` makes every save hand back a JPEG whose LENGTH is
 * a bound a real encoder was measured under, so a walk can prove that a photo
 * too heavy for its budget is saved again, smaller, and that what uploads is
 * under the budget. It still makes no pixels: the bytes are a valid JPEG
 * frame (SOI · DQT · SOF with the image's own size · DHT · SOS · filler ·
 * EOI) that the app's real strip and the media Worker's real size read accept.
 *
 * THE BOUND, in bits per pixel, by the image's long edge and the JPEG quality
 * (`BORNE_BPP` below; length = ⌈width × height × bpp × densité / 8⌉):
 *
 *   long edge │ 0.8  │ 0.7  │ 0.6  │ 0.5
 *   ──────────┼──────┼──────┼──────┼──────
 *     1280    │ 0.74 │ 0.58 │ 0.48 │ 0.42
 *     1080    │ 0.78 │ 0.61 │ 0.51 │ 0.45
 *      900    │ 0.83 │ 0.66 │ 0.56 │ 0.49
 *      720    │ 0.89 │ 0.72 │ 0.61 │ 0.55
 *      320    │ 1.18 │ 0.96 │ 0.82 │ 0.74
 *      280    │ 1.22 │ 1.00 │ 0.87 │ 0.78
 *      240    │ 1.35 │ 1.11 │ 0.94 │ 0.84
 *
 * WHERE IT COMES FROM, said plainly. Measured once, OUTSIDE this repository,
 * with a desktop libjpeg-turbo (the IJG quality scale the browser canvas and
 * Android use; 4:2:0; no Huffman optimisation) on a SYNTHETIC photo-like
 * frame: a woven bag on a soft backdrop, gradient light, sensor-like noise, a
 * 4000×3000 master — no person, no text, no place. Each cell is the LARGEST
 * bits-per-pixel seen over every geometry a rung meets (4:3 and 3:4 shots,
 * the square and 4:5 hero crops, vignettes made from each role's derivative
 * at every photo edge), rounded UP to the next 0.01. The measured values sit
 * in `rendu-harness.test.ts`, which fails if any cell here drops below them.
 * Measured bytes on that frame, for scale: hero square 1280 px — 130 477 B at
 * 0.8, 100 522 at 0.7, 83 817 at 0.6, 74 109 at 0.5; a 4:3 shot at 1280 px —
 * 90 746 B at 0.8; the largest 320 px vignette — 13 144 B at 0.8.
 *
 * WHAT IT DOES NOT KNOW: a real phone's encoder was not measured (iOS maps
 * quality differently), and a real photograph can be busier than this frame.
 * `densite` (≥ 1, never below — a stand-in kinder than the encoder is refused)
 * stands for a busier photograph; a quality with no measured cell THROWS.
 * A long edge between two rows takes the row below it (a smaller image packs
 * more bits per pixel), so the bound never shrinks between measured points;
 * `rendu-harness.test.ts` checks in-between edges against both neighbours.
 * A save under the 240 px row THROWS too: nothing was measured there. The one
 * exception is the guidance frame, which never uploads: the double knows it by
 * the app's own request (`metricsActions()`, a resize to its exact width) —
 * not by its size — and prices it at the 240 px row, as before.
 *
 * ON THE WEB (armed `'web'`) every render and every save carries its own
 * `blob:` URL, as the web library's do (`URL.createObjectURL`), so a test can
 * see which ones the app frees. On a phone they carry none.
 */
import { metricsActions } from '../../src/studio/normalization';

export const SaveFormat = {
  JPEG: 'jpeg',
  PNG: 'png',
  WEBP: 'webp',
} as const;

/**
 * FOURNISSEUR-VRAI-1 — ARMED, it hands back ONE encoded result the walk
 * supplied: base64 bytes and their size. It still makes no pixels — the bytes
 * are the walk's own, and the app's REAL strip and `assertExifFree` run over
 * them exactly as on a phone, so a walk that arms garbage meets the real
 * refusal. Unarmed, it throws as before.
 */
let arme: { readonly base64: string; readonly width: number; readonly height: number } | null = null;
let plateforme: 'native' | 'web' = 'native';
/** Measured mode (see `armerManipulateurMesure`); null when not armed. */
let mesure: { readonly source: { readonly width: number; readonly height: number }; readonly densite: number } | null = null;

/**
 * MEDIA-PORTE-1 (F-49) — THE VERBS ASKED FOR, IN ORDER, with their arguments:
 * what the app told the library to do, never what the library would draw. It
 * is how a test proves the paper is laid at the rendered size, after the
 * resize and before the JPEG. Cleared on every arming.
 */
let journal: [string, ...unknown[]][] = [];
/** The object URLs handed out on the web since the last arming (see `urlWeb`). */
let urlsWeb: string[] = [];

export function armerManipulateur(
  encode: { readonly base64: string; readonly width: number; readonly height: number } | null,
  surface: 'native' | 'web' = 'native',
): void {
  arme = encode;
  mesure = null;
  plateforme = surface;
  journal = [];
  urlsWeb = [];
}

export const BORNE_BPP: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  1280: { 0.8: 0.74, 0.7: 0.58, 0.6: 0.48, 0.5: 0.42 },
  1080: { 0.8: 0.78, 0.7: 0.61, 0.6: 0.51, 0.5: 0.45 },
  900: { 0.8: 0.83, 0.7: 0.66, 0.6: 0.56, 0.5: 0.49 },
  720: { 0.8: 0.89, 0.7: 0.72, 0.6: 0.61, 0.5: 0.55 },
  320: { 0.8: 1.18, 0.7: 0.96, 0.6: 0.82, 0.5: 0.74 },
  280: { 0.8: 1.22, 0.7: 1.0, 0.6: 0.87, 0.5: 0.78 },
  240: { 0.8: 1.35, 0.7: 1.11, 0.6: 0.94, 0.5: 0.84 },
};

/** The length a save of a `width`×`height` image at `compress` hands back. */
export function octetsBornes(width: number, height: number, compress: number, densite = 1): number {
  return borne(width, height, compress, densite, false);
}

function borne(width: number, height: number, compress: number, densite: number, trameDeGuidage: boolean): number {
  if (!(densite >= 1)) throw new Error(`densite ${densite} < 1 would be kinder than the measured encoder`);
  const rangs = Object.keys(BORNE_BPP).map(Number).sort((a, b) => b - a);
  const long = Math.max(width, height);
  if (long < rangs[rangs.length - 1]! && !trameDeGuidage) {
    throw new Error(`no measured bound under a ${rangs[rangs.length - 1]} px long edge (${width}×${height}) — an uncertified rung`);
  }
  const rang = rangs.find((e) => e <= long) ?? rangs[rangs.length - 1]!;
  const bpp = BORNE_BPP[rang]![compress];
  if (bpp === undefined) throw new Error(`no measured bound at quality ${compress} — an uncertified rung`);
  return Math.ceil((width * height * bpp * densite) / 8);
}

/** A baseline JPEG frame of exactly `total` bytes declaring `width`×`height`. */
export function jpegDeTaille(width: number, height: number, total: number): Uint8Array {
  const seg = (marker: number, body: readonly number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const tete = [
    0xff, 0xd8,
    ...seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
    ...seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
  ];
  const remplissage = total - tete.length - 2;
  if (remplissage < 1) throw new Error(`a ${total}-byte JPEG cannot hold its own header`);
  const out = new Uint8Array(total);
  out.set(tete, 0);
  out.fill(0x12, tete.length, total - 2); // never 0xFF: no marker hides in the filler
  out[total - 2] = 0xff;
  out[total - 1] = 0xd9;
  return out;
}

/** The size a `data:image/jpeg` URI's own SOF declares, or null. */
function tailleDeDataUri(uri: string): { width: number; height: number } | null {
  const prefixe = 'data:image/jpeg;base64,';
  if (!uri.startsWith(prefixe)) return null;
  const b = Buffer.from(uri.slice(prefixe.length), 'base64');
  let i = 2;
  while (i + 9 <= b.length && b[i] === 0xff) {
    const m = b[i + 1]!;
    if (m === 0xda || m === 0xd9) break;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
    }
    i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
  }
  return null;
}

/**
 * MEASURED MODE (see the bound at the top). `source` is the size of every
 * picture the app opens by a file or library address (a camera master, a
 * gallery pick); a `data:image/jpeg` address is read at the size its own SOF
 * declares, and an image the library rendered keeps its own size — so crop,
 * resize and the web paper fill move the size exactly as the app asked.
 */
export function armerManipulateurMesure(
  options: { readonly source: { readonly width: number; readonly height: number }; readonly densite?: number },
  surface: 'native' | 'web' = 'native',
): void {
  const densite = options.densite ?? 1;
  if (!(densite >= 1)) throw new Error(`densite ${densite} < 1 would be kinder than the measured encoder`);
  arme = null;
  mesure = { source: options.source, densite };
  plateforme = surface;
  journal = [];
  urlsWeb = [];
}

/** Each web render and save gets its own object URL, as the library's do:
 *  numbered in the order handed out, from 1 at every arming. */
function urlWeb(genre: 'rendu' | 'sauvegarde'): { uri: string } | Record<string, never> {
  if (plateforme !== 'web') return {};
  const uri = `blob:double/${genre}-${urlsWeb.length + 1}`;
  urlsWeb.push(uri);
  return { uri };
}
/** Every object URL handed out since the last arming, in order. */
export function urlsWebDonnees(): readonly string[] {
  return urlsWeb;
}

function manipulerMesure(src: unknown, m: NonNullable<typeof mesure>) {
  let taille: { width: number; height: number };
  const guidage = metricsActions()[0]!.resize;
  let trameDeGuidage = false;
  if (typeof src === 'object' && src !== null && typeof (src as { width?: unknown }).width === 'number') {
    const r = src as { width: number; height: number };
    taille = { width: r.width, height: r.height };
  } else if (typeof src === 'string' && src.startsWith('data:')) {
    const lue = tailleDeDataUri(src);
    if (lue === null) throw new Error(`expo-image-manipulator double (measured): no SOF in « ${src.slice(0, 40)}… »`);
    taille = lue;
  } else {
    taille = { ...m.source };
  }
  journal.push(['manipulate']);
  const ctx: Record<string, unknown> = {
    resize: (size: { width?: number; height?: number }) => {
      journal.push(['resize', size]);
      if (size.width === guidage.width && size.height === guidage.height) trameDeGuidage = true;
      const { width, height } = taille;
      if (size.width !== undefined && size.height !== undefined) taille = { width: size.width, height: size.height };
      else if (size.width !== undefined) taille = { width: size.width, height: Math.round((height * size.width) / width) };
      else if (size.height !== undefined) taille = { width: Math.round((width * size.height) / height), height: size.height };
      return ctx;
    },
    crop: (rect: { width: number; height: number }) => {
      journal.push(['crop', rect]);
      taille = { width: rect.width, height: rect.height };
      return ctx;
    },
    ...(plateforme === 'web'
      ? {
          extent: (options: { width: number; height: number }) => {
            journal.push(['extent', options]);
            taille = { width: options.width, height: options.height };
            return ctx;
          },
        }
      : {}),
    renderAsync: async () => {
      journal.push(['renderAsync']);
      const { width, height } = taille;
      const guidageRendu = trameDeGuidage;
      return {
        width,
        height,
        ...urlWeb('rendu'),
        saveAsync: async (options: { compress?: number }) => {
          journal.push(['saveAsync', options]);
          const octets = jpegDeTaille(width, height, borne(width, height, options.compress ?? 1, m.densite, guidageRendu));
          return { base64: Buffer.from(octets).toString('base64'), width, height, ...urlWeb('sauvegarde') };
        },
      };
    },
  };
  return ctx;
}

export function journalManipulateur(): readonly (readonly [string, ...unknown[]])[] {
  return journal;
}

export const ImageManipulator = {
  manipulate(uri: unknown) {
    if (mesure !== null) return manipulerMesure(uri, mesure);
    const sortie = arme;
    if (sortie === null) {
      throw new Error(
        `expo-image-manipulator double: no image pipeline under vitest (asked for « ${String(uri)} »). ` +
          'A walk that means to exercise capture must arm this double explicitly.',
      );
    }
    journal.push(['manipulate']);
    const ctx: Record<string, unknown> = {
      resize: (size: unknown) => {
        journal.push(['resize', size]);
        return ctx;
      },
      crop: (rect: unknown) => {
        journal.push(['crop', rect]);
        return ctx;
      },
      ...(plateforme === 'web'
        ? {
            extent: (options: unknown) => {
              journal.push(['extent', options]);
              return ctx;
            },
          }
        : {}),
      renderAsync: async () => {
        journal.push(['renderAsync']);
        return {
          width: sortie.width,
          height: sortie.height,
          saveAsync: async (options: unknown) => {
            journal.push(['saveAsync', options]);
            return { base64: sortie.base64, width: sortie.width, height: sortie.height };
          },
        };
      },
    };
    return ctx;
  },
};
