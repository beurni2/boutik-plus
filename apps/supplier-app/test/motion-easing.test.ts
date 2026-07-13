import { describe, expect, it } from 'vitest';
import { motion } from '@platform/ui-tokens';
import { cubicBezierPoints } from '../src/ui/motion';

/**
 * WO-6.0 ruling ② — token fidelity for the motion curves. The kit drives
 * Animated.timing with Easing.bezier(...cubicBezierPoints(token)); this test
 * proves the parse extracts the designer's EXACT control points and that a
 * malformed / keyword curve THROWS rather than silently falling back to a
 * default easing (a fallback would be a design-value drift).
 */

describe('cubic-bezier token fidelity', () => {
  it('extracts the EXACT four control points the canon token authored', () => {
    // The literals here are the canon v0.9.0 values (family.ts motion.*);
    // the test cross-checks the parse AGAINST the live token, so a canon bump
    // that changed a curve would fail this until the numbers are re-read.
    expect(cubicBezierPoints(motion.springSoft)).toEqual([0.2, 0.8, 0.25, 1]);
    expect(cubicBezierPoints(motion.springPop)).toEqual([0.34, 1.56, 0.64, 1]);
    expect(cubicBezierPoints(motion.flyOut)).toEqual([0.16, 0.8, 0.3, 1]);
  });

  it('the extracted points are literally the token string, not a hardcode', () => {
    // Reconstruct the token string from the parsed points and assert it matches
    // the token (normalised) — binds the assertion to the token, not to memory.
    for (const curve of [motion.springSoft, motion.springPop, motion.flyOut]) {
      const [a, b, c, d] = cubicBezierPoints(curve);
      expect(curve.replace(/\s+/g, '')).toBe(`cubic-bezier(${a},${b},${c},${d})`);
    }
  });

  it('THROWS on a keyword easing (no silent fallback)', () => {
    expect(() => cubicBezierPoints('linear')).toThrow(/fidelity|cubic-bezier/);
    expect(() => cubicBezierPoints('ease-in-out')).toThrow();
  });

  it('THROWS on a malformed curve (wrong arg count / non-numeric)', () => {
    expect(() => cubicBezierPoints('cubic-bezier(1, 2, 3)')).toThrow();
    expect(() => cubicBezierPoints('cubic-bezier(a, b, c, d)')).toThrow();
    expect(() => cubicBezierPoints('')).toThrow();
  });
});
