import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatFcfa } from '../src/demo/store';
import { readCmap, readSfntIdentity } from '../src/ui/sfnt';

/**
 * WO-FP-BOUTIK · STEP 0 — the Faso Premium font pipeline, guarded on the NEW
 * bytes. Bricolage Grotesque (700/800) + Instrument Sans (400/500/600/700),
 * subset per weight with DISTINCT name-table identities (the Archivo WO-5.1
 * collision lesson) and the money-render/cmap proof rebuilt on the new fonts:
 * « 11 500 F » drawable in EVERY weight through the EXISTING formatter
 * (formatFcfa consumed, untouched), and the U+202F/U+00A0 question answered by
 * the fonts' actual cmap, consciously pinned.
 *
 * STAGED ONLY: these fonts are not wired into app.json/the kit — that is the
 * v2-token adoption (gated on canon WO-FP-0). Archivo stays the shipped face;
 * its own guards (font-embedding / money-render) are untouched and still green.
 * The sfnt reader's non-vacuity (a planted collision is DETECTED, an unmapped
 * codepoint is REJECTED) is locked by test/font-embedding.test.ts +
 * test/money-render.test.ts, which exercise the SAME reader.
 */

const dir = join(import.meta.dirname, '..', 'assets/fonts/faso-premium');
const bytes = (f: string) => new Uint8Array(readFileSync(join(dir, f)));

// The six staged cuts and their EXPECTED distinct identities.
const FP_FONTS: Record<string, { family: string; weightClass: number }> = {
  'BricolageGrotesque-Bold.ttf': { family: 'BricolageGrotesque-Bold', weightClass: 700 },
  'BricolageGrotesque-ExtraBold.ttf': { family: 'BricolageGrotesque-ExtraBold', weightClass: 800 },
  'InstrumentSans-Regular.ttf': { family: 'InstrumentSans-Regular', weightClass: 400 },
  'InstrumentSans-Medium.ttf': { family: 'InstrumentSans-Medium', weightClass: 500 },
  'InstrumentSans-SemiBold.ttf': { family: 'InstrumentSans-SemiBold', weightClass: 600 },
  'InstrumentSans-Bold.ttf': { family: 'InstrumentSans-Bold', weightClass: 700 },
};
const FILES = Object.keys(FP_FONTS);
const BRICOLAGE = FILES.filter((f) => f.startsWith('Bricolage'));
const INSTRUMENT = FILES.filter((f) => f.startsWith('Instrument'));

describe('STEP 0 · distinct name-table identity per weight (the Archivo collision lesson)', () => {
  it('each staged TTF carries its DISTINCT family + usWeightClass (read from the real bytes)', () => {
    const got: Record<string, { family: string; weightClass: number }> = {};
    for (const f of FILES) got[f] = readSfntIdentity(bytes(f));
    expect(got).toEqual(FP_FONTS);
  });

  it('the six identities are DISTINCT — a name-table collision (WO-5.1) would collapse this Set', () => {
    const families = FILES.map((f) => readSfntIdentity(bytes(f)).family);
    expect(new Set(families).size).toBe(6);
    // and each weight class is the design weight, not a defaulted 400
    expect(FILES.map((f) => readSfntIdentity(bytes(f)).weightClass).sort((a, b) => a - b)).toEqual([400, 500, 600, 700, 700, 800]);
  });

  it('the two families are exactly the WO-named set — Bricolage 700/800 · Instrument 400/500/600/700', () => {
    expect(BRICOLAGE.map((f) => FP_FONTS[f]!.weightClass).sort((a, b) => a - b)).toEqual([700, 800]);
    expect(INSTRUMENT.map((f) => FP_FONTS[f]!.weightClass).sort((a, b) => a - b)).toEqual([400, 500, 600, 700]);
  });
});

describe('STEP 0 · money renders on the NEW bytes through the EXISTING formatter (formatFcfa consumed, untouched)', () => {
  const cmapAll = () => FILES.map((f) => readCmap(bytes(f)));

  it('EVERY codepoint formatFcfa emits for « 11 500 » is drawable by ALL SIX weights', () => {
    const cmaps = cmapAll();
    const inAll = (cp: number) => cmaps.every((c) => c.has(cp));
    // formatFcfa is the SHIPPED formatter — its output is the load-bearing string
    const emitted = [...formatFcfa(11_500)].map((c) => c.codePointAt(0)!);
    expect(emitted).toEqual([0x31, 0x31, 0x00a0, 0x35, 0x30, 0x30]); // "11" U+00A0 "500" — the ruling-③ NBSP
    const missing = emitted.filter((cp) => !inAll(cp)).map((c) => '0x' + c.toString(16));
    expect(missing, 'formatFcfa output fully drawable in every FP weight').toEqual([]);
  });

  it('the full « 11 500 F » glyph set — digits · U+00A0 separator · space · « F » — is drawable by every weight', () => {
    const cmaps = cmapAll();
    const inAll = (cp: number) => cmaps.every((c) => c.has(cp));
    for (const cp of [0x30, 0x31, 0x35, 0x00a0, 0x20, 0x46]) {
      expect(inAll(cp), `every FP weight draws U+${cp.toString(16).padStart(4, '0')}`).toBe(true);
    }
  });

  it('U+00A0 (the rendered separator) is present in every weight — « 11 500 F » never tofus', () => {
    for (const f of FILES) expect(readCmap(bytes(f)).has(0x00a0), `${f} draws U+00A0`).toBe(true);
  });

  it('the U+202F question — PINNED to the bytes: Bricolage HAS it, Instrument Sans LACKS it (the U+00A0 fallback stays necessary)', () => {
    // Consciously pinned per each font's ACTUAL cmap. The body face (Instrument
    // Sans, « everything else ») cannot draw U+202F, so formatFcfa's U+00A0
    // normalization (ruling ③) remains required. A future bytes change flips this.
    for (const f of BRICOLAGE) expect(readCmap(bytes(f)).has(0x202f), `${f} HAS U+202F`).toBe(true);
    for (const f of INSTRUMENT) expect(readCmap(bytes(f)).has(0x202f), `${f} LACKS U+202F`).toBe(false);
  });
});

describe('STEP 0 · the staged assets exist, are non-trivial, and OFL ships with them', () => {
  it('all six TTFs are present and non-trivial', () => {
    for (const f of FILES) {
      expect(statSync(join(dir, f)).size, `${f} present + non-trivial`).toBeGreaterThan(10_000);
    }
  });

  it('the OFL license text ships alongside both families (redistribution + embedding)', () => {
    const bricolage = readFileSync(join(dir, 'OFL-BricolageGrotesque.txt'), 'utf8');
    const instrument = readFileSync(join(dir, 'OFL-InstrumentSans.txt'), 'utf8');
    expect(bricolage).toMatch(/SIL OPEN FONT LICENSE/i);
    expect(bricolage).toMatch(/Bricolage Grotesque Project Authors/);
    expect(instrument).toMatch(/SIL OPEN FONT LICENSE/i);
    expect(instrument).toMatch(/Instrument Sans Project Authors/);
  });
});
