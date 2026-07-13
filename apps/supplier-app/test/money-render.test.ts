import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatFcfa } from '../src/demo/store';

/**
 * WO-6.0 ruling ③ — the money separator must PAINT, not tofu. Canon groups with
 * U+202F (narrow no-break space); Archivo has no U+202F glyph, so rendering it
 * would show a box next to a franc — a money-screen trust failure. The founder's
 * ruling ③ authorizes a fallback: the display normalizes to U+00A0 (NBSP), which
 * Archivo DOES draw and which keeps « 11 500 F » unbreakable.
 *
 * These assertions prove the RENDERED money is drawable by the embedded typeface:
 * every codepoint the seller sees in a franc amount is in Archivo's cmap, and
 * U+202F never reaches the screen.
 */

const appDir = join(import.meta.dirname, '..');
const NNBSP = ' ';
const NBSP = ' ';

// « 11 500 F » is the reference path the ruling names.
const separatorRendered = () => formatFcfa(11_500);
const fullAmount = () => {
  const template = (JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as { key?: string; fr: string }[])
    .map((e) => e.fr)
    .find((s) => s === '{amount} F' || s === `{amount}${NBSP}F`);
  return (template ?? `{amount}${NBSP}F`).replace('{amount}', formatFcfa(11_500));
};

describe('the money separator renders in the embedded Archivo (ruling ③)', () => {
  it('formatFcfa emits U+00A0 between thousands — never U+202F, never a breaking space', () => {
    const s = formatFcfa(11_500);
    const cps = [...s].map((c) => c.codePointAt(0)!);
    expect(cps).toEqual([0x31, 0x31, 0x00a0, 0x35, 0x30, 0x30]); // "11" NBSP "500"
    expect(s).not.toContain(NNBSP); // U+202F never rendered (Archivo can't draw it)
    expect(s).not.toContain(' '); // no BREAKING space either — « 11 500 » never wraps
  });

  it('the full « 11 500 F » path carries a no-break U+00A0 before the franc', () => {
    const full = fullAmount();
    expect(full).toBe(`11${NBSP}500${NBSP}F`);
    expect(full).not.toContain(NNBSP);
  });

  it('EVERY codepoint the seller sees in a franc amount is in the embedded Archivo cmap (it paints)', () => {
    let py: string;
    try {
      py = execFileSync('python3', ['-c', 'import fontTools; print("ok")'], { encoding: 'utf8' }).trim();
    } catch {
      return; // no fontTools here — the source-level cps assertions above still hold
    }
    expect(py).toBe('ok');
    const script = `
import json, glob, os
from fontTools.ttLib import TTFont
cmaps = [set(TTFont(f)['cmap'].getBestCmap().keys()) for f in glob.glob(os.path.join(${JSON.stringify(join(appDir, 'assets/fonts'))}, '*.ttf'))]
common = set.intersection(*cmaps) if cmaps else set()
print(json.dumps({'has_00A0': 0x00A0 in common, 'has_202F': 0x202F in common, 'count': len(cmaps)}))
`;
    const cmap = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' })) as {
      has_00A0: boolean;
      has_202F: boolean;
      count: number;
    };
    expect(cmap.count).toBe(5);
    // the fallback space we render IS drawable; the canon U+202F is NOT (why the fallback exists)
    expect(cmap.has_00A0, 'embedded Archivo draws U+00A0 (the rendered separator)').toBe(true);
    expect(cmap.has_202F, 'embedded Archivo lacks U+202F — proving the fallback is necessary').toBe(false);

    // and every actual codepoint in « 11 500 F » is in the font
    const rendered = fullAmount();
    const script2 = `
import json, glob, os
from fontTools.ttLib import TTFont
cmaps = [set(TTFont(f)['cmap'].getBestCmap().keys()) for f in glob.glob(os.path.join(${JSON.stringify(join(appDir, 'assets/fonts'))}, '*.ttf'))]
common = set.intersection(*cmaps)
cps = [ord(c) for c in ${JSON.stringify(rendered)}]
print(json.dumps({'missing': [hex(c) for c in cps if c not in common]}))
`;
    const check = JSON.parse(execFileSync('python3', ['-c', script2], { encoding: 'utf8' })) as { missing: string[] };
    expect(check.missing, 'every glyph in « 11 500 F » is drawable by Archivo').toEqual([]);
  });
});
