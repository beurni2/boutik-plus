import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatFcfa } from '../src/demo/store';
import { FONT_WEIGHTS } from '../src/ui/fonts';
import { readCmap } from '../src/ui/sfnt';

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

  it('EVERY codepoint the seller sees in a franc amount is in the embedded Archivo cmap — pure TS, NEVER skips (WO-6.8)', () => {
    // WO-6.8: the old check read cmaps via python/fontTools and RETURNED EARLY
    // when absent — green while asserting nothing about which glyphs paint. This
    // reads the cmap straight from the committed bytes (src/ui/sfnt.ts) so it
    // runs in every environment, on the intersection of all five weights.
    const dir = join(appDir, 'assets/fonts');
    const cmaps = Object.values(FONT_WEIGHTS).map((f) => readCmap(new Uint8Array(readFileSync(join(dir, f)))));
    const inAll = (cp: number): boolean => cmaps.every((c) => c.has(cp));
    expect(cmaps).toHaveLength(5);

    // the fallback separator we render IS drawable by every weight …
    expect(inAll(0x00a0), 'embedded Archivo draws U+00A0 (the rendered separator)').toBe(true);

    // … and the canon U+202F is NOT — PINNED to its CURRENT state. The founder
    // has asked the designer to add U+202F to the Archivo subset. WHEN her new
    // bytes land, THIS ASSERTION FAILS LOUDLY: the slice that adopts them must
    // consciously flip it to `.toBe(true)` AND re-verify formatFcfa's separator
    // choice (the U+00A0 fallback becomes obsolete). The U+202F transition can
    // never happen silently, and it can never quietly slip through a skip.
    expect(inAll(0x202f), 'embedded Archivo lacks U+202F today — the U+00A0 fallback is still necessary').toBe(false);

    // every actual codepoint in « 11 500 F » is drawable by all five weights
    const rendered = fullAmount();
    const missing = [...rendered]
      .map((c) => c.codePointAt(0)!)
      .filter((cp) => !inAll(cp))
      .map((c) => '0x' + c.toString(16));
    expect(missing, 'every glyph in « 11 500 F » is drawable by Archivo').toEqual([]);
  });

  it('the cmap reader is NON-VACUOUS: it FINDS a mapped codepoint and REJECTS an unmapped one (WO-6.8)', () => {
    // a minimal real sfnt with a format-4 cmap mapping exactly U+0041 and U+00A0
    // — built byte-by-byte, so the reader is proven to read ACTUAL coverage in
    // BOTH directions (the WO-6.7 byte-built-sfnt standard).
    const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
    const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    const makeCmapSfnt = (codepoints: number[]): Uint8Array => {
      const segs = [...codepoints].sort((a, b) => a - b).concat(0xffff); // last segment ends at 0xFFFF
      const segX2 = segs.length * 2;
      const sub = [
        ...be16(4), ...be16(16 + 4 * segX2), ...be16(0), ...be16(segX2), // format, length, language, segCountX2
        ...be16(0), ...be16(0), ...be16(0), // searchRange, entrySelector, rangeShift (reader ignores)
        ...segs.flatMap((c) => be16(c)), // endCode[]
        ...be16(0), // reservedPad
        ...segs.flatMap((c) => be16(c)), // startCode[] (point segments: start === end)
        ...segs.flatMap(() => be16(1)), // idDelta[] = 1 → glyph = cp+1 (0 only for 0xFFFF terminator)
        ...segs.flatMap(() => be16(0)), // idRangeOffset[] = 0
      ];
      const cmap = [...be16(0), ...be16(1), ...be16(3), ...be16(1), ...be32(12), ...sub]; // 1 Windows-BMP subtable
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
