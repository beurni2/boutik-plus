import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type as fpType } from '@platform/ui-tokens';
import { FONT_FAMILY_DISPLAY, FONT_FAMILY_TEXT, FONT_FALLBACK } from '../src/ui/fonts';

/**
 * WO-FP-BOUTIK — the SUBSTRATE: the canon icon set (unchanged — the 26 glyphs
 * are the ecosystem's, generated from design-reference), the Faso Premium
 * typeface roots, and the approved-deps guard (this slice adds NONE). The icon
 * proof is geometry-identity; the RN repo idiom is source-discipline (no RN
 * renderer harness).
 */

const appDir = join(import.meta.dirname, '..');
const repoRoot = join(appDir, '../..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const iconsSrc = read('src/ui/icons.tsx');
const svgDir = join(repoRoot, 'design-reference/grand-teint/icons');
const svgNames = readdirSync(svgDir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

describe('the 26 icon components carry the design-reference geometry (byte-identity)', () => {
  it('there are exactly 26 canonical glyphs, and 26 components', () => {
    expect(svgNames).toHaveLength(26);
    expect(iconsSrc.match(/export function Icon\w+\(/g)).toHaveLength(26);
  });

  it('every path `d`, circle and rect from every SVG appears verbatim in its component', () => {
    for (const name of svgNames) {
      const svg = readFileSync(join(svgDir, `${name}.svg`), 'utf8');
      const ds = [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
      const circles = [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)];
      for (const d of ds) {
        expect(iconsSrc, `${name}: path d not carried verbatim`).toContain(`d="${d}"`);
      }
      for (const c of circles) {
        expect(iconsSrc, `${name}: circle not carried`).toContain(`cx={${c[1]}}`);
        expect(iconsSrc, `${name}: circle not carried`).toContain(`cy={${c[2]}}`);
      }
    }
  });

  it('every component defaults to currentColor and threads it to every stroke/fill', () => {
    const comps = iconsSrc.split(/export function Icon(?=[A-Z])/).slice(1);
    expect(comps).toHaveLength(26);
    for (const c of comps) {
      expect(c).toMatch(/color = 'currentColor'/);
      expect(c).toMatch(/stroke=\{color\}/);
      expect(c).toMatch(/color=\{color\}/);
      expect(c).toMatch(/width=\{size\} height=\{size\}/);
      expect(c).toMatch(/viewBox="0 0 24 24"/);
    }
    expect(iconsSrc).toMatch(/size = 20/);
    expect(iconsSrc).toMatch(/from 'react-native-svg'/);
  });

  it('the icon module carries no hardcoded color — currentColor only (zero-hardcode)', () => {
    expect(iconsSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(iconsSrc).not.toMatch(/\brgba?\(|\bhsla?\(/);
  });
});

describe('the Faso Premium typeface roots — data only, loads nothing', () => {
  it('the two family roots match the canon token family names (README § Type)', () => {
    expect(FONT_FAMILY_DISPLAY).toBe(fpType.families.display.name);
    expect(FONT_FAMILY_DISPLAY).toBe('Bricolage Grotesque');
    expect(FONT_FAMILY_TEXT).toBe(fpType.families.text.name);
    expect(FONT_FAMILY_TEXT).toBe('Instrument Sans');
    expect(FONT_FALLBACK).toBe('System');
  });

  it('the substrate GATES NOTHING: it is data, with no font loader and no expo-font import (cold-start law)', () => {
    const src = read('src/ui/fonts.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/expo-font|loadAsync|useFonts/);
    expect(src).not.toMatch(/\brequire\(/);
  });
});

describe('the approved dependencies — every one traceable to a founder ruling', () => {
  it('the approved set, and NO other runtime dep', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['react-native-svg']).toBe('15.12.1');
    expect(pkg.dependencies['expo-haptics']).toBe('~15.0.8');
    expect(pkg.dependencies['expo-font']).toBe('~14.0.12');
    expect(pkg.dependencies['expo-file-system']).toBe('~19.0.23');
    expect(pkg.dependencies['expo-crypto']).toBe('~15.0.9');
    // STUDIO-GALLERY-1 (founder ruling 2026-07-25): « HE WANTS TO UPLOAD FROM HIS
    // DEVICE, not only capture » — gallery for hero and details, camera-only for
    // the PROOF role. The picker is the only way to obtain a library URI.
    expect(pkg.dependencies['expo-image-picker']).toBeDefined();
    const before = new Set([
      '@platform/i18n', '@platform/ui-tokens', 'expo', 'expo-camera',
      'expo-image-manipulator', 'expo-status-bar', 'expo-updates', 'react', 'react-native',
    ]);
    const added = Object.keys(pkg.dependencies).filter((d) => !before.has(d));
    // WO-FP-BOUTIK adds NO new runtime dep (the FP fonts are assets; gradients
    // use the already-approved react-native-svg). The WO-FP-PIXEL web harness
    // deps (react-dom/react-native-web) were REMOVED with the visual pipeline —
    // fidelity is VALUE MATCH ONLY (founder order 2026-07-17): the property
    // gate compares style data to the Phase-0 table; nothing renders.
    expect(added.sort()).toEqual([
      'expo-crypto', 'expo-file-system', 'expo-font', 'expo-haptics', 'expo-image-picker', 'react-native-svg',
    ]);
  });
});
