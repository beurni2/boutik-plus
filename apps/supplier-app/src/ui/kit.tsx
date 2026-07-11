import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { boutikPlusTheme as theme, money, motion } from '@platform/ui-tokens';

/**
 * WO-4.2R — LE VISAGE. The per-app component kit, built ONCE on ui-tokens
 * v2 (pin 539dbc8a) against the founder's prototype patterns
 * (design-reference/faso-commerce-prototype.jsx — feel/flow reference; the
 * TOKENS own every color, size and duration; the scan test proves zero
 * hardcoded style values). RN primitives only — zero new dependencies.
 * Navigation semantics live in App.tsx and are untouched by this layer.
 */

/* The woven band — the ecosystem signature (prototype `.band`): a slim
 * tri-color strip on the theme's own palette, at the very top of the app. */
const BAND_SEQUENCE = [
  theme.colors.primary,
  theme.colors.surfaceSunken,
  theme.colors.warning,
  theme.colors.surfaceSunken,
] as const;
export function WaxBand() {
  return (
    <View style={styles.band} accessibilityElementsHidden>
      {Array.from({ length: 24 }, (_, i) => (
        <View key={i} style={[styles.bandSegment, { backgroundColor: BAND_SEQUENCE[i % BAND_SEQUENCE.length] }]} />
      ))}
    </View>
  );
}

/* Header (prototype `Top`): back chip · title + one-line context · right slot. */
export function AppHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string | undefined;
  backLabel?: string | undefined;
  onBack?: (() => void) | undefined;
  right?: React.ReactNode | undefined;
}) {
  return (
    <View style={styles.header}>
      {onBack !== undefined && (
        <Pressable
          style={({ pressed }) => [styles.backChip, pressed && styles.pressed]}
          onPress={onBack}
          accessibilityRole="button"
        >
          <Text style={styles.backChipText}>{backLabel}</Text>
        </Pressable>
      )}
      <View style={styles.headerTitleBlock}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

/* Bottom hub bar (prototype `.tabbar`): icon + label, active = soft pill.
 * Tabs are waypoint RESETS under the ratified two-level-ladder law —
 * they never add journey edges; App.tsx owns the semantics. */
export interface TabItem {
  key: string;
  icon: string;
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
          style={[styles.tab, item.active && styles.tabActive]}
          onPress={item.onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.active }}
        >
          <Text style={styles.tabIcon}>{item.icon}</Text>
          <Text style={[styles.tabLabel, item.active && styles.tabLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* Card (prototype `.card`): raised surface, hairline, disciplined radius. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* Section overline (prototype `.cap`). */
export function Overline({ children }: { children: React.ReactNode }) {
  return <Text style={styles.overline}>{children}</Text>;
}

/* List row (prototype tile rows): leading glyph box · title/meta/net · chip · chevron. */
export function ListRow({
  glyph,
  title,
  meta,
  net,
  chip,
  onPress,
}: {
  glyph: string;
  title: string;
  meta?: string | undefined;
  net?: string | undefined;
  chip?: React.ReactNode | undefined;
  onPress?: (() => void) | undefined;
}) {
  const body = (
    <>
      <View style={styles.rowGlyphBox}>
        <Text style={styles.rowGlyph}>{glyph}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {meta !== undefined && (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        )}
        {net !== undefined && <Text style={styles.rowNet}>{net}</Text>}
        {chip !== undefined && <View style={styles.rowChipLine}>{chip}</View>}
      </View>
      {onPress !== undefined && <Text style={styles.rowChevron}>›</Text>}
    </>
  );
  if (onPress === undefined) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>
      {body}
    </Pressable>
  );
}

/* Button hierarchy (prototype `.btn .pri/.sec/.ghost`): one primary per
 * screen; press feedback within the touch budget (D17 < 100 ms — a style
 * swap on press, no animation to wait for). */
function buttonStyle(base: StyleProp<ViewStyle>) {
  return ({ pressed }: { pressed: boolean }) => [base, pressed && styles.pressed];
}
export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={buttonStyle([styles.buttonBase, styles.buttonPrimary, disabled === true && styles.buttonDisabled])}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.buttonPrimaryText}>{label}</Text>
    </Pressable>
  );
}
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={buttonStyle([styles.buttonBase, styles.buttonSecondary])} onPress={onPress} accessibilityRole="button">
      <Text style={styles.buttonSecondaryText}>{label}</Text>
    </Pressable>
  );
}
export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={buttonStyle([styles.buttonBase, styles.buttonGhost])} onPress={onPress} accessibilityRole="button">
      <Text style={styles.buttonGhostText}>{label}</Text>
    </Pressable>
  );
}

/* « L'argent en majesté » (DESIGN-LANGUAGE §2): the FCFA amount as the
 * hero of its screen — money.amountScale.hero, tabular numerals. */
export function AmountHero({ label, amount }: { label?: string | undefined; amount: string }) {
  return (
    <View style={styles.amountHeroBlock}>
      {label !== undefined && <Text style={styles.amountHeroLabel}>{label}</Text>}
      <Text style={styles.amountHero}>{amount}</Text>
    </View>
  );
}

/* Status chip (prototype pills): a dot + label on a calm wash — state is
 * always visible, never a sentence. */
export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
const CHIP_COLOR: Record<ChipTone, string> = {
  ok: theme.colors.success,
  warn: theme.colors.warning,
  bad: theme.colors.danger,
  info: theme.colors.info,
  muted: theme.colors.inkMuted,
};
export function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: CHIP_COLOR[tone] }]} />
      <Text style={[styles.chipText, { color: CHIP_COLOR[tone] }]}>{label}</Text>
    </View>
  );
}

/* Reduced-motion hook — the doctrine's flag, honored everywhere motion runs. */
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

/* Skeleton (doctrine §1: « jamais un spinner nu ») — a calm pulse; static
 * under reduced motion. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: motion.standard.durationMs, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: motion.standard.durationMs, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[styles.skeleton, { opacity: pulse }, style]} />;
}

/* Honest empty state — designed, never apologetic. */
export function EmptyState({ glyph, title, hint }: { glyph: string; title: string; hint?: string }) {
  return (
    <Card style={styles.emptyState}>
      <Text style={styles.emptyGlyph}>{glyph}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint !== undefined && <Text style={styles.emptyHint}>{hint}</Text>}
    </Card>
  );
}

/* The offline/pending notice — queued = pending, never done. */
export function PendingNotice({ lines }: { lines: readonly string[] }) {
  return (
    <View style={styles.pendingNotice}>
      <View style={[styles.chipDot, { backgroundColor: theme.colors.warning }]} />
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

/* « La célébration » (DESIGN-LANGUAGE §3) — produit_pret: a soft halo and
 * three woven-motif bars in the theme's celebration palette. ≤ 800 ms by
 * token ceiling, absolutely NON-BLOCKING (pointerEvents none), skipped
 * entirely under reduced motion. */
export function Celebration({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const tokens = theme.celebration.produit_pret;
  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      onDone();
      return;
    }
    progress.setValue(0);
    Animated.sequence([
      Animated.spring(progress, {
        toValue: 1,
        damping: motion.springSoft.damping,
        stiffness: motion.springSoft.stiffness,
        mass: motion.springSoft.mass,
        useNativeDriver: true,
      }),
      Animated.timing(progress, { toValue: 2, duration: motion.celebrate.durationMs, useNativeDriver: true }),
    ]).start(() => onDone());
    const ceiling = setTimeout(onDone, motion.celebrationMaxMs);
    return () => clearTimeout(ceiling);
  }, [visible, reduced, progress, onDone]);
  if (!visible || reduced) return null;
  const fade = progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const rise = progress.interpolate({ inputRange: [0, 1, 2], outputRange: [theme.spacing.xl, 0, 0] });
  return (
    <View pointerEvents="none" style={styles.celebrationWrap}>
      <Animated.View style={[styles.celebrationHalo, { backgroundColor: tokens.halo, opacity: fade }]}>
        <Animated.View style={[styles.motifRow, { transform: [{ translateY: rise }] }]}>
          {tokens.motifPalette.map((color, i) => (
            <View key={i} style={[styles.motifBar, { backgroundColor: color }]} />
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { flexDirection: 'row', height: theme.spacing.sm },
  bandSegment: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: theme.touch.minTargetPx,
  },
  backChip: {
    minHeight: theme.touch.minTargetPx,
    minWidth: theme.touch.minTargetPx,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  backChipText: { color: theme.colors.ink, fontSize: theme.typeScale.body.size, fontWeight: theme.typeScale.label.weight },
  headerTitleBlock: { flex: 1 },
  headerTitle: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.heading.size,
    lineHeight: theme.typeScale.heading.lineHeight,
    fontWeight: theme.typeScale.title.weight,
  },
  headerSub: { color: theme.colors.inkMuted, fontSize: theme.typeScale.caption.size, lineHeight: theme.typeScale.caption.lineHeight },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.line,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    minHeight: theme.touch.minTargetPx,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: theme.colors.primarySoft },
  tabIcon: { fontSize: theme.typeScale.heading.size, lineHeight: theme.typeScale.heading.lineHeight },
  tabLabel: { color: theme.colors.inkMuted, fontSize: theme.typeScale.caption.size, fontWeight: theme.typeScale.label.weight },
  tabLabelActive: { color: theme.colors.primaryStrong },
  card: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    shadowColor: theme.colors.ink,
    shadowOpacity: theme.elevation.raised.shadowOpacity,
    shadowRadius: theme.elevation.raised.shadowRadius,
    shadowOffset: { width: 0, height: theme.elevation.raised.shadowOffsetY },
    elevation: theme.elevation.raised.shadowOffsetY,
  },
  overline: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.caption.size,
    lineHeight: theme.typeScale.caption.lineHeight,
    fontWeight: theme.typeScale.label.weight,
    textTransform: 'uppercase',
    letterSpacing: theme.spacing.xs / 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line,
    padding: theme.spacing.md,
    minHeight: theme.touch.minTargetPx,
  },
  rowGlyphBox: {
    width: theme.touch.minTargetPx,
    height: theme.touch.minTargetPx,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyph: { fontSize: theme.typeScale.heading.size, color: theme.colors.primaryStrong, fontWeight: theme.typeScale.title.weight },
  rowBody: { flex: 1, gap: theme.spacing.xs },
  rowTitle: { color: theme.colors.ink, fontSize: theme.typeScale.body.size, lineHeight: theme.typeScale.body.lineHeight, fontWeight: theme.typeScale.heading.weight },
  rowMeta: { color: theme.colors.inkMuted, fontSize: theme.typeScale.caption.size, lineHeight: theme.typeScale.caption.lineHeight },
  rowNet: {
    color: theme.colors.primaryStrong,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
    fontWeight: theme.typeScale.title.weight,
    fontVariant: ['tabular-nums'],
  },
  rowChipLine: { flexDirection: 'row' },
  rowChevron: { color: theme.colors.inkFaint, fontSize: theme.typeScale.title.size },
  pressed: { opacity: theme.elevation.overlay.shadowOpacity * 5, transform: [{ scale: 0.98 }] },
  buttonBase: {
    minHeight: theme.touch.minTargetPx + theme.spacing.sm,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  buttonPrimary: { backgroundColor: theme.colors.primary },
  buttonPrimaryText: { color: theme.colors.onPrimary, fontSize: theme.typeScale.bodyLarge.size, fontWeight: theme.typeScale.heading.weight },
  buttonSecondary: { backgroundColor: theme.colors.primarySoft },
  buttonSecondaryText: { color: theme.colors.primaryStrong, fontSize: theme.typeScale.bodyLarge.size, fontWeight: theme.typeScale.heading.weight },
  buttonGhost: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceRaised },
  buttonGhostText: { color: theme.colors.ink, fontSize: theme.typeScale.bodyLarge.size, fontWeight: theme.typeScale.label.weight },
  buttonDisabled: { opacity: theme.elevation.overlay.shadowOpacity * 3 },
  amountHeroBlock: { alignItems: 'center', gap: theme.spacing.xs },
  amountHeroLabel: { color: theme.colors.inkMuted, fontSize: theme.typeScale.body.size, lineHeight: theme.typeScale.body.lineHeight },
  amountHero: {
    color: theme.colors.primaryStrong,
    fontSize: money.amountScale.hero.size,
    lineHeight: money.amountScale.hero.lineHeight,
    fontWeight: money.amountScale.hero.weight,
    fontVariant: ['tabular-nums'],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  chipDot: { width: theme.spacing.sm, height: theme.spacing.sm, borderRadius: theme.radius.pill },
  chipText: { fontSize: theme.typeScale.caption.size, fontWeight: theme.typeScale.label.weight },
  skeleton: { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radius.md, minHeight: theme.spacing.xl },
  emptyState: { alignItems: 'center', paddingVertical: theme.spacing.xxl },
  emptyGlyph: { fontSize: money.amountScale.hero.size, lineHeight: money.amountScale.hero.lineHeight },
  emptyTitle: { color: theme.colors.ink, fontSize: theme.typeScale.bodyLarge.size, fontWeight: theme.typeScale.heading.weight, textAlign: 'center' },
  emptyHint: { color: theme.colors.inkMuted, fontSize: theme.typeScale.body.size, lineHeight: theme.typeScale.body.lineHeight, textAlign: 'center' },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  pendingBody: { flex: 1, gap: theme.spacing.xs },
  pendingText: { color: theme.colors.inkMuted, fontSize: theme.typeScale.caption.size, lineHeight: theme.typeScale.caption.lineHeight },
  celebrationWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  celebrationHalo: {
    width: money.amountScale.hero.size * 4,
    height: money.amountScale.hero.size * 4,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motifRow: { flexDirection: 'row', gap: theme.spacing.sm },
  motifBar: { width: theme.spacing.md, height: theme.spacing.xxl, borderRadius: theme.radius.sm },
});
