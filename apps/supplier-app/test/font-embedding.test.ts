import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_FAMILY_BY_WEIGHT, FONT_WEIGHTS, fontFamilyForWeight } from '../src/ui/fonts';
import { readSfntIdentity } from '../src/ui/sfnt';

/**
 * WO-6.0 ruling ② — Archivo is embedded NATIVELY (present at first frame),
 * never loaded asynchronously. This pins the mechanism the prebuilt artifact
 * proved: the config plugin lists the five instances, each TTF carries a
 * DISTINCT weight-specific family (the WO-5.1 name-table collision is fixed and
 * guarded), the kit addresses those families by weight, and no JS async font
 * load exists anywhere.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

describe('the typeface is embedded natively, at first frame (ruling ②)', () => {
  it('app.json declares the expo-font config plugin with all five static instances', () => {
    const cfg = JSON.parse(read('app.json')) as { expo: { plugins?: unknown[] } };
    const plugins = cfg.expo.plugins ?? [];
    const fontPlugin = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-font') as
      | [string, { fonts: string[] }]
      | undefined;
    expect(fontPlugin, 'expo-font config plugin present').toBeDefined();
    const fonts = fontPlugin![1].fonts;
    for (const file of Object.values(FONT_WEIGHTS)) {
      expect(fonts, `plugin embeds ${file}`).toContain(`./assets/fonts/${file}`);
    }
    expect(fonts).toHaveLength(5);
  });

  it('NO async font load anywhere in the app — the font never gates a render', () => {
    for (const f of ['App.tsx', 'src/ui/kit.tsx', 'src/ui/fonts.ts']) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${f} loads a font at runtime`).not.toMatch(/useFonts|loadAsync|Font\.load|from 'expo-font'/);
    }
  });

  it('the kit addresses each design weight by its distinct embedded family', () => {
    expect(fontFamilyForWeight(400)).toBe('Archivo-Regular');
    expect(fontFamilyForWeight(500)).toBe('Archivo-Medium');
    expect(fontFamilyForWeight(700)).toBe('Archivo-Bold');
    expect(fontFamilyForWeight(800)).toBe('Archivo-ExtraBold');
    expect(fontFamilyForWeight(900)).toBe('Archivo-Black');
    // the type scale's `row`/reconcileLine wght 600 has no shipped instance →
    // nearest, ties resolve heavier (700) so no text drops to the system face.
    expect(fontFamilyForWeight(600)).toBe('Archivo-Bold');
    // the five families are distinct (the WO-5.1 collision would fail this)
    expect(new Set(Object.values(FONT_FAMILY_BY_WEIGHT)).size).toBe(5);
  });

  it('each embedded TTF carries its DISTINCT name-table family + weight class — pure TS, NEVER skips (WO-6.7)', () => {
    // WO-6.7: the old test read the name/OS2 tables via python/fontTools and
    // RETURNED EARLY when they were absent — green while asserting nothing, on
    // the exact WO-5.1 collision. This reads the bytes directly (src/ui/sfnt.ts)
    // so it can never skip: it runs the same assertion on the real embedded TTFs
    // in every environment.
    const dir = join(appDir, 'assets/fonts');
    const got: Record<string, { family: string; weightClass: number }> = {};
    for (const file of Object.values(FONT_WEIGHTS)) {
      got[file] = readSfntIdentity(new Uint8Array(readFileSync(join(dir, file))));
    }
    expect(got).toEqual({
      'Archivo-Regular.ttf': { family: 'Archivo-Regular', weightClass: 400 },
      'Archivo-Medium.ttf': { family: 'Archivo-Medium', weightClass: 500 },
      'Archivo-Bold.ttf': { family: 'Archivo-Bold', weightClass: 700 },
      'Archivo-ExtraBold.ttf': { family: 'Archivo-ExtraBold', weightClass: 800 },
      'Archivo-Black.ttf': { family: 'Archivo-Black', weightClass: 900 },
    });
    // the five name-table identities are DISTINCT — the WO-5.1 collision (all
    // five reading « Archivo SemiBold ») would collapse this Set below 5.
    expect(new Set(Object.values(got).map((g) => g.family)).size).toBe(5);
  });

  it('the sfnt reader is NON-VACUOUS: a PLANTED name-table collision is DETECTED (WO-6.7)', () => {
    // A minimal, real sfnt (name + OS/2 tables) built byte-by-byte — so the
    // reader is proven to read the ACTUAL family bytes, not to trivially pass.
    const makeSfnt = (family: string, weight: number): Uint8Array => {
      const fam = new Uint8Array(family.length * 2);
      for (let i = 0; i < family.length; i++) fam[i * 2 + 1] = family.charCodeAt(i); // UTF-16BE (ASCII)
      // name table: header(6) + 1 record(12) + storage(fam)
      const nameRec = new Uint8Array([0, 3, 0, 1, 0x04, 0x09, 0, 1, (fam.length >> 8) & 0xff, fam.length & 0xff, 0, 0]);
      const nameHdr = new Uint8Array([0, 0, 0, 1, 0, 18]); // format 0, count 1, stringOffset 18
      const name = new Uint8Array([...nameHdr, ...nameRec, ...fam]);
      const os2 = new Uint8Array([0, 4, 0, 0, (weight >> 8) & 0xff, weight & 0xff]); // usWeightClass at offset 4
      const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
      const header = 12 + 2 * 16; // dir header + 2 records
      const rec = (t: string, off: number, len: number) => [...[...t].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...be32(off), ...be32(len)];
      return new Uint8Array([
        0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, // sfntVersion 1.0, numTables 2, search/entry/range 0
        ...rec('OS/2', header, os2.length),
        ...rec('name', header + os2.length, name.length),
        ...os2,
        ...name,
      ]);
    };
    // the reader reads the actual planted name + weight
    expect(readSfntIdentity(makeSfnt('Archivo-Test', 615))).toEqual({ family: 'Archivo-Test', weightClass: 615 });
    // and a COLLISION collapses the Set — proving the check would catch WO-5.1
    const collided = [makeSfnt('Archivo SemiBold', 400), makeSfnt('Archivo SemiBold', 700), makeSfnt('Archivo-Bold', 700)];
    const families = collided.map((b) => readSfntIdentity(b).family);
    expect(families).toEqual(['Archivo SemiBold', 'Archivo SemiBold', 'Archivo-Bold']);
    expect(new Set(families).size).toBe(2); // 3 fonts, 2 identities → the collision is SEEN
  });

  it('the five embedded TTFs exist and stay within the design byte budget', () => {
    let total = 0;
    for (const file of Object.values(FONT_WEIGHTS)) {
      const size = statSync(join(appDir, 'assets/fonts', file)).size;
      expect(size, `${file} present + non-trivial`).toBeGreaterThan(10_000);
      total += size;
    }
    expect(total, 'within the 180–240 KB design estimate').toBeLessThan(240 * 1024);
  });
});
