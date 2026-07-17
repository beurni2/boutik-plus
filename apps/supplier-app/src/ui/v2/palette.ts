/**
 * WO-FP-PIXEL — the V2 palette (HANDOFF V2 §1.1, exhaustive), token-fidelity
 * architecture preserved:
 *   • every token the PINNED package already carries is DERIVED from it
 *     (@platform/ui-tokens sharedColour/boutikColour — never re-hexed);
 *   • every V2-only tone is DOCKETED below, hex transcribed VERBATIM from
 *     `design-reference/pixel-source-v2/Boutik Plus - HANDOFF V2.md` §1.1 and
 *     cross-checked against the Phase-0 computed census
 *     (_review/WO-FP-PIXEL/values-census.json — zero unexplained colors).
 * The Phase-0 values table is the authority; prose loses on conflict.
 */
import { sharedColour, boutikColour } from '@platform/ui-tokens';

/** V2-only tones — absent from the pinned package; source = HANDOFF V2 §1.1. */
export const V2_COLOUR_DOCKET = [
  { key: 'sheet', value: '#FCF9F2', where: '§1.1 `sheet` — fond bottom sheets; dock à 88 %' },
  { key: 'toastCheck', value: '#8FD4B4', where: '§1.1 `toastCheck` — coche verte des toasts' },
  { key: 'dangerDeep', value: '#7E1A15', where: '§1.1 `dangerDeep` — encre bannières danger pleines' },
  { key: 'divider', value: '#F3EDDE', where: '§1.1 `divider` — séparateurs internes (meters, processing)' },
  { key: 'dockBorder', value: '#EBE2D0', where: '§1.1 `dockBorder` — border-top du dock' },
  { key: 'grabber', value: '#DDD2BC', where: '§1.1 `grabber` — poignée sheet; border dashed état vide' },
  { key: 'barIdle', value: '#E8DFCC', where: '§1.1 `barIdle` — connecteurs timeline futurs' },
  { key: 'dashDemo', value: '#C9BDA3', where: '§1.1 `dashDemo` — border dashed du bouton [DEMO]' },
  { key: 'toastFg', value: '#F6F0E4', where: '§1.1 `toastFg` — texte toast' },
  { key: 'skeleton', value: '#ECE4D4', where: '§1.1 `skeleton` — phase sombre du shimmer' },
  { key: 'creamCaption', value: '#FFF6E8', where: '§1.1 `creamCaption` — légende du viseur Studio' },
  { key: 'scrim', value: 'rgba(24,18,11,.45)', where: '§1.1 `scrim` — voile derrière sheets' },
  { key: 'celebScrim', value: 'rgba(7,59,46,.95)', where: '§1.1 `celebScrim` — voile célébration' },
  { key: 'pauseBadge', value: 'rgba(28,23,16,.72)', where: '§1.1 `pauseBadge` — badge « EN PAUSE » (flow-state, PHASE0-DELTAS Δ2)' },
  { key: 'dock88', value: 'rgba(252,249,242,.88)', where: '§1.1 `sheet` note — dock à 88 %' },
] as const;

const D = Object.fromEntries(V2_COLOUR_DOCKET.map((e) => [e.key, e.value])) as {
  [K in (typeof V2_COLOUR_DOCKET)[number]['key']]: string;
};

/** The §1.1 palette under its HANDOFF names. Derived-or-docketed, never re-hexed. */
export const P = {
  // derived from the pinned package (identical values, canon names differ)
  bg: sharedColour.paper, //            #F4EFE6
  surface: sharedColour.card, //        #FFFFFF
  ink: sharedColour.ink, //             #1C1710
  inkSoft: sharedColour.body, //        #4A3F33
  sub: sharedColour.sub, //             #6F6355
  faint: sharedColour.disabledCtaFg, // #8A7D6B (= §1.1 faint = disabledFg)
  green: boutikColour.primary, //       #0B5B47
  greenDeep: boutikColour.deep, //      #073B2E
  greenSoft: boutikColour.soft, //      #E4EFE9
  successBg: sharedColour.okBg, //      #DFEEE3
  successFg: sharedColour.okFg, //      #14603A
  warnBg: sharedColour.warnBg, //       #F6E9C8
  warnFg: sharedColour.warnFgAlt, //    #7A5104
  warnDeep: sharedColour.warnFg, //     #5F4403
  dangerBg: sharedColour.dangerBg, //   #F8E1DE
  dangerFg: sharedColour.dangerFg, //   #8C1D18
  gold: boutikColour.gold, //           #C89A3F
  borderCard: sharedColour.hairline, // #EDE4D3
  borderCtl: sharedColour.hairlineStrong, // #E5DCC9
  disabledBg: sharedColour.disabledCta, //   #DDD5C3
  disabledFg: sharedColour.disabledCtaFg, // #8A7D6B
  dotIdle: sharedColour.hairlineInput, //    #E0D6C2
  neutralPill: sharedColour.mutedBg, //      #EFE8DA
  cream: boutikColour.onPrimary, //          #F6F1E7
  // V2-only, docketed above
  sheet: D.sheet,
  toastCheck: D.toastCheck,
  dangerDeep: D.dangerDeep,
  divider: D.divider,
  dockBorder: D.dockBorder,
  grabber: D.grabber,
  barIdle: D.barIdle,
  dashDemo: D.dashDemo,
  toastFg: D.toastFg,
  skeleton: D.skeleton,
  creamCaption: D.creamCaption,
  scrim: D.scrim,
  celebScrim: D.celebScrim,
  pauseBadge: D.pauseBadge,
  dock88: D.dock88,
} as const;

/** §1.4 shadow tokens — VERBATIM CSS strings (RN ≥0.76 boxShadow carries spread
 * exactly; the web harness renders the same string). Source: HANDOFF V2 §1.4. */
export const SH = {
  btnPrimary: '0 12px 26px -10px rgba(11,91,71,0.5)',
  btnPrimaryPressed: '0 6px 14px -8px rgba(11,91,71,0.5)',
  card: '0 1px 2px rgba(28,22,15,0.04)',
  cardFloat: '0 1px 2px rgba(28,22,15,0.04), 0 10px 30px -16px rgba(28,22,15,0.14)',
  chipHdr: '0 1px 2px rgba(28,22,15,0.05)',
} as const;

/** §1.1 product-tile gradients (2-stop, 140deg) — VERBATIM pairs. */
export const TILE_GRADIENT = {
  p1: ['#B65C2E', '#7A3014'], // Robe brodée bogolan (+ viseur lumière OK)
  p3: ['#8A4F1D', '#5C3210'], // Sac cuir artisanal
  p7: ['#A31D4E', '#5E0F2C'], // Foulard Faso Dan Fani
  p8: ['#3E4B8C', '#232B54'], // Chemise Faso Dan Fani
  nouveau: ['#0B5B47', '#073B2E'], // produit publié via l'assistant
  studioOriginal: ['#8A5A3A', '#5A3A22'],
  studioLowLight: ['#3A3128', '#241E17'],
} as const;
