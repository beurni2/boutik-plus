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
 */

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

/**
 * MEDIA-PORTE-1 (F-49) — THE VERBS ASKED FOR, IN ORDER, with their arguments:
 * what the app told the library to do, never what the library would draw. It
 * is how a test proves the paper is laid at the rendered size, after the
 * resize and before the JPEG. Cleared on every arming.
 */
let journal: [string, ...unknown[]][] = [];

export function armerManipulateur(
  encode: { readonly base64: string; readonly width: number; readonly height: number } | null,
  surface: 'native' | 'web' = 'native',
): void {
  arme = encode;
  plateforme = surface;
  journal = [];
}

export function journalManipulateur(): readonly (readonly [string, ...unknown[]])[] {
  return journal;
}

export const ImageManipulator = {
  manipulate(uri: unknown) {
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
