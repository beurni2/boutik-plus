/**
 * WO-FP-BOUTIK — motion, consumed AS AUTHORED (founder ruling ②, token
 * fidelity). This module is PURE (no react-native import) so the parse is
 * unit-testable on its own; the kit maps the returned spec to an RN Easing.
 *
 * Faso Premium expresses the seven fp* motions as
 * `{ durationMs, timingFunction }` (`@platform/ui-tokens` motion.*). Three
 * carry a `cubic-bezier(…)` (fpIn, fpUp, fpPop); the other four carry a CSS
 * KEYWORD verbatim (fpPulse `ease` · fpBar `ease-in-out` · fpShimmer `linear` ·
 * fpShake `ease`). The design specifies an easing CURVE, not a physical spring,
 * so the RN kit drives `Animated.timing` with `Easing.bezier(...)` /
 * `Easing.linear`, never invented spring physics.
 *
 * FIDELITY of the keyword translation: RN's named `Easing.ease` is NOT the CSS
 * `ease` curve, so a keyword is translated to its CSS-SPEC control points
 * (`cubic-bezier(.25,.1,.25,1)` for `ease`, etc.) rather than RN's lookalike.
 * A malformed / unknown timing string THROWS — no silent fallback, because a
 * fallback would drift from the designer's authored curve.
 */

export type BezierPoints = readonly [number, number, number, number];

const CUBIC_BEZIER = /^cubic-bezier\(\s*(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)\s*\)$/;

/**
 * Extract the four control points from a `cubic-bezier(x1,y1,x2,y2)` string.
 * Throws on anything that is not exactly that shape (keyword easings like
 * "linear"/"ease", wrong argument count, non-numeric args) — no silent
 * fallback, because a fallback would drift from the designer's authored curve.
 */
export function cubicBezierPoints(curve: string): BezierPoints {
  const m = CUBIC_BEZIER.exec(curve.trim());
  if (m === null) {
    throw new Error(
      `motion: "${curve}" is not a cubic-bezier(x1,y1,x2,y2) curve — refusing to guess an easing (token fidelity, no silent fallback).`,
    );
  }
  const pts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const;
  if (pts.some((n) => Number.isNaN(n))) {
    throw new Error(`motion: "${curve}" has a non-numeric control point.`);
  }
  return pts;
}

/**
 * The CSS timing KEYWORDS Faso Premium uses, each as its CSS-SPEC cubic-bezier
 * control points (W3C easing-1). `linear` is handled separately (it is its own
 * easing kind, not a bezier). These are the source's own keywords translated to
 * the exact curve — never RN's differently-shaped named easings.
 */
const CSS_KEYWORD_POINTS: Record<string, BezierPoints> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** A resolved easing the kit maps to an RN `Easing`: bezier points, or linear. */
export type EasingSpec = { kind: 'bezier'; points: BezierPoints } | { kind: 'linear' };

/**
 * Resolve any Faso Premium `timingFunction` — a `cubic-bezier(…)` OR a CSS
 * keyword (`ease` · `ease-in-out` · `linear`) — to an `EasingSpec`. Throws on
 * an unrecognized string (no silent fallback; the fidelity gate's whole point).
 */
export function easingSpec(timingFunction: string): EasingSpec {
  const tf = timingFunction.trim();
  if (tf === 'linear') return { kind: 'linear' };
  if (tf.startsWith('cubic-bezier')) return { kind: 'bezier', points: cubicBezierPoints(tf) };
  const kw = CSS_KEYWORD_POINTS[tf];
  if (kw !== undefined) return { kind: 'bezier', points: kw };
  throw new Error(`motion: "${timingFunction}" is not a known timing function (cubic-bezier / ease / ease-in-out / linear).`);
}

/** A Faso Premium duration is a number or a README range `{ min, max }`. */
export type FpDuration = number | { readonly min: number; readonly max: number };

/**
 * Resolve a duration to ms. A single value is itself; a RANGE takes its `min`
 * by default (the snappier bound), or `max` where a site wants the fuller
 * overshoot (fpPop: checks take min .3s, the celebration disk takes max .45s —
 * the pixel-source usage split). Journaled; founder-overridable.
 */
export function fpDurationMs(d: FpDuration, bound: 'min' | 'max' = 'min'): number {
  return typeof d === 'number' ? d : d[bound];
}
