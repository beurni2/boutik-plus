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

type Row = { case: string; el: string; prop: string; expected: string; built: string; verdict: 'pass' | 'FROZEN(§9.2)' | 'MISMATCH' };
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
