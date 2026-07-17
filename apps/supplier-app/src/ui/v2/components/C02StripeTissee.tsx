import { View, StyleSheet } from 'react-native';
import { C02_CYCLE, C02_STYLES } from './C02.styles';

/**
 * C02 StripeTissée — the 6px woven band under the status zone (HANDOFF V2
 * §1.3/§1.5; Phase-0: S02 element y=54 h=6, repeating-linear-gradient(90deg,
 * green 0 18px, bg 18 24px, gold 24 32px, bg 32 38px)).
 *
 * LISTED DIVERGENCE (build order, Phase 1): RN has no repeating-linear-gradient;
 * the 38px cycle [green 18 · bg 6 · gold 8 · bg 6] is rendered as literal Views
 * — same stops to the pixel, proven by the clip diff.
 */
const CYCLE_W = 38;

export function C02StripeTissee({ width = 402 }: { width?: number }) {
  const n = Math.ceil(width / CYCLE_W);
  return (
    <View style={[styles.band, { width }]} pointerEvents="none">
      {Array.from({ length: n }, (_, i) =>
        C02_CYCLE.map((seg, j) => (
          <View key={`${i}-${j}`} style={{ width: seg.w, height: 6, backgroundColor: seg.c }} />
        )),
      )}
    </View>
  );
}

// style values live in C02.styles.ts (plain data) for the property-diff gate.
const styles = StyleSheet.create(C02_STYLES);
