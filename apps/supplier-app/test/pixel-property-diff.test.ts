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
  if (!v.startsWith('#')) return v;
  const n = parseInt(v.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const normShadow = (s: string) => {
  // canonical: color|x|y|blur|spread — accepts CSS-order ('0 12px 26px -10px rgba(…)')
  // and computed-order ('rgba(…) 0px 12px 26px -10px'); lengths may be bare 0.
  const color = s.match(/rgba?\([^)]*\)/)?.[0]?.replace(/\s+/g, '') ?? '';
  const nums = s
    .replace(/rgba?\([^)]*\)/, '')
    .trim()
    .split(/\s+/)
    .filter((t) => /^-?[\d.]+(px)?$/.test(t))
    .map((t) => (t.endsWith('px') ? t : `${t}px`));
  while (nums.length < 4) nums.push('0px');
  return `${color}|${nums.join('|')}`;
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
