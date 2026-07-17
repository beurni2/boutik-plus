import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatFcfa } from '../src/demo/store';
import { FP_FACES, FP_FONT_DIR } from '../src/ui/fonts';
import { readCmap } from '../src/ui/sfnt';

/**
 * WO-FP-BOUTIK — the money separator must PAINT, not tofu, in the NEW Faso
 * Premium faces. Canon groups with U+202F (narrow no-break space); the display
 * face (Bricolage) has it but the text face (Instrument Sans) does not, so
 * rendering U+202F would tofu on any body-weight amount. The founder's ruling ③
 * fallback holds: `formatFcfa` normalizes to U+00A0 (NBSP), which ALL SIX faces
 * draw and which keeps « 11 500 F » unbreakable.
 *
 * These assertions prove the RENDERED money is drawable by every embedded face:
 * every codepoint the seller sees in a franc amount is in each face's cmap, and
 * U+202F never reaches the screen. `formatFcfa` is CONSUMED, never reimplemented.
 */

const appDir = join(import.meta.dirname, '..');
const NNBSP = ' ';
const NBSP = ' ';

const fullAmount = () => {
  const template = (JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as { key?: string; fr: string }[])
    .map((e) => e.fr)
    .find((s) => s === '{amount} F' || s === `{amount}${NBSP}F`);
  return (template ?? `{amount}${NBSP}F`).replace('{amount}', formatFcfa(11_500));
};

describe('the money separator renders in the embedded Faso Premium faces (ruling ③)', () => {
  it('formatFcfa emits U+00A0 between thousands — never U+202F, never a breaking space', () => {
    const s = formatFcfa(11_500);
    const cps = [...s].map((c) => c.codePointAt(0)!);
    expect(cps).toEqual([0x31, 0x31, 0x00a0, 0x35, 0x30, 0x30]); // "11" NBSP "500"
    expect(s).not.toContain(NNBSP); // U+202F never rendered (Instrument Sans can't draw it)
    expect(s).not.toContain(' '); // no BREAKING space either — « 11 500 » never wraps
  });

  it('the full « 11 500 F » path carries a no-break U+00A0 before the franc', () => {
    const full = fullAmount();
    expect(full).toBe(`11${NBSP}500${NBSP}F`);
    expect(full).not.toContain(NNBSP);
  });

  it('EVERY codepoint the seller sees in a franc amount is in ALL SIX embedded faces — pure TS, NEVER skips', () => {
    // reads the cmap straight from the committed bytes (src/ui/sfnt.ts) so it runs
    // in every environment, on the intersection of all six Faso Premium faces.
    const dir = join(appDir, 'assets/fonts', FP_FONT_DIR);
    const cmaps = FP_FACES.map((f) => readCmap(new Uint8Array(readFileSync(join(dir, f.file)))));
    const inAll = (cp: number): boolean => cmaps.every((c) => c.has(cp));
    expect(cmaps).toHaveLength(6);

    // the fallback separator we render IS drawable by every face …
    expect(inAll(0x00a0), 'every embedded face draws U+00A0 (the rendered separator)').toBe(true);

    // … and the canon U+202F is NOT drawable by ALL six — the text face lacks it,
    // so the U+00A0 fallback stays necessary. PINNED to its current state: when a
    // future subset adds U+202F to the text face, THIS FAILS LOUDLY and the slice
    // that adopts it must consciously re-verify formatFcfa's separator choice.
    expect(inAll(0x202f), 'Instrument Sans lacks U+202F today — the U+00A0 fallback is still necessary').toBe(false);

    // every actual codepoint in « 11 500 F » is drawable by all six faces
    const rendered = fullAmount();
    const missing = [...rendered]
      .map((c) => c.codePointAt(0)!)
      .filter((cp) => !inAll(cp))
      .map((c) => '0x' + c.toString(16));
    expect(missing, 'every glyph in « 11 500 F » is drawable by every Faso Premium face').toEqual([]);
  });

  it('the U+202F split is per-face: the display face HAS it, the text face LACKS it', () => {
    const dir = join(appDir, 'assets/fonts', FP_FONT_DIR);
    const cmapFor = (kind: 'display' | 'text') =>
      FP_FACES.filter((f) => f.kind === kind).map((f) => readCmap(new Uint8Array(readFileSync(join(dir, f.file)))));
    const display = cmapFor('display');
    const text = cmapFor('text');
    expect(display.every((c) => c.has(0x202f)), 'Bricolage (display) draws U+202F').toBe(true);
    expect(text.some((c) => c.has(0x202f)), 'Instrument Sans (text) never draws U+202F').toBe(false);
    // both draw the fallback U+00A0
    expect([...display, ...text].every((c) => c.has(0x00a0))).toBe(true);
  });

  it('the cmap reader is NON-VACUOUS: it FINDS a mapped codepoint and REJECTS an unmapped one', () => {
    const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
    const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    const makeCmapSfnt = (codepoints: number[]): Uint8Array => {
      const segs = [...codepoints].sort((a, b) => a - b).concat(0xffff);
      const segX2 = segs.length * 2;
      const sub = [
        ...be16(4), ...be16(16 + 4 * segX2), ...be16(0), ...be16(segX2),
        ...be16(0), ...be16(0), ...be16(0),
        ...segs.flatMap((c) => be16(c)),
        ...be16(0),
        ...segs.flatMap((c) => be16(c)),
        ...segs.flatMap(() => be16(1)),
        ...segs.flatMap(() => be16(0)),
      ];
      const cmap = [...be16(0), ...be16(1), ...be16(3), ...be16(1), ...be32(12), ...sub];
      const dirLen = 12 + 16;
      const rec = [...[...'cmap'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...be32(dirLen), ...be32(cmap.length)];
      return new Uint8Array([...be32(0x00010000), ...be16(1), ...be16(0), ...be16(0), ...be16(0), ...rec, ...cmap]);
    };
    const cmap = readCmap(makeCmapSfnt([0x41, 0x00a0]));
    expect(cmap.has(0x41), 'a mapped codepoint is FOUND').toBe(true);
    expect(cmap.has(0x00a0), 'the mapped NBSP is FOUND').toBe(true);
    expect(cmap.has(0x202f), 'an UNMAPPED codepoint (U+202F) is NOT found').toBe(false);
    expect(cmap.has(0x42), 'an UNMAPPED codepoint (U+0042) is NOT found').toBe(false);
  });
});
