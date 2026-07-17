/**
 * WO-FP-PIXEL — the V2 token surface beyond the palette: §1.2 type roles,
 * §1.3 geometry, §1.4 shadows (exhaustive), §1.5 texture periods, §1.6 z,
 * §1.7 pressed scales. Values transcribed VERBATIM from HANDOFF V2 and
 * cross-checked against the Phase-0 census (sizes/ls resolve exactly).
 * lh '—' in source → FROZEN 1.2 (§1.2/§9.2) at the use sites.
 */

/** §1.2 — role: [family, weight, size, letterSpacing(em)?, lineHeight?] */
export type TypeRole = { f: 'BG' | 'IS'; w: 400 | 500 | 600 | 700 | 800; s: number; lsEm?: number; lh?: number; upper?: true };
export const T = {
  DisplayMoney: { f: 'BG', w: 800, s: 38, lsEm: -0.02 },
  CelebAmount: { f: 'BG', w: 800, s: 34, lsEm: -0.02 },
  ChallengeCode: { f: 'BG', w: 800, s: 34, lsEm: 0.14 },
  PageTitle: { f: 'BG', w: 800, s: 28, lsEm: -0.02 }, // Accueil greeting: lh 1.1 at site
  StepTitle: { f: 'BG', w: 800, s: 26, lsEm: -0.02 },
  StatValue: { f: 'BG', w: 800, s: 24, lsEm: -0.01 },
  NetXL: { f: 'BG', w: 800, s: 22 },
  NetL: { f: 'BG', w: 800, s: 20 },
  SheetTitle: { f: 'BG', w: 800, s: 20, lsEm: -0.01 },
  StudioTitle: { f: 'BG', w: 700, s: 20 },
  ScreenTitle: { f: 'BG', w: 800, s: 19, lsEm: -0.02 }, // détail commande: −.01em at site
  StepperValue: { f: 'BG', w: 800, s: 19 },
  MoneySub: { f: 'BG', w: 800, s: 17 },
  CardHeadline: { f: 'BG', w: 700, s: 16 },
  RecapNet: { f: 'BG', w: 800, s: 16 },
  BtnL: { f: 'BG', w: 700, s: 16 },
  BtnM: { f: 'BG', w: 700, s: 15 }, // 15–15.5: succès inscription 15.5 at site
  MoneyRowNet: { f: 'BG', w: 800, s: 15.5 },
  RowMonogram: { f: 'BG', w: 800, s: 15, lsEm: 0.02 },
  RelevTotal: { f: 'BG', w: 800, s: 15 },
  ProduitPrix: { f: 'BG', w: 800, s: 14 },
  EchTime: { f: 'BG', w: 800, s: 12.5 },
  Body: { f: 'IS', w: 400, s: 14, lh: 1.55 }, // 14–14.5 · lh 1.55–1.8 per screen at site
  RowTitle: { f: 'IS', w: 700, s: 14.5 },
  CardTitle: { f: 'IS', w: 700, s: 15 },
  BannerTxt: { f: 'IS', w: 400, s: 12.5, lh: 1.55 }, // 12.5–13 · lh 1.5–1.65 at site
  SubLine: { f: 'IS', w: 400, s: 12.5, lh: 1.4 }, // 12.5–13.5 · 1.4–1.55 at site
  TileName: { f: 'IS', w: 700, s: 13.5, lsEm: -0.01, lh: 1.25 },
  Timeline: { f: 'IS', w: 500, s: 13.5, lh: 1.45 }, // 700 when done/current
  ChipTxt: { f: 'IS', w: 600, s: 13 }, // segments 13 · catégories 14 at site
  ToastTxt: { f: 'IS', w: 600, s: 13 },
  GhostS: { f: 'IS', w: 600, s: 13.5 }, // 13–13.5 at site
  HistTxt: { f: 'IS', w: 400, s: 12.5, lh: 1.5 }, // timestamp IS600 tnum at site
  Caption: { f: 'IS', w: 400, s: 11.5, lh: 1.4 }, // 11.5–12 at site
  PillTxt: { f: 'IS', w: 700, s: 11 }, // 10.5 Argent rows · 11.5 fiche chips · 10 tile badges
  Overline: { f: 'IS', w: 700, s: 11, lsEm: 0.1, upper: true }, // 10.5 intra-carte at site
  CelebLabel: { f: 'IS', w: 700, s: 11, lsEm: 0.12, upper: true },
  TabLabel: { f: 'IS', w: 700, s: 10.5, lsEm: 0.01 },
  Input: { f: 'IS', w: 400, s: 16 },
} as const satisfies Record<string, TypeRole>;

/** §1.3 — geometry (frame · paddings · gaps · radii · hit targets). */
export const GEO = {
  frame: { w: 402, h: 874 },
  statusZone: 54,
  stripeH: 6,
  stripeCycle: [18, 6, 8, 6] as const, // vert · crème · or · crème = 38px period
  screenPad: { side: 20, top: 16, bottomTabs: 150, bottomStacked: 60 },
  wizardContentPad: { top: 18, side: 20, bottom: 120 },
  wizardFooterPad: { top: 14, side: 20, bottom: 40 },
  sheetPad: { top: 10, side: 22, bottom: 44 },
  gap: { listRow: 10, releves: 9, grid: 12, chips: 8, dots: 6 },
  r: {
    sheetTop: 30, hero: 22, cardL: 20, row: 18, banner: 18, encartCode: 18,
    bannerS: 16, stepperValue: 16, ctaL: 16, avantApresFrame: 16,
    ctaM: 14, input: 14, ghost: 14, iconTile: 14, iconTileOrder: 13, dockItem: 14,
    echTime: 10, pill: 99,
  },
  hit: { min: 38, back: 40, stepper: 52, dockItem: 51 },
} as const;

/** §1.4 — shadows, exhaustive (CSS strings; RN boxShadow carries spread). */
export const SHADOW = {
  cardSm: '0 1px 2px rgba(28,22,15,0.04)',
  cardLg: '0 1px 2px rgba(28,22,15,0.04), 0 10px 30px -16px rgba(28,22,15,0.14)',
  chipHdr: '0 1px 2px rgba(28,22,15,0.05)',
  heroImg: '0 16px 36px -16px rgba(28,22,15,0.35)',
  heroStudio: '0 16px 36px -16px rgba(28,22,15,0.4)',
  moneyHero: '0 16px 36px -14px rgba(11,91,71,0.55)',
  btnPrimary: '0 12px 26px -10px rgba(11,91,71,0.5)',
  btnPrimaryPressed: '0 6px 14px -8px rgba(11,91,71,0.5)',
  sheet: '0 -18px 50px rgba(24,18,11,0.25)',
  toast: '0 12px 30px rgba(0,0,0,0.35)',
  trustActive: '0 12px 30px -14px rgba(11,91,71,0.35)',
  celebCircle: '0 18px 40px -12px rgba(11,91,71,0.55)',
  framedPhoto: '0 6px 16px rgba(28,22,15,0.18)',
} as const;

/** §1.5 — glyph drop-shadows + texture periods. */
export const GLYPH_SHADOW = {
  sm: { color: 'rgba(0,0,0,0.25)', y: 3, blur: 6 }, // 22–25px glyphs
  md: { color: 'rgba(0,0,0,0.25)', y: 4, blur: 8 }, // 38–44px
  lg: { color: 'rgba(0,0,0,0.3)', y: 6, blur: 12 }, // 68–72px
} as const;
export const TEXTURE = {
  weaveS: { deg: 135, on: 'rgba(255,255,255,0.07)', a: 8, b: 20 }, // icon tiles 48–56
  weaveM: { deg: 135, on: 'rgba(255,255,255,0.07)', a: 10, b: 26 }, // images 96–230 (viseur .06)
  moneyHero: { deg: 135, on: 'rgba(255,255,255,0.05)', a: 12, b: 30 },
  celebDash: { w: 132, h: 6, on: 12, off: 8 }, // gold 0-12, transparent 12-20
  shimmer: { size: 640 },
} as const;

/** §1.6 — stacking. */
export const Z = { dock: 30, sheet: 60, toast: 80, celebration: 90 } as const;

/** §1.7 — pressed scales (.15s; Accueil CTA also swaps to btnPrimaryPressed). */
export const PRESSED = {
  ctaFull: 0.98, rowTodoOrder: 0.98, tileHalfBtn: 0.97, chipSegment: 0.96,
  chipCategory: 0.95, dockItem: 0.94, back: 0.92, stepper: 0.9,
} as const;
