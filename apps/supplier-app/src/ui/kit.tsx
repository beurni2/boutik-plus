import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  band,
  boutikColour,
  celebration,
  interaction,
  money,
  motion,
  radius,
  sharedColour,
  skeleton as skeletonToken,
  spacing,
  touch,
  type as typeTokens,
} from '@platform/ui-tokens';
import { cubicBezierPoints } from './motion';
import { FONT_FAMILY } from './fonts';
import { Icon, type IconName } from './icons';

// The kit is the single design-system entry point: screens import the glyph
// dispatcher + its name type from here alongside the components.
export { Icon, type IconName } from './icons';

/**
 * WO-6.0 — LE VISAGE, rebuilt from zero on ui-tokens v0.9.0 (Grand Teint,
 * direction 1b). The look is « craft under constraint »: near-black ink on
 * warm paper, hairline tables (radius 0, NO shadow — elevation theatre is
 * forbidden), money in majesty (tabular, U+202F group space owned by the
 * money tokens the screens format with), and one primary action per screen.
 *
 * Every colour/size/duration/radius resolves to a token — zero hardcode (the
 * scan gate proves it). Motion is consumed AS AUTHORED: `motion.springSoft`
 * is a cubic-bezier string driven through Easing.bezier (src/ui/motion.ts,
 * ruling ②), never invented spring physics; transform + opacity only, native
 * driver, reduced-motion static equivalents. Icons are the canon set as
 * react-native-svg (currentColor) — ZERO emoji (the emoji-scan gate enforces
 * it). The typeface is Archivo (progressive: the metrics-matched system face
 * paints first; native embedding lands in the font slice).
 */

// The Boutik+ palette with EXACT string types (theme.colours indexes the
// accent keys through a Record<string,string> → string|undefined under
// noUncheckedIndexedAccess; the source const objects keep the literal types).
const C = { ...sharedColour, ...boutikColour };
/** The Boutik+ Grand Teint palette, for screens composing custom surfaces. */
export const palette = C;

// ── the authored easings, parsed once (token fidelity — no spring physics) ──
const EASE_SOFT = Easing.bezier(...cubicBezierPoints(motion.springSoft));
const EASE_POP = Easing.bezier(...cubicBezierPoints(motion.springPop));
const EASE_FLY = Easing.bezier(...cubicBezierPoints(motion.flyOut));

// ── type: canon scale → RN TextStyle (lh is a unitless multiplier; wght a
//    numeric axis → RN fontWeight string; caps → uppercase; ls → letterSpacing).
export type ScaleToken = {
  size: number;
  lh: number;
  wght: number;
  ls?: number;
  caps?: boolean;
  wdth?: number;
};
/** The canon type scale → an RN TextStyle. Exported so screens compose the
 * design system's typography instead of re-deriving lineHeight/weight. */
export function textStyle(s: ScaleToken): TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: s.size,
    lineHeight: s.size * s.lh,
    fontWeight: String(s.wght) as TextStyle['fontWeight'],
    color: C.ink,
    ...(s.ls !== undefined ? { letterSpacing: s.ls } : {}),
    ...(s.caps === true ? { textTransform: 'uppercase' } : {}),
  };
}
const T = typeTokens.scale;

/** Reduced-motion flag — the doctrine's veto, honoured everywhere motion runs. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
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

/** ThemeBand — the 4 px app-colour strip under the header (the one permanent
 * brand mark; the tri-colour weave is reserved for celebrations). */
export function ThemeBand() {
  return <View style={styles.themeBand} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

/** AppHeader — wordmark caps + one-line context (right), bottom hairline,
 * ThemeBand below. The anchor of stability: no motion. */
export function AppHeader({
  title,
  context,
  backLabel,
  onBack,
}: {
  title: string;
  context?: string | undefined;
  backLabel?: string | undefined;
  onBack?: (() => void) | undefined;
}) {
  return (
    <View>
      <View style={styles.header}>
        {onBack !== undefined && (
          <Pressable
            style={pressableStyle(styles.backHit)}
            onPress={onBack}
            accessibilityRole="button"
            hitSlop={spacing.sm}
          >
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {context !== undefined && (
          <Text style={styles.headerContext} numberOfLines={1}>
            {context}
          </Text>
        )}
      </View>
      <ThemeBand />
    </View>
  );
}

/** HairlineBox — content in a bordered box (radius 0, no shadow). `ink`
 * variant = 2 px ink border for money/summary surfaces. */
export function HairlineBox({
  children,
  ink,
  style,
}: {
  children: React.ReactNode;
  ink?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.box, ink === true ? styles.boxInk : styles.boxHairline, style]}>{children}</View>;
}

/** Overline — the small caps section label (labelXS). */
export function Overline({ children }: { children: React.ReactNode }) {
  return <Text style={styles.overline}>{children}</Text>;
}

/** ListRow — FIXED height (getItemLayout law); icon + label + optional right
 * value (tnum) or chevron; bottom hairline. */
export const LIST_ROW_HEIGHT = 56;
export function ListRow({
  icon,
  title,
  meta,
  value,
  chip,
  destructive,
  onPress,
}: {
  icon?: IconName | undefined;
  title: string;
  meta?: string | undefined;
  value?: string | undefined;
  chip?: React.ReactNode | undefined;
  destructive?: boolean | undefined;
  onPress?: (() => void) | undefined;
}) {
  const tint = destructive === true ? C.danger : C.ink;
  const body = (
    <>
      {icon !== undefined && <Icon name={icon} size={17} color={tint} />}
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: tint }]} numberOfLines={1}>
          {title}
        </Text>
        {meta !== undefined && (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        )}
        {chip !== undefined && <View style={styles.rowChipLine}>{chip}</View>}
      </View>
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
      {onPress !== undefined && value === undefined && <Icon name="chevron" size={17} color={C.soft} />}
    </>
  );
  if (onPress === undefined) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable style={pressableStyle(styles.row)} onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

function pressableStyle(base: StyleProp<ViewStyle>) {
  return ({ pressed }: { pressed: boolean }) => [base, pressed && styles.pressed];
}

/** PrimaryButton — full-width block; ink fill (structure) or theme primary
 * (money commitment). Disabled carries an explanatory label (never a dead
 * grey button); loading shows the gtBar pulse, never a spinner. */
export function PrimaryButton({
  label,
  onPress,
  money: isMoney,
  disabled,
  disabledLabel,
}: {
  label: string;
  onPress: () => void;
  money?: boolean | undefined;
  disabled?: boolean | undefined;
  disabledLabel?: string | undefined;
}) {
  const isDisabled = disabled === true;
  return (
    <Pressable
      style={pressableStyle([
        styles.button,
        isMoney === true ? styles.buttonPrimary : styles.buttonInk,
        isDisabled && styles.buttonDisabled,
      ])}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      <Text style={styles.buttonInkText}>{isDisabled && disabledLabel !== undefined ? disabledLabel : label}</Text>
    </Pressable>
  );
}

/** SecondaryButton — hairline box, ink label; `danger` variant for
 * equal-prominence problem paths (bordered, not screaming). */
export function SecondaryButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean | undefined;
}) {
  return (
    <Pressable
      style={pressableStyle([styles.button, styles.buttonSecondary, danger === true && styles.buttonSecondaryDanger])}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.buttonSecondaryText, danger === true && styles.buttonSecondaryDangerText]}>{label}</Text>
    </Pressable>
  );
}

/** UnderlineLink — the tertiary verb (MODIFIER, REFAIRE, REVENIR…): caps
 * labelXS primaryStrong + underline, hit area padded to touch minimum. */
export function UnderlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={pressableStyle(styles.linkHit)} onPress={onPress} accessibilityRole="link" hitSlop={spacing.sm}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** AmountHero — « l'argent en majesté »: caps label + the amount as the
 * biggest ink on the screen (tabular), optional honesty note. `pending`
 * mutes the amount + never shows a green success before server truth. */
export function AmountHero({
  label,
  amount,
  note,
  pending,
}: {
  label?: string | undefined;
  amount: string;
  note?: string | undefined;
  pending?: boolean | undefined;
}) {
  return (
    <View style={styles.amountHeroBlock}>
      {label !== undefined && <Text style={styles.amountHeroLabel}>{label}</Text>}
      <Text style={[styles.amountHero, pending === true && styles.amountPending]}>{amount}</Text>
      {note !== undefined && <Text style={styles.amountNote}>{note}</Text>}
    </View>
  );
}

/** PriceBand ⭐ — the signature money moment: full-width theme block, tiny
 * caps label + big tabular amount (onPrimary) + right-column honesty note. */
export function PriceBand({
  label,
  amount,
  note,
  muted,
}: {
  label: string;
  amount: string;
  note?: string | undefined;
  muted?: boolean | undefined;
}) {
  return (
    <View style={[styles.priceBand, muted === true && styles.priceBandMuted]}>
      <View style={styles.priceBandMain}>
        <Text style={styles.priceBandLabel}>{label}</Text>
        <Text style={styles.priceBandAmount}>{amount}</Text>
      </View>
      {note !== undefined && <Text style={styles.priceBandNote}>{note}</Text>}
    </View>
  );
}

/** ReconcileLine — « chaque franc a sa place »: the receipt's honesty line
 * under a money box (right-aligned, tabular). */
export function ReconcileLine({ children }: { children: React.ReactNode }) {
  return <Text style={styles.reconcileLine}>{children}</Text>;
}

/** StatusChip — square caps chip; tone maps to the state palette. `fact` is
 * an ink fill; success fill only after server truth (never a green lie). */
export type ChipTone = 'fact' | 'neutral' | 'pending' | 'problem' | 'celebrate';
export function StatusChip({ tone, label, icon }: { tone: ChipTone; label: string; icon?: IconName | undefined }) {
  const chipStyle = CHIP_STYLE[tone];
  return (
    <View style={[styles.chip, chipStyle.box]}>
      {icon !== undefined && <Icon name={icon} size={12} color={chipStyle.fg} />}
      <Text style={[styles.chipText, { color: chipStyle.fg }]}>{label}</Text>
    </View>
  );
}

/** Skeleton — sand block that CLONES the exact box of its content (layout
 * shift forbidden → CLS 0 by construction); opacity pulse, static under
 * reduced motion. `width`/`height` are required so it matches the content. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: skeletonToken.pulseFloor,
          duration: skeletonToken.pulseMs / 2,
          easing: EASE_SOFT,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: skeletonToken.pulseMs / 2,
          easing: EASE_SOFT,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[styles.skeleton, { opacity: reduced ? skeletonToken.pulseFloor : pulse }, style]} />;
}

/** EmptyState — a designed state, never an apology: icon + one sentence + one
 * action (the next act). */
export function EmptyState({
  icon,
  title,
  action,
}: {
  icon: IconName;
  title: string;
  action?: React.ReactNode | undefined;
}) {
  return (
    <View style={styles.emptyState}>
      <Icon name={icon} size={28} color={C.soft} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {action}
    </View>
  );
}

/** PendingNotice — « C'est noté. En attente du réseau. » Queued = pending,
 * never done: warningTint band, clock icon. */
export function PendingNotice({ lines }: { lines: readonly string[] }) {
  return (
    <View style={styles.pendingNotice}>
      <Icon name="horloge" size={17} color={C.warning} />
      <View style={styles.pendingBody}>
        {lines.map((line) => (
          <Text key={line} style={styles.pendingText}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** OfflineBanner — global ink band under the header when offline. */
export function OfflineBanner({ label }: { label: string }) {
  return (
    <View style={styles.offlineBanner}>
      <Icon name="horsligne" size={14} color={C.onInk} />
      <Text style={styles.offlineText}>{label}</Text>
    </View>
  );
}

/** TabBar — ≤ 4 items, icon 20 + word (icon+word law), active = ink + 2 px
 * top indicator. Icon slots are typed `IconName`. */
export interface TabItem {
  key: string;
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
}
export function TabBar({ items }: { items: readonly TabItem[] }) {
  return (
    <View style={styles.tabBar}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          style={styles.tab}
          onPress={item.onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.active }}
        >
          {item.active && <View style={styles.tabIndicator} />}
          <Icon name={item.icon} size={20} color={item.active ? C.ink : C.soft} />
          <Text style={[styles.tabLabel, item.active && styles.tabLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** ScreenEnter — the screen arrives from the direction of travel: translateY
 * 14 → 0, opacity 0 → 1, 240 ms springSoft (Easing.bezier). Non-blocking
 * (content interactive from frame 1); static under reduced motion. */
export function ScreenEnter({ screenKey, children }: { screenKey: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.standardMs,
      easing: EASE_SOFT,
      useNativeDriver: true,
    }).start();
  }, [screenKey, reduced, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return (
    <Animated.View style={[styles.enterFill, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/** CelebrationLayer — « Produit prêt » (B7): halo + ring + woven-diamond
 * motifs + badge, ≤ 800 ms, tap-to-skip, NON-BLOCKING (the state underneath
 * is already true). Reduced motion = no layer at all (the confirmed panel is
 * already shown). Transform + opacity only, native driver. */
export function CelebrationLayer({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const cel = celebration.produitPret;
  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      onDone();
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: celebration.motifMs,
      easing: EASE_FLY,
      useNativeDriver: true,
    }).start();
    const ceiling = setTimeout(onDone, motion.celebrateMaxMs);
    return () => clearTimeout(ceiling);
  }, [visible, reduced, progress, onDone]);
  if (!visible || reduced) return null;
  const haloScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.18] });
  const haloOpacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.55, 0] });
  const ringScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.32] });
  const ringOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });
  const badgeScale = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.55, 1.07, 1], extrapolate: 'clamp' });
  return (
    <Pressable style={styles.celebrationWrap} onPress={onDone} accessibilityElementsHidden>
      <Animated.View
        style={[styles.celebrationHalo, { backgroundColor: cel.halo, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
      />
      <Animated.View
        style={[styles.celebrationRing, { borderColor: cel.ring, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
      />
      <View style={styles.motifRow}>
        {cel.motifColours.map((colour, i) => (
          <Animated.View
            key={i}
            style={[styles.motifDiamond, { backgroundColor: colour, transform: [{ scale: badgeScale }, { rotate: '45deg' }] }]}
          />
        ))}
      </View>
      <Animated.View style={[styles.celebrationBadge, { backgroundColor: cel.badgeBg, transform: [{ scale: badgeScale }] }]}>
        <Text style={[styles.celebrationBadgeText, { color: cel.badgeFg }]}>{cel.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const H = interaction.hairline;

const CHIP_STYLE: Record<ChipTone, { box: ViewStyle; fg: string }> = {
  fact: { box: { backgroundColor: C.ink }, fg: C.onInk },
  neutral: { box: { borderWidth: H.medium, borderColor: C.hairlineStrong, backgroundColor: C.paper }, fg: C.body },
  pending: { box: { backgroundColor: C.warningTint }, fg: C.warning },
  problem: { box: { backgroundColor: C.dangerTint }, fg: C.danger },
  celebrate: { box: { backgroundColor: C.primary }, fg: C.onPrimary },
};

const styles = StyleSheet.create({
  themeBand: { height: band.themeStripPx, backgroundColor: C.themeStrip },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    borderBottomWidth: H.thin,
    borderBottomColor: C.hairline,
    backgroundColor: C.paper,
  },
  backHit: { minHeight: touch.minTargetPx, justifyContent: 'center' },
  backText: { ...textStyle(T.label), color: C.ink },
  headerTitle: { ...textStyle(T.labelLG), flex: 1, color: C.ink },
  headerContext: { ...textStyle(T.caption), color: C.muted },
  box: { padding: spacing.lg, gap: spacing.md, backgroundColor: C.paper },
  boxHairline: { borderWidth: H.medium, borderColor: C.hairlineStrong, borderRadius: radius.box },
  boxInk: { borderWidth: H.strong, borderColor: C.ink, borderRadius: radius.box },
  overline: { ...textStyle(T.labelXS), color: C.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: LIST_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: H.thin,
    borderBottomColor: C.hairline,
    backgroundColor: C.paper,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...textStyle(T.row), color: C.ink },
  rowMeta: { ...textStyle(T.caption), color: C.muted },
  rowChipLine: { flexDirection: 'row', marginTop: 2 },
  rowValue: { ...textStyle({ ...money.amountScale.row }), color: C.ink, fontVariant: ['tabular-nums'] },
  pressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.pressScale }] },
  button: {
    minHeight: 56,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonInk: { backgroundColor: C.ink },
  buttonPrimary: { backgroundColor: C.primary },
  buttonInkText: { ...textStyle(T.label), color: C.onInk },
  buttonDisabled: { opacity: interaction.disabledOpacity },
  buttonSecondary: { borderWidth: H.medium, borderColor: C.hairlineStrong, backgroundColor: C.paper, minHeight: 50 },
  buttonSecondaryDanger: { borderColor: C.danger },
  buttonSecondaryText: { ...textStyle(T.label), color: C.ink },
  buttonSecondaryDangerText: { color: C.danger },
  linkHit: { minHeight: touch.minTargetPx, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { ...textStyle(T.labelXS), color: C.primaryStrong, textDecorationLine: 'underline' },
  amountHeroBlock: { gap: spacing.xs },
  amountHeroLabel: { ...textStyle(T.labelXS), color: C.muted },
  amountHero: { ...textStyle({ ...money.amountScale.hero }), color: C.ink, fontVariant: ['tabular-nums'] },
  amountPending: { color: C.muted },
  amountNote: { ...textStyle(T.caption), color: C.muted },
  priceBand: { backgroundColor: C.primary, paddingVertical: band.priceBand.padY, paddingHorizontal: band.priceBand.padX, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  priceBandMuted: { backgroundColor: C.soft },
  priceBandMain: { flex: 1 },
  priceBandLabel: { ...textStyle(T.labelXS), color: C.primarySoft },
  priceBandAmount: { ...textStyle({ ...money.amountScale.page }), color: C.onPrimary, fontVariant: ['tabular-nums'] },
  priceBandNote: { ...textStyle(T.caption), color: C.primarySoft, width: 118, textAlign: 'right' },
  reconcileLine: { ...textStyle({ size: money.reconcileLine.size, lh: 1.3, wght: money.reconcileLine.wght, ls: money.reconcileLine.ls }), color: C.muted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.chip, paddingVertical: 3, paddingHorizontal: spacing.sm, alignSelf: 'flex-start' },
  chipText: { ...textStyle(T.labelXS) },
  skeleton: { backgroundColor: skeletonToken.bg, borderRadius: radius.box },
  emptyState: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  emptyTitle: { ...textStyle(T.body), color: C.body, textAlign: 'center' },
  pendingNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: C.warningTint, padding: spacing.md },
  pendingBody: { flex: 1, gap: 2 },
  pendingText: { ...textStyle(T.caption), color: C.warning },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 30, backgroundColor: C.ink },
  offlineText: { ...textStyle(T.caption), color: C.onInk },
  tabBar: { flexDirection: 'row', borderTopWidth: H.thin, borderTopColor: C.hairline, backgroundColor: C.paper },
  tab: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, minHeight: 56, justifyContent: 'center' },
  tabIndicator: { position: 'absolute', top: 0, left: spacing.lg, right: spacing.lg, height: H.strong, backgroundColor: C.ink },
  tabLabel: { ...textStyle(T.labelXS), color: C.soft },
  tabLabelActive: { color: C.ink },
  enterFill: { flex: 1 },
  celebrationWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  celebrationHalo: { position: 'absolute', width: 220, height: 220, borderRadius: radius.pill },
  celebrationRing: { position: 'absolute', width: 132, height: 132, borderRadius: radius.pill, borderWidth: H.strong },
  motifRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  motifDiamond: { width: spacing.md, height: spacing.md },
  celebrationBadge: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.badge },
  celebrationBadgeText: { ...textStyle(T.label) },
});
