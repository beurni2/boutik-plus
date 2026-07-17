import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, afterAll } from 'vitest';
import { C07_STYLES } from '../src/ui/v2/components/C07.styles';
import { C02_CYCLE, C02_STYLES } from '../src/ui/v2/components/C02.styles';
import { FP_FACES } from '../src/ui/fonts';

/**
 * WO-FP-PIXEL — the PRIMARY fidelity gate (founder order): property-for-property
 * comparison of the V2 style DATA against the Phase-0 values table
 * (_review/WO-FP-PIXEL/values-table.json — getComputedStyle ground truth).
 * Deterministic, no render, no server. Empty diff == value-pass; this is what
 * catches recolors. The visual diff is a per-SCREEN composition check only.
 *
 * Normalizers (RN → computed CSS):
 *   number n          → `${n}px` (dimensions, radius, gap, fontSize)
 *   '#RRGGBB'         → 'rgb(r, g, b)'  ·  rgba strings pass through
 *   fontFamily face   → (web family, weight) via FP_FACES identity
 *   boxShadow string  → canonical {color,x,y,blur,spread} (computed puts color first)
 *   FROZEN rulings (§9.x) → recorded as frozen-pass with the ruling cited,
 *   never silently skipped.
 */

const appDir = join(import.meta.dirname, '..');
const TABLE = JSON.parse(readFileSync(join(appDir, '../../_review/WO-FP-PIXEL/values-table.json'), 'utf8')) as {
  screens: Record<string, { elements: { path: string; tag: string; text?: string; box: { x: number; y: number; w: number; h: number }; props: Record<string, string> }[] }>;
};

const px = (n: number) => `${n}px`;
const hexToRgb = (v: string) => {
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  // canonicalize rgba(): spacing + leading-zero alpha ('.88' → '0.88')
  const m = v.match(/^rgba?\(([^)]*)\)$/);
  if (!m) return v;
  const parts = m[1]!.split(',').map((t) => {
    const x = t.trim();
    return x.startsWith('.') ? `0${x}` : x;
  });
  return `${parts.length === 4 ? 'rgba' : 'rgb'}(${parts.join(', ')})`;
};
const normShadow = (s: string) => {
  // Multi-shadow-safe canonical form: mask colour groups, split shadows on the
  // TOP-LEVEL commas (the only true boundary — a CSS-order shadow may carry
  // only 3 lengths), then per shadow: one colour + lengths padded to 4
  // (computed puts colour first; CSS-order puts lengths first; bare 0 → 0px).
  const colors: string[] = [];
  const masked = s.replace(/rgba?\([^)]*\)/g, (m) => {
    colors.push(m);
    return `@${colors.length - 1}@`;
  });
  return masked
    .split(',')
    .map((part) => {
      const ci = part.match(/@(\d+)@/);
      const color = ci ? hexToRgb(colors[+ci[1]!]!) : '';
      const lens = (part.replace(/@\d+@/g, '').match(/-?[\d.]+(?:px)?/g) ?? [])
        .map((t) => (t.endsWith('px') ? t : `${t}px`));
      while (lens.length < 4) lens.push('0px');
      return `${color.replace(/\s+/g, '')}|${lens.join('|')}`;
    })
    .sort()
    .join(' + ');
};
const faceOf = (rnFamily: string) => {
  const f = FP_FACES.find((x) => x.family === rnFamily);
  if (!f) throw new Error(`unknown face ${rnFamily}`);
  return { webFamily: f.kind === 'display' ? 'Bricolage Grotesque' : 'Instrument Sans', weight: String(f.wght) };
};

type Row = { case: string; el: string; prop: string; expected: string; built: string; verdict: 'pass' | `FROZEN(${string})` | 'MISMATCH' };
const rows: Row[] = [];
const check = (caseId: string, elName: string, prop: string, expected: string | undefined, built: string, frozen?: string) => {
  const verdict: Row['verdict'] = frozen !== undefined ? (`FROZEN(${frozen})` as Row['verdict']) : expected === built ? 'pass' : 'MISMATCH';
  rows.push({ case: caseId, el: elName, prop, expected: expected ?? '(absent)', built, verdict });
  if (frozen === undefined) expect(built, `${caseId}/${elName}/${prop}`).toBe(expected);
};

// ─── C07 BtnPrimary ↔ S02 « Ajouter un produit » ──────────────────────────────
describe('PROPERTY DIFF — C07 BtnPrimary vs values-table S02', () => {
  const btn = TABLE.screens['S02']!.elements.find((e) => e.text === 'Ajouter un produit' && e.tag === 'button')!;

  it('container properties equal the extracted computed values', () => {
    const p = btn.props;
    const s = C07_STYLES.btn;
    check('C07', 'btn', 'background-color', p['background-color'], hexToRgb(s.backgroundColor));
    check('C07', 'btn', 'height', p['height'], px(s.height));
    for (const corner of ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'] as const)
      check('C07', 'btn', corner, p[corner], px(s.borderRadius));
    check('C07', 'btn', 'display+direction', `${p['display']}/${p['flex-direction']}`, `flex/${s.flexDirection}`);
    check('C07', 'btn', 'align-items', p['align-items'], s.alignItems);
    check('C07', 'btn', 'justify-content', p['justify-content'], s.justifyContent);
    check('C07', 'btn', 'gap', p['gap'], px(s.gap));
    check('C07', 'btn', 'border-width', p['border-top-width'], '0px');
    check('C07', 'btn', 'box-shadow', normShadow(p['box-shadow'] ?? ''), normShadow(C07_STYLES.btnShadow.boxShadow));
  });

  it('label typography equals the extracted computed values (font identity via FP_FACES)', () => {
    const p = btn.props;
    const l = C07_STYLES.label;
    const face = faceOf(l.fontFamily);
    check('C07', 'label', 'font-family', ((p['font-family'] ?? '').split(',')[0] ?? '').replace(/"/g, '').trim(), face.webFamily);
    check('C07', 'label', 'font-weight', p['font-weight'], face.weight);
    check('C07', 'label', 'font-weight(style)', p['font-weight'], String(l.fontWeight));
    check('C07', 'label', 'font-size', p['font-size'], px(l.fontSize));
    check('C07', 'label', 'color', p['color'], hexToRgb(l.color));
    // §9.2: source lh 'normal' → FROZEN 1.2 (19.2px) — recorded, not a mismatch
    check('C07', 'label', 'line-height', p['line-height'], px(l.lineHeight), '§9.2');
    expect(p['line-height']).toBe('normal'); // the frozen ruling's premise stays true
  });
});

// ─── C02 StripeTissée ↔ S02 stripe ────────────────────────────────────────────
describe('PROPERTY DIFF — C02 StripeTissée vs values-table S02', () => {
  const stripe = TABLE.screens['S02']!.elements.find((e) => e.box.h === 6 && e.box.y === 54)!;

  it('band box + cycle stops equal the extracted repeating-gradient', () => {
    check('C02', 'band', 'height', px(stripe.box.h), px(C02_STYLES.band.height));
    // the computed gradient: green 0-18, bg 18-24, gold 24-32, bg 32-38
    const g = stripe.props['background-image'] ?? '';
    const stops = [...g.matchAll(/rgb\([^)]*\) (\d+)px, rgb\([^)]*\) (\d+)px/g)].map((m) => [+(m[1] ?? 0), +(m[2] ?? 0)]);
    const colors = [...g.matchAll(/rgb\([^)]*\)/g)].map((m) => m[0]);
    // cycle widths from the gradient stop pairs
    const widths = stops.map(([a, b]) => (b ?? 0) - (a ?? 0));
    check('C02', 'cycle', 'segment-widths', widths.join(','), C02_CYCLE.map((s) => s.w).join(','));
    check('C02', 'cycle', 'segment-colors', [colors[0], colors[2], colors[4], colors[6]].join('|'), C02_CYCLE.map((s) => hexToRgb(s.c)).join('|'));
  });
});

// ─── batch: the §2 component library vs the table (data-driven) ──────────────
import { C03, C05, C06, C14, C18, C20, C25, C26, C44, STATUS_PILL } from '../src/ui/v2/styles';
import { formatF } from '../src/v2/money';

type El = { path: string; tag: string; text?: string; box: { x: number; y: number; w: number; h: number }; props: Record<string, string> };
const find = (sid: string, pred: (e: El) => boolean): El => {
  const el = TABLE.screens[sid]!.elements.find(pred);
  if (!el) throw new Error(`table element not found on ${sid}`);
  return el;
};

describe('PROPERTY DIFF — component library batch vs values-table', () => {
  it('C18 StatCard: card box + overline + value + legend (S02 « En attente »)', () => {
    const card = find('S02', (e) => e.props['padding-top'] === '16px' && e.props['border-top-left-radius'] === '20px');
    check('C18', 'card', 'padding', card.props['padding-top'], px(C18.card.padding));
    check('C18', 'card', 'radius', card.props['border-top-left-radius'], px(C18.card.borderRadius));
    check('C18', 'card', 'bg', card.props['background-color'], hexToRgb(C18.card.backgroundColor));
    check('C18', 'card', 'border', card.props['border-top-width'], px(C18.card.borderWidth));
    check('C18', 'card', 'shadow', normShadow(card.props['box-shadow'] ?? ''), normShadow(C18.card.boxShadow));
    const ov = find('S02', (e) => e.text === 'En attente');
    check('C18', 'overline', 'font-size', ov.props['font-size'], px(C05.card.fontSize));
    check('C18', 'overline', 'letter-spacing', ov.props['letter-spacing'], px(C05.card.letterSpacing));
    check('C18', 'overline', 'color', ov.props['color'], hexToRgb(C05.card.color));
    check('C18', 'overline', 'transform', ov.props['text-transform'], C05.card.textTransform ?? '');
  });

  it('C20 MoneyHero: green card r22 + moneyHero shadow + overline .75 (S32)', () => {
    const hero = find('S32', (e) => e.props['background-color'] === 'rgb(11, 91, 71)' && e.props['padding-top'] === '20px');
    check('C20', 'card', 'padding', hero.props['padding-top'], px(C20.card.padding));
    check('C20', 'card', 'radius', hero.props['border-top-left-radius'], px(C20.card.borderRadius));
    check('C20', 'card', 'bg', hero.props['background-color'], hexToRgb(C20.card.backgroundColor));
    check('C20', 'card', 'shadow', normShadow(hero.props['box-shadow'] ?? ''), normShadow(C20.card.boxShadow));
    const ov = find('S32', (e) => e.text === 'En attente' && e.props['opacity'] === '0.75');
    check('C20', 'overline', 'font-size', ov.props['font-size'], px(C20.overline.fontSize));
    check('C20', 'overline', 'opacity', ov.props['opacity'], String(C20.overline.opacity));
    check('C20', 'overline', 'color', ov.props['color'], hexToRgb(C20.overline.color));
  });

  it('C44 HeaderBoutique: monogram 40×40 green, RowMonogram 15/+.02 (S02 « BW »)', () => {
    const m = find('S02', (e) => e.text === 'BW');
    check('C44', 'monogram', 'width', m.props['width'], px(C44.monogram.width));
    check('C44', 'monogram', 'height', m.props['height'], px(C44.monogram.height));
    check('C44', 'monogram', 'radius', m.props['border-top-left-radius'], px(C44.monogram.borderRadius));
    check('C44', 'monogram', 'bg', m.props['background-color'], hexToRgb(C44.monogram.backgroundColor));
    check('C44', 'monogram', 'font-size', m.props['font-size'], px(C44.monogramTxt.fontSize));
    check('C44', 'monogram', 'ls', m.props['letter-spacing'], px(C44.monogramTxt.letterSpacing ?? 0));
    check('C44', 'monogram', 'font', (m.props['font-family'] ?? '').includes('Bricolage') ? 'BG' : '?', C44.monogramTxt.fontFamily.includes('Bricolage') ? 'BG' : '?');
  });

  it('C06 StatusPill: FUNDED « À préparer » warnBg/warnFg 11px 5/10 r99 (S07)', () => {
    const pill = find('S07', (e) => e.text === 'À préparer');
    expect(STATUS_PILL['FUNDED']!.label).toBe('À préparer');
    check('C06', 'pill', 'font-size', pill.props['font-size'], px(C06.pill.fontSize));
    check('C06', 'pill', 'pad-v', pill.props['padding-top'], px(C06.pill.paddingVertical));
    check('C06', 'pill', 'pad-h', pill.props['padding-left'], px(C06.pill.paddingHorizontal));
    check('C06', 'pill', 'radius', pill.props['border-top-left-radius'], px(C06.pill.borderRadius));
    check('C06', 'pill', 'bg', pill.props['background-color'], hexToRgb(STATUS_PILL['FUNDED']!.bg));
    check('C06', 'pill', 'fg', pill.props['color'], hexToRgb(STATUS_PILL['FUNDED']!.fg));
  });

  it('C25 RowReleve: week 13.5/700 ink (S32 « Sem. 28 »)', () => {
    const wk = find('S32', (e) => (e.text ?? '').startsWith('Sem. 28'));
    check('C25', 'week', 'font-size', wk.props['font-size'], px(C25.week.fontSize));
    check('C25', 'week', 'weight', wk.props['font-weight'], C25.week.fontWeight);
    check('C25', 'week', 'color', wk.props['color'], hexToRgb(C25.week.color));
  });

  it('C26 ProductTile: TileName 13.5/700/−.01/1.25 + price BG800/14 greenDeep (S03 p1)', () => {
    const name = find('S03', (e) => e.text === 'Robe brodée bogolan' && e.props['font-size'] === '13.5px');
    check('C26', 'name', 'font-size', name.props['font-size'], px(C26.name.fontSize));
    check('C26', 'name', 'weight', name.props['font-weight'], C26.name.fontWeight);
    check('C26', 'name', 'ls', name.props['letter-spacing'], px(+(13.5 * -0.01).toFixed(3)));
    const price = find('S03', (e) => e.text === formatF(10_000) && e.props['font-size'] === '14px');
    check('C26', 'price', 'color', price.props['color'], hexToRgb(C26.price.color));
    check('C26', 'price', 'font', (price.props['font-family'] ?? '').includes('Bricolage') ? 'BG' : '?', 'BG');
    check('C26', 'price', 'weight', price.props['font-weight'], C26.price.fontWeight);
  });

  it('C03 Dock: bar padding/bg/border + active item soft/deep (S02)', () => {
    const bar = find('S02', (e) => e.props['background-color'] === 'rgba(252, 249, 242, 0.88)');
    check('C03', 'bar', 'pad-top', bar.props['padding-top'], px(C03.bar.paddingTop));
    check('C03', 'bar', 'pad-h', bar.props['padding-left'], px(C03.bar.paddingHorizontal));
    check('C03', 'bar', 'pad-bottom', bar.props['padding-bottom'], px(C03.bar.paddingBottom));
    check('C03', 'bar', 'bg', hexToRgb(bar.props['background-color'] ?? ''), hexToRgb(C03.bar.backgroundColor));
    check('C03', 'bar', 'border-top', `${bar.props['border-top-width']} ${bar.props['border-top-color']}`, `${px(C03.bar.borderTopWidth)} ${hexToRgb(C03.bar.borderTopColor)}`);
    const active = find('S02', (e) => e.text === 'Accueil' && e.props['font-size'] === '10.5px');
    check('C03', 'item', 'active-fg', active.props['color'], hexToRgb(C03.labelActive.color));
  });

  it('C14 ChipVerified: white pill, border ctl, green 13/600, chipHdr shadow (S02)', () => {
    const chip = find('S02', (e) => e.text === 'Vérifié' && e.props['height'] === '38px');
    check('C14', 'chip', 'height', chip.props['height'], px(C14.chip.height));
    check('C14', 'chip', 'radius', chip.props['border-top-left-radius'], px(C14.chip.borderRadius));
    check('C14', 'chip', 'border', `${chip.props['border-top-width']} ${chip.props['border-top-color']}`, `${px(C14.chip.borderWidth)} ${hexToRgb(C14.chip.borderColor)}`);
    check('C14', 'chip', 'bg', chip.props['background-color'], hexToRgb(C14.chip.backgroundColor));
    check('C14', 'chip', 'fg', chip.props['color'], hexToRgb(C14.txt.color));
    check('C14', 'chip', 'font-size', chip.props['font-size'], px(C14.txt.fontSize));
    check('C14', 'chip', 'shadow', normShadow(chip.props['box-shadow'] ?? ''), normShadow(C14.chip.boxShadow));
  });
});

// ─── FINAL PASS (founder order): EVERY C## and S## vs the table ───────────────
// Rows collect WITHOUT throwing so property-diff.json always carries the whole
// table; one closing assertion requires zero MISMATCH rows.
import {
  C04, C08, C09, C10, C11, C12, C13, C15, C16, C17, C19, C21, C22, C24, C27, C28, C29, C30,
  C31, C32, C33, C34, C35, C36, C37, C38, C39, C40, C41, C43, C45, C46, C47, C48,
  S05L, S17L, SCROLL,
} from '../src/ui/v2/styles';
import { GEO } from '../src/ui/v2/tokens';
import { P } from '../src/ui/v2/palette';

const pxr = (n: number) => `${+n.toFixed(3)}px`;
const sweep = (caseId: string, elName: string, prop: string, expected: string | undefined, built: string, frozen?: string) => {
  const verdict: Row['verdict'] = frozen !== undefined ? `FROZEN(${frozen})` : expected === built ? 'pass' : 'MISMATCH';
  rows.push({ case: caseId, el: elName, prop, expected: expected ?? '(absent)', built, verdict });
};
// Chrome snaps fractional CSS border widths to whole device px in USED values
// (getComputedStyle returns used value for border-width at DPR 1): 1.5→1, 2.5→2.
// Built keeps the source CSS declaration (Δ4, same class as PHASE0-DELTAS Δ1).
const sweepBorder = (caseId: string, elName: string, tableVal: string | undefined, cssPx: number) => {
  const built = px(cssPx);
  if (tableVal === built) sweep(caseId, elName, 'border-width', tableVal, built);
  else if (tableVal === px(Math.floor(cssPx))) sweep(caseId, elName, 'border-width', tableVal, built, 'Δ4 border-snap: CSS declares the fraction; DPR-1 used value floors it');
  else sweep(caseId, elName, 'border-width', tableVal, built);
};
const qe = (sid: string, pred: (e: El) => boolean): El | undefined => TABLE.screens[sid]?.elements.find(pred);
const pr = (el: El | undefined, prop: string): string | undefined => el?.props[prop];
const missing = (caseId: string, elName: string) => rows.push({ case: caseId, el: elName, prop: 'anchor', expected: '(table element)', built: 'ANCHOR NOT FOUND', verdict: 'MISMATCH' });

const SRC = {
  screens1: readFileSync(join(appDir, 'src/v2/screens1.tsx'), 'utf8'),
  screens2: readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8'),
};
const srcHas = (caseId: string, file: keyof typeof SRC, needle: string) =>
  sweep(caseId, file, `composition-string «${needle.slice(0, 32)}»`, 'present', SRC[file].includes(needle) ? 'present' : 'ABSENT');

describe('FINAL PASS — component library sweep (every C##)', () => {
  it('C01 StatusZone: 54px zone above the stripe', () => {
    const zone = qe('S02', (e) => e.box.y === 0 && e.box.h === 54 && e.box.w === 402);
    if (!zone) return missing('C01', 'zone');
    sweep('C01', 'zone', 'height', `${zone.box.h}px`, px(GEO.statusZone));
    sweep('C01', 'zone', 'frame-width', `${zone.box.w}px`, px(GEO.frame.w));
  });

  it('C04 PageTitle (S03 « Produits »)', () => {
    const el = qe('S03', (e) => e.text === 'Produits');
    if (!el) return missing('C04', 'title');
    sweep('C04', 'title', 'font-size', pr(el, 'font-size'), px(C04.title.fontSize));
    sweep('C04', 'title', 'font-weight', pr(el, 'font-weight'), String(C04.title.fontWeight));
    sweep('C04', 'title', 'letter-spacing', pr(el, 'letter-spacing'), pxr(C04.title.letterSpacing ?? 0));
    sweep('C04', 'title', 'color', pr(el, 'color'), hexToRgb(C04.title.color));
    sweep('C04', 'title', 'font-family', ((pr(el, 'font-family') ?? '').split(',')[0] ?? '').replace(/"/g, '').trim(), faceOf(C04.title.fontFamily).webFamily);
  });

  it('C05 Overline screen level (S02 « À faire maintenant »)', () => {
    const el = qe('S02', (e) => e.text === 'À faire maintenant');
    if (!el) return missing('C05', 'screen');
    sweep('C05', 'screen', 'font-size', pr(el, 'font-size'), px(C05.screen.fontSize));
    sweep('C05', 'screen', 'font-weight', pr(el, 'font-weight'), String(C05.screen.fontWeight));
    sweep('C05', 'screen', 'letter-spacing', pr(el, 'letter-spacing'), pxr(C05.screen.letterSpacing ?? 0));
    sweep('C05', 'screen', 'text-transform', pr(el, 'text-transform'), C05.screen.textTransform ?? '');
    sweep('C05', 'screen', 'color', pr(el, 'color'), hexToRgb(C05.screen.color));
  });

  it('C06 argentRow pill variant (S32 « Versé » 10.5/4/9)', () => {
    const el = qe('S32', (e) => e.text === 'Versé' && parseFloat(e.props['font-size'] ?? '0') < 12);
    if (!el) return missing('C06', 'argentRow');
    sweep('C06', 'argentRow', 'font-size', pr(el, 'font-size'), px(C06.argentRow.fontSize));
    sweep('C06', 'argentRow', 'pad-v', pr(el, 'padding-top'), px(C06.argentRow.paddingVertical));
    sweep('C06', 'argentRow', 'pad-h', pr(el, 'padding-left'), px(C06.argentRow.paddingHorizontal));
    sweep('C06', 'argentRow', 'bg(PAID)', pr(el, 'background-color'), hexToRgb(STATUS_PILL['PAID']!.bg));
  });

  it('C08 BtnSoft (S03 « Lister un produit — gratuit »)', () => {
    const el = qe('S03', (e) => e.text === 'Lister un produit — gratuit' && e.tag === 'button');
    if (!el) return missing('C08', 'btn');
    sweep('C08', 'btn', 'height', pr(el, 'height'), px(C08.btn.height));
    sweep('C08', 'btn', 'radius', pr(el, 'border-top-left-radius'), px(C08.btn.borderRadius));
    sweep('C08', 'btn', 'bg', pr(el, 'background-color'), hexToRgb(C08.btn.backgroundColor));
    sweep('C08', 'btn', 'gap', pr(el, 'gap'), px(C08.btn.gap));
    sweep('C08', 'label', 'font-size', pr(el, 'font-size'), px(C08.label.fontSize));
    sweep('C08', 'label', 'font-weight', pr(el, 'font-weight'), String(C08.label.fontWeight));
    sweep('C08', 'label', 'color', pr(el, 'color'), hexToRgb(C08.label.color));
    // §5 S05 pair (.btn-soft.h48) + S17 photo override (inline r14)
    const pair = qe('S05', (e) => e.text === 'Modifier' && e.tag === 'button');
    if (!pair) return missing('C08', 'S05-pair');
    sweep('C08', 'S05-pair', 'height', pr(pair, 'height'), px(S05L.pairSoft.height));
    sweep('C08', 'S05-pair', 'radius', pr(pair, 'border-top-left-radius'), px(S05L.pairSoft.borderRadius));
    sweep('C08', 'S05-pair', 'font-size', pr(pair, 'font-size'), px(S05L.pairSoftTxt.fontSize));
    const photo = qe('S17', (e) => (e.text ?? '').startsWith('Prendre la photo') && e.tag === 'button');
    if (!photo) return missing('C08', 'S17-photo');
    sweep('C08', 'S17-photo', 'height', pr(photo, 'height'), px(C08.btn.height));
    sweep('C08', 'S17-photo', 'radius', pr(photo, 'border-top-left-radius'), px(S17L.photoBtn.borderRadius));
  });

  it('C09 BtnGhost (S32 « Télécharger le relevé » · S05 pair)', () => {
    const el = qe('S32', (e) => (e.text ?? '').startsWith('Télécharger le relevé') && e.tag === 'button');
    if (!el) return missing('C09', 'btn');
    sweep('C09', 'btn', 'height', pr(el, 'height'), px(C09.btn.height));
    sweep('C09', 'btn', 'radius', pr(el, 'border-top-left-radius'), px(C09.btn.borderRadius));
    sweepBorder('C09', 'btn', pr(el, 'border-top-width'), C09.btn.borderWidth);
    sweep('C09', 'btn', 'border-color', pr(el, 'border-top-color'), hexToRgb(C09.btn.borderColor));
    sweep('C09', 'label', 'font-size', pr(el, 'font-size'), px(C09.label.fontSize));
    sweep('C09', 'label', 'font-weight', pr(el, 'font-weight'), String(C09.label.fontWeight));
    const pair = qe('S05', (e) => e.text === 'Mettre en pause' && e.tag === 'button');
    if (!pair) return missing('C09', 'S05-pair');
    sweep('C09', 'S05-pair', 'height', pr(pair, 'height'), px(S05L.pairGhost.height));
  });

  it('C10 BtnDemo (S12 prefix+Simuler, dashed demo button)', () => {
    const el = qe('S12', (e) => (e.text ?? '').includes('Simuler') && e.tag === 'button');
    if (!el) return missing('C10', 'btn');
    sweep('C10', 'btn', 'height', pr(el, 'height'), px(C10.btn.height));
    sweep('C10', 'btn', 'border-style', pr(el, 'border-top-style'), C10.btn.borderStyle);
    sweepBorder('C10', 'btn', pr(el, 'border-top-width'), C10.btn.borderWidth);
    sweep('C10', 'btn', 'border-color', pr(el, 'border-top-color'), hexToRgb(C10.btn.borderColor));
    sweep('C10', 'label', 'font-size', pr(el, 'font-size'), px(C10.label.fontSize));
    sweep('C10', 'label', 'color', pr(el, 'color'), hexToRgb(C10.label.color));
    sweep('C10', 'label', 'prefix', (el.text ?? '').slice(0, 2), C10.prefix);
  });

  it('C11 BackBtn (S05 40×40 r99)', () => {
    const el = qe('S05', (e) => e.props['width'] === '40px' && e.props['height'] === '40px' && e.tag === 'button');
    if (!el) return missing('C11', 'btn');
    sweep('C11', 'btn', 'width', pr(el, 'width'), px(C11.btn.width));
    sweep('C11', 'btn', 'radius', pr(el, 'border-top-left-radius'), px(C11.btn.borderRadius));
    sweepBorder('C11', 'btn', pr(el, 'border-top-width'), C11.btn.borderWidth);
    sweep('C11', 'btn', 'bg', pr(el, 'background-color'), hexToRgb(C11.btn.backgroundColor));
  });

  it('C12 ChipSegment (S07 « À traiter » active)', () => {
    const el = qe('S07', (e) => (e.text ?? '').startsWith('À traiter'));
    if (!el) return missing('C12', 'chip');
    sweep('C12', 'chip', 'height', pr(el, 'height'), px(C12.chip.height));
    sweep('C12', 'chip', 'pad-h', pr(el, 'padding-left'), px(C12.chip.paddingHorizontal));
    sweep('C12', 'chip', 'radius', pr(el, 'border-top-left-radius'), px(GEO.r.pill));
    sweepBorder('C12', 'chip', pr(el, 'border-top-width'), C12.chip.borderWidth);
    sweep('C12', 'chip', 'active-bg', pr(el, 'background-color'), hexToRgb(C12.active.backgroundColor));
    sweep('C12', 'chip', 'active-border', pr(el, 'border-top-color'), hexToRgb(C12.active.borderColor));
    sweep('C12', 'chip', 'active-fg', pr(el, 'color'), hexToRgb(C12.txtActive.color));
    sweep('C12', 'txt', 'font-size', pr(el, 'font-size'), px(C12.txt.fontSize));
  });

  it('C13 ChipCategory (S20 « Mode homme » inactive + active border)', () => {
    const el = qe('S20', (e) => e.text === 'Mode homme');
    if (!el) return missing('C13', 'chip');
    sweep('C13', 'chip', 'height', pr(el, 'height'), px(C13.chip.height));
    sweep('C13', 'chip', 'pad-h', pr(el, 'padding-left'), px(C13.chip.paddingHorizontal));
    sweep('C13', 'chip', 'radius', pr(el, 'border-top-left-radius'), px(GEO.r.pill));
    sweepBorder('C13', 'chip', pr(el, 'border-top-width'), C13.chip.borderWidth);
    sweep('C13', 'chip', 'inactive-bg', pr(el, 'background-color'), hexToRgb(C13.inactive.backgroundColor));
    sweep('C13', 'chip', 'inactive-border', pr(el, 'border-top-color'), hexToRgb(C13.inactive.borderColor));
    sweep('C13', 'txt', 'font-size', pr(el, 'font-size'), px(C13.txt.fontSize));
    const active = qe('S20', (e) => e.props['height'] === '42px' && e.props['border-top-color'] === hexToRgb(C13.active.borderColor));
    sweep('C13', 'chip', 'active-anchor(Mode femme)', active ? 'found' : 'ABSENT', 'found');
    if (active) sweep('C13', 'chip', 'active-bg', pr(active, 'background-color'), hexToRgb(C13.active.backgroundColor));
  });

  it('C15 Stepper (S22 buttons 52×52 + value + glyph Δ1)', () => {
    const btn = qe('S22', (e) => e.text === '−' && e.tag === 'button');
    if (!btn) return missing('C15', 'btn');
    sweep('C15', 'btn', 'width', pr(btn, 'width'), px(C15.btn.width));
    sweep('C15', 'btn', 'radius', pr(btn, 'border-top-left-radius'), px(GEO.r.pill));
    sweepBorder('C15', 'btn', pr(btn, 'border-top-width'), C15.btn.borderWidth);
    sweep('C15', 'btn', 'bg', pr(btn, 'background-color'), hexToRgb(C15.btn.backgroundColor));
    sweep('C15', 'glyph', 'font-size', pr(btn, 'font-size'), px(C15.glyph.fontSize));
    sweep('C15', 'glyph', 'font-weight', pr(btn, 'font-weight'), String(C15.glyph.fontWeight));
    // Δ1 (PHASE0-DELTAS): computed family is the UA leak (Arial); built = IS600 per HANDOFF, ruling pending
    sweep('C15', 'glyph', 'font-family', pr(btn, 'font-family'), faceOf(C15.glyph.fontFamily).webFamily, 'Δ1 stepper UA font leak — built IS600 per HANDOFF §2, ruling pending');
    // Δ1 guard (verifier hardening): the freeze holds only while the table really reads Arial
    sweep('C15', 'glyph', 'freeze-premise(UA Arial)', pr(btn, 'font-family'), 'Arial');
    const val = qe('S22', (e) => e.props['padding-top'] === '13px' && e.props['text-align'] === 'center');
    if (!val) return missing('C15', 'value');
    sweep('C15', 'value', 'radius', pr(val, 'border-top-left-radius'), px(C15.value.borderRadius));
    sweepBorder('C15', 'value', pr(val, 'border-top-width'), C15.value.borderWidth);
    sweep('C15', 'value', 'font-size', pr(val, 'font-size'), px(C15.value.fontSize));
    sweep('C15', 'value', 'font-weight', pr(val, 'font-weight'), String(C15.value.fontWeight));
  });

  it('C16 Input (S21 name field)', () => {
    const el = qe('S21', (e) => e.tag === 'input');
    if (!el) return missing('C16', 'input');
    sweep('C16', 'input', 'pad-v', pr(el, 'padding-top'), px(C16.input.paddingVertical));
    sweep('C16', 'input', 'pad-h', pr(el, 'padding-left'), px(C16.input.paddingHorizontal));
    sweep('C16', 'input', 'radius', pr(el, 'border-top-left-radius'), px(C16.input.borderRadius));
    sweepBorder('C16', 'input', pr(el, 'border-top-width'), C16.input.borderWidth);
    sweep('C16', 'input', 'font-size', pr(el, 'font-size'), px(C16.input.fontSize));
    sweep('C16', 'input', 'bg', pr(el, 'background-color'), hexToRgb(C16.input.backgroundColor));
  });

  it('C17 Card L (S05 pad-17 r20 cardSm)', () => {
    const el = qe('S05', (e) => e.props['padding-top'] === '17px' && e.props['border-top-left-radius'] === '20px');
    if (!el) return missing('C17', 'L');
    sweep('C17', 'L', 'padding', pr(el, 'padding-top'), px(C17.L.padding));
    sweep('C17', 'L', 'radius', pr(el, 'border-top-left-radius'), px(C17.L.borderRadius));
    sweepBorder('C17', 'L', pr(el, 'border-top-width'), C17.L.borderWidth);
    sweep('C17', 'L', 'shadow', normShadow(pr(el, 'box-shadow') ?? ''), normShadow(C17.L.boxShadow));
  });

  it('C19 MoneyBreakdown (S05 lines + total)', () => {
    const label = qe('S05', (e) => e.text === 'Vous recevez');
    if (!label) return missing('C19', 'totalLabel');
    sweep('C19', 'totalLabel', 'font-size', pr(label, 'font-size'), px(C19.totalLabel.fontSize));
    sweep('C19', 'totalLabel', 'font-weight', pr(label, 'font-weight'), String(C19.totalLabel.fontWeight));
    const line = qe('S05', (e) => e.text === C19.ORDER[0]);
    if (!line) return missing('C19', 'line');
    sweep('C19', 'line', 'font-size', pr(line, 'font-size'), px(C19.lineTxt.fontSize));
    const netEl = qe('S05', (e) => e.text === formatF(8_500) && parseFloat(e.props['font-size'] ?? '0') >= 17);
    if (!netEl) return missing('C19', 'totalValL');
    sweep('C19', 'totalValL', 'font-size', pr(netEl, 'font-size'), px(C19.totalValL.fontSize));
    sweep('C19', 'totalValL', 'color', pr(netEl, 'color'), hexToRgb(C19.totalValL.color));
  });

  it('C21 IconTile size table (todo 52 · order 48 · produitImg 108 · heroFiche 180 · viseur 230)', () => {
    const todo = qe('S02', (e) => e.props['width'] === '52px' && e.props['height'] === '52px');
    if (todo) sweep('C21', 'todo', 'radius', pr(todo, 'border-top-left-radius'), px(C21.todo.r)); else missing('C21', 'todo');
    const order = qe('S07', (e) => e.props['width'] === '48px' && e.props['height'] === '48px');
    if (order) sweep('C21', 'order', 'radius', pr(order, 'border-top-left-radius'), px(C21.order.r)); else missing('C21', 'order');
    const img = qe('S03', (e) => e.props['height'] === '108px');
    sweep('C21', 'produitImg', 'height', img ? '108px' : '(absent)', px(C21.produitImg.h));
    const hero = qe('S05', (e) => e.props['height'] === '180px');
    if (hero) sweep('C21', 'heroFiche', 'radius', pr(hero, 'border-top-left-radius'), px(C21.heroFiche.r)); else missing('C21', 'heroFiche');
    const viseur = qe('S26', (e) => e.props['height'] === '230px');
    if (viseur) sweep('C21', 'viseur', 'radius', pr(viseur, 'border-top-left-radius'), px(C21.viseur.r)); else missing('C21', 'viseur');
    // verifier finding: S25 DOES render the 56px preview tile (C48 row) — table-asserted, not prose
    const prev = qe('S25', (e) => e.props['width'] === '56px' && e.props['height'] === '56px');
    if (!prev) return missing('C21', 'preview');
    sweep('C21', 'preview', 'size', pr(prev, 'width'), px(C21.preview.size));
    sweep('C21', 'preview', 'radius', pr(prev, 'border-top-left-radius'), px(C21.preview.r));
  });

  it('C22 RowTodo (S02) + C23 RowOrder (S07)', () => {
    const row = qe('S02', (e) => e.props['padding-top'] === '13px' && e.props['border-top-left-radius'] === '18px');
    if (!row) return missing('C22', 'row');
    sweep('C22', 'row', 'padding', pr(row, 'padding-top'), px(C22.row.padding));
    sweep('C22', 'row', 'radius', pr(row, 'border-top-left-radius'), px(C22.row.borderRadius));
    sweep('C22', 'row', 'shadow(cardLg)', normShadow(pr(row, 'box-shadow') ?? ''), normShadow(C22.row.boxShadow));
    const title = qe('S02', (e) => e.text === 'CMD-2417' && e.props['font-weight'] === '700');
    if (title) sweep('C22', 'title', 'font-size', pr(title, 'font-size'), px(C22.title.fontSize));
    const sub = qe('S02', (e) => (e.text ?? '').includes('confirmez « Produit prêt »'));
    if (sub) {
      sweep('C22', 'sub', 'font-size', pr(sub, 'font-size'), px(C22.sub.fontSize));
      sweep('C22', 'sub', 'color', pr(sub, 'color'), hexToRgb(C22.sub.color));
    }
    const orow = qe('S07', (e) => e.props['padding-top'] === '13px' && e.props['border-top-left-radius'] === '18px');
    if (!orow) return missing('C23', 'row');
    sweep('C23', 'row', 'shadow(cardSm)', normShadow(pr(orow, 'box-shadow') ?? ''), normShadow(C22.rowOrder.boxShadow));
  });

  it('C24 RowMoney (S32 code + row + net)', () => {
    const code = qe('S32', (e) => e.text === 'CMD-2417');
    if (!code) return missing('C24', 'code');
    sweep('C24', 'code', 'font-size', pr(code, 'font-size'), px(C24.code.fontSize));
    sweep('C24', 'code', 'font-weight', pr(code, 'font-weight'), String(C24.code.fontWeight));
    const row = qe('S32', (e) => e.props['padding-top'] === '14px' && e.props['padding-left'] === '15px' && e.props['border-top-left-radius'] === '18px');
    if (row) {
      sweep('C24', 'row', 'pad-v', pr(row, 'padding-top'), px(C24.row.paddingVertical));
      sweep('C24', 'row', 'pad-h', pr(row, 'padding-left'), px(C24.row.paddingHorizontal));
    } else missing('C24', 'row');
    const net = qe('S32', (e) => e.text === formatF(8_500));
    if (net) sweep('C24', 'net', 'font-size', pr(net, 'font-size'), px(C24.net.fontSize)); else missing('C24', 'net');
  });

  it('C27 Banner (S11 warn prep banner)', () => {
    const el = qe('S11', (e) => e.props['padding-top'] === '14px' && e.props['padding-left'] === '16px');
    if (!el) return missing('C27', 'banner');
    sweep('C27', 'banner', 'pad-v', pr(el, 'padding-top'), px(C27.banner.paddingVertical));
    sweep('C27', 'banner', 'pad-h', pr(el, 'padding-left'), px(C27.banner.paddingHorizontal));
    sweep('C27', 'banner', 'radius', pr(el, 'border-top-left-radius'), px(C27.banner.borderRadius));
    sweep('C27', 'banner', 'warn-bg', pr(el, 'background-color'), hexToRgb(C27.warn.bg));
  });

  it('C28 EmptyState (S08 dashed box)', () => {
    const el = qe('S08', (e) => e.text === C28.label);
    if (!el) return missing('C28', 'box');
    sweep('C28', 'box', 'pad-v', pr(el, 'padding-top'), px(C28.box.paddingVertical));
    sweep('C28', 'box', 'pad-h', pr(el, 'padding-left'), px(C28.box.paddingHorizontal));
    sweep('C28', 'box', 'border-style', pr(el, 'border-top-style'), C28.box.borderStyle);
    sweep('C28', 'box', 'border-color', pr(el, 'border-top-color'), hexToRgb(C28.box.borderColor));
    sweep('C28', 'txt', 'font-size', pr(el, 'font-size'), px(C28.txt.fontSize));
  });

  it('C29 Timeline (S11 dots + label)', () => {
    const dot = qe('S11', (e) => e.props['width'] === '14px' && e.props['height'] === '14px');
    if (!dot) return missing('C29', 'dot');
    sweep('C29', 'dot', 'width', pr(dot, 'width'), px(C29.dot.width));
    sweep('C29', 'dot', 'radius', pr(dot, 'border-top-left-radius'), px(GEO.r.pill));
    sweepBorder('C29', 'dot', pr(dot, 'border-top-width'), C29.dot.borderWidth);
    sweep('C29', 'dot', 'done-border', pr(dot, 'border-top-color'), hexToRgb(C29.dotDone.borderColor));
    const label = qe('S11', (e) => (e.text ?? '').startsWith('Frais de livraison payés'));
    if (!label) return missing('C29', 'label');
    sweep('C29', 'label', 'font-size', pr(label, 'font-size'), px(C29.label.fontSize));
    sweep('C29', 'label', 'padding-bottom', pr(label, 'padding-bottom'), px(C29.label.paddingBottom));
  });

  it('C30 Toast (S12 live toast — verifier finding: z-index sits on the container, text on the child)', () => {
    const stack = qe('S12', (e) => e.props['z-index'] === '80');
    if (stack) sweep('C30', 'stack', 'top', `${stack.box.y}px`, px(C30.stack.top)); else missing('C30', 'stack');
    const toast = qe('S12', (e) => e.props['background-color'] === hexToRgb(C30.toast.backgroundColor) && (e.text ?? '').length > 3);
    if (!toast) return missing('C30', 'toast');
    sweep('C30', 'toast', 'bg', pr(toast, 'background-color'), hexToRgb(C30.toast.backgroundColor));
    sweep('C30', 'toast', 'pad-v', pr(toast, 'padding-top'), px(C30.toast.paddingVertical));
    sweep('C30', 'toast', 'pad-h', pr(toast, 'padding-left'), px(C30.toast.paddingHorizontal));
    sweep('C30', 'toast', 'radius', pr(toast, 'border-top-left-radius'), px(GEO.r.pill));
    sweep('C30', 'txt', 'color', pr(toast, 'color'), hexToRgb(C30.txt.color));
    sweep('C30', 'txt', 'font-size', pr(toast, 'font-size'), px(C30.txt.fontSize));
    sweep('C30', 'toast', 'life-ms', '(§9.9: 2800, hard removal)', String(C30.LIFE_MS), 'PROSE §4.3/§9.9 — timing is not a computed style');
  });

  it('C31 Sheet (S17 scrim + panel + grabber + title)', () => {
    const scrim = qe('S17', (e) => e.props['z-index'] === '60');
    if (scrim) sweep('C31', 'scrim', 'bg', pr(scrim, 'background-color'), hexToRgb(C31.scrim.backgroundColor)); else missing('C31', 'scrim');
    const panel = qe('S17', (e) => e.props['padding-bottom'] === '44px' && e.props['padding-left'] === '22px');
    if (!panel) return missing('C31', 'panel');
    sweep('C31', 'panel', 'radius-top', pr(panel, 'border-top-left-radius'), px(C31.panel.borderTopLeftRadius));
    sweep('C31', 'panel', 'pad-top', pr(panel, 'padding-top'), px(C31.panel.paddingTop));
    sweep('C31', 'panel', 'pad-h', pr(panel, 'padding-left'), px(C31.panel.paddingHorizontal));
    sweep('C31', 'panel', 'pad-bottom', pr(panel, 'padding-bottom'), px(C31.panel.paddingBottom));
    sweep('C31', 'panel', 'bg', pr(panel, 'background-color'), hexToRgb(C31.panel.backgroundColor));
    sweep('C31', 'panel', 'shadow', normShadow(pr(panel, 'box-shadow') ?? ''), normShadow(C31.panel.boxShadow));
    const grabber = qe('S17', (e) => e.props['width'] === '40px' && e.props['height'] === '5px');
    if (grabber) sweep('C31', 'grabber', 'bg', pr(grabber, 'background-color'), hexToRgb(C31.grabber.backgroundColor)); else missing('C31', 'grabber');
    const title = qe('S17', (e) => e.text === 'Confirmer « Produit prêt »');
    if (title) sweep('C31', 'title', 'font-size', pr(title, 'font-size'), px(C31.title.fontSize)); else missing('C31', 'title');
  });

  it('C32 ProgressDots (S22 done + idle segs)', () => {
    const done = qe('S22', (e) => e.props['height'] === '4px' && e.props['background-color'] === hexToRgb(C32.segDone.backgroundColor));
    if (!done) return missing('C32', 'segDone');
    sweep('C32', 'segDone', 'radius', pr(done, 'border-top-left-radius'), px(GEO.r.pill));
    sweep('C32', 'segDone', 'bg', pr(done, 'background-color'), hexToRgb(C32.segDone.backgroundColor));
    const idle = qe('S22', (e) => e.props['height'] === '4px' && e.props['background-color'] === hexToRgb(C32.seg.backgroundColor));
    sweep('C32', 'seg', 'idle-bg', idle ? pr(idle, 'background-color') : '(absent)', hexToRgb(C32.seg.backgroundColor));
  });

  it('C33 WizardFooter (S20 absolute 14/20/40)', () => {
    const el = qe('S20', (e) => e.props['padding-bottom'] === '40px' && e.props['position'] === 'absolute');
    if (!el) return missing('C33', 'footer');
    sweep('C33', 'footer', 'pad-top', pr(el, 'padding-top'), px(C33.footer.paddingTop));
    sweep('C33', 'footer', 'pad-h', pr(el, 'padding-left'), px(C33.footer.paddingHorizontal));
    sweep('C33', 'footer', 'pad-bottom', pr(el, 'padding-bottom'), px(C33.footer.paddingBottom));
  });

  it('C34 Skeleton (S01 blocks + wrap)', () => {
    const specs: [string, number, number | null, number][] = [
      ['b1', 18, 150, 9], ['b2', 34, 230, 12], ['b3', 86, null, 20], ['b5', 104, 175, 20], ['b6', 54, null, 16],
    ];
    for (const [name, h, w, r] of specs) {
      const el = qe('S01', (e) => e.props['height'] === `${h}px` && (w === null || e.props['width'] === `${w}px`) && e.props['border-top-left-radius'] === `${r}px`);
      sweep('C34', name, `block ${h}px`, el ? 'found' : 'ABSENT', 'found');
    }
    const wrap = qe('S01', (e) => e.props['padding-left'] === '20px' && e.box.w === 402);
    if (!wrap) return missing('C34', 'wrap');
    sweep('C34', 'wrap', 'pad-v', pr(wrap, 'padding-top'), px(C34.wrap.paddingVertical));
    sweep('C34', 'wrap', 'pad-h', pr(wrap, 'padding-left'), px(C34.wrap.paddingHorizontal));
  });

  it('C35 Celebration (S40 scrim/badge/amount/caption/hint/dash)', () => {
    const scrim = qe('S40', (e) => e.props['z-index'] === '90');
    if (!scrim) return missing('C35', 'scrim');
    sweep('C35', 'scrim', 'bg', pr(scrim, 'background-color'), hexToRgb(C35.scrim.backgroundColor));
    sweep('C35', 'scrim', 'pad-h', pr(scrim, 'padding-left'), px(C35.scrim.paddingHorizontal));
    const badge = qe('S40', (e) => e.props['width'] === '78px');
    if (badge) {
      sweep('C35', 'badge', 'width', pr(badge, 'width'), px(C35.badge.width));
      sweep('C35', 'badge', 'bg', pr(badge, 'background-color'), hexToRgb(C35.badge.backgroundColor));
    } else missing('C35', 'badge');
    const amount = qe('S40', (e) => e.text === formatF(12_750) && e.props['font-size'] === '34px');
    if (amount) {
      sweep('C35', 'amount', 'font-size', pr(amount, 'font-size'), px(C35.amount.fontSize));
      sweep('C35', 'amount', 'font-weight', pr(amount, 'font-weight'), String(C35.amount.fontWeight));
      sweep('C35', 'amount', 'letter-spacing', pr(amount, 'letter-spacing'), pxr(C35.amount.letterSpacing ?? 0));
      sweep('C35', 'amount', 'color', pr(amount, 'color'), hexToRgb(C35.amount.color));
    } else missing('C35', 'amount');
    const caption = qe('S40', (e) => (e.text ?? '').toLowerCase().startsWith('versé sur votre'));
    if (caption) {
      sweep('C35', 'caption', 'font-size', pr(caption, 'font-size'), px(C35.caption.fontSize));
      sweep('C35', 'caption', 'color', pr(caption, 'color'), hexToRgb(C35.caption.color));
      sweep('C35', 'caption', 'transform', pr(caption, 'text-transform'), C35.caption.textTransform ?? '');
    } else missing('C35', 'caption');
    // dash band: source is a repeating-gradient 132×6 (gold 0-12, transparent 12-20);
    // built as literal segment Views — same stops (LISTED, C02-class divergence)
    const dash = qe('S40', (e) => e.box.w === 132 && e.box.h === 6);
    if (!dash) return missing('C35', 'dash');
    const g = pr(dash, 'background-image') ?? '';
    const m = g.match(/rgb\(([^)]*)\) 0px, rgb\([^)]*\) (\d+)px, rgba?\([^)]*\) \d+px, rgba?\([^)]*\) (\d+)px/);
    sweep('C35', 'dash', 'band', `132×6 seg ${m?.[2] ?? '?'} cycle ${m?.[3] ?? '?'}`, `${C35.dash.width}×${C35.dash.height} seg ${C35.dashSeg.width} cycle ${C35.dashSeg.width + C35.dashSeg.marginRight}`);
    sweep('C35', 'dash', 'gold', m ? `rgb(${m[1]})` : '(gradient unparsed)', hexToRgb(C35.dashSeg.backgroundColor));
  });

  it('C36 TrustCard (S33 current + title)', () => {
    const cur = qe('S33', (e) => e.props['border-top-width'] === '2px');
    if (!cur) return missing('C36', 'current');
    sweep('C36', 'current', 'border-width', pr(cur, 'border-top-width'), px(C36.current.borderWidth));
    sweep('C36', 'current', 'border-color', pr(cur, 'border-top-color'), hexToRgb(C36.current.borderColor));
    sweep('C36', 'current', 'shadow', normShadow(pr(cur, 'box-shadow') ?? ''), normShadow(C36.current.boxShadow));
    const title = qe('S33', (e) => e.text === 'De confiance');
    if (!title) return missing('C36', 'title');
    sweep('C36', 'title', 'font-size', pr(title, 'font-size'), px(C36.title.fontSize));
    sweep('C36', 'title', 'font-weight', pr(title, 'font-weight'), String(C36.title.fontWeight));
  });

  it('C37 MetersList (S26 label + OK pill + row divider)', () => {
    const label = qe('S26', (e) => e.text === 'Luminosité');
    if (!label) return missing('C37', 'label');
    sweep('C37', 'label', 'font-size', pr(label, 'font-size'), px(C37.label.fontSize));
    sweep('C37', 'label', 'color', pr(label, 'color'), hexToRgb(C37.label.color));
    const pill = qe('S26', (e) => e.text === C37.ok.label && e.tag === 'span');
    if (!pill) return missing('C37', 'okPill');
    sweep('C37', 'okPill', 'bg', pr(pill, 'background-color'), hexToRgb(C37.ok.bg));
    sweep('C37', 'okPill', 'fg', pr(pill, 'color'), hexToRgb(C37.ok.fg));
    sweep('C37', 'okPill', 'font-size', pr(pill, 'font-size'), px(C37.pillTxt.fontSize));
    sweep('C37', 'okPill', 'pad-v', pr(pill, 'padding-top'), px(C37.pill.paddingVertical));
    sweep('C37', 'okPill', 'pad-h', pr(pill, 'padding-left'), px(C37.pill.paddingHorizontal));
    const row = qe('S26', (e) => e.props['padding-top'] === '9px' && e.props['border-bottom-width'] === '1px');
    if (row) sweep('C37', 'row', 'divider', pr(row, 'border-bottom-color'), hexToRgb(C37.row.borderBottomColor)); else missing('C37', 'row');
  });

  it('C38 ProcessingList (S30 done 600/ink · idle 500/faint)', () => {
    const done = qe('S30', (e) => e.text === 'Rotation corrigée');
    if (!done) return missing('C38', 'done');
    sweep('C38', 'done', 'font-size', pr(done, 'font-size'), px(C38.labelDone.fontSize));
    sweep('C38', 'done', 'font-weight', pr(done, 'font-weight'), String(C38.labelDone.fontWeight));
    sweep('C38', 'done', 'color', pr(done, 'color'), hexToRgb(C38.labelDone.color));
    const idle = qe('S30', (e) => e.text === 'Analyse du fond');
    if (!idle) return missing('C38', 'idle');
    sweep('C38', 'idle', 'font-weight', pr(idle, 'font-weight'), String(C38.labelIdle.fontWeight));
    sweep('C38', 'idle', 'color', pr(idle, 'color'), hexToRgb(C38.labelIdle.color));
  });

  it('C39 Viewfinder (S26 frame + inset + caption)', () => {
    const frame = qe('S26', (e) => e.props['height'] === '230px');
    if (!frame) return missing('C39', 'frame');
    sweep('C39', 'frame', 'height', pr(frame, 'height'), px(C39.frame.height));
    sweep('C39', 'frame', 'radius', pr(frame, 'border-top-left-radius'), px(C39.frame.borderRadius));
    const inset = qe('S26', (e) => e.props['border-top-style'] === 'dashed' && (e.props['border-top-color'] ?? '').startsWith('rgba(255'));
    if (!inset) return missing('C39', 'inset');
    sweepBorder('C39', 'inset', pr(inset, 'border-top-width'), C39.inset.borderWidth);
    sweep('C39', 'inset', 'border-color', pr(inset, 'border-top-color'), hexToRgb(C39.inset.borderColor));
    sweep('C39', 'inset', 'radius', pr(inset, 'border-top-left-radius'), px(C39.inset.borderRadius));
    const cap = qe('S26', (e) => e.text === C39.CAPTION);
    if (!cap) return missing('C39', 'caption');
    sweep('C39', 'caption', 'font-size', pr(cap, 'font-size'), px(C39.caption.fontSize));
    sweep('C39', 'caption', 'font-weight', pr(cap, 'font-weight'), String(C39.caption.fontWeight));
  });

  it('C40 AvantApres (S31 images + framed + legends)', () => {
    const img = qe('S31', (e) => e.props['height'] === '106px');
    if (!img) return missing('C40', 'imgLeft');
    sweep('C40', 'imgLeft', 'radius', pr(img, 'border-top-left-radius'), px(C40.imgLeft.r));
    const framed = qe('S31', (e) => e.props['border-top-width'] === '5px');
    if (!framed) return missing('C40', 'framed');
    sweep('C40', 'framed', 'border-width', pr(framed, 'border-top-width'), px(C40.framed.borderWidth));
    sweep('C40', 'framed', 'border-color', pr(framed, 'border-top-color'), hexToRgb(C40.framed.borderColor));
    sweep('C40', 'framed', 'radius', pr(framed, 'border-top-left-radius'), px(C40.framed.borderRadius));
    const legend = qe('S31', (e) => e.text === C40.LEGEND_RIGHT);
    if (!legend) return missing('C40', 'legend');
    sweep('C40', 'legend', 'font-size', pr(legend, 'font-size'), px(C40.legend.fontSize));
  });

  it('C41 ChallengeCode (S17 card + code)', () => {
    const card = qe('S17', (e) => e.props['padding-top'] === '19px');
    if (!card) return missing('C41', 'card');
    sweep('C41', 'card', 'padding', pr(card, 'padding-top'), px(C41.card.padding));
    sweep('C41', 'card', 'radius', pr(card, 'border-top-left-radius'), px(C41.card.borderRadius));
    sweepBorder('C41', 'card', pr(card, 'border-top-width'), C41.card.borderWidth);
    sweep('C41', 'card', 'border-color', pr(card, 'border-top-color'), hexToRgb(C41.card.borderColor));
    const code = qe('S17', (e) => (e.text ?? '').startsWith('WK-'));
    if (!code) return missing('C41', 'code');
    sweep('C41', 'code', 'font-size', pr(code, 'font-size'), px(C41.code.fontSize));
    sweep('C41', 'code', 'font-weight', pr(code, 'font-weight'), String(C41.code.fontWeight));
    sweep('C41', 'code', 'letter-spacing', pr(code, 'letter-spacing'), pxr(C41.code.letterSpacing ?? 0));
    sweep('C41', 'code', 'color', pr(code, 'color'), hexToRgb(C41.code.color));
  });

  it('C42 IconSet — svg dims in table; strokes derived from shipped code vs source markup', () => {
    const svg = qe('S02', (e) => e.tag === 'svg' && e.props['width'] === '15px');
    sweep('C42', 'chipVer-check', 'svg 15×15', svg ? 'found' : 'ABSENT', 'found');
    // the table has no svg stroke props (verified) — so the expected side is the
    // SOURCE MARKUP constant, and the built side is read from the shipped code,
    // so stroke drift in code IS caught (verifier hardening)
    const compSrc = readFileSync(join(appDir, 'src/v2/components.tsx'), 'utf8');
    const c07Src = readFileSync(join(appDir, 'src/ui/v2/components/C07BtnPrimary.tsx'), 'utf8');
    const base = compSrc.match(/strokeWidth = ([\d.]+)/)?.[1] ?? '?';
    const c07 = c07Src.match(/strokeWidth=\{([\d.]+)\}/)?.[1] ?? '?';
    sweep(
      'C42', 'strokes', 'per-component (markup-expected vs code-built)',
      'base 1.9 · C07 2.2 · C11 2.1 · C30 2.4 · C35 2.6',
      `base ${base} · C07 ${c07} · C11 ${C11.chevron.strokeWidth} · C30 ${C30.check.strokeWidth} · C35 ${C35.check.strokeWidth}`,
    );
  });

  it('C43 HeaderStacked (S05 title 19 · S22 counter · titleStep 26)', () => {
    const title = qe('S05', (e) => e.text === 'Robe brodée bogolan' && parseFloat(e.props['font-size'] ?? '0') >= 18);
    if (!title) return missing('C43', 'title');
    sweep('C43', 'title', 'font-size', pr(title, 'font-size'), px(C43.title.fontSize));
    sweep('C43', 'title', 'font-weight', pr(title, 'font-weight'), String(C43.title.fontWeight));
    const counter = qe('S22', (e) => /^[0-9]\/5$/.test(e.text ?? ''));
    if (!counter) return missing('C43', 'counter');
    sweep('C43', 'counter', 'font-size', pr(counter, 'font-size'), px(C43.counter.fontSize));
    sweep('C43', 'counter', 'color', pr(counter, 'color'), hexToRgb(C43.counter.color));
    const step = qe('S22', (e) => e.text === 'Prix & commission');
    if (!step) return missing('C43', 'titleStep');
    sweep('C43', 'titleStep', 'font-size', pr(step, 'font-size'), px(C43.titleStep.fontSize));
    sweep('C43', 'titleStep', 'font-weight', pr(step, 'font-weight'), String(C43.titleStep.fontWeight));
    sweep('C43', 'titleStep', 'letter-spacing', pr(step, 'letter-spacing'), pxr(C43.titleStep.letterSpacing ?? 0));
  });

  it('C45 EcheanceRow (S02 time pill + label)', () => {
    const time = qe('S02', (e) => e.text === '11 h 30');
    if (!time) return missing('C45', 'time');
    sweep('C45', 'time', 'font-size', pr(time, 'font-size'), px(C45.time.fontSize));
    sweep('C45', 'time', 'bg', pr(time, 'background-color'), hexToRgb(C45.time.backgroundColor));
    sweep('C45', 'time', 'pad-v', pr(time, 'padding-top'), px(C45.time.paddingVertical));
    sweep('C45', 'time', 'radius', pr(time, 'border-top-left-radius'), px(C45.time.borderRadius));
    const label = qe('S02', (e) => (e.text ?? '').startsWith('— préparer'));
    if (!label) return missing('C45', 'label');
    sweep('C45', 'label', 'font-size', pr(label, 'font-size'), px(C45.label.fontSize));
    sweep('C45', 'label', 'line-height', pr(label, 'line-height'), pxr(C45.label.lineHeight ?? 0));
    sweep('C45', 'label', 'color', pr(label, 'color'), hexToRgb(C45.label.color));
  });

  it('C46 ActivityCard (S05 card 16/17 + body 13/1.7)', () => {
    const card = qe('S05', (e) => e.props['padding-top'] === '16px' && e.props['padding-left'] === '17px');
    if (!card) return missing('C46', 'card');
    sweep('C46', 'card', 'pad-v', pr(card, 'padding-top'), px(C46.card.paddingVertical));
    sweep('C46', 'card', 'pad-h', pr(card, 'padding-left'), px(C46.card.paddingHorizontal));
    const body = qe('S05', (e) => e.props['line-height'] === '22.1px');
    if (!body) return missing('C46', 'body');
    sweep('C46', 'body', 'font-size', pr(body, 'font-size'), px(C46.body.fontSize));
    sweep('C46', 'body', 'line-height', pr(body, 'line-height'), pxr(C46.body.lineHeight ?? 0));
    sweep('C46', 'body', 'color', pr(body, 'color'), hexToRgb(C46.body.color));
  });

  it('C47 RecapCard (S25 name + line + net)', () => {
    const name = qe('S25', (e) => e.text === 'Robe brodée bogolan' && e.props['font-weight'] === '700');
    if (!name) return missing('C47', 'name');
    sweep('C47', 'name', 'font-size', pr(name, 'font-size'), px(C47.name.fontSize));
    const line = qe('S25', (e) => e.text === 'Commission revendeuse');
    if (line) sweep('C47', 'line', 'font-size', pr(line, 'font-size'), px(C47.lineTxt.fontSize)); else missing('C47', 'line');
    const net = qe('S25', (e) => e.text === formatF(8_500));
    if (!net) return missing('C47', 'net');
    sweep('C47', 'net', 'font-size', pr(net, 'font-size'), px(C47.net.fontSize));
    sweep('C47', 'net', 'color', pr(net, 'color'), hexToRgb(C47.net.color));
  });

  it('C48 PreviewRevendeuse (S25 overline + commission line)', () => {
    const ov = qe('S25', (e) => (e.text ?? '').startsWith('Aperçu — ce que verront'));
    if (!ov) return missing('C48', 'overline');
    sweep('C48', 'overline', 'font-size', pr(ov, 'font-size'), px(C05.card.fontSize));
    sweep('C48', 'overline', 'letter-spacing', pr(ov, 'letter-spacing'), pxr(C05.card.letterSpacing));
    sweep('C48', 'overline', 'transform', pr(ov, 'text-transform'), C05.card.textTransform ?? '');
    const comm = qe('S25', (e) => (e.text ?? '').startsWith('Commission revendeuse 1'));
    if (!comm) return missing('C48', 'commission');
    sweep('C48', 'commission', 'font-size', pr(comm, 'font-size'), px(C48.commission.fontSize));
    sweep('C48', 'commission', 'font-weight', pr(comm, 'font-weight'), String(C48.commission.fontWeight));
    sweep('C48', 'commission', 'color', pr(comm, 'color'), hexToRgb(C48.commission.color));
  });
});

describe('FINAL PASS — screen sweep (every S##: container profile + title)', () => {
  type Profile = 'tabs' | 'stacked' | 'wizard' | 'none';
  const SCREENS: { sid: string; profile: Profile; title?: string; titleStyle?: 'page' | 'stacked' | 'step' | 'sheet' | 'amount'; src?: keyof typeof SRC }[] = [
    { sid: 'S01', profile: 'none' }, // skeleton — C34.wrap asserted above
    { sid: 'S02', profile: 'tabs', title: 'Boutik+', titleStyle: 'page' }, // wordmark row — fs handled by C44
    { sid: 'S03', profile: 'tabs', title: 'Produits', titleStyle: 'page', src: 'screens1' },
    { sid: 'S04', profile: 'tabs', title: 'Produits', titleStyle: 'page' },
    { sid: 'S05', profile: 'stacked', title: 'Robe brodée bogolan', titleStyle: 'stacked' },
    { sid: 'S06', profile: 'stacked', title: 'Robe brodée bogolan', titleStyle: 'stacked' },
    { sid: 'S07', profile: 'tabs', title: 'Commandes', titleStyle: 'page', src: 'screens1' },
    { sid: 'S08', profile: 'tabs', title: 'Commandes', titleStyle: 'page' },
    { sid: 'S09', profile: 'tabs', title: 'Commandes', titleStyle: 'page' },
    { sid: 'S10', profile: 'tabs', title: 'Commandes', titleStyle: 'page' },
    { sid: 'S11', profile: 'stacked', title: 'CMD-2417', titleStyle: 'stacked' },
    { sid: 'S12', profile: 'stacked', title: 'CMD-2417', titleStyle: 'stacked' },
    { sid: 'S13', profile: 'stacked', title: 'CMD-2411', titleStyle: 'stacked' },
    { sid: 'S14', profile: 'stacked', title: 'CMD-2402', titleStyle: 'stacked' },
    { sid: 'S15', profile: 'stacked', title: 'CMD-2398', titleStyle: 'stacked' },
    { sid: 'S16', profile: 'stacked', title: 'CMD-2409', titleStyle: 'stacked' },
    { sid: 'S17', profile: 'stacked', title: 'Confirmer « Produit prêt »', titleStyle: 'sheet', src: 'screens2' },
    { sid: 'S18', profile: 'stacked', title: 'Confirmer « Produit prêt »', titleStyle: 'sheet' },
    { sid: 'S19', profile: 'stacked', title: 'Ajuster le stock', titleStyle: 'sheet', src: 'screens2' },
    { sid: 'S20', profile: 'wizard', title: 'Catégorie', titleStyle: 'step', src: 'screens2' },
    { sid: 'S21', profile: 'wizard', title: 'Détails & stock', titleStyle: 'step', src: 'screens2' },
    { sid: 'S22', profile: 'wizard', title: 'Prix & commission', titleStyle: 'step', src: 'screens2' },
    { sid: 'S23', profile: 'wizard', title: 'Photos — Studio', titleStyle: 'step', src: 'screens2' },
    { sid: 'S24', profile: 'wizard', title: 'Photos — Studio', titleStyle: 'step' },
    { sid: 'S25', profile: 'wizard', title: 'Vérifiez, puis publiez', titleStyle: 'step', src: 'screens2' },
    { sid: 'S26', profile: 'stacked', title: 'Boutik+ Studio', titleStyle: 'stacked', src: 'screens2' },
    { sid: 'S27', profile: 'stacked', title: 'Boutik+ Studio', titleStyle: 'stacked' },
    { sid: 'S28', profile: 'stacked', title: 'Boutik+ Studio', titleStyle: 'stacked' },
    { sid: 'S29', profile: 'stacked', title: 'Boutik+ Studio', titleStyle: 'stacked' },
    { sid: 'S30', profile: 'stacked', title: 'Boutik+ Studio', titleStyle: 'stacked' },
    { sid: 'S31', profile: 'stacked', title: 'Boutik+ Studio', titleStyle: 'stacked' },
    { sid: 'S32', profile: 'tabs', title: 'Argent', titleStyle: 'page', src: 'screens2' },
    { sid: 'S33', profile: 'stacked', title: 'Niveau de confiance', titleStyle: 'stacked', src: 'screens2' },
    { sid: 'S34', profile: 'wizard', title: 'Bienvenue sur Boutik+', titleStyle: 'step', src: 'screens2' },
    { sid: 'S35', profile: 'wizard', title: 'Votre numéro', titleStyle: 'step', src: 'screens2' },
    { sid: 'S36', profile: 'wizard', title: 'Votre boutique', titleStyle: 'step', src: 'screens2' },
    { sid: 'S37', profile: 'wizard', title: 'Compte de versement', titleStyle: 'step', src: 'screens2' },
    { sid: 'S38', profile: 'wizard', title: 'Statut provisoire', titleStyle: 'step', src: 'screens2' },
    { sid: 'S39', profile: 'none', title: 'Compte provisoire créé', titleStyle: 'step', src: 'screens2' },
    { sid: 'S40', profile: 'stacked', title: formatF(12_750), titleStyle: 'amount' }, // célébration — amount asserted by C35
  ];

  it('container paddings per §5 profile + title role per screen', () => {
    for (const sc of SCREENS) {
      if (sc.profile === 'tabs' || sc.profile === 'stacked') {
        const el = qe(sc.sid, (e) => e.props['padding-left'] === '20px' && e.box.w === 402 && e.props['padding-top'] === '16px');
        if (!el) { missing(sc.sid, 'container'); continue; }
        const want = sc.profile === 'tabs' ? SCROLL.tabs : SCROLL.stacked;
        sweep(sc.sid, 'container', 'pad-top', pr(el, 'padding-top'), px(want.paddingTop));
        sweep(sc.sid, 'container', 'pad-side', pr(el, 'padding-left'), px(want.paddingHorizontal));
        sweep(sc.sid, 'container', 'pad-bottom', pr(el, 'padding-bottom'), px(want.paddingBottom));
      } else if (sc.profile === 'wizard') {
        const el = qe(sc.sid, (e) => e.props['padding-left'] === '20px' && e.box.w === 402 && e.props['padding-top'] === '18px');
        if (!el) { missing(sc.sid, 'container'); continue; }
        sweep(sc.sid, 'container', 'pad-top', pr(el, 'padding-top'), px(SCROLL.wizard.paddingTop));
        sweep(sc.sid, 'container', 'pad-side', pr(el, 'padding-left'), px(SCROLL.wizard.paddingHorizontal));
        sweep(sc.sid, 'container', 'pad-bottom', pr(el, 'padding-bottom'), px(SCROLL.wizard.paddingBottom));
      }
      if (sc.title !== undefined && sc.titleStyle !== undefined) {
        const t = qe(sc.sid, (e) => e.text === sc.title && parseFloat(e.props['font-size'] ?? '0') >= 15);
        if (!t) { missing(sc.sid, `title «${sc.title}»`); continue; }
        const wantFs =
          sc.titleStyle === 'page' ? (sc.sid === 'S02' ? C44.wordmark.fontSize : C04.title.fontSize)
          : sc.titleStyle === 'stacked' ? C43.title.fontSize
          : sc.titleStyle === 'step' ? C43.titleStep.fontSize
          : sc.titleStyle === 'sheet' ? C31.title.fontSize
          : C35.amount.fontSize;
        sweep(sc.sid, 'title', `font-size «${sc.title.slice(0, 24)}»`, pr(t, 'font-size'), px(wantFs));
      }
      if (sc.src !== undefined && sc.title !== undefined) srcHas(sc.sid, sc.src, sc.title);
    }
  });
});

describe('FINAL PASS — the mismatch table must be empty', () => {
  it('zero MISMATCH rows across every C## and S##', () => {
    const bad = rows.filter((r) => r.verdict === 'MISMATCH');
    expect(bad, `MISMATCH TABLE (${bad.length}):\n` + bad.map((r) => `  ${r.case}/${r.el} ${r.prop}: table=${r.expected} built=${r.built}`).join('\n')).toEqual([]);
  });
});

// ─── artifact: the property-diff table (primary evidence) ─────────────────────
afterAll(() => {
  const out = join(appDir, '../../_review/WO-FP-PIXEL');
  mkdirSync(out, { recursive: true });
  const summary = {
    $note: 'WO-FP-PIXEL PRIMARY GATE — property-for-property diff of V2 style data vs the Phase-0 computed values table. Deterministic; no render. FROZEN rows cite their §9 ruling.',
    generatedAt: new Date().toISOString(),
    cases: [...new Set(rows.map((r) => r.case))].map((c) => ({
      case: c,
      total: rows.filter((r) => r.case === c).length,
      mismatches: rows.filter((r) => r.case === c && r.verdict === 'MISMATCH').length,
      frozen: rows.filter((r) => r.case === c && r.verdict.startsWith('FROZEN')).length,
      valuePass: rows.filter((r) => r.case === c && r.verdict === 'MISMATCH').length === 0,
    })),
    rows,
  };
  writeFileSync(join(out, 'property-diff.json'), JSON.stringify(summary, null, 1));
});
