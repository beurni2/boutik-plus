/**
 * WO-FP-BOUTIK — the RN motion primitives, wired from the seven Faso Premium
 * `fp*` tokens. Every one respects `prefers-reduced-motion` (README § Motion:
 * "prefers-reduced-motion:reduce ⇒ tout à none") — under reduced motion the
 * wrappers render their settled end-state with NO animation.
 *
 * Fidelity: durations + curves come from `@platform/ui-tokens` motion.*; the
 * curve is driven through `Easing.bezier(...)` / `Easing.linear` (motion.ts
 * `easingSpec`), never invented spring physics. Transform + opacity only, native
 * driver where the value is not read in JS.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '@platform/ui-tokens';
import { easingSpec, fpDurationMs, type FpDuration } from './motion';

/** A token `timingFunction` → an RN Easing (bezier points or linear). */
export function rnEasing(timingFunction: string) {
  const spec = easingSpec(timingFunction);
  return spec.kind === 'linear' ? Easing.linear : Easing.bezier(...spec.points);
}

/** Reduced-motion flag — the doctrine's veto, honoured everywhere motion runs. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * FpIn — screen/element entry: opacity 0→1 + translateY 14→0, from the `fpIn`
 * token (.32s cubic-bezier(.2,.8,.2,1)). Non-blocking (interactive from frame 1);
 * static under reduced motion. `motionKey` re-triggers the entry on change.
 */
export function FpIn({
  motionKey,
  children,
  style,
}: {
  motionKey?: string | number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      p.setValue(1);
      return;
    }
    p.setValue(0);
    Animated.timing(p, {
      toValue: 1,
      duration: motion.fpIn.durationMs,
      easing: rnEasing(motion.fpIn.timingFunction),
      useNativeDriver: true,
    }).start();
  }, [motionKey, reduced, p]);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: p, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/**
 * FpPop — the check / success overshoot from the `fpPop` token (scale .6→1.06→1,
 * opacity 0→1). `bound` picks the duration end of the token's range: 'min' (.3s,
 * checks) or 'max' (.45s, the celebration disc). Static end-state under reduced
 * motion. Mounts its children when `visible`.
 */
export function FpPop({
  visible = true,
  bound = 'min',
  children,
  style,
}: {
  visible?: boolean;
  bound?: 'min' | 'max';
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      p.setValue(1);
      return;
    }
    p.setValue(0);
    Animated.timing(p, {
      toValue: 1,
      duration: fpDurationMs(motion.fpPop.durationMs as FpDuration, bound),
      easing: rnEasing(motion.fpPop.timingFunction),
      useNativeDriver: true,
    }).start();
  }, [visible, reduced, bound, p]);
  if (!visible) return null;
  // scale .6→1.06(0.6)→1: an overshoot curve expressed on the 0→1 progress.
  const scale = p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 1.06, 1], extrapolate: 'clamp' });
  return <Animated.View style={[style, { opacity: p, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/**
 * Pulse — the `fpPulse` token (1.2s ease, opacity 1→.35→1): the current timeline
 * step, live dots, processing. Static (full opacity) under reduced motion.
 */
export function Pulse({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 0.35, duration: motion.fpPulse.durationMs / 2, easing: rnEasing(motion.fpPulse.timingFunction), useNativeDriver: true }),
        Animated.timing(p, { toValue: 1, duration: motion.fpPulse.durationMs / 2, easing: rnEasing(motion.fpPulse.timingFunction), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [p, reduced]);
  return <Animated.View style={[style, { opacity: reduced ? 1 : p }]}>{children}</Animated.View>;
}

/**
 * useCountUp — money heroes count up over 800 ms with the HANDOFF's cubic-out
 * easing `1−(1−k)³` (README § Motion), re-running whenever the target changes.
 * Returns the current integer value to format. Reduced motion → the target
 * immediately. JS-driven (the value is read every frame to reformat), so it
 * never touches the native driver.
 */
export function useCountUp(target: number, durationMs = 800): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const startRef = useRef(0);
  useEffect(() => {
    if (reduced || target === fromRef.current) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    startRef.current = 0;
    const tick = (now: number) => {
      if (startRef.current === 0) startRef.current = now;
      const k = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3); // 1−(1−k)³ — cubic-out, HANDOFF §3
      setValue(Math.round(from + (target - from) * eased));
      if (k < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, reduced]);
  return value;
}

/**
 * Shimmer — the skeleton sweep (`fpShimmer` 1.2s linear): a light band travels
 * across a skeleton-base block sized to the real content. Static base under
 * reduced motion. Colours are passed in (tokens) so this stays render-only.
 */
export function Shimmer({
  baseColour,
  highlightColour,
  style,
}: {
  baseColour: string;
  highlightColour: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduced || w === 0) return;
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: motion.fpShimmer.durationMs, easing: rnEasing(motion.fpShimmer.timingFunction), useNativeDriver: true }),
    );
    x.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [x, reduced, w]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-w, w] });
  return (
    <Animated.View
      style={[{ backgroundColor: baseColour, overflow: 'hidden' }, style]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {!reduced && w > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { width: w * 0.6, backgroundColor: highlightColour, opacity: 0.6, transform: [{ translateX }] },
          ]}
        />
      )}
    </Animated.View>
  );
}
