/**
 * WO-FP-PIXEL §2 — the C01–C48 style DATA (plain objects, no react-native
 * import). Single source: components wrap these with StyleSheet.create; the
 * value gate compares them to the Phase-0 table. Every number/hex resolves to
 * tokens.ts / palette.ts (§1) or is a §2 per-component exact value.
 */
import { P } from './palette';
import { GEO, SHADOW, T, type TypeRole } from './tokens';

/** §1.2 face identity: (family, weight) → the shipped face name (fonts.ts). */
export const face = (f: 'BG' | 'IS', w: number): string =>
  f === 'BG'
    ? w >= 800
      ? 'BricolageGrotesque-ExtraBold'
      : 'BricolageGrotesque-Bold'
    : w >= 700
      ? 'InstrumentSans-Bold'
      : w >= 600
        ? 'InstrumentSans-SemiBold'
        : w >= 500
          ? 'InstrumentSans-Medium'
          : 'InstrumentSans-Regular';

/** T role → RN text style (§1.2; lh '—' frozen 1.2 per §9.2 where set at site). */
export const role = (r: TypeRole, colour: string) => ({
  fontFamily: face(r.f, r.w),
  fontSize: r.s,
  fontWeight: String(r.w) as '400' | '500' | '600' | '700' | '800',
  color: colour,
  ...(r.lsEm !== undefined ? { letterSpacing: r.s * r.lsEm } : {}),
  ...(r.lh !== undefined ? { lineHeight: r.s * r.lh } : {}),
  ...(r.upper === true ? { textTransform: 'uppercase' as const } : {}),
});
export const TNUM = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };

// ── §5 scroll containers (« Scroll 16/20/150 » = top/latéral/bottom) ─────────
export const SCROLL = {
  tabs: { paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side, paddingBottom: GEO.screenPad.bottomTabs },
  stacked: { paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side, paddingBottom: GEO.screenPad.bottomStacked },
  wizard: { paddingTop: GEO.wizardContentPad.top, paddingHorizontal: GEO.wizardContentPad.side, paddingBottom: GEO.wizardContentPad.bottom },
} as const;

// ── §5 screen-local variants (exact per-anatomy values, cited) ───────────────
/** S05 fiche action pair — source `.btn-soft.h48` / `.btn-ghost.h48`. */
export const S05L = {
  pairSoft: { height: 48, borderRadius: 14 },
  pairSoftTxt: { fontSize: 14 },
  pairGhost: { height: 48 },
} as const;
/** S17 ready-sheet photo button — C08 with inline `border-radius:14px`. */
export const S17L = { photoBtn: { borderRadius: 14 } } as const;

// ── C03 Dock ──────────────────────────────────────────────────────────────────
export const C03 = {
  bar: {
    position: 'absolute' as const, left: 0, right: 0, bottom: 0, zIndex: 30,
    flexDirection: 'row' as const,
    paddingTop: 8, paddingHorizontal: 10, paddingBottom: 28,
    backgroundColor: P.dock88,
    borderTopWidth: 1, borderTopColor: P.dockBorder,
  },
  item: {
    flex: 1, alignItems: 'center' as const, gap: 3,
    paddingTop: 8, paddingHorizontal: 2, paddingBottom: 6,
    borderRadius: GEO.r.dockItem,
  },
  itemActive: { backgroundColor: P.greenSoft },
  label: { ...role(T.TabLabel, P.faint) },
  labelActive: { color: P.greenDeep },
} as const;

// ── C04 PageTitle · C05 Overline ─────────────────────────────────────────────
export const C04 = { title: role(T.PageTitle, P.ink) } as const;
export const C05 = {
  screen: role(T.Overline, P.sub), // 11px, screen level
  card: { ...role(T.Overline, P.sub), fontSize: 10.5, letterSpacing: 10.5 * 0.1 }, // intra-carte
} as const;

// ── C06 StatusPill (tone map §2) ─────────────────────────────────────────────
export const C06 = {
  pill: { ...role(T.PillTxt, P.ink), paddingVertical: 5, paddingHorizontal: 10, borderRadius: GEO.r.pill, overflow: 'hidden' as const },
  header: { paddingHorizontal: 11 }, // détail header variant 5px 11px
  argentRow: { fontSize: 10.5, paddingVertical: 4, paddingHorizontal: 9 }, // rangées Argent
} as const;
export const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  FUNDED: { label: 'À préparer', bg: P.warnBg, fg: P.warnFg },
  READY: { label: 'Prêt — enlèvement', bg: P.greenSoft, fg: P.greenDeep },
  TRANSIT: { label: 'En route', bg: P.greenSoft, fg: P.greenDeep },
  ARRIVED: { label: 'Livreur arrivé', bg: P.greenSoft, fg: P.greenDeep },
  INSPECT: { label: 'Inspection', bg: P.greenSoft, fg: P.greenDeep },
  AWAIT_PAY: { label: 'Paiement à la porte', bg: P.warnBg, fg: P.warnFg },
  PAY_OK: { label: 'Paiement confirmé', bg: P.successBg, fg: P.successFg },
  HANDOFF: { label: 'Remise — code cliente', bg: P.greenSoft, fg: P.greenDeep },
  DELIVERED: { label: 'Livré', bg: P.successBg, fg: P.successFg },
  PAID: { label: 'Versé', bg: P.successBg, fg: P.successFg },
  READY_FAILED: { label: 'Photo à reprendre', bg: P.dangerBg, fg: P.dangerFg },
  BUYER_REFUSED: { label: 'Refusée par la cliente', bg: P.dangerBg, fg: P.dangerFg },
  PICKUP_REFUSED: { label: "Refusé à l'enlèvement", bg: P.dangerBg, fg: P.dangerFg },
  RETURNED: { label: 'Retourné', bg: P.neutralPill, fg: P.sub },
};
export const PRODUCT_PILL = {
  online: { label: 'En ligne', bg: P.successBg, fg: P.successFg },
  paused: { label: 'En pause', bg: P.neutralPill, fg: P.sub },
  moderation: { label: 'En modération', bg: P.warnBg, fg: P.warnDeep },
} as const;

// ── C07 lives in components/C07.styles.ts (pilot; kept) ─────────────────────

// ── C08 BtnSoft · C09 BtnGhost · C10 BtnDemo · C11 BackBtn ───────────────────
export const C08 = {
  btn: {
    height: 50, borderRadius: 16, backgroundColor: P.greenSoft,
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
  },
  label: { ...role({ f: 'BG', w: 700, s: 15 }, P.greenDeep) },
} as const;
export const C09 = {
  btn: {
    height: 46, borderRadius: GEO.r.ghost, borderWidth: 1.5, borderColor: P.borderCtl,
    backgroundColor: 'transparent',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  label: { ...role(T.GhostS, P.ink) },
} as const;
export const C10 = {
  btn: {
    height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: P.dashDemo, borderStyle: 'dashed' as const,
    backgroundColor: 'transparent',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  label: { ...role({ f: 'IS', w: 600, s: 13 }, P.sub) },
  prefix: '\u25B6 ', // « ▶ » U+25B6 (C10 spec; escape — chrome gate scans literals)
} as const;
export const C11 = {
  btn: {
    width: 40, height: 40, borderRadius: GEO.r.pill, borderWidth: 1, borderColor: P.borderCtl,
    backgroundColor: P.surface, alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  chevron: { size: 17, stroke: P.ink, strokeWidth: 2.1, d: 'M14.5 6l-6 6 6 6' },
} as const;

// ── C12 ChipSegment · C13 ChipCategory · C14 ChipVerified ────────────────────
export const C12 = {
  chip: {
    height: 38, paddingHorizontal: 14, borderRadius: GEO.r.pill, borderWidth: 1.5,
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7,
  },
  active: { borderColor: P.green, backgroundColor: P.greenSoft },
  inactive: { borderColor: P.borderCtl, backgroundColor: P.surface },
  txt: { ...role(T.ChipTxt, P.sub) },
  txtActive: { color: P.greenDeep },
  count: { ...role({ f: 'IS', w: 700, s: 11 }, P.sub), opacity: 0.75 },
} as const;
export const C13 = {
  chip: { height: 42, paddingHorizontal: 16, borderRadius: GEO.r.pill, borderWidth: 1.5, alignItems: 'center' as const, justifyContent: 'center' as const },
  active: { borderColor: P.green, backgroundColor: P.greenSoft },
  inactive: { borderColor: P.borderCtl, backgroundColor: P.surface },
  txt: { ...role({ f: 'IS', w: 600, s: 14 }, P.ink) },
  txtActive: { color: P.greenDeep },
} as const;
export const C14 = {
  chip: {
    height: 38, paddingHorizontal: 14, borderRadius: GEO.r.pill, borderWidth: 1, borderColor: P.borderCtl,
    backgroundColor: P.surface, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    boxShadow: SHADOW.chipHdr,
  },
  txt: { ...role({ f: 'IS', w: 600, s: 13 }, P.green) },
  label: 'Vérifié',
} as const;

// ── C15 Stepper ──────────────────────────────────────────────────────────────
export const C15 = {
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  btn: {
    width: 52, height: 52, borderRadius: GEO.r.pill, borderWidth: 1, borderColor: P.borderCtl,
    backgroundColor: P.surface, alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  // Δ1 (PHASE0-DELTAS): render UA-leaked Arial → built IS600 per HANDOFF, ruling pending
  glyph: { ...role({ f: 'IS', w: 600, s: 20 }, P.ink) },
  minus: '−', // −
  plus: '＋', // ＋ (§9.7)
  value: {
    flex: 1, textAlign: 'center' as const, padding: 13, borderRadius: GEO.r.stepperValue,
    borderWidth: 1, borderColor: P.borderCard, backgroundColor: P.surface,
    ...role(T.StepperValue, P.ink),
  },
} as const;

// ── C16 Input ────────────────────────────────────────────────────────────────
export const C16 = {
  input: {
    width: '100%' as const, paddingVertical: 14, paddingHorizontal: 15,
    borderRadius: GEO.r.input, borderWidth: 1.5, borderColor: P.borderCtl,
    backgroundColor: P.surface, ...role(T.Input, P.ink),
  },
  focus: { borderColor: P.green, boxShadow: '0 0 0 3px rgba(11,91,71,0.12)' },
  labelGap: 8,
} as const;

// ── C17 Card ─────────────────────────────────────────────────────────────────
export const C17 = {
  L: { padding: 17, borderRadius: GEO.r.cardL, borderWidth: 1, borderColor: P.borderCard, backgroundColor: P.surface, boxShadow: SHADOW.cardSm },
  Llg: { boxShadow: SHADOW.cardLg },
  Llist: { paddingVertical: 8, paddingHorizontal: 17 },
  row: { padding: 13, borderRadius: GEO.r.row, borderWidth: 1, borderColor: P.borderCard, backgroundColor: P.surface, boxShadow: SHADOW.cardSm },
} as const;

// ── C18 StatCard ─────────────────────────────────────────────────────────────
export const C18 = {
  card: { ...C17.L, padding: 16, boxShadow: SHADOW.cardLg },
  value: { ...role(T.StatValue, P.ink), marginTop: 6 },
  valueVerse: { color: P.green },
  legend: { ...role({ f: 'IS', w: 400, s: 12, lh: 1.4 }, P.sub), marginTop: 3 },
} as const;

// ── C19 MoneyBreakdown ───────────────────────────────────────────────────────
export const C19 = {
  line: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 6 },
  lineTxt: { ...role({ f: 'IS', w: 400, s: 14 }, P.ink) },
  lineTxtSub: { color: P.sub },
  lineVal: { ...role({ f: 'IS', w: 700, s: 14 }, P.ink) },
  total: { borderTopWidth: 1.5, borderTopColor: P.borderCtl, borderStyle: 'dashed' as const, marginTop: 5, paddingTop: 12, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const },
  totalLabel: { ...role({ f: 'IS', w: 700, s: 15 }, P.ink) },
  totalValL: { ...role(T.NetL, P.greenDeep) },
  totalValXL: { ...role(T.NetXL, P.greenDeep) },
  note: { ...role({ f: 'IS', w: 400, s: 12, lh: 1.5 }, P.sub), marginTop: 8 },
  minus: '−',
  ORDER: ['Prix de base', 'Commission revendeuse', 'Frais Boutik+ (5 %)', 'Vous recevez'] as const,
} as const;

// ── C20 MoneyHero ────────────────────────────────────────────────────────────
export const C20 = {
  card: { padding: 20, borderRadius: GEO.r.hero, backgroundColor: P.green, boxShadow: SHADOW.moneyHero, overflow: 'hidden' as const },
  overline: { ...role(T.Overline, P.cream), fontSize: 10.5, letterSpacing: 10.5 * 0.1, opacity: 0.75 },
  amount: { ...role(T.DisplayMoney, P.cream), marginTop: 6 },
  footRow: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(246,241,231,0.22)', flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  footLabel: { ...role({ f: 'IS', w: 400, s: 12.5 }, P.cream), opacity: 0.85 },
  footVal: { ...role(T.MoneySub, P.cream) },
} as const;

// ── C21 IconTile size table ──────────────────────────────────────────────────
export const C21 = {
  todo: { size: 52, r: 14, glyph: 24 },
  order: { size: 48, r: GEO.r.iconTileOrder, glyph: 22 },
  preview: { size: 56, r: 14, glyph: 25 },
  produitImg: { h: 108, glyph: 44 },
  heroFiche: { h: 180, r: GEO.r.hero, glyph: 68 },
  viseur: { h: 230, r: GEO.r.hero, glyph: 72 },
} as const;

// ── C22 RowTodo / C23 RowOrder ───────────────────────────────────────────────
export const C22 = {
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 13, borderRadius: GEO.r.row, borderWidth: 1, borderColor: P.borderCard, backgroundColor: P.surface, boxShadow: SHADOW.cardLg },
  rowOrder: { boxShadow: SHADOW.cardSm },
  col: { flex: 1, minWidth: 0 },
  title: { ...role(T.RowTitle, P.ink) },
  sub: { ...role({ f: 'IS', w: 400, s: 12.5 }, P.sub), marginTop: 2 },
  SUB_FUNDED: 'Commande payée — confirmez « Produit prêt »',
  SUB_READY_FAILED: 'Photo refusée — reprenez la photo du produit prêt',
  MODE_A: 'payé en entier',
  MODE_B: 'produit payé à la porte',
} as const;

// ── C24 RowMoney · C25 RowReleve ─────────────────────────────────────────────
export const C24 = {
  row: { ...C17.row, paddingVertical: 14, paddingHorizontal: 15, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  code: { ...role(T.RowTitle, P.ink) },
  name: { ...role({ f: 'IS', w: 400, s: 12.5 }, P.sub) },
  net: { ...role(T.MoneyRowNet, P.ink) },
  right: { alignItems: 'flex-end' as const },
  pillGap: 4,
} as const;
export const C25 = {
  row: { paddingVertical: 13, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderColor: P.borderCard, backgroundColor: P.surface, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  week: { ...role({ f: 'IS', w: 700, s: 13.5 }, P.ink) },
  sub: { ...role({ f: 'IS', w: 400, s: 12 }, P.sub), marginTop: 1 },
  total: { ...role(T.RelevTotal, P.ink) },
} as const;

// ── C26 ProductTile ──────────────────────────────────────────────────────────
export const C26 = {
  tile: { borderRadius: GEO.r.row, overflow: 'hidden' as const, borderWidth: 1, borderColor: P.borderCard, backgroundColor: P.surface, boxShadow: SHADOW.cardLg },
  body: { paddingTop: 11, paddingHorizontal: 12, paddingBottom: 12 },
  name: { ...role(T.TileName, P.ink) },
  priceRow: { marginTop: 5, flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, gap: 6 },
  price: { ...role(T.ProduitPrix, P.greenDeep) },
  stock: { ...role({ f: 'IS', w: 600, s: 11.5 }, P.sub) },
  stockLow: { color: P.warnFg }, // ≤ 4
  badge: { position: 'absolute' as const, top: 8, left: 8, paddingVertical: 4, paddingHorizontal: 8, borderRadius: GEO.r.pill },
  badgeTxt: { ...role({ f: 'IS', w: 700, s: 10 }, P.cream) },
  badgePause: { backgroundColor: P.pauseBadge },
  badgeMod: { backgroundColor: P.warnBg },
  badgeModTxt: { color: P.warnDeep },
  // PRODUITS-READ-1 — the two states a REAL offer has that a mock never did.
  // Built from the same tokens as the rest of C26; no one-off values.
  noPhoto: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: P.bg },
  noPhotoTxt: { ...role({ f: 'IS', w: 600, s: 12 }, P.sub) },
  variants: { ...role({ f: 'IS', w: 400, s: 11.5 }, P.sub), marginTop: 4 },
  /** « expirée » — warn, never danger: a lapsed offer is a fact to act on, not a fault. */
  hidden: { ...role({ f: 'IS', w: 600, s: 11.5 }, P.warnDeep), marginTop: 6 },
} as const;

// ── C27 Banner ───────────────────────────────────────────────────────────────
export const C27 = {
  banner: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: GEO.r.banner },
  txt: { ...role(T.BannerTxt, P.greenDeep) },
  info: { bg: P.greenSoft, fg: P.greenDeep },
  warn: { bg: P.warnBg, fg: P.warnDeep },
  danger: { bg: P.dangerBg, fg: P.dangerDeep },
  success: { bg: P.successBg, fg: P.successFg },
} as const;

// ── C28 EmptyState ───────────────────────────────────────────────────────────
export const C28 = {
  box: { paddingVertical: 22, paddingHorizontal: 16, borderRadius: GEO.r.row, borderWidth: 1, borderColor: P.grabber, borderStyle: 'dashed' as const },
  txt: { ...role({ f: 'IS', w: 400, s: 13.5 }, P.sub), textAlign: 'center' as const },
  label: "Rien ici pour l'instant.",
} as const;

// ── C29 Timeline ─────────────────────────────────────────────────────────────
export const C29 = {
  step: { flexDirection: 'row' as const, gap: 12 },
  gutter: { width: 18, alignItems: 'center' as const },
  dot: { width: 14, height: 14, borderRadius: GEO.r.pill, borderWidth: 2.5, marginTop: 2 },
  dotDone: { borderColor: P.green, backgroundColor: P.green },
  dotCurrent: { borderColor: P.green, backgroundColor: P.surface },
  dotFuture: { borderColor: P.dotIdle, backgroundColor: P.surface },
  bar: { width: 2.5, flex: 1, minHeight: 16 },
  barDone: { backgroundColor: P.green },
  barIdle: { backgroundColor: P.barIdle },
  label: { flex: 1, paddingBottom: 16, ...role(T.Timeline, P.faint) },
  labelStrong: { fontFamily: face('IS', 700), fontWeight: '700' as const, color: P.ink },
  interrupted: { borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15, backgroundColor: P.dangerBg },
  interruptedTxt: { ...role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.dangerDeep) },
} as const;

// ── C30 Toast ────────────────────────────────────────────────────────────────
export const C30 = {
  stack: { position: 'absolute' as const, top: 66, left: 0, right: 0, zIndex: 80, alignItems: 'center' as const, gap: 8 },
  toast: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: P.ink, paddingVertical: 12, paddingHorizontal: 17, borderRadius: GEO.r.pill, maxWidth: '86%' as const, boxShadow: SHADOW.toast },
  txt: { ...role(T.ToastTxt, P.toastFg) },
  check: { size: 15, stroke: P.toastCheck, strokeWidth: 2.4 },
  LIFE_MS: 2800, // §9.9: no exit animation — hard removal
} as const;

// ── C31 Sheet ────────────────────────────────────────────────────────────────
export const C31 = {
  scrim: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, backgroundColor: P.scrim, justifyContent: 'flex-end' as const },
  panel: { backgroundColor: P.sheet, borderTopLeftRadius: GEO.r.sheetTop, borderTopRightRadius: GEO.r.sheetTop, paddingTop: 10, paddingHorizontal: 22, paddingBottom: 44, maxHeight: '86%' as const, boxShadow: SHADOW.sheet },
  grabber: { width: 40, height: 5, borderRadius: GEO.r.pill, backgroundColor: P.grabber, alignSelf: 'center' as const, marginTop: 6, marginBottom: 16 },
  title: { ...role(T.SheetTitle, P.ink) },
} as const;

// ── C32 ProgressDots · C33 WizardFooter · C34 Skeleton ───────────────────────
export const C32 = {
  row: { flexDirection: 'row' as const, gap: 6, marginTop: 14 },
  seg: { flex: 1, height: 4, borderRadius: GEO.r.pill, backgroundColor: P.borderCtl },
  segDone: { backgroundColor: P.green },
} as const;
export const C33 = {
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 40 },
} as const;
export const C34 = {
  base: P.skeleton,
  highlight: P.cream,
  wrap: { flex: 1, paddingVertical: 18, paddingHorizontal: 20, gap: 14 },
  // S01's 7 exact blocks (§5 S01): [h, w|null=full, r]
  blocks: [
    { h: 18, w: 150, r: 9 },
    { h: 34, w: 230, r: 12 },
    { h: 86, w: null, r: 20 },
    { h: 86, w: null, r: 20 },
    { h: 104, w: null, r: 20, half: true }, // ×2 side by side gap 12
    { h: 54, w: null, r: 16 },
  ],
  BOOT_MS: 750,
} as const;

// ── C35 Celebration (S40) ────────────────────────────────────────────────────
export const C35 = {
  scrim: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, zIndex: 90, backgroundColor: P.celebScrim, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 32 },
  badge: { marginTop: 24, width: 78, height: 78, borderRadius: GEO.r.pill, backgroundColor: P.cream, alignItems: 'center' as const, justifyContent: 'center' as const },
  check: { size: 36, stroke: P.green, strokeWidth: 2.6 },
  amount: { ...role({ f: 'BG', w: 800, s: 34, lsEm: -0.02 }, P.cream), marginTop: 20 },
  caption: { ...role({ f: 'IS', w: 700, s: 11, lsEm: 0.12, upper: true }, P.gold), marginTop: 8 },
  hint: { ...role({ f: 'IS', w: 400, s: 12 }, 'rgba(246,241,231,0.65)'), marginTop: 14 },
  // §1.5 celebDash: 132×6, gold 0-12, transparent 12-20 (cycle 20)
  dash: { width: 132, height: 6, flexDirection: 'row' as const },
  dashSeg: { width: 12, height: 6, backgroundColor: P.gold, marginRight: 8 },
} as const;

// ── C36 TrustCard · C37 MetersList · C38 ProcessingList ──────────────────────
export const C36 = {
  card: C17.L,
  current: { borderWidth: 2, borderColor: P.green, boxShadow: SHADOW.trustActive },
  title: { ...role(T.CardTitle, P.ink) },
  body: { ...role({ f: 'IS', w: 400, s: 13, lh: 1.55 }, P.sub), marginTop: 6 },
} as const;
export const C37 = {
  card: { ...C17.L, paddingVertical: 8, paddingHorizontal: 17 },
  row: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: P.divider, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  label: { ...role({ f: 'IS', w: 400, s: 13.5 }, P.sub) },
  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: GEO.r.pill },
  pillTxt: { ...role({ f: 'IS', w: 700, s: 11 }, P.successFg) },
  ok: { bg: P.successBg, fg: P.successFg, label: 'OK' },
  fix: { bg: P.warnBg, fg: P.warnFg, label: 'À corriger' },
} as const;
export const C38 = {
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: P.divider, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  labelDone: { ...role({ f: 'IS', w: 600, s: 14 }, P.ink) },
  labelIdle: { ...role({ f: 'IS', w: 500, s: 14 }, P.faint) },
  mark: { fontSize: 13 },
  MARK_DONE: '✓',
  MARK_CURRENT: '…',
  MARK_FUTURE: '·',
} as const;

// ── C39 Viewfinder (Studio) · C40 AvantApres ─────────────────────────────────
export const C39 = {
  frame: { height: C21.viseur.h, borderRadius: C21.viseur.r, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
  inset: { position: 'absolute' as const, top: 20, left: 20, right: 20, bottom: 20, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.75)', borderStyle: 'dashed' as const, borderRadius: 16 },
  caption: { ...role({ f: 'IS', w: 700, s: 12, lsEm: 0.02 }, P.creamCaption), position: 'absolute' as const, bottom: 30, left: 30, right: 30, textAlign: 'center' as const },
  CAPTION: "Placez l'article dans le cadre",
} as const;
/**
 * STUDIO-REVIEW-1 — the two crop guides drawn on a reviewed HERO image.
 *
 * `square` reuses `C39.inset`'s border VERBATIM (planche 446) — only the rect
 * changes, from a fixed 20pt decoration to a derived crop rectangle.
 * `vertical` has NO planche line behind it (listed divergence D-1: the planche
 * had one mock viewfinder, so it had one inset). It is composed from its
 * sibling — same cream, same radius, DERIVED not retyped — and differs only in
 * weight and style, so the pair reads as primary + secondary.
 */
export const C39G = {
  square: {
    borderWidth: C39.inset.borderWidth,
    borderColor: C39.inset.borderColor,
    borderStyle: C39.inset.borderStyle,
    borderRadius: C39.inset.borderRadius,
  },
  vertical: {
    borderWidth: 1.5,
    borderColor: C39.inset.borderColor,
    borderStyle: 'solid' as const,
    borderRadius: C39.inset.borderRadius,
  },
} as const;
export const C40 = {
  grid: { marginTop: 12, flexDirection: 'row' as const, gap: 12, alignItems: 'flex-start' as const },
  col: { flex: 1 },
  imgLeft: { h: 106, r: 14, glyph: 38 },
  framed: { borderWidth: 5, borderColor: P.bg, borderRadius: 16, overflow: 'hidden' as const },
  imgRight: { h: 96, r: 0, glyph: 38 },
  legend: { ...role({ f: 'IS', w: 400, s: 11.5, lh: 1.4 }, P.sub), marginTop: 7, textAlign: 'center' as const },
  LEGEND_LEFT: 'Originale (conservée en privé)',
  LEGEND_RIGHT: 'Publique · sans prix',
} as const;

// ── C41 ChallengeCode ────────────────────────────────────────────────────────
export const C41 = {
  card: { padding: 19, borderRadius: GEO.r.encartCode, borderWidth: 1.5, borderColor: P.green, backgroundColor: P.surface, alignItems: 'center' as const },
  code: { ...role(T.ChallengeCode, P.greenDeep) },
  note: { ...role({ f: 'IS', w: 400, s: 12.5 }, P.sub), marginTop: 6 },
} as const;

// ── C43 HeaderStacked · C44 HeaderBoutique · C45 EcheanceRow ─────────────────
export const C43 = {
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  title: { ...role(T.ScreenTitle, P.ink), flex: 1 },
  titleWizard: { ...role(T.CardHeadline, P.ink), flex: 1 },
  counter: { ...role(T.CardHeadline, P.sub) },
  /** §5 wizard/onboarding step heading (26 BG800 −.02, ink). */
  titleStep: role({ f: 'BG', w: 800, s: 26, lsEm: -0.02 }, P.ink),
} as const;
export const C44 = {
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  monogram: { width: 40, height: 40, borderRadius: 14, backgroundColor: P.green, alignItems: 'center' as const, justifyContent: 'center' as const },
  monogramTxt: { ...role(T.RowMonogram, P.cream) },
  MONOGRAM: 'BW',
  wordmark: { ...role({ f: 'BG', w: 800, s: 19, lsEm: -0.02 }, P.ink) },
  WORDMARK: 'Boutik+',
  subline: { ...role({ f: 'IS', w: 400, s: 12.5 }, P.sub) },
  col: { flex: 1, minWidth: 0 },
} as const;
export const C45 = {
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  time: { ...role(T.EchTime, P.greenDeep), backgroundColor: P.greenSoft, borderRadius: GEO.r.echTime, paddingVertical: 5, paddingHorizontal: 9, overflow: 'hidden' as const },
  label: { ...role({ f: 'IS', w: 400, s: 13, lh: 1.4 }, P.inkSoft) },
} as const;

// ── C46 ActivityCard · C47 RecapCard · C48 PreviewRevendeuse ─────────────────
export const C46 = {
  card: { ...C17.L, paddingVertical: 16, paddingHorizontal: 17 },
  body: { ...role({ f: 'IS', w: 400, s: 13, lh: 1.7 }, P.sub), marginTop: 8 },
} as const;
export const C47 = {
  card: C17.L,
  name: { ...role(T.CardHeadline, P.ink) },
  subline: { ...role({ f: 'IS', w: 400, s: 13 }, P.sub), marginTop: 3 },
  divider: { height: 1, backgroundColor: P.borderCard, marginVertical: 13 },
  line: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 5 },
  lineTxt: { ...role({ f: 'IS', w: 400, s: 14 }, P.ink) },
  net: { ...role(T.RecapNet, P.greenDeep) },
} as const;
export const C48 = {
  card: { ...C17.L, padding: 16 },
  row: { marginTop: 11, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  name: { ...role({ f: 'IS', w: 700, s: 14 }, P.ink) },
  sub: { ...role({ f: 'IS', w: 400, s: 12 }, P.sub), marginTop: 2 },
  commission: { ...role({ f: 'IS', w: 700, s: 12.5 }, P.greenDeep), marginTop: 3 },
  OVERLINE: 'APERÇU — CE QUE VERRONT LES REVENDEUSES',
} as const;
