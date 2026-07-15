import { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { C, appColour, D, R, SHADOW, ts, MONEY_TEXT, motion, DUR } from './fp';
import { FpIn, FpPop, Pulse, FpBar, useReducedMotion, Shimmer, rnEasing } from './anim';
import { WovenBand, CornerTicks } from './signature';
import { Icon, type IconName } from './icons';

/**
 * WO-FP-BOUTIK — LE VISAGE, Faso Premium. The same walkable world (journey
 * spine, back law, every franc from the pinned waterfall — all frozen), now
 * dressed in the redesign: warm paper, one confident supply-green accent per
 * screen, the six signature elements, money in Bricolage majesty. Every
 * colour/dimension/duration resolves to a token or a docketed app-local value
 * (src/ui/fp.ts) — zero hand-copied hex (the fidelity gate proves it). Motion
 * is the seven fp* tokens through src/ui/anim.tsx, reduced-motion honoured.
 * Icons are the canon 26/29 set (react-native-svg, currentColor) — ZERO emoji
 * in chrome (the no-emoji gate enforces it).
 */

// Re-exports so screens import the whole design system from one place.
export { Icon, type IconName } from './icons';
export { WovenBand, HeroLedgerBand, DuotoneTile, Selectable, CornerTicks, QuoteRule } from './signature';
export { FpIn, FpPop, Pulse, FpBar, useCountUp, useReducedMotion } from './anim';
export { C, ts, D, R } from './fp';
/** The Boutik+ palette, for screens composing custom surfaces. */
export const palette = C;

function pressable(base: StyleProp<ViewStyle>) {
  return ({ pressed }: { pressed: boolean }) => [base, pressed && styles.pressed];
}

/** AppHeader — the monogram + wordmark (home) OR back + view title, a right
 * slot (chip), the woven band beneath. The anchor of stability: no motion. */
export function AppHeader({
  title,
  context,
  backLabel,
  onBack,
  right,
}: {
  title: string;
  context?: string | undefined;
  backLabel?: string | undefined;
  onBack?: (() => void) | undefined;
  right?: React.ReactNode | undefined;
}) {
  return (
    <View>
      <View style={styles.header}>
        {onBack !== undefined ? (
          <Pressable style={pressable(styles.backHit)} onPress={onBack} accessibilityRole="button" hitSlop={8}>
            <Text style={ts('cta', C.deep)}>{backLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.monogram}>
            <Text style={ts('view', C.onPrimary)}>B+</Text>
          </View>
        )}
        <View style={styles.headerTitleWrap}>
          <Text style={ts('view', C.ink)} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {context !== undefined && (
            <Text style={ts('rowSub', C.sub)} numberOfLines={1}>
              {context}
            </Text>
          )}
        </View>
        {right}
      </View>
      <WovenBand />
    </View>
  );
}

/** Monogram — the accent "B+" square (planche accueil header, 40px r14). */
export function Monogram({ label = 'B+' }: { label?: string }) {
  return (
    <View style={styles.monogram}>
      <Text style={ts('view', C.onPrimary)}>{label}</Text>
    </View>
  );
}

/** WordmarkHeader — the accueil in-scroll header (planche « Accueil »): monogram
 * + Boutik+ + the shop line + a right slot (the Vérifié chip). Scrolls WITH the
 * content — there is no global fixed header in the Faso Premium frames. */
export function WordmarkHeader({ shopLine, right }: { shopLine: string; right?: React.ReactNode | undefined }) {
  return (
    <View style={styles.wordmarkRow}>
      <Monogram />
      <View style={styles.wordmarkCol}>
        <Text style={ts('view', C.ink)}>Boutik+</Text>
        <Text style={ts('rowSub', C.sub)} numberOfLines={1}>
          {shopLine}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** HubTitle — a hub screen's big in-scroll title (planche « Produits » / « Argent »
 * / « Commandes »): the 28px Bricolage display title + optional subtitle. No back
 * button — hubs are tab roots; the title scrolls WITH the content. */
export function HubTitle({ title, subtitle }: { title: string; subtitle?: string | undefined }) {
  return (
    <View style={styles.hubTitle}>
      <Text style={ts('screen', C.ink)} accessibilityRole="header">
        {title}
      </Text>
      {subtitle !== undefined && <Text style={[ts('body', C.sub), styles.hubSubtitle]}>{subtitle}</Text>}
    </View>
  );
}

/** ViewHeader — a stacked view's in-scroll header (planche « Fiche produit » /
 * « Détail commande »…): back (← label) + view title + optional right slot. */
export function ViewHeader({
  title,
  backLabel,
  onBack,
  right,
}: {
  title: string;
  backLabel?: string | undefined;
  onBack?: (() => void) | undefined;
  right?: React.ReactNode | undefined;
}) {
  return (
    <View style={styles.viewHeader}>
      {onBack !== undefined && (
        <Pressable style={pressable(styles.backHit)} onPress={onBack} accessibilityRole="button" hitSlop={8}>
          <Text style={ts('caps', C.deep)}>{backLabel}</Text>
        </Pressable>
      )}
      <Text style={[ts('view', C.ink), styles.headerTitleWrap]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

/** VerifiedChip — the white outlined « Vérifié » pill (planche accueil): check
 * + accent label on white with a hairline border (distinct from a StatusChip). */
export function VerifiedChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={pressable(styles.verifiedChip)} onPress={onPress} accessibilityRole="button">
      <Icon name="coche" size={15} color={C.deep} />
      <Text style={ts('rowSub', C.deep)}>{label}</Text>
    </Pressable>
  );
}

/** StatCard — a 2-col stat (planche accueil): caps label + Bricolage tnum amount
 * + sub note. `accent` renders the amount in deep supply-green (the « Versé »). */
export function StatCard({
  label,
  amount,
  note,
  accent,
}: {
  label: string;
  amount: string;
  note?: string | undefined;
  accent?: boolean | undefined;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={ts('caps', C.sub)}>{label}</Text>
      <Text style={[ts('cardMoney', accent === true ? C.primary : C.ink), MONEY_TEXT, styles.statAmount]} numberOfLines={1}>
        {amount}
      </Text>
      {note !== undefined && <Text style={ts('rowSub', C.sub)}>{note}</Text>}
    </View>
  );
}

/** SectionLabel — a caps section header + optional danger count pill (planche
 * « À faire maintenant »). */
export function SectionLabel({ children, count }: { children: React.ReactNode; count?: number | undefined }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={ts('caps', C.sub)}>{children}</Text>
      {count !== undefined && count > 0 && (
        <View style={styles.sectionCount}>
          <Text style={ts('pill', C.dangerFg)}>{count}</Text>
        </View>
      )}
    </View>
  );
}

/** NoteCard — the soft-accent info card (planche accueil gratuité note). */
export function NoteCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.noteCard}>{children}</View>;
}

/** TimeChip — the accent-soft time pill (planche « Échéances du jour »): deep
 * Bricolage tnum on soft accent. */
export function TimeChip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.timeChip}>
      <Text style={[ts('priceInline', C.deep), MONEY_TEXT]}>{children}</Text>
    </View>
  );
}

/** Card — the FP surface: white, radius 20, 1px hairline, soft card shadow.
 * `accent` swaps the border for a 2px accent rule (the emphasis surface). */
export function Card({
  children,
  accent,
  style,
}: {
  children: React.ReactNode;
  accent?: boolean | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, accent === true && styles.cardAccent, style]}>{children}</View>;
}

/** Overline — the small-caps section label (README caps role). */
export function Overline({ children, tone }: { children: React.ReactNode; tone?: string | undefined }) {
  return <Text style={ts('caps', tone ?? C.sub)}>{children}</Text>;
}

/** ListRow — art tile (icon or thumb) + title/sub column + right pill/value.
 * Intrinsic height (title+sub+pill grow the row), press scale .98. */
export function ListRow({
  icon,
  art,
  title,
  meta,
  value,
  chip,
  destructive,
  onPress,
}: {
  icon?: IconName | undefined;
  art?: React.ReactNode | undefined;
  title: string;
  meta?: string | undefined;
  value?: string | undefined;
  chip?: React.ReactNode | undefined;
  destructive?: boolean | undefined;
  onPress?: (() => void) | undefined;
}) {
  const tint = destructive === true ? C.dangerFg : C.ink;
  const body = (
    <>
      {art ?? (icon !== undefined && (
        <View style={styles.rowArt}>
          <Icon name={icon} size={20} color={C.primary} />
        </View>
      ))}
      <View style={styles.rowBody}>
        <Text style={ts('row', tint)} numberOfLines={1}>
          {title}
        </Text>
        {meta !== undefined && (
          <Text style={ts('rowSub', C.sub)} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
      {value !== undefined && <Text style={[ts('priceInline', C.deep), MONEY_TEXT]}>{value}</Text>}
      {chip}
      {onPress !== undefined && value === undefined && chip === undefined && (
        <Icon name="chevron" size={18} color={C.hairlineStrong} />
      )}
    </>
  );
  if (onPress === undefined) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable style={pressable(styles.row)} onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

/** PrimaryButton — full-width accent block, onPrimary label, CTA shadow.
 * Disabled carries an explanatory label (never a dead grey button); the
 * `money` flag keeps the same confident green (one primary action). */
export function PrimaryButton({
  label,
  onPress,
  money: _money,
  disabled,
  disabledLabel,
  icon,
}: {
  label: string;
  onPress: () => void;
  money?: boolean | undefined;
  disabled?: boolean | undefined;
  disabledLabel?: string | undefined;
  icon?: IconName | undefined;
}) {
  const isDisabled = disabled === true;
  return (
    <Pressable
      style={pressable([styles.button, styles.buttonPrimary, isDisabled && styles.buttonDisabled])}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      {icon !== undefined && !isDisabled && <Icon name={icon} size={18} color={C.onPrimary} />}
      <Text style={ts('cta', isDisabled ? C.disabledCtaFg : C.onPrimary)}>
        {isDisabled && disabledLabel !== undefined ? disabledLabel : label}
      </Text>
    </Pressable>
  );
}

/** SecondaryButton — soft-accent fill, deep label; `danger` = danger-tinted;
 * optional leading icon (planche « Lister un produit — gratuit »). */
export function SecondaryButton({
  label,
  onPress,
  danger,
  icon,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean | undefined;
  icon?: IconName | undefined;
}) {
  const fg = danger === true ? C.dangerFg : C.deep;
  return (
    <Pressable
      style={pressable([styles.button, styles.buttonSecondary, danger === true && styles.buttonSecondaryDanger])}
      onPress={onPress}
      accessibilityRole="button"
    >
      {icon !== undefined && <Icon name={icon} size={17} color={fg} />}
      <Text style={ts('cta', fg)}>{label}</Text>
    </Pressable>
  );
}

/** GhostButton — 1.5px hairline, ink label (the quiet secondary). */
export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={pressable([styles.button, styles.buttonGhost])} onPress={onPress} accessibilityRole="button">
      <Text style={ts('cta', C.ink)}>{label}</Text>
    </Pressable>
  );
}

/** DemoButton — the dashed, flagged demo affordance (`showDemoControls`),
 * to be stripped in production (README § Engineering). */
export function DemoButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={pressable([styles.button, styles.buttonDemo])} onPress={onPress} accessibilityRole="button">
      <Text style={ts('body', C.sub)}>{label}</Text>
    </Pressable>
  );
}

/** UnderlineLink — the tertiary verb: caps deep + underline, padded hit area. */
export function UnderlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={pressable(styles.linkHit)} onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <Text style={[ts('caps', C.deep), styles.linkUnderline]}>{label}</Text>
    </Pressable>
  );
}

/** AmountHero — money in majesty on paper: caps label + the amount as the
 * biggest ink on the screen (tnum), optional honesty note. `pending` mutes
 * the amount — never a green success before server truth. */
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
      {label !== undefined && <Text style={ts('caps', C.sub)}>{label}</Text>}
      <Text style={[ts('heroMoney', pending === true ? C.sub : C.deep), MONEY_TEXT]}>{amount}</Text>
      {note !== undefined && <Text style={ts('rowSub', C.sub)}>{note}</Text>}
    </View>
  );
}

/** MoneyField — the base-price input: 16px, 1.5px input border, tnum
 * right-aligned, fixed « F » suffix, numeric keypad. Calm in every state —
 * a below-floor refusal is a SIBLING note the screen owns, never a red field.
 * `readOnly` renders a settled figure (no keypad). */
export function MoneyField({
  label,
  value,
  suffix,
  onChangeText,
  placeholder,
  readOnly,
}: {
  label: string;
  value: string;
  suffix: string;
  onChangeText?: ((t: string) => void) | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Overline>{label}</Overline>
      <View style={styles.fieldBox}>
        {readOnly === true ? (
          <Text style={[styles.fieldInput, ts('cardMoney', C.ink), MONEY_TEXT]} numberOfLines={1}>
            {value}
          </Text>
        ) : (
          <TextInput
            style={[styles.fieldInput, ts('cardMoney', C.ink), MONEY_TEXT]}
            value={value}
            onChangeText={onChangeText}
            keyboardType="number-pad"
            placeholder={placeholder}
            placeholderTextColor={C.sub}
            maxLength={9}
            accessibilityLabel={label}
          />
        )}
        <Text style={[ts('cardMoney', C.sub), MONEY_TEXT]}>{suffix}</Text>
      </View>
    </View>
  );
}

/** Stepper — the − / + circle-button value control (README § Stepper). */
export function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Overline>{label}</Overline>
      <View style={styles.stepperRow}>
        <Pressable style={pressable(styles.stepperBtn)} onPress={onDec} accessibilityRole="button" accessibilityLabel="moins">
          <Text style={ts('view', C.ink)}>{'−'}</Text>
        </Pressable>
        <Text style={[styles.stepperValue, ts('view', C.ink), MONEY_TEXT]}>{value}</Text>
        <Pressable style={pressable(styles.stepperBtn)} onPress={onInc} accessibilityRole="button" accessibilityLabel="plus">
          <Text style={ts('view', C.ink)}>{'+'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** ReconcileLine — « chaque franc a sa place »: the receipt honesty line
 * under a money box (right-aligned, tnum, sub tone). */
export function ReconcileLine({ children }: { children: React.ReactNode }) {
  return <Text style={[styles.reconcileLine, ts('rowSub', C.sub), MONEY_TEXT]}>{children}</Text>;
}

/** StatusChip — pill caps chip; tone maps to the status palette. `fact` is the
 * server-confirmed truth (ok green — the DF-1 gold-chip ruling is superseded by
 * this system); success/celebrate only after server truth (never a green lie). */
export type ChipTone = 'fact' | 'neutral' | 'pending' | 'problem' | 'celebrate';
export function StatusChip({ tone, label, icon }: { tone: ChipTone; label: string; icon?: IconName | undefined }) {
  const s = CHIP_STYLE[tone];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      {icon !== undefined && <Icon name={icon} size={12} color={s.fg} />}
      <Text style={[ts('pill', s.fg), styles.chipText]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Skeleton — a shimmer block CLONING the exact box of its content (README:
 * "layout matching real dimensions", 750 ms); static under reduced motion. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Shimmer baseColour={appColour.skeletonBase} highlightColour={C.onPrimary} style={[styles.skeleton, style]} />
  );
}

/** EmptyState — a designed state, never an apology: dashed encart, icon, one
 * sentence, one action (the next act). */
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
      <Icon name={icon} size={28} color={C.sub} />
      <Text style={[ts('body', C.body), styles.emptyTitle]}>{title}</Text>
      {action}
    </View>
  );
}

/** CheckRow — a tappable readiness check (B7 gate): a box that fills accent with
 * a coche when on, + label. Whole row is the ≥44px target; icon+text law. */
export function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={pressable(styles.checkRow)}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked && (
          <FpPop>
            <Icon name="coche" size={14} color={C.onPrimary} />
          </FpPop>
        )}
      </View>
      <Text style={ts('row', C.ink)}>{label}</Text>
    </Pressable>
  );
}

/** PendingNotice — « C'est noté. En attente du réseau. » Queued = pending,
 * never done: warn band, clock icon. `serverWait` marks an ACTIVE server/operator
 * wait (B7 pending): the clock pulses (fpPulse) and an indeterminate bar sweeps
 * (fpBar) — the two motions the redesign spec'd for live steps + server waits.
 * A queued (offline) notice is NOT a server wait — it stays calm, no bar. */
export function PendingNotice({ lines, serverWait }: { lines: readonly string[]; serverWait?: boolean | undefined }) {
  const clock = <Icon name="horloge" size={18} color={C.warnFgAlt} />;
  return (
    <View style={styles.pendingNotice}>
      <View style={styles.pendingRow}>
        {serverWait === true ? <Pulse>{clock}</Pulse> : clock}
        <View style={styles.pendingBody}>
          {lines.map((line) => (
            <Text key={line} style={ts('body', C.warnFgAlt)}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      {serverWait === true && <FpBar trackColour={C.hairlineInput} fillColour={C.warnFgAlt} style={styles.pendingBar} />}
    </View>
  );
}

/** WarnNote — an inline warn advisory (below-floor, queue error): warn band,
 * alert icon, calm — never a red scold. */
export function WarnNote({ text, icon, tone = 'warn' }: { text: string; icon?: IconName; tone?: 'warn' | 'danger' }) {
  const danger = tone === 'danger';
  const fg = danger ? C.dangerFg : C.warnFgAlt;
  return (
    <View style={[styles.pendingNotice, danger && styles.pendingNoticeDanger]}>
      <Icon name={icon ?? (danger ? 'refus' : 'alerte')} size={18} color={fg} />
      <Text style={[ts('body', fg), styles.flex1]}>{text}</Text>
    </View>
  );
}

/** OfflineBanner — offline is a designed STATE, not an error (warn band under
 * the header; « jamais perdu »). */
export function OfflineBanner({ label }: { label: string }) {
  return (
    <View style={styles.offlineBanner}>
      <Icon name="horsligne" size={14} color={C.warnFgAlt} />
      <Text style={ts('caps', C.warnFgAlt)}>{label}</Text>
    </View>
  );
}

/** TabBar — ≤ 4 items, icon 24 + word (icon+word law); active = soft-accent
 * pill bg + deep text. The dock is a near-opaque paper dock with a top hairline
 * (a true backdrop blur needs expo-blur — deferred; approximated, flagged). */
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
          style={[styles.tab, item.active && styles.tabActive]}
          onPress={item.onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.active }}
        >
          <Icon name={item.icon} size={24} color={item.active ? C.deep : C.sub} />
          <Text style={ts('caps', item.active ? C.deep : C.sub)}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** ScreenEnter — every screen mounts with fpIn (opacity + 14px rise), static
 * under reduced motion. */
export function ScreenEnter({ screenKey, children }: { screenKey: string; children: React.ReactNode }) {
  return (
    <FpIn motionKey={screenKey} style={styles.enterFill}>
      {children}
    </FpIn>
  );
}

/**
 * CelebrationLayer — the payout / « produit prêt » celebration (HANDOFF §2
 * Célébration): accent-deep scrim, two gold dash bars, an onPrimary disc with a
 * green check (fpPop .45s), the amount, the caps line, tap-to-skip, auto-dismiss.
 * NON-BLOCKING (the state underneath is already true). Reduced motion = no
 * layer. THE TRIGGER stays under the standing law — real-franc events only (E3);
 * in a demo context it renders a « démo » marker so it is never mistaken for a
 * real payout. Transform + opacity only, native driver.
 */
export function CelebrationLayer({
  visible,
  onDone,
  amount,
  label,
  caption,
  demo,
}: {
  visible: boolean;
  onDone: () => void;
  amount?: string | undefined;
  label?: string | undefined;
  caption?: string | undefined;
  demo?: boolean | undefined;
}) {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;
  // The animation + the auto-dismiss timer run in an effect (never in render):
  // onDone() flips the parent's celebrating flag, so calling it during render
  // would be an illegal cross-component update. Reduced motion = no layer, done
  // immediately (the confirmed panel underneath is already true).
  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      onDone();
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 250,
      easing: rnEasing(motion.fpIn.timingFunction),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(onDone, DUR.celebrationMs);
    return () => clearTimeout(timer);
  }, [visible, reduced, onDone, fade]);
  if (!visible || reduced) return null;
  return (
    <Animated.View style={[styles.celebrationWrap, { opacity: fade }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityElementsHidden />
      <View style={styles.celebrationBars}>
        <View style={styles.celebrationBar} />
        <View style={styles.celebrationBar} />
      </View>
      <FpPop bound="max" style={styles.celebrationDisc}>
        <Icon name="coche" size={36} color={C.primary} />
      </FpPop>
      {amount !== undefined && <Text style={[ts('heroMoney', C.onPrimary), MONEY_TEXT, styles.celebrationAmount]}>{amount}</Text>}
      {label !== undefined && <Text style={[ts('caps', C.gold), styles.celebrationLabel]}>{label}</Text>}
      {demo === true && <Text style={ts('caps', C.gold)}>· démo ·</Text>}
      {caption !== undefined && <Text style={ts('body', C.soft)}>{caption}</Text>}
    </Animated.View>
  );
}

// ── chip palette (DF-1 gold-chip ruling superseded: fact = server-truth ok) ──
const CHIP_STYLE: Record<ChipTone, { bg: string; fg: string }> = {
  fact: { bg: C.okBg, fg: C.okFg },
  neutral: { bg: C.mutedBg, fg: C.mutedFg },
  pending: { bg: C.warnBg, fg: C.warnFgAlt },
  problem: { bg: C.dangerBg, fg: C.dangerFg },
  celebrate: { bg: C.soft, fg: C.deep },
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.gap,
    paddingHorizontal: D.pad,
    minHeight: D.minTouch,
    paddingVertical: D.gapSm,
    backgroundColor: C.paper,
  },
  monogram: {
    width: 40,
    height: 40,
    borderRadius: R.input,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  backHit: { minHeight: D.minTouch, justifyContent: 'center' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: D.gap, paddingBottom: D.gapSm },
  wordmarkCol: { flex: 1, minWidth: 0 },
  viewHeader: { flexDirection: 'row', alignItems: 'center', gap: D.gap, paddingBottom: D.gapSm, minHeight: D.minTouch },
  hubTitle: { paddingBottom: D.gapSm },
  hubSubtitle: { marginTop: D.padTiny },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.gapXs,
    height: D.chipH,
    paddingHorizontal: D.gap,
    borderRadius: R.pill,
    borderWidth: D.hair,
    borderColor: C.hairlineStrong,
    backgroundColor: C.card,
    ...SHADOW.card,
  },
  statCard: { flex: 1, padding: D.cardPad, gap: D.gapXs, backgroundColor: C.card, borderRadius: R.card, borderWidth: D.hair, borderColor: C.hairline, ...SHADOW.card },
  statAmount: { marginVertical: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionCount: { backgroundColor: C.dangerBg, borderRadius: R.pill, paddingHorizontal: D.gapSm, paddingVertical: 3 },
  noteCard: { backgroundColor: C.soft, borderRadius: R.tile, padding: D.cardPad, gap: D.gapSm },
  timeChip: { backgroundColor: C.soft, borderRadius: 10, paddingHorizontal: D.gapSm, paddingVertical: 5, alignSelf: 'flex-start' },
  card: {
    padding: D.cardPad,
    gap: D.gapSm,
    backgroundColor: C.card,
    borderRadius: R.card,
    borderWidth: D.hair,
    borderColor: C.hairline,
    ...SHADOW.card,
  },
  cardAccent: { borderWidth: D.selOn, borderColor: C.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.gap,
    minHeight: 56,
    padding: D.rowPad,
    borderRadius: R.tile,
    backgroundColor: C.card,
    borderWidth: D.hair,
    borderColor: C.hairline,
    marginBottom: D.gapSm,
  },
  rowArt: {
    width: D.artRow,
    height: D.artRow,
    borderRadius: R.art,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  pressed: { opacity: 0.96, transform: [{ scale: 0.98 }] },
  button: {
    minHeight: D.ctaH,
    borderRadius: R.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: D.gapSm,
    paddingHorizontal: D.pad,
  },
  buttonPrimary: { backgroundColor: C.primary, ...SHADOW.cta },
  buttonDisabled: { backgroundColor: C.disabledCta, shadowOpacity: 0, elevation: 0 },
  buttonSecondary: { backgroundColor: C.soft, minHeight: D.secondaryH },
  buttonSecondaryDanger: { backgroundColor: C.dangerBg },
  buttonGhost: { borderWidth: D.hairMed, borderColor: C.hairlineStrong, backgroundColor: C.paper, minHeight: D.secondaryH },
  buttonDemo: { borderWidth: D.hairMed, borderColor: appColour.demoDash, borderStyle: 'dashed', backgroundColor: C.paper, minHeight: 46 },
  linkHit: { minHeight: D.minTouch, justifyContent: 'center', alignSelf: 'flex-start' },
  linkUnderline: { textDecorationLine: 'underline' },
  amountHeroBlock: { gap: 2 },
  fieldBlock: { gap: D.gapXs },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.gapSm,
    minHeight: 56,
    borderWidth: D.hairMed,
    borderColor: C.hairlineStrong,
    borderRadius: R.input,
    paddingHorizontal: D.cardPad,
    backgroundColor: C.card,
  },
  fieldInput: { flex: 1, textAlign: 'right', padding: 0 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: D.gap },
  stepperBtn: {
    width: D.stepper,
    height: D.stepper,
    borderRadius: R.pill,
    borderWidth: D.hairMed,
    borderColor: C.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: D.rowPad,
    borderRadius: R.button,
    borderWidth: D.hair,
    borderColor: C.hairline,
  },
  reconcileLine: { textAlign: 'right' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.gapXs,
    borderRadius: R.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  chipText: {},
  skeleton: { borderRadius: R.card },
  emptyState: {
    alignItems: 'center',
    gap: D.gap,
    paddingVertical: 40,
    borderWidth: D.hairMed,
    borderColor: appColour.demoDash,
    borderStyle: 'dashed',
    borderRadius: R.card,
  },
  emptyTitle: { textAlign: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: D.gap, minHeight: D.minTouch, paddingVertical: D.gapSm },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: D.hairMed,
    borderColor: C.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: C.primary, borderColor: C.primary },
  pendingNotice: {
    gap: D.gapSm,
    backgroundColor: C.warnBg,
    padding: D.rowPad,
    borderRadius: R.input,
  },
  pendingNoticeDanger: { backgroundColor: C.dangerBg },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: D.gapSm },
  pendingBar: { marginTop: 2 },
  pendingBody: { flex: 1, gap: 2 },
  flex1: { flex: 1 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: D.gapSm,
    paddingVertical: D.gapXs,
    backgroundColor: C.warnBg,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: D.tabPadTop,
    paddingHorizontal: D.tabPadX,
    paddingBottom: D.tabPadBottom,
    backgroundColor: C.paper,
    borderTopWidth: D.hair,
    borderTopColor: C.hairlineStrong,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: D.gapXs, borderRadius: R.input, minHeight: 48, justifyContent: 'center' },
  tabActive: { backgroundColor: C.soft },
  enterFill: { flex: 1 },
  celebrationWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appColour.celebrationScrim,
    alignItems: 'center',
    justifyContent: 'center',
    gap: D.gap,
    paddingHorizontal: 32,
  },
  celebrationBars: { flexDirection: 'row', gap: D.gap, marginBottom: D.gapSm },
  celebrationBar: { width: 132, height: 6, borderRadius: R.pill, backgroundColor: C.gold, opacity: 0.9 },
  celebrationDisc: {
    width: 78,
    height: 78,
    borderRadius: R.pill,
    backgroundColor: C.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationAmount: { marginTop: D.gap },
  celebrationLabel: { textAlign: 'center' },
});
