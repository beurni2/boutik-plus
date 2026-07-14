import { describe, expect, it } from 'vitest';
import { motion } from '@platform/ui-tokens';
import { cubicBezierPoints, easingSpec, fpDurationMs } from '../src/ui/motion';

/**
 * WO-FP-BOUTIK (ruling ② — token fidelity for the motion curves). The kit drives
 * Animated.timing with an Easing resolved from the fasoPremium `fp*` tokens; this
 * test proves the parse extracts the designer's EXACT control points (bezier) or
 * resolves the CSS keyword to its spec curve, and that a malformed string THROWS
 * rather than silently falling back to a default easing (a drift).
 */

describe('fp* motion token fidelity', () => {
  it('the three bezier motions extract the EXACT control points the canon token authored', () => {
    // literals cross-checked AGAINST the live token, so a canon curve change fails here.
    expect(cubicBezierPoints(motion.fpIn.timingFunction)).toEqual([0.2, 0.8, 0.2, 1]);
    expect(cubicBezierPoints(motion.fpUp.timingFunction)).toEqual([0.32, 0.72, 0.25, 1]);
    expect(cubicBezierPoints(motion.fpPop.timingFunction)).toEqual([0.2, 0.8, 0.2, 1]);
  });

  it('easingSpec resolves bezier motions to points and keyword motions to their kind', () => {
    expect(easingSpec(motion.fpIn.timingFunction)).toEqual({ kind: 'bezier', points: [0.2, 0.8, 0.2, 1] });
    // the four keyword motions carry a CSS keyword verbatim (ease / ease-in-out / linear)
    expect(motion.fpPulse.timingFunction).toBe('ease');
    expect(motion.fpBar.timingFunction).toBe('ease-in-out');
    expect(motion.fpShimmer.timingFunction).toBe('linear');
    expect(motion.fpShake.timingFunction).toBe('ease');
    // linear is its own kind; the others resolve to their CSS-spec bezier points
    expect(easingSpec('linear')).toEqual({ kind: 'linear' });
    expect(easingSpec('ease')).toEqual({ kind: 'bezier', points: [0.25, 0.1, 0.25, 1] });
    expect(easingSpec('ease-in-out')).toEqual({ kind: 'bezier', points: [0.42, 0, 0.58, 1] });
  });

  it('cubicBezierPoints THROWS on a keyword easing (no silent fallback)', () => {
    expect(() => cubicBezierPoints('linear')).toThrow(/fidelity|cubic-bezier/);
    expect(() => cubicBezierPoints('ease-in-out')).toThrow();
  });

  it('cubicBezierPoints THROWS on a malformed curve (wrong arg count / non-numeric)', () => {
    expect(() => cubicBezierPoints('cubic-bezier(1, 2, 3)')).toThrow();
    expect(() => cubicBezierPoints('cubic-bezier(a, b, c, d)')).toThrow();
    expect(() => cubicBezierPoints('')).toThrow();
  });

  it('easingSpec THROWS on an unknown timing function (no silent fallback)', () => {
    expect(() => easingSpec('wiggle')).toThrow();
    expect(() => easingSpec('cubic-bezier(1,2,3)')).toThrow();
  });

  it('fpDurationMs resolves the fpPop range at both bounds (checks .3s / disc .45s)', () => {
    expect(fpDurationMs(motion.fpPop.durationMs)).toBe(300); // default min — checks
    expect(fpDurationMs(motion.fpPop.durationMs, 'max')).toBe(450); // the celebration disc
    expect(fpDurationMs(motion.fpIn.durationMs)).toBe(320); // a plain number is itself
  });
});
