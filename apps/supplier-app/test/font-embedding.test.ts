import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_FAMILY_BY_WEIGHT, FONT_WEIGHTS, fontFamilyForWeight } from '../src/ui/fonts';

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

  it('each embedded TTF carries its DISTINCT family name + correct weight class (WO-5.1 collision fixed)', () => {
    // read the name/OS2 tables with fontTools if available (the built artifact
    // registers fonts by these); skip cleanly if python/fontTools is absent.
    let py: string;
    try {
      py = execFileSync('python3', ['-c', 'import fontTools; print("ok")'], { encoding: 'utf8' }).trim();
    } catch {
      return; // no python/fontTools in this env — the app.json + fonts.ts pins above still hold
    }
    expect(py).toBe('ok');
    const script = `
import json, glob, os
from fontTools.ttLib import TTFont
out = {}
for f in sorted(glob.glob(os.path.join(${JSON.stringify(join(appDir, 'assets/fonts'))}, '*.ttf'))):
    t = TTFont(f)
    out[os.path.basename(f)] = [t['name'].getDebugName(1), t['OS/2'].usWeightClass]
print(json.dumps(out))
`;
    const result = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' })) as Record<
      string,
      [string, number]
    >;
    const expected: Record<string, [string, number]> = {
      'Archivo-Regular.ttf': ['Archivo-Regular', 400],
      'Archivo-Medium.ttf': ['Archivo-Medium', 500],
      'Archivo-Bold.ttf': ['Archivo-Bold', 700],
      'Archivo-ExtraBold.ttf': ['Archivo-ExtraBold', 800],
      'Archivo-Black.ttf': ['Archivo-Black', 900],
    };
    expect(result).toEqual(expected);
    // and the families are all distinct (no collision)
    expect(new Set(Object.values(result).map(([fam]) => fam)).size).toBe(5);
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
