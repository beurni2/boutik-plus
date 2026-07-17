/**
 * WO-FP-BOUTIK — THE SIGNATURE MODULE. The six Faso Premium signature elements
 * (README § Signature elements), built ONCE here and consumed by every view —
 * never re-forked per screen. Every colour resolves to a token or a docketed
 * app-local tone (src/ui/fp.ts); zero hand-copied hex. Gradients use
 * react-native-svg (an approved dep) — never a new CSS-gradient dependency.
 *
 *   1. WovenBand      — the 6px repeating accent/paper/gold strip.
 *   2. HeroLedgerBand — the full-width accent money card (weave + tnum hero).
 *   3. DuotoneTile    — the product-art placeholder (duotone + weave + monogram).
 *   4. Selectable     — border-swap + 26px check bubble (fpPop) on selection.
 *   5. CornerTicks    — the documentary-evidence L-marks inside frames.
 *   6. QuoteRule      — the 3px ink left-rule for the one sentence that matters.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Rect, Stop } from 'react-native-svg';
import { C, appColour, D, R, ts, MONEY_TEXT, SHADOW } from './fp';
import { FpPop } from './anim';
import { Icon } from './icons';

// ── 1 · Woven band ───────────────────────────────────────────────────────────
// README: repeating-linear-gradient(90deg, ACCENT 0 18px, PAPER 18px 24px,
// GOLD 24px 32px, PAPER 32px 38px). Hard stops → solid segments (byte-faithful).
// Rendered as a clipped row of the 38px unit repeated to cover the frame width.
const WOVEN_UNIT = [
  { c: C.primary, w: 18 },
  { c: C.paper, w: 6 },
  { c: C.gold, w: 8 },
  { c: C.paper, w: 6 },
] as const;
const WOVEN_REPEATS = 14; // 14 × 38px = 532 > frame 402 → always covers, clipped

/** The 6px woven strip under the status bar — the permanent brand mark. */
export function WovenBand({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[styles.woven, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: WOVEN_REPEATS }).flatMap((_, u) =>
        WOVEN_UNIT.map((seg, i) => (
          <View key={`${u}-${i}`} style={{ width: seg.w, backgroundColor: seg.c }} />
        )),
      )}
    </View>
  );
}

// ── weave overlay (shared by ledger band + duotone tile) ─────────────────────
// README: repeating-linear-gradient(135deg, tint 0 12px, transparent 12px 30px).
// Diagonal parallel lines, 12px stroke every 30px, at 45°. Measures itself.
function WeaveOverlay({ colour, style }: { colour: string; style?: StyleProp<ViewStyle> }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const lines: number[] = [];
  for (let x = -size.h; x < size.w; x += 30) lines.push(x);
  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          {lines.map((x, i) => (
            <Line key={i} x1={x} y1={0} x2={x + size.h} y2={size.h} stroke={colour} strokeWidth={12} />
          ))}
        </Svg>
      )}
    </View>
  );
}

// ── 2 · Hero ledger band ─────────────────────────────────────────────────────
/**
 * Full-width accent money card: weave overlay, a caps label, the 36–38px tnum
 * amount (money majesty), and an optional hairline divider row (children). The
 * signature money moment (README § Signature elements 2 · HANDOFF « héros vert »).
 */
export function HeroLedgerBand({
  label,
  amount,
  sub,
  children,
  style,
}: {
  label: string;
  amount: string;
  sub?: string | undefined;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.ledger, style]}>
      {/* The weave is a 5%-white TEXTURE on the solid accent (planche « héros
          vert »), never the money's background — the figure reads on solid. */}
      <WeaveOverlay colour={appColour.ledgerWeave} style={styles.ledgerWeave} />
      <Text style={ts('caps', C.soft)}>{label}</Text>
      <Text style={[ts('heroMoney', C.onPrimary), MONEY_TEXT]} numberOfLines={1}>
        {amount}
      </Text>
      {sub !== undefined && <Text style={ts('body', C.soft)}>{sub}</Text>}
      {children !== undefined && <View style={styles.ledgerDivider}>{children}</View>}
    </View>
  );
}

// ── 3 · Duotone product-art tile ─────────────────────────────────────────────
// README: linear-gradient(140deg, A, B) + weave overlay (.07 white) + glyph.
// The frozen demo store carries no glyph/bg data, so the tile renders the
// token-derived duotone + weave signature with a text monogram (NOT emoji —
// the no-emoji chrome gate stays green unchanged; adaptation listed for the
// founder). The duotone pair is chosen deterministically from the label.
const DUOTONE_PAIRS: readonly (readonly [string, string])[] = [
  [C.primary, C.deep],
  [C.deep, C.primary],
  [C.gold, C.primary],
  [C.primary, C.gold],
];
function duotoneFor(seed: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DUOTONE_PAIRS[h % DUOTONE_PAIRS.length]!;
}

/** The product-art placeholder surface — a warm duotone with the weave overlay
 * and a monogram initial. `height`/`radius` default to the list-tile size. */
export function DuotoneTile({
  label,
  height = D.artTileH,
  radius = R.tile,
  style,
}: {
  label: string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [a, b] = duotoneFor(label);
  const gid = `duo-${a}-${b}`.replace(/[^a-zA-Z0-9]/g, '');
  const mono = (label.trim()[0] ?? '·').toUpperCase();
  return (
    <View style={[{ height, borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gid} x1="0.1" y1="0.05" x2="0.85" y2="0.95">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
      <WeaveOverlay colour={appColour.artWeave} />
      <View style={styles.tileGlyphWrap} pointerEvents="none">
        <Text style={[ts('screen', C.onPrimary), styles.tileGlyph]}>{mono}</Text>
      </View>
    </View>
  );
}

// ── 4 · Selection = border swap + check bubble ───────────────────────────────
/**
 * A selectable surface: unselected = 1.5px hairline-input border; selected =
 * 2px accent border + a 26px accent check bubble top-right (fpPop). README
 * § Signature elements 4.
 */
export function Selectable({
  selected,
  onPress,
  children,
  style,
  accessibilityLabel,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string | undefined;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.selectable,
        selected ? styles.selectableOn : styles.selectableOff,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
      {selected && (
        <FpPop style={styles.checkBubble}>
          <Icon name="coche" size={16} color={C.onPrimary} />
        </FpPop>
      )}
    </Pressable>
  );
}

// ── 5 · Corner ticks ─────────────────────────────────────────────────────────
/**
 * The four L-marks inside a photo/code frame — "documentary evidence" framing
 * (README § Signature elements 5). Absolute; `colour` defaults to the accent.
 */
export function CornerTicks({ colour = C.primary, inset = 0 }: { colour?: string; inset?: number }) {
  const arm = { position: 'absolute' as const, width: D.cornerTick, height: D.cornerTick, borderColor: colour };
  return (
    <View style={[StyleSheet.absoluteFill, { margin: inset }]} pointerEvents="none">
      <View style={[arm, { top: 0, left: 0, borderTopWidth: D.cornerStroke, borderLeftWidth: D.cornerStroke }]} />
      <View style={[arm, { top: 0, right: 0, borderTopWidth: D.cornerStroke, borderRightWidth: D.cornerStroke }]} />
      <View style={[arm, { bottom: 0, left: 0, borderBottomWidth: D.cornerStroke, borderLeftWidth: D.cornerStroke }]} />
      <View style={[arm, { bottom: 0, right: 0, borderBottomWidth: D.cornerStroke, borderRightWidth: D.cornerStroke }]} />
    </View>
  );
}

// ── 6 · Quote rule ───────────────────────────────────────────────────────────
/** The 3px ink left-rule for the one sentence that matters (README § 6). */
export function QuoteRule({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.quote, style]}>
      <Text style={ts('body', C.body)}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  woven: { height: D.wovenH, flexDirection: 'row', overflow: 'hidden', backgroundColor: C.paper },
  ledger: {
    backgroundColor: C.primary,
    borderRadius: R.ledger,
    padding: D.pad,
    gap: D.gapXs,
    overflow: 'hidden',
    ...SHADOW.hero,
  },
  ledgerWeave: { borderRadius: R.ledger },
  ledgerDivider: { marginTop: D.gap, paddingTop: D.gap, borderTopWidth: D.hair, borderTopColor: C.onPrimary, opacity: 1 },
  tileGlyphWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  tileGlyph: { opacity: 0.9, textShadowColor: C.ink, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 6 },
  selectable: { borderRadius: R.tile, padding: D.cardPad, backgroundColor: C.card },
  selectableOff: { borderWidth: D.selOff, borderColor: C.hairlineInput },
  selectableOn: { borderWidth: D.selOn, borderColor: C.primary },
  checkBubble: {
    position: 'absolute',
    top: -D.checkBubble / 3,
    right: -D.checkBubble / 3,
    width: D.checkBubble,
    height: D.checkBubble,
    borderRadius: R.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quote: { borderLeftWidth: D.quoteWidth, borderLeftColor: C.ink, paddingLeft: D.quotePad },
  pressed: { opacity: 0.96, transform: [{ scale: 0.98 }] },
});
