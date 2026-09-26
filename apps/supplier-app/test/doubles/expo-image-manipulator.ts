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

export function armerManipulateur(encode: { readonly base64: string; readonly width: number; readonly height: number } | null): void {
  arme = encode;
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
    const ctx = {
      resize: () => ctx,
      renderAsync: async () => ({
        width: sortie.width,
        height: sortie.height,
        saveAsync: async () => ({ base64: sortie.base64, width: sortie.width, height: sortie.height }),
      }),
    };
    return ctx;
  },
};
