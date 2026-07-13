/**
 * WO-5.1 — the Grand Teint TYPEFACE substrate for RN (Archivo, Latin subset).
 * This is DATA ONLY: the family name, the five static weights, their asset
 * files, and the metrics-matched system fallback. It does NOT load the font
 * (that is expo-font work in a later screen slice) and it consumes no token.
 *
 * THE COLD-START LAW (design budget · the CTO's flagged risk): the family
 * name below is the ENHANCEMENT; `fallback` is what paints FIRST. Nothing in
 * the app may gate a first render on the font resolving — Expo loads custom
 * fonts asynchronously, and the design renders in the metrics-matched
 * fallback immediately, swapping to Archivo when (and only when) it is ready,
 * with no reflow. See design-reference/grand-teint/docs/budget.md and
 * assets/fonts/COLD-START.md.
 */

/** The family the design locks (docs/tokens.json → type.family). */
export const FONT_FAMILY = 'Archivo';

/** The fallback that paints before Archivo resolves (type.familyFallback).
 * On RN this is the platform system face; metrics are close to Archivo
 * (budget.md: "Archivo is metrics-friendly"), so the swap causes no reflow. */
export const FONT_FALLBACK = 'System';

/** The five static instances the design uses, and their bundled asset files.
 * (Latin subset, produced from Archivo variable — see COLD-START.md.) */
export const FONT_WEIGHTS = {
  400: 'Archivo-Regular.ttf',
  500: 'Archivo-Medium.ttf',
  700: 'Archivo-Bold.ttf',
  800: 'Archivo-ExtraBold.ttf',
  900: 'Archivo-Black.ttf',
} as const;

export type FontWeight = keyof typeof FONT_WEIGHTS;

/**
 * WO-6.0 ruling ② — native embedding addresses fonts by NAME. Each static
 * instance now carries a distinct weight-specific family (its name table was
 * fixed: the WO-5.1 subset left all five named « Archivo SemiBold Regular »,
 * a collision that broke weight selection). RN references these exact families;
 * expo-font's config plugin embeds the files so the family resolves at the
 * FIRST FRAME (in the binary, no async load).
 */
export const FONT_FAMILY_BY_WEIGHT: Record<FontWeight, string> = {
  400: 'Archivo-Regular',
  500: 'Archivo-Medium',
  700: 'Archivo-Bold',
  800: 'Archivo-ExtraBold',
  900: 'Archivo-Black',
};

const SHIPPED_WEIGHTS = [400, 500, 700, 800, 900] as const;

/**
 * The embedded family for a design weight. The five shipped instances match the
 * design's declared weights; a value between them (the type scale's `row`/
 * reconcileLine wght 600) maps to the NEAREST shipped instance (ties → heavier),
 * so no text falls back to the system face mid-screen.
 */
export function fontFamilyForWeight(wght: number): string {
  let nearest: FontWeight = 400;
  for (const w of SHIPPED_WEIGHTS) {
    const better = Math.abs(w - wght) < Math.abs(nearest - wght);
    const tieHeavier = Math.abs(w - wght) === Math.abs(nearest - wght) && w > nearest;
    if (better || tieHeavier) nearest = w;
  }
  return FONT_FAMILY_BY_WEIGHT[nearest];
}
