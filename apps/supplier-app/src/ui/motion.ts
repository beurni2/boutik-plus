/**
 * WO-6.0 — motion, consumed AS AUTHORED (founder ruling ②, token fidelity).
 *
 * Canon v0.9.0 expresses easings as CSS cubic-bezier STRINGS (`motion.springSoft`
 * = "cubic-bezier(0.2, 0.8, 0.25, 1)"). The design specifies an easing CURVE,
 * not a physical spring — so the RN kit drives `Animated.timing` with
 * `Easing.bezier(...)`, never `Animated.spring({ damping, stiffness, mass })`.
 * Inventing spring physics would be a design-value drift; the fidelity gate
 * exists to prevent exactly that.
 *
 * This module is PURE (no react-native import) so the parse is unit-testable
 * on its own: the kit does `Easing.bezier(...cubicBezierPoints(motion.springSoft))`.
 * A malformed / unknown curve string THROWS — a silent fallback to a default
 * easing would be a drift, and drift is what the gate forbids.
 */

export type BezierPoints = readonly [number, number, number, number];

const CUBIC_BEZIER = /^cubic-bezier\(\s*(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)\s*,\s*(-?[0-9]*\.?[0-9]+)\s*\)$/;

/**
 * Extract the four control points from a canon `cubic-bezier(x1,y1,x2,y2)`
 * string. Throws on anything that is not exactly that shape (keyword easings
 * like "linear"/"ease", wrong argument count, non-numeric args) — no silent
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
