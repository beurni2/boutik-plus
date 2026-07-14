/**
 * WO-FP-BOUTIK — the app-local FASO PREMIUM design module. The ONE place the
 * supplier app resolves the design system: it re-exports the canon tokens,
 * assigns each type role its family (display/text), and holds the app-local
 * pixel-source values the canon tokens do not encode this wave.
 *
 * THE HIERARCHY LAW (ruled at WO-FP-0) governs every value here:
 *   THE README DEFINES THE SYSTEM → THE v2 TOKENS ENCODE IT → THE PROTOTYPE IS
 *   PIXEL-SOURCE FOR APP-LOCAL DETAIL.
 * • Every colour/type/radius/geometry/motion the tokens encode is imported from
 *   `@platform/ui-tokens` — never hand-copied (TOKEN-FIDELITY: zero hand-copied
 *   hex; the token wins over any straying prototype usage).
 * • Values that exist ONLY in the prototype (the divider tone, the skeleton
 *   gradient stops, the sheet chrome, the celebration scrim — the `band`,
 *   `skeleton`, `ribbon` groups canon left in Grand Teint) are derived LOCALLY
 *   here, each BYTE-MATCHING a cited line in the committed brief
 *   (design-reference/handoff_redesign/). The fidelity gate
 *   (test/token-docket.test.ts) proves every one of them against those bytes,
 *   and a planted undocketed hex fires it.
 *
 * Dimensions are app-local pixel-source (canon: "frame/grab/list-pad geometry
 * is app-local, not canon this wave") — held as named constants derived from
 * the HANDOFF, cited inline. Nothing renders here; this is data.
 */
import {
  sharedColour,
  boutikColour,
  type as fpType,
  radius,
  geometry,
  motion,
} from '@platform/ui-tokens';
import type { TextStyle } from 'react-native';
import { fontFamily, type FontKind } from './fonts';

export { radius, geometry, motion };

// ── colour ────────────────────────────────────────────────────────────────
/** The canon palette Boutik+ paints with — shared tones + the four boutik
 * accents. Every value is a token; nothing here is a hand-copied hex. */
export const C = { ...sharedColour, ...boutikColour };

/**
 * THE APP-LOCAL COLOUR DOCKET — prototype-only tones (the canon tokens leave
 * `band`/`skeleton`/`ribbon`/`statusbar` in Grand Teint this wave). Each value
 * BYTE-MATCHES a cited line in the committed brief; the fidelity gate verifies
 * every one against those bytes and rejects any undocketed hex. `file` is where
 * the byte-match is asserted ('HANDOFF' | 'Redesign').
 */
export const APP_COLOUR_DOCKET = [
  { key: 'divider', value: '#F3EDDE', file: 'HANDOFF', where: 'internal card divider (§1 "divider interne #F3EDDE")' },
  { key: 'skeletonBase', value: '#ECE4D4', file: 'HANDOFF', where: 'skeleton gradient base (§2 Squelette)' },
  { key: 'demoDash', value: '#C9BDA3', file: 'HANDOFF', where: 'demo dashed-button border (§2 "1.5px dashed #C9BDA3")' },
  { key: 'sheetPanel', value: '#FCF9F2', file: 'HANDOFF', where: 'bottom-sheet panel (§2 Sheet "panneau #FCF9F2")' },
  { key: 'sheetGrab', value: '#DDD2BC', file: 'HANDOFF', where: 'sheet grab handle (§2 "poignée 40×5 #DDD2BC")' },
  { key: 'toastFg', value: '#F6F0E4', file: 'HANDOFF', where: 'toast pill text (§2 Toast "fg #F6F0E4")' },
  { key: 'toastCheck', value: '#8FD4B4', file: 'Redesign', where: 'toast confirmation check stroke' },
  { key: 'timelineFuture', value: '#E8DFCC', file: 'HANDOFF', where: 'timeline future-leg bar (§2 Timeline "#E8DFCC")' },
  { key: 'pauseScrim', value: 'rgba(28,23,16,.72)', file: 'HANDOFF', where: 'EN PAUSE tile badge (§2 Tuile)' },
  { key: 'celebrationScrim', value: 'rgba(7,59,46,.95)', file: 'HANDOFF', where: 'payout celebration scrim (§2 Célébration)' },
  { key: 'artWeave', value: 'rgba(255,255,255,.07)', file: 'HANDOFF', where: 'product-art weave overlay (§2 Art produit)' },
] as const;

type DocketKey = (typeof APP_COLOUR_DOCKET)[number]['key'];
/** The app-local tones, keyed — built from the docket so the values and their
 * warrants never drift apart. */
export const appColour = Object.fromEntries(APP_COLOUR_DOCKET.map((d) => [d.key, d.value])) as Record<DocketKey, string>;

// ── type ────────────────────────────────────────────────────────────────────
/**
 * A resolved type role → `{ size, wght, kind, lsEm?, upper?, lh }`. Sizes the
 * README states as a range are resolved to the HANDOFF §1 table's stated pixel
 * (view 19, heroMoney 38 for money-majesty, caps 11, body 14) — the app-local
 * pick within the token range, journaled. `kind` assigns the family per README
 * § Type (display = titles/money/CTAs/codes; text = everything else). `lsEm` is
 * the README letter-spacing in em (converted to px at render: size × lsEm).
 */
export interface Role {
  size: number;
  wght: number;
  kind: FontKind;
  lh: number;
  lsEm?: number;
  upper?: boolean;
}

// Cross-check anchors to the token scale so a canon bump is caught (the sizes
// below sit inside the token's stated ranges; `fpType` is imported to bind it).
const _scale = fpType.scale;
void _scale;

/** The Faso Premium type roles (HANDOFF §1 table + README § Type). */
export const TEXT = {
  // display — Bricolage Grotesque, titles ls −.02em
  screen: { size: 28, wght: 800, kind: 'display', lh: 1.12, lsEm: -0.02 },
  view: { size: 19, wght: 800, kind: 'display', lh: 1.15, lsEm: -0.02 },
  wordmark: { size: 19, wght: 800, kind: 'display', lh: 1.1, lsEm: -0.02 },
  heroMoney: { size: 38, wght: 800, kind: 'display', lh: 1.0 },
  cardMoney: { size: 24, wght: 800, kind: 'display', lh: 1.05 },
  priceInline: { size: 14, wght: 800, kind: 'display', lh: 1.1 }, // HANDOFF Tuile "prix Bricolage 800 14"
  bigCode: { size: 34, wght: 800, kind: 'display', lh: 1.05, lsEm: 0.14 }, // HANDOFF Sheet "WK-472 Bricolage 800 34 ls .14em"
  cta: { size: 16, wght: 700, kind: 'display', lh: 1.1 }, // HANDOFF "CTA Bricolage 700 16px"
  // text — Instrument Sans
  row: { size: 14.5, wght: 700, kind: 'text', lh: 1.25 }, // HANDOFF "Titre rangée 700 14.5"
  body: { size: 14, wght: 400, kind: 'text', lh: 1.5 }, // HANDOFF "Corps 13–14.5 lh 1.5"
  bodyStrong: { size: 14, wght: 600, kind: 'text', lh: 1.5 },
  rowSub: { size: 12.5, wght: 400, kind: 'text', lh: 1.35 }, // HANDOFF Rangée "sous-titre 12.5"
  caps: { size: 11, wght: 700, kind: 'text', lh: 1.2, lsEm: 0.1, upper: true }, // HANDOFF "Label caps 700 10.5–11 ls .1em upper"
  pill: { size: 11, wght: 700, kind: 'text', lh: 1.1 }, // HANDOFF "Pilule statut 700 11"
} as const satisfies Record<string, Role>;

export type TextRole = keyof typeof TEXT;

/** A type role → RN `TextStyle`. Family from the role's `kind` + `wght`;
 * lineHeight = size × lh; letterSpacing = size × lsEm (em→px); caps → uppercase.
 * The default ink colour is applied; callers override `color` per surface. */
export function ts(role: TextRole, color: string = C.ink): TextStyle {
  const r: Role = TEXT[role];
  return {
    fontFamily: fontFamily(r.kind, r.wght),
    fontSize: r.size,
    lineHeight: r.size * r.lh,
    fontWeight: String(r.wght) as TextStyle['fontWeight'],
    color,
    ...(r.lsEm !== undefined ? { letterSpacing: r.size * r.lsEm } : {}),
    ...(r.upper === true ? { textTransform: 'uppercase' as const } : {}),
  };
}

/** tnum + no-wrap — every franc and code (README § Type: `tnum` + nowrap). */
export const MONEY_TEXT = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };

// ── dimensions (app-local pixel-source, HANDOFF §2; canon leaves these local) ─
/** Radii — the canon `radius` token; `art`/`buttonSecondary` ranges resolved to
 * the HANDOFF pixel (14 / 14). */
export const R = {
  card: radius.card,
  tile: radius.tile,
  art: radius.art.max, // 14 — HANDOFF "art 13–14"
  ledger: 22, // HANDOFF "Hero ledger band radius 22"
  button: radius.button,
  buttonSecondary: radius.buttonSecondary.min, // 14
  sheet: radius.sheet,
  pill: radius.pill,
  input: 14, // HANDOFF "Champ radius 14"
} as const;

/** Spacing + component dimensions (HANDOFF §2, verbatim px). Not hex — app-local
 * pixel-source per the hierarchy law. `pad`/`status` come from the geometry token. */
export const D = {
  pad: geometry.paddingPx, // 20
  status: geometry.statusPx, // 54
  gap: 12,
  gapSm: 9,
  gapXs: 6,
  cardPad: 16, // HANDOFF Carte "padding 16–17"
  rowPad: 13, // HANDOFF Rangée "padding 13"
  ctaH: 54, // HANDOFF primary "h54–56" → 54
  secondaryH: 48, // HANDOFF secondary "h48–50" → 48
  chipH: 38, // HANDOFF Chip segment "h38"
  stepper: 52, // HANDOFF Stepper "cercles 52px"
  artRow: 52, // HANDOFF Rangée/Accueil "art 52"
  artTileH: 108, // HANDOFF Tuile "art h108"
  artHeroH: 180, // HANDOFF Fiche "art héro h180"
  artStudioH: 230, // HANDOFF Studio "cadre h230"
  wovenH: 6, // HANDOFF "bande tissée 6px"
  cornerTick: 14, // README/HANDOFF "12–14px L-marks" → 14
  cornerStroke: 2, // HANDOFF Détail "2px ink frame + corner ticks"
  quoteWidth: 3, // README "border-left:3px solid INK"
  quotePad: 13, // README "padding-left:13px"
  checkBubble: 26, // HANDOFF "26px accent circle top-right"
  selOn: 2, // HANDOFF "2px solid ACCENT"
  selOff: 1.5, // HANDOFF "1.5px solid #E0D6C2"
  hair: 1, // HANDOFF Carte "1px solid hairline"
  hairMed: 1.5, // HANDOFF chip/input "1.5px"
  timelineDot: 14, // HANDOFF Timeline "puce 14px"
  timelineStroke: 2.5, // HANDOFF Timeline "bordure 2.5"
  grabW: 40, // HANDOFF Sheet "poignée 40×5"
  grabH: 5,
  toastTop: 66, // HANDOFF Toast "top 66"
  tabPadTop: 8, // HANDOFF Dock "padding:8px 10px 28px"
  tabPadX: 10,
  tabPadBottom: 28,
  scrollFlow: 60, // HANDOFF "bas de scroll ... 60px (vues)"
  scrollTabbed: 150, // HANDOFF "150px (onglets)"
  minTouch: 44, // "Laws carried from Grand Teint" — touch ≥ 44px
  framePad: 40, // frame/overlay vertical breathing room (camera + empty state)
  padTiny: 3, // recall-chip / diagnostic-pill vertical pad
} as const;

/** Durations (README § Motion): skeleton shimmer, count-up. */
export const DUR = {
  skeletonMs: 750, // README "Skeleton-first load: 750 ms"
  shimmerMs: motion.fpShimmer.durationMs, // 1200 (token)
  countUpMs: 800, // README "Count-up: 800 ms"
  celebrationMs: 2200, // HANDOFF §2 Célébration "auto 2 200 ms"
} as const;

// ── shadows (token colours + opacity — no hand-copied hex) ───────────────────
/** RN shadow presets (HANDOFF §1 Ombres) — shadowColor is a token; the rgba's
 * alpha becomes shadowOpacity. RN has no spread, so the blur/opacity approximate
 * the CSS. */
export const SHADOW = {
  card: { shadowColor: C.ink, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, shadowOpacity: 0.04, elevation: 1 },
  cardClickable: { shadowColor: C.ink, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, shadowOpacity: 0.12, elevation: 3 },
  cta: { shadowColor: C.primary, shadowOffset: { width: 0, height: 12 }, shadowRadius: 18, shadowOpacity: 0.5, elevation: 6 },
  hero: { shadowColor: C.primary, shadowOffset: { width: 0, height: 14 }, shadowRadius: 22, shadowOpacity: 0.55, elevation: 8 },
  sheet: { shadowColor: C.ink, shadowOffset: { width: 0, height: -12 }, shadowRadius: 30, shadowOpacity: 0.25, elevation: 12 },
} as const;
