/**
 * WO-FP-BOUTIK — the FASO PREMIUM typeface substrate for RN. DATA ONLY: the
 * two family names, their static weights, the bundled asset files, and the
 * family-aware resolver. It does NOT load the font (expo-font's config plugin
 * embeds the files at build time; see app.json) and computes no colour.
 *
 * Faso Premium has TWO families (README § Type, verbatim):
 *   • Bricolage Grotesque — DISPLAY: screen titles, money, CTAs, big codes.
 *     Weights 700/800 (the `@platform/ui-tokens` type.families.display pair).
 *   • Instrument Sans — TEXT: everything else. Weights 400–700 (Regular 400,
 *     Medium 500, SemiBold 600, Bold 700).
 *
 * THE COLD-START LAW (design budget · low-end-Android-first): the family names
 * below are the ENHANCEMENT; `FONT_FALLBACK` paints FIRST. Nothing gates a
 * first render on the font resolving — Expo embeds them in the binary (config
 * plugin), so the family resolves at the FIRST FRAME with no async load and no
 * reflow. The six faces carry DISTINCT name-table identities (STEP 0, the
 * WO-5.1 collision lesson) so weight selection is by exact family name.
 */

/** The two Faso Premium family roots (README § Type). */
export const FONT_FAMILY_DISPLAY = 'Bricolage Grotesque';
export const FONT_FAMILY_TEXT = 'Instrument Sans';

/** The fallback that paints before the embedded faces resolve. On RN this is
 * the platform system face — used only for the sub-frame before first paint. */
export const FONT_FALLBACK = 'System';

/** The two type roles the design system distinguishes (README § Type). */
export type FontKind = 'display' | 'text';

/**
 * The six shipped static instances: file, embedded family (its distinct
 * name-table identity — nameID 1/4/16), design weight, and role. Bricolage is
 * DISPLAY (700/800); Instrument Sans is TEXT (400/500/600/700). The embedded
 * family strings are what RN references and what expo-font registers.
 */
export const FP_FACES = [
  { kind: 'display', wght: 700, family: 'BricolageGrotesque-Bold', file: 'BricolageGrotesque-Bold.ttf' },
  { kind: 'display', wght: 800, family: 'BricolageGrotesque-ExtraBold', file: 'BricolageGrotesque-ExtraBold.ttf' },
  { kind: 'text', wght: 400, family: 'InstrumentSans-Regular', file: 'InstrumentSans-Regular.ttf' },
  { kind: 'text', wght: 500, family: 'InstrumentSans-Medium', file: 'InstrumentSans-Medium.ttf' },
  { kind: 'text', wght: 600, family: 'InstrumentSans-SemiBold', file: 'InstrumentSans-SemiBold.ttf' },
  { kind: 'text', wght: 700, family: 'InstrumentSans-Bold', file: 'InstrumentSans-Bold.ttf' },
] as const satisfies readonly { kind: FontKind; wght: number; family: string; file: string }[];

/** The asset subdirectory the six faces live in (relative to assets/fonts). */
export const FP_FONT_DIR = 'faso-premium';

/**
 * The embedded family for a design (kind, weight). A weight between the shipped
 * instances maps to the NEAREST instance of that family (ties → heavier), so no
 * text falls back to the system face mid-screen. `display` weight is drawn from
 * Bricolage {700,800}; every other role from Instrument Sans {400,500,600,700}.
 */
export function fontFamily(kind: FontKind, wght: number): string {
  const faces = FP_FACES.filter((f) => f.kind === kind);
  let nearest = faces[0]!;
  for (const f of faces) {
    const better = Math.abs(f.wght - wght) < Math.abs(nearest.wght - wght);
    const tieHeavier = Math.abs(f.wght - wght) === Math.abs(nearest.wght - wght) && f.wght > nearest.wght;
    if (better || tieHeavier) nearest = f;
  }
  return nearest.family;
}
