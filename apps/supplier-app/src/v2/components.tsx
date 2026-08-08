/**
 * WO-FP-PIXEL §2 — the C01–C48 RENDERERS: thin TSX over the style DATA in
 * src/ui/v2/styles.ts (the value-gate's single source). No styling decisions
 * live here — only composition. Textures/gradients per §1.5 via react-native-svg
 * (the RN mapping §1.8). Motion (§7) is wired in a later slice — value match
 * first (founder order 2026-07-17).
 */
import { useState, type ReactNode } from 'react';
import { FicheVideo } from './fiche-video';
import { Image, Modal, Pressable, Text, TextInput, View, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Rect, Stop, Circle } from 'react-native-svg';
import { P, TILE_GRADIENT } from '../ui/v2/palette';
import { GEO, GLYPH_SHADOW, PRESSED, TEXTURE } from '../ui/v2/tokens';
import {
  C03, C04, C05, C06, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, C18, C19, C20, C21,
  C22, C24, C25, C26, C27, C28, C29, C30, C31, C32, C33, C34, C36, C37, C38, C41, C43, C44,
  C45, C46, C47, C48, STATUS_PILL, PRODUCT_PILL, TNUM, role,
} from '../ui/v2/styles';
import { t as tr } from '../i18n';
import type { PhotoSlot } from '../supply/produits-view';
import { C02StripeTissee } from '../ui/v2/components/C02StripeTissee';
import { C07BtnPrimary } from '../ui/v2/components/C07BtnPrimary';
import type { OrderStatus } from './seed';

export { C02StripeTissee, C07BtnPrimary };

const press = (scale: number, base: StyleProp<ViewStyle>) =>
  ({ pressed }: { pressed: boolean }) => [base, pressed && { transform: [{ scale }] }];

// ── C42 IconSet ───────────────────────────────────────────────────────────────
export type IconName = 'check' | 'plus' | 'chevronLeft' | 'camera' | 'retry' | 'alertTriangle' | 'tab.home' | 'tab.tag' | 'tab.box' | 'tab.franc';
export function Icon({ name, size, stroke, strokeWidth = 1.9 }: { name: IconName; size: number; stroke: string; strokeWidth?: number }) {
  const p = { fill: 'none' as const, stroke, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />}
      {name === 'plus' && (<><Path d="M12 5v14" {...p} /><Path d="M5 12h14" {...p} /></>)}
      {name === 'chevronLeft' && <Path d="M14.5 6l-6 6 6 6" {...p} />}
      {name === 'camera' && (<><Path d="M4 8h3l2-2.5h6L17 8h3v11H4V8z" {...p} /><Circle cx={12} cy={13} r={3.2} {...p} /></>)}
      {name === 'retry' && (<><Path d="M4 10a8 8 0 1 1 2 5.3" {...p} /><Path d="M4 5.5V10h4.5" {...p} /></>)}
      {name === 'alertTriangle' && (<><Path d="M12 4L21 19.5H3L12 4z" {...p} /><Path d="M12 10v4" {...p} /><Circle cx={12} cy={16.8} r={1.2} fill={stroke} stroke="none" /></>)}
      {name === 'tab.home' && (<><Path d="M4 11l8-7 8 7" {...p} /><Path d="M6 9.5V20h12V9.5" {...p} /><Path d="M10 20v-6h4v6" {...p} /></>)}
      {name === 'tab.tag' && (<><Path d="M4 4h6.8l9.2 9.2-6.8 6.8L4 10.8V4z" {...p} /><Circle cx={8.6} cy={8.6} r={1.5} {...p} /></>)}
      {name === 'tab.box' && (<><Path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3z" {...p} /><Path d="M4.5 7.2L12 11.5l7.5-4.3" {...p} /><Path d="M12 11.5V21" {...p} /></>)}
      {name === 'tab.franc' && (<><Circle cx={12} cy={12} r={8.5} {...p} /><Path d="M10 16V8.5h4.5" {...p} /><Path d="M10 12.2h3.5" {...p} /></>)}
    </Svg>
  );
}

// ── §1.5 weave texture (SVG diagonal stripes, exact periods) ─────────────────
export function Weave({ on, a, b, opacity = 1 }: { on: string; a: number; b: number; opacity?: number }) {
  // 135° repeating stripes: draw diagonal lines across a generous span
  const span = 600;
  const lines = [];
  for (let i = -span; i < span * 2; i += a + (b - a)) {
    lines.push(<Line key={i} x1={i} y1={-20} x2={i - span} y2={span - 20} stroke={on} strokeWidth={a} opacity={opacity} />);
  }
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines}
    </Svg>
  );
}

/** C21 IconTile — product gradient (140deg) + weave S/M + centred glyph. */
export function IconTile({
  bg, glyph, size, height, radius, glyphSize, weave = 'S', style,
}: {
  bg: readonly [string, string];
  glyph: string;
  size?: number;
  height?: number;
  radius: number;
  glyphSize: number;
  weave?: 'S' | 'M';
  style?: StyleProp<ViewStyle>;
}) {
  const tex = weave === 'S' ? TEXTURE.weaveS : TEXTURE.weaveM;
  const sh = glyphSize >= 60 ? GLYPH_SHADOW.lg : glyphSize >= 38 ? GLYPH_SHADOW.md : GLYPH_SHADOW.sm;
  return (
    <View style={[{ width: size, height: height ?? size, borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="0.77" y2="0.64">
            <Stop offset="0" stopColor={bg[0]} />
            <Stop offset="1" stopColor={bg[1]} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g)" />
      </Svg>
      <Weave on={tex.on} a={tex.a} b={tex.b} />
      <Text style={{ fontSize: glyphSize, textShadowColor: sh.color, textShadowOffset: { width: 0, height: sh.y }, textShadowRadius: sh.blur }}>{glyph}</Text>
    </View>
  );
}

// ── chrome ────────────────────────────────────────────────────────────────────
export function StatusZone() {
  return <View style={{ height: GEO.statusZone, backgroundColor: P.bg }} />;
}

type DockTab = 'home' | 'produits' | 'commandes' | 'argent' | 'operations';
export function Dock({ tab, onTab, operateur }: { tab: DockTab; onTab: (t: DockTab) => void; operateur?: boolean }) {
  const TABS = [
    { k: 'home' as const, label: 'Accueil', icon: 'tab.home' as const },
    { k: 'produits' as const, label: 'Produits', icon: 'tab.tag' as const },
    { k: 'commandes' as const, label: 'Commandes', icon: 'tab.box' as const },
    // RB-4 (founder order 2026-08-08: « for the chip Argent suggest a good
    // [name] and apply it ») — « Gains »: his own word for the tab, and the
    // screen's title. The machine's tab id stays 'argent' (an identifier,
    // not a user-facing string).
    { k: 'argent' as const, label: 'Gains', icon: 'tab.franc' as const },
    // CONSOLE-1 — the founder's surface, present ONLY when his key is on this
    // device (the shell decides; see AppV2). Everyone else's Dock is unchanged.
    ...(operateur === true ? [{ k: 'operations' as const, label: 'Opérations', icon: 'tab.box' as const }] : []),
  ];
  return (
    <View style={s.dockBar}>
      {TABS.map((t) => {
        const active = tab === t.k;
        return (
          <Pressable key={t.k} onPress={() => onTab(t.k)} style={press(PRESSED.dockItem, [s.dockItem, active && s.dockItemActive])} accessibilityRole="button">
            <Icon name={t.icon} size={24} stroke={active ? P.greenDeep : P.faint} />
            <Text style={[s.dockLabel, active && s.dockLabelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const PageTitle = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text style={[s.pageTitle, style]}>{children}</Text>
);
export const Overline = ({ children, level = 'screen', style }: { children: ReactNode; level?: 'screen' | 'card'; style?: StyleProp<TextStyle> }) => (
  <Text style={[level === 'screen' ? s.overlineScreen : s.overlineCard, style]}>{children}</Text>
);

export function StatusPill({ status, variant, style }: { status: OrderStatus; variant?: 'header' | 'argent'; style?: StyleProp<ViewStyle> }) {
  const t = STATUS_PILL[status]!;
  return (
    <View style={[s.pill, { backgroundColor: t.bg }, variant === 'header' && s.pillHeader, style]}>
      <Text style={[s.pillTxt, { color: t.fg }, variant === 'argent' && s.pillArgent]} numberOfLines={1}>{t.label}</Text>
    </View>
  );
}
export function ProductPill({ kind }: { kind: keyof typeof PRODUCT_PILL }) {
  const t = PRODUCT_PILL[kind];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillTxt, { color: t.fg }]} numberOfLines={1}>{t.label}</Text>
    </View>
  );
}

// ── buttons ───────────────────────────────────────────────────────────────────
export const BtnSoft = ({ label, onPress, icon, style, labelStyle }: { label: string; onPress: () => void; icon?: IconName; style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle> }) => (
  <Pressable onPress={onPress} style={press(PRESSED.tileHalfBtn, [s.btnSoft, style])} accessibilityRole="button">
    {icon !== undefined && <Icon name={icon} size={17} stroke={P.greenDeep} strokeWidth={1.9} />}
    <Text style={[s.btnSoftLabel, labelStyle]}>{label}</Text>
  </Pressable>
);
export const BtnGhost = ({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) => (
  <Pressable onPress={onPress} style={press(PRESSED.tileHalfBtn, [s.btnGhost, style])} accessibilityRole="button">
    <Text style={s.btnGhostLabel}>{label}</Text>
  </Pressable>
);
export const BtnDemo = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={press(PRESSED.ctaFull, s.btnDemo)} accessibilityRole="button">
    <Text style={s.btnDemoLabel}>{`${C10.prefix}${label}`}</Text>
  </Pressable>
);
export const BackBtn = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} style={press(PRESSED.back, s.backBtn)} accessibilityRole="button" accessibilityLabel="Retour">
    <Icon name="chevronLeft" size={C11.chevron.size} stroke={C11.chevron.stroke} strokeWidth={C11.chevron.strokeWidth} />
  </Pressable>
);

// ── chips ─────────────────────────────────────────────────────────────────────
export const ChipSegment = ({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={press(PRESSED.chipSegment, [s.chipSeg, active ? s.chipSegActive : s.chipSegInactive])} accessibilityRole="button">
    <Text style={[s.chipSegTxt, active && s.chipSegTxtActive]}>{label}</Text>
    <Text style={[s.chipSegCount, active && s.chipSegTxtActive, TNUM]}>{count}</Text>
  </Pressable>
);
export const ChipCategory = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={press(PRESSED.chipCategory, [s.chipCat, active ? s.chipCatActive : s.chipCatInactive])} accessibilityRole="button">
    <Text style={[s.chipCatTxt, active && s.chipCatTxtActive]}>{label}</Text>
  </Pressable>
);
/**
 * AUDIT-B+1 F18 — the « Vérifié » chip was a 91×38 TAP TARGET, under the §5
 * doctrine minimum of 44 px. It is a real button (onPress, role="button"),
 * not a badge.
 *
 * Fixed with LAYOUT, not `hitSlop`, and that distinction is the finding:
 * react-native-web 0.21.2 does not implement `hitSlop` on `Pressable` at all
 * (it survives only in the legacy `Touchable` export — verified in
 * node_modules/react-native-web/dist). This console SHIPS AS WEB, so the
 * house `hitSlop={8}` idiom is a no-op on exactly the surface the audit
 * measured in headless Chromium. A hitSlop "fix" here would have changed
 * nothing and looked like a fix.
 *
 * The painted pill keeps its 38 px height token untouched; only the invisible
 * touch box around it grows to 44. The header row is already taller than that
 * (monogram + two-line column), so nothing moves.
 */
export const ChipVerified = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} style={press(PRESSED.chipSegment, s.chipVerifiedHit)} accessibilityRole="button">
    <View style={s.chipVerified}>
      <Icon name="check" size={15} stroke={P.green} strokeWidth={2.2} />
      <Text style={s.chipVerifiedTxt}>{C14.label}</Text>
    </View>
  </Pressable>
);

// ── stepper + input ───────────────────────────────────────────────────────────
/**
 * C15 Stepper. `onChangeText` is OPTIONAL and ADDITIVE (founder device ruling
 * 2026-07-26: *"I want to be able to edit it inside of the box instead of just
 * the - +"*).
 *
 * Without it the box is the frozen read-only text and the demo board is
 * byte-identical. With it the SAME box becomes a numeric field — same style
 * object, same height, same alignment — so a seller who knows his price types
 * it instead of tapping + eighteen times.
 */
export function Stepper({ value, onMinus, onPlus, onChangeText }: { value: string; onMinus: () => void; onPlus: () => void; onChangeText?: (t: string) => void }) {
  return (
    <View style={s.stepperRow}>
      <Pressable onPress={onMinus} style={press(PRESSED.stepper, s.stepperBtn)} accessibilityRole="button">
        <Text style={s.stepperGlyph}>{C15.minus}</Text>
      </Pressable>
      {onChangeText === undefined ? (
        <Text style={[s.stepperValue, TNUM]} numberOfLines={1}>{value}</Text>
      ) : (
        <TextInput
          style={[s.stepperValue, TNUM]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          selectTextOnFocus
          accessibilityLabel={value}
        />
      )}
      <Pressable onPress={onPlus} style={press(PRESSED.stepper, s.stepperBtn)} accessibilityRole="button">
        <Text style={s.stepperGlyph}>{C15.plus}</Text>
      </Pressable>
    </View>
  );
}
/**
 * C16 Input. `keyboardType` is OPTIONAL and defaults to the existing behaviour —
 * no style changes, so the §2 property-diff table is untouched. It exists because
 * a FCFA field that opens the alphabetic keyboard on a 1GB Android is a failed
 * screen (SUPPLIER-AUTHORING-1).
 */
export function Input({ label, value, onChangeText, defaultValue, keyboardType }: { label: string; value?: string; onChangeText?: (t: string) => void; defaultValue?: string; keyboardType?: 'default' | 'number-pad' }) {
  return (
    <View>
      <Overline>{label}</Overline>
      <TextInput style={[s.input, { marginTop: C16.labelGap }]} value={value} defaultValue={defaultValue} onChangeText={onChangeText} keyboardType={keyboardType} placeholderTextColor={P.sub} />
    </View>
  );
}

// ── cards ─────────────────────────────────────────────────────────────────────
export const Card = ({ children, variant = 'L', style }: { children: ReactNode; variant?: 'L' | 'Llg' | 'Llist' | 'row'; style?: StyleProp<ViewStyle> }) => (
  <View style={[variant === 'row' ? s.cardRow : s.cardL, variant === 'Llg' && s.cardLlg, variant === 'Llist' && s.cardLlist, style]}>{children}</View>
);

export const StatCard = ({ label, value, legend, verse }: { label: string; value: string; legend: string; verse?: boolean }) => (
  <View style={[s.statCard, { flex: 1 }]}>
    <Overline level="card">{label}</Overline>
    <Text style={[s.statValue, verse === true && s.statValueVerse, TNUM]} numberOfLines={1}>{value}</Text>
    <Text style={s.statLegend}>{legend}</Text>
  </View>
);

export function MoneyBreakdown({ B, C, feeV, netV, netSize = 'L', note, overline }: { B: string; C: string; feeV: string; netV: string; netSize?: 'L' | 'XL'; note?: string; overline?: string }) {
  const lines: [string, string, boolean][] = [
    [C19.ORDER[0], B, false],
    [C19.ORDER[1], `${C19.minus}${C}`, true],
    [C19.ORDER[2], `${C19.minus}${feeV}`, true],
  ];
  return (
    <Card>
      {overline !== undefined && <Overline level="card">{overline}</Overline>}
      {lines.map(([l, v, sub]) => (
        <View key={l} style={s.moneyLine}>
          <Text style={[s.moneyLineTxt, sub && s.moneyLineSub]}>{l}</Text>
          <Text style={[s.moneyLineVal, sub && s.moneyLineSub, TNUM]}>{v}</Text>
        </View>
      ))}
      <View style={s.moneyTotal}>
        <Text style={s.moneyTotalLabel}>{C19.ORDER[3]}</Text>
        <Text style={[netSize === 'XL' ? s.moneyTotalXL : s.moneyTotalL, TNUM]}>{netV}</Text>
      </View>
      {note !== undefined && <Text style={s.moneyNote}>{note}</Text>}
    </Card>
  );
}

export function MoneyHero({ pending, paid }: { pending: string; paid: string }) {
  return (
    <View style={s.moneyHero}>
      <Weave on={TEXTURE.moneyHero.on} a={TEXTURE.moneyHero.a} b={TEXTURE.moneyHero.b} />
      <Overline level="card" style={s.moneyHeroOverline}>En attente</Overline>
      <Text style={[s.moneyHeroAmount, TNUM]} numberOfLines={1}>{pending}</Text>
      <View style={s.moneyHeroFoot}>
        <Text style={s.moneyHeroFootLabel}>Versé ces 7 jours</Text>
        <Text style={[s.moneyHeroFootVal, TNUM]}>{paid}</Text>
      </View>
    </View>
  );
}

// ── rows ──────────────────────────────────────────────────────────────────────
export function Row({ art, title, sub, pill, onPress, todo }: { art: ReactNode; title: string; sub: string; pill: ReactNode; onPress: () => void; todo?: boolean }) {
  return (
    <Pressable onPress={onPress} style={press(PRESSED.rowTodoOrder, [s.rowCard, todo !== true && s.rowCardOrder])} accessibilityRole="button">
      {art}
      <View style={s.rowCol}>
        <Text style={[s.rowTitle, TNUM]} numberOfLines={1}>{title}</Text>
        <Text style={s.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      {pill}
    </Pressable>
  );
}
export const RowMoney = ({ code, name, netV, status }: { code: string; name: string; netV: string; status: OrderStatus }) => (
  <View style={s.moneyRow}>
    <View style={s.rowCol}>
      <Text style={[s.moneyRowCode, TNUM]}>{code}</Text>
      <Text style={s.moneyRowName}>{name}</Text>
    </View>
    <View style={s.moneyRowRight}>
      <Text style={[s.moneyRowNet, TNUM]}>{netV}</Text>
      <StatusPill status={status} variant="argent" style={{ marginTop: C24.pillGap }} />
    </View>
  </View>
);
export const RowReleve = ({ week, sub, total }: { week: string; sub: string; total: string }) => (
  <View style={s.releveRow}>
    <View style={s.rowCol}>
      <Text style={s.releveWeek}>{week}</Text>
      <Text style={s.releveSub}>{sub}</Text>
    </View>
    <Text style={[s.releveTotal, TNUM]} numberOfLines={1}>{total}</Text>
  </View>
);

export function ProductTile({ bg, glyph, name, priceF, stock, paused, mod, onPress, style }: { bg: readonly [string, string]; glyph: string; name: string; priceF: string; stock: number; paused: boolean; mod?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} style={press(PRESSED.tileHalfBtn, [s.tile, style])} accessibilityRole="button">
      <View>
        <IconTile bg={bg} glyph={glyph} height={C21.produitImg.h} radius={0} glyphSize={C21.produitImg.glyph} weave="M" />
        {paused && (
          <View style={[s.tileBadge, s.tileBadgePause]}><Text style={s.tileBadgeTxt}>EN PAUSE</Text></View>
        )}
        {mod === true && (
          <View style={[s.tileBadge, s.tileBadgeMod]}><Text style={[s.tileBadgeTxt, s.tileBadgeModTxt]} numberOfLines={1}>EN MODÉRATION</Text></View>
        )}
      </View>
      <View style={s.tileBody}>
        <Text style={s.tileName}>{name}</Text>
        <View style={s.tilePriceRow}>
          <Text style={[s.tilePrice, TNUM]}>{priceF}</Text>
          <Text style={[s.tileStock, stock <= 4 && s.tileStockLow, TNUM]} numberOfLines={1}>{`stock ${stock}`}</Text>
        </View>
      </View>
    </Pressable>
  );
}


/**
 * FULL-SCREEN PHOTO VIEWER (founder device ruling 2026-07-26: tap a photo, see
 * it). Core RN `Modal` — no new dependency. The image is CONTAINED, never
 * cropped: this is the inspection view, so every pixel of the shipped bytes is
 * on screen. One tap anywhere closes — the 5-second rule for an overlay is
 * that leaving it must need no instructions.
 */
export function PhotoViewer({ photo, onClose }: { photo: { uri: string; label: string } | null; onClose: () => void }) {
  return (
    <Modal visible={photo !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.viewerFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={photo?.label ?? ''}>
        {photo !== null && (
          <>
            <Image source={{ uri: photo.uri }} style={s.viewerImg} resizeMode="contain" />
            <Text style={s.viewerLabel}>{photo.label}</Text>
          </>
        )}
      </Pressable>
    </Modal>
  );
}

/**
 * ONE REAL OFFER (PRODUITS-READ-1). Deliberately NOT `ProductTile`: that one
 * takes `bg` / `glyph` / `paused`, three fields with no real source.
 *
 * `ProductTile` IS LEFT IN PLACE BUT IT NOW HAS ZERO CALL SITES — corrected
 * after a verifier finding, because the comment here used to say it was "left
 * untouched for the Commandes demo board" and Commandes never used it (it uses
 * IconTile and ProductPill). It is kept rather than deleted under the
 * no-unrequested-tidying rule; what is fixed is the CLAIM about why.
 *
 * THE PHOTOGRAPH: `assetRefs[0]` is the heroSquare by construction (wire order,
 * master excluded). Media reads are UNAUTHENTICATED — the media Worker's write
 * gate short-circuits GETs — so `${base}/${ref}` renders with no credential. No
 * refs, or no configured base, gives « Sans photo »: an honest absence, never
 * the demo glyph standing in for evidence.
 *
 * NOT PRESSABLE: there is no fiche for a real offer yet, and `st.products` holds
 * no entry for one, so a tap would land on the id-miss guard. A dead tap is
 * worse than no tap.
 */
/** Full-width card image height (founder: « more bigger so I can see clearly »). App-local geometry. */
const OFFER_IMG_LARGE = 210;

export function OfferTile({ name, priceF, stock, variants, photo, clipUri, hiddenNote, style, onPress, large }: {
  name: string;
  priceF: string;
  stock: number;
  variants?: string | undefined;
  /** THREE facts, not two — a photograph, an honest absence, or « we cannot
   * fetch it ». Decided purely in `supply/produits-view.ts`. */
  photo: PhotoSlot;
  /**
   * VIDEO-PARTOUT — the ≤ 6 s clip's absolute url when this product has one.
   * It plays IN PLACE OF the photograph (the photo stays its poster), so the
   * founder sees at a glance which products carry a clip without tapping into
   * each fiche. Absent ⇒ the photograph alone, exactly as before.
   */
  clipUri?: string | undefined;
  /** Present ⇒ Shop+ is not showing this offer, and this is the sentence for why. */
  hiddenNote?: string | undefined;
  style?: StyleProp<ViewStyle>;
  /** The fiche exists now (2026-07-26) — a tap with a real destination. Absent = not pressable, as before. */
  onPress?: (() => void) | undefined;
  /** Founder device ruling 2026-07-26: full-width card, photograph tall enough to judge. */
  large?: boolean | undefined;
}) {
  const [broken, setBroken] = useState(false);
  const imgH = large === true ? OFFER_IMG_LARGE : C21.produitImg.h;
  const Wrap = onPress === undefined ? View : Pressable;
  return (
    <Wrap style={[s.tile, style]} {...(onPress === undefined ? {} : { onPress, accessibilityRole: 'button' as const })}>
      {photo.kind === 'photo' && !broken && clipUri !== undefined && clipUri !== '' ? (
        <FicheVideo src={clipUri} poster={photo.uri} />
      ) : photo.kind === 'photo' && !broken ? (
        <Image
          source={{ uri: photo.uri }}
          // LARGE CARDS SHOW THE WHOLE PHOTOGRAPH (founder live report
          // 2026-07-27: « the frame is not making the product show entirely »
          // — his duffel was cropped top and bottom). A fixed 210 band with
          // `cover` trims whatever does not fit; the large card now gives the
          // image a square frame and CONTAINS it — every pixel visible,
          // letterboxed on warm paper when the aspect differs. Small tiles
          // keep the covered band (a browse thumbnail, not an inspection).
          style={large === true
            ? { width: '100%', aspectRatio: 1, backgroundColor: P.bg }
            : { width: '100%', height: imgH }}
          resizeMode={large === true ? 'contain' : 'cover'}
          // A ref that 404s (wrong base, purged object) must land on the SAME
          // designed state as an unfetchable one — never an empty box.
          onError={() => setBroken(true)}
        />
      ) : (
        <View style={[s.tileNoPhoto, { height: imgH }]}>
          {/* A ref that was fetchable in principle but 404'd lands HERE, on the
              same designed state as one we cannot fetch at all — « Photo
              indisponible », never « Sans photo », because he DID upload one. */}
          <Text style={s.tileNoPhotoTxt}>
            {tr(photo.kind === 'photo' ? 'produits.photo_non_configure' : photo.message)}
          </Text>
        </View>
      )}
      <View style={s.tileBody}>
        <Text style={s.tileName} numberOfLines={2}>{name}</Text>
        <View style={s.tilePriceRow}>
          <Text style={[s.tilePrice, TNUM]}>{priceF}</Text>
          <Text style={[s.tileStock, stock <= 4 && s.tileStockLow, TNUM]} numberOfLines={1}>{`stock ${stock}`}</Text>
        </View>
        {variants !== undefined && <Text style={s.tileVariants} numberOfLines={1}>{variants}</Text>}
        {hiddenNote !== undefined && <Text style={s.tileHidden}>{hiddenNote}</Text>}
      </View>
    </Wrap>
  );
}

// ── banners, empty, timeline ─────────────────────────────────────────────────
export function Banner({ tone, children, check, style }: { tone: 'info' | 'warn' | 'danger' | 'success'; children: ReactNode; check?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = C27[tone];
  return (
    <View style={[s.banner, { backgroundColor: t.bg }, check === true && s.bannerRow, style]}>
      {check === true && <Icon name="check" size={17} stroke={t.fg} strokeWidth={2.2} />}
      <Text style={[s.bannerTxt, { color: t.fg }, check === true && { flex: 1 }]}>{children}</Text>
    </View>
  );
}
export const EmptyState = () => (
  <View style={s.empty}><Text style={s.emptyTxt}>{C28.label}</Text></View>
);

export function Timeline({ steps, interrupted }: { steps: { label: string; state: 'done' | 'current' | 'future' }[]; interrupted?: { pill: string; note: string } | undefined }) {
  return (
    <View>
      {steps.map((st, i) => (
        <View key={i} style={s.tlStep}>
          <View style={s.tlGutter}>
            <View style={[s.tlDot, st.state === 'done' ? s.tlDotDone : st.state === 'current' ? s.tlDotCurrent : s.tlDotFuture]} />
            {i < steps.length - 1 && <View style={[s.tlBar, st.state === 'done' ? s.tlBarDone : s.tlBarIdle]} />}
          </View>
          <Text style={[s.tlLabel, st.state !== 'future' && s.tlLabelStrong]}>{st.label}</Text>
        </View>
      ))}
      {interrupted !== undefined && (
        <View style={s.tlInterrupted}>
          <Text style={s.tlInterruptedTxt}>{`Commande interrompue : ${interrupted.pill}. ${interrupted.note}`}</Text>
        </View>
      )}
    </View>
  );
}

// ── toast stack + sheet + dots + footer ───────────────────────────────────────
export const ToastStack = ({ toasts }: { toasts: { id: number; m: string }[] }) => (
  <View style={s.toastStack} pointerEvents="none">
    {toasts.map((t) => (
      <View key={t.id} style={s.toast}>
        <Icon name="check" size={C30.check.size} stroke={C30.check.stroke} strokeWidth={C30.check.strokeWidth} />
        <Text style={s.toastTxt} numberOfLines={2}>{t.m}</Text>
      </View>
    ))}
  </View>
);

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <Pressable style={s.scrim} onPress={onClose}>
      <Pressable style={s.sheetPanel} onPress={() => {}}>
        <View style={s.sheetGrabber} />
        <Text style={s.sheetTitle}>{title}</Text>
        {children}
      </Pressable>
    </Pressable>
  );
}

export const ProgressDots = ({ total, step }: { total: number; step: number }) => (
  <View style={s.dotsRow}>
    {Array.from({ length: total }, (_, i) => (
      <View key={i} style={[s.dotSeg, i <= step && s.dotSegDone]} />
    ))}
  </View>
);
export const WizardFooter = ({ children }: { children: ReactNode }) => <View style={s.wizFooter}>{children}</View>;

// ── skeleton (S01 blocks) ─────────────────────────────────────────────────────
export function SkeletonBoot() {
  return (
    <View style={C34.wrap}>
      <View style={[s.skel, { height: 18, width: 150, borderRadius: 9 }]} />
      <View style={[s.skel, { height: 34, width: 230, borderRadius: 12 }]} />
      <View style={[s.skel, { height: 86, borderRadius: 20 }]} />
      <View style={[s.skel, { height: 86, borderRadius: 20 }]} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[s.skel, { flex: 1, height: 104, borderRadius: 20 }]} />
        <View style={[s.skel, { flex: 1, height: 104, borderRadius: 20 }]} />
      </View>
      <View style={[s.skel, { height: 54, borderRadius: 16 }]} />
    </View>
  );
}

// ── trust, meters, processing, code ──────────────────────────────────────────
export const TrustCard = ({ title, body, current, pill }: { title: string; body: string; current?: boolean; pill?: ReactNode }) => (
  <View style={[s.cardL, current === true && s.trustCurrent]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={s.trustTitle}>{title}</Text>
      {pill}
    </View>
    <Text style={s.trustBody}>{body}</Text>
  </View>
);
export const MetersList = ({ rows }: { rows: { label: string; ok: boolean }[] }) => (
  <View style={[s.cardL, s.cardLlist]}>
    {rows.map((r) => (
      <View key={r.label} style={s.meterRow}>
        <Text style={s.meterLabel}>{r.label}</Text>
        <View style={[s.meterPill, { backgroundColor: r.ok ? C37.ok.bg : C37.fix.bg }]}>
          <Text style={[s.meterPillTxt, { color: r.ok ? C37.ok.fg : C37.fix.fg }]}>{r.ok ? C37.ok.label : C37.fix.label}</Text>
        </View>
      </View>
    ))}
  </View>
);
export const ProcessingList = ({ rows, proc }: { rows: string[]; proc: number }) => (
  <View style={[s.cardL, s.cardLlist]}>
    {rows.map((label, i) => (
      <View key={label} style={s.procRow}>
        <Text style={i < proc ? s.procDone : s.procIdle}>{label}</Text>
        <Text style={s.procMark}>{i < proc ? C38.MARK_DONE : i === proc ? C38.MARK_CURRENT : C38.MARK_FUTURE}</Text>
      </View>
    ))}
  </View>
);
export const ChallengeCode = ({ code, note }: { code: string; note: string }) => (
  <View style={s.challengeCard}>
    <Text style={[s.challengeCode, TNUM]}>{code}</Text>
    <Text style={s.challengeNote}>{note}</Text>
  </View>
);

// ── headers + misc ────────────────────────────────────────────────────────────
export const HeaderStacked = ({ title, onBack, right, wizardCounter }: { title: string; onBack: () => void; right?: ReactNode; wizardCounter?: string }) => (
  <View style={s.headerRow}>
    <BackBtn onPress={onBack} />
    {wizardCounter !== undefined ? (
      <Text style={s.headerTitleWizard} numberOfLines={1}>
        {title} <Text style={s.headerCounter}>{wizardCounter}</Text>
      </Text>
    ) : (
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
    )}
    {right}
  </View>
);
export const HeaderBoutique = ({ shopName, onTrust }: { shopName: string; onTrust: () => void }) => (
  <View style={s.boutiqueRow}>
    <View style={s.monogram}><Text style={[s.monogramTxt, { letterSpacing: 15 * 0.02 }]}>{C44.MONOGRAM}</Text></View>
    <View style={s.rowCol}>
      <Text style={s.wordmark}>{C44.WORDMARK}</Text>
      <Text style={s.boutiqueSub} numberOfLines={1}>{`${shopName} · Rood Woko`}</Text>
    </View>
    <ChipVerified onPress={onTrust} />
  </View>
);
export const EcheanceRow = ({ time, label }: { time: string; label: string }) => (
  <View style={s.echRow}>
    <Text style={[s.echTime, TNUM]}>{time}</Text>
    <Text style={s.echLabel}>{label}</Text>
  </View>
);
export const ActivityCard = ({ overline, lines }: { overline: string; lines: string[] }) => (
  <View style={[s.cardL, { paddingVertical: 16, paddingHorizontal: 17 }]}>
    <Overline level="card">{overline}</Overline>
    <Text style={s.activityBody}>{lines.map((l) => `• ${l}`).join('\n')}</Text>
  </View>
);

const s = StyleSheet.create({
  dockBar: C03.bar, dockItem: C03.item, dockItemActive: C03.itemActive, dockLabel: C03.label, dockLabelActive: C03.labelActive,
  pageTitle: C04.title, overlineScreen: C05.screen, overlineCard: C05.card,
  pill: C06.pill, pillHeader: C06.header, pillArgent: C06.argentRow, pillTxt: {},
  btnSoft: C08.btn, btnSoftLabel: C08.label,
  btnGhost: C09.btn, btnGhostLabel: C09.label,
  btnDemo: C10.btn, btnDemoLabel: C10.label,
  backBtn: C11.btn,
  chipSeg: C12.chip, chipSegActive: C12.active, chipSegInactive: C12.inactive, chipSegTxt: C12.txt, chipSegTxtActive: C12.txtActive, chipSegCount: C12.count,
  chipCat: C13.chip, chipCatActive: C13.active, chipCatInactive: C13.inactive, chipCatTxt: C13.txt, chipCatTxtActive: C13.txtActive,
  chipVerified: C14.chip, chipVerifiedTxt: C14.txt,
  /** F18 — the 44 px touch box around the 38 px painted pill. */
  chipVerifiedHit: { minHeight: 44, justifyContent: 'center' as const },
  stepperRow: C15.row, stepperBtn: C15.btn, stepperGlyph: C15.glyph, stepperValue: C15.value,
  input: C16.input,
  cardL: C17.L, cardLlg: C17.Llg, cardLlist: C17.Llist, cardRow: C17.row,
  statCard: C18.card, statValue: C18.value, statValueVerse: C18.valueVerse, statLegend: C18.legend,
  moneyLine: C19.line, moneyLineTxt: C19.lineTxt, moneyLineSub: C19.lineTxtSub, moneyLineVal: C19.lineVal,
  moneyTotal: C19.total, moneyTotalLabel: C19.totalLabel, moneyTotalL: C19.totalValL, moneyTotalXL: C19.totalValXL, moneyNote: C19.note,
  moneyHero: C20.card, moneyHeroOverline: C20.overline, moneyHeroAmount: C20.amount, moneyHeroFoot: C20.footRow, moneyHeroFootLabel: C20.footLabel, moneyHeroFootVal: C20.footVal,
  rowCard: C22.row, rowCardOrder: C22.rowOrder, rowCol: C22.col, rowTitle: C22.title, rowSub: C22.sub,
  moneyRow: C24.row, moneyRowCode: C24.code, moneyRowName: C24.name, moneyRowNet: C24.net, moneyRowRight: C24.right,
  releveRow: C25.row, releveWeek: C25.week, releveSub: C25.sub, releveTotal: C25.total,
  tile: C26.tile, tileBody: C26.body, tileName: C26.name, tilePriceRow: C26.priceRow, tilePrice: C26.price, tileStock: C26.stock, tileStockLow: C26.stockLow,
  tileNoPhoto: C26.noPhoto, tileNoPhotoTxt: C26.noPhotoTxt, tileVariants: C26.variants, tileHidden: C26.hidden,
  // PhotoViewer — an inspection overlay; near-black so the photograph is the
  // only light on screen. rgba, not a palette tone: this is a scrim, not a surface.
  viewerFill: { flex: 1, backgroundColor: 'rgba(10,8,6,0.96)', alignItems: 'center' as const, justifyContent: 'center' as const },
  viewerImg: { width: '100%' as const, height: '80%' as const },
  viewerLabel: { ...role({ f: 'IS', w: 700, s: 13 }, P.cream), marginTop: 14 },
  tileBadge: C26.badge, tileBadgeTxt: C26.badgeTxt, tileBadgePause: C26.badgePause, tileBadgeMod: C26.badgeMod, tileBadgeModTxt: C26.badgeModTxt,
  banner: C27.banner, bannerTxt: C27.txt, bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  empty: C28.box, emptyTxt: C28.txt,
  tlStep: C29.step, tlGutter: C29.gutter, tlDot: C29.dot, tlDotDone: C29.dotDone, tlDotCurrent: C29.dotCurrent, tlDotFuture: C29.dotFuture,
  tlBar: C29.bar, tlBarDone: C29.barDone, tlBarIdle: C29.barIdle, tlLabel: C29.label, tlLabelStrong: C29.labelStrong,
  tlInterrupted: C29.interrupted, tlInterruptedTxt: C29.interruptedTxt,
  toastStack: C30.stack, toast: C30.toast, toastTxt: C30.txt,
  scrim: C31.scrim, sheetPanel: C31.panel, sheetGrabber: C31.grabber, sheetTitle: C31.title,
  dotsRow: C32.row, dotSeg: C32.seg, dotSegDone: C32.segDone,
  wizFooter: C33.footer,
  skel: { backgroundColor: P.skeleton },
  trustCurrent: C36.current, trustTitle: C36.title, trustBody: C36.body,
  meterRow: C37.row, meterLabel: C37.label, meterPill: C37.pill, meterPillTxt: C37.pillTxt,
  procRow: C38.row, procDone: C38.labelDone, procIdle: C38.labelIdle, procMark: C38.mark,
  challengeCard: C41.card, challengeCode: C41.code, challengeNote: C41.note,
  headerRow: C43.row, headerTitle: C43.title, headerTitleWizard: C43.titleWizard, headerCounter: C43.counter,
  boutiqueRow: C44.row, monogram: C44.monogram, monogramTxt: C44.monogramTxt, wordmark: C44.wordmark, boutiqueSub: C44.subline,
  echRow: C45.row, echTime: C45.time, echLabel: C45.label,
  activityBody: C46.body,
});
