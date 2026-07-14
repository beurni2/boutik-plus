import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FP_FACES, FP_FONT_DIR, fontFamily } from '../src/ui/fonts';
import { readSfntIdentity } from '../src/ui/sfnt';

/**
 * WO-FP-BOUTIK — the Faso Premium faces are embedded NATIVELY (present at first
 * frame), never loaded asynchronously. The config plugin lists the six static
 * instances; each TTF carries a DISTINCT weight-specific family (the WO-5.1
 * name-table collision lesson, re-proven on the FP bytes); the kit addresses
 * those families by (kind, weight); and no JS async font load exists anywhere.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

describe('the Faso Premium typeface is embedded natively, at first frame', () => {
  it('app.json declares the expo-font config plugin with all six FP instances', () => {
    const cfg = JSON.parse(read('app.json')) as { expo: { plugins?: unknown[] } };
    const plugins = cfg.expo.plugins ?? [];
    const fontPlugin = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-font') as
      | [string, { fonts: string[] }]
      | undefined;
    expect(fontPlugin, 'expo-font config plugin present').toBeDefined();
    const fonts = fontPlugin![1].fonts;
    for (const face of FP_FACES) {
      expect(fonts, `plugin embeds ${face.file}`).toContain(`./assets/fonts/${FP_FONT_DIR}/${face.file}`);
    }
    expect(fonts).toHaveLength(6);
    // Archivo (Grand Teint) is NO LONGER embedded — the app renders only FP.
    expect(fonts.some((f) => /Archivo/.test(f))).toBe(false);
  });

  it('NO async font load anywhere in the app — the font never gates a render', () => {
    for (const f of ['App.tsx', 'src/ui/kit.tsx', 'src/ui/fonts.ts']) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${f} loads a font at runtime`).not.toMatch(/useFonts|loadAsync|Font\.load|from 'expo-font'/);
    }
  });

  it('the kit addresses each design (kind, weight) by its distinct embedded family', () => {
    expect(fontFamily('display', 700)).toBe('BricolageGrotesque-Bold');
    expect(fontFamily('display', 800)).toBe('BricolageGrotesque-ExtraBold');
    expect(fontFamily('text', 400)).toBe('InstrumentSans-Regular');
    expect(fontFamily('text', 500)).toBe('InstrumentSans-Medium');
    expect(fontFamily('text', 600)).toBe('InstrumentSans-SemiBold');
    expect(fontFamily('text', 700)).toBe('InstrumentSans-Bold');
    // a weight with no shipped instance → nearest in that family (ties heavier),
    // so no text drops to the system face: display 400 → 700, text 800 → 700.
    expect(fontFamily('display', 400)).toBe('BricolageGrotesque-Bold');
    expect(fontFamily('text', 800)).toBe('InstrumentSans-Bold');
    // the six embedded families are DISTINCT (the WO-5.1 collision would fail this)
    expect(new Set(FP_FACES.map((f) => f.family)).size).toBe(6);
  });

  it('each embedded TTF carries its DISTINCT name-table family + weight class — pure TS, NEVER skips', () => {
    const dir = join(appDir, 'assets/fonts', FP_FONT_DIR);
    for (const face of FP_FACES) {
      const id = readSfntIdentity(new Uint8Array(readFileSync(join(dir, face.file))));
      expect(id, `${face.file} identity`).toEqual({ family: face.family, weightClass: face.wght });
    }
    // the six name-table identities are DISTINCT
    const ids = FP_FACES.map((f) => readSfntIdentity(new Uint8Array(readFileSync(join(dir, f.file)))).family);
    expect(new Set(ids).size).toBe(6);
  });

  it('the sfnt reader is NON-VACUOUS: a PLANTED name-table collision is DETECTED', () => {
    const makeSfnt = (family: string, weight: number): Uint8Array => {
      const fam = new Uint8Array(family.length * 2);
      for (let i = 0; i < family.length; i++) fam[i * 2 + 1] = family.charCodeAt(i); // UTF-16BE (ASCII)
      const nameRec = new Uint8Array([0, 3, 0, 1, 0x04, 0x09, 0, 1, (fam.length >> 8) & 0xff, fam.length & 0xff, 0, 0]);
      const nameHdr = new Uint8Array([0, 0, 0, 1, 0, 18]);
      const name = new Uint8Array([...nameHdr, ...nameRec, ...fam]);
      const os2 = new Uint8Array([0, 4, 0, 0, (weight >> 8) & 0xff, weight & 0xff]);
      const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
      const header = 12 + 2 * 16;
      const rec = (t: string, off: number, len: number) => [...[...t].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...be32(off), ...be32(len)];
      return new Uint8Array([
        0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0,
        ...rec('OS/2', header, os2.length),
        ...rec('name', header + os2.length, name.length),
        ...os2,
        ...name,
      ]);
    };
    expect(readSfntIdentity(makeSfnt('Bricolage-Test', 615))).toEqual({ family: 'Bricolage-Test', weightClass: 615 });
    const collided = [makeSfnt('InstrumentSans-SemiBold', 400), makeSfnt('InstrumentSans-SemiBold', 700), makeSfnt('InstrumentSans-Bold', 700)];
    const families = collided.map((b) => readSfntIdentity(b).family);
    expect(families).toEqual(['InstrumentSans-SemiBold', 'InstrumentSans-SemiBold', 'InstrumentSans-Bold']);
    expect(new Set(families).size).toBe(2); // 3 fonts, 2 identities → the collision is SEEN
  });

  it('the six embedded TTFs exist and stay within the FP byte budget (STEP-0 flag ②: ~293 KB)', () => {
    const dir = join(appDir, 'assets/fonts', FP_FONT_DIR);
    let total = 0;
    for (const face of FP_FACES) {
      const size = statSync(join(dir, face.file)).size;
      expect(size, `${face.file} present + non-trivial`).toBeGreaterThan(10_000);
      total += size;
    }
    // the FP set (2 families / 6 cuts) is larger than Archivo (166.7 KB) — the
    // +126 KB was STEP-0-flagged for this adoption slice; pinned under 320 KB.
    expect(total, 'within the FP font budget').toBeLessThan(320 * 1024);
  });
});
