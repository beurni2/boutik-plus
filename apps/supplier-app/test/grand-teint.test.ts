import { readFileSync } from 'node:fs';
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
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
// AUDIT-B+2 F-60 — the icon components (`src/ui/icons.tsx`) served only the
// retired E1 shell and left with it; the live pages draw their own glyphs.

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
  // EXPO-57-2 (founder 2026-09-05: « go sdk ») — every version below is what
  // `expo@57.0.20/bundledNativeModules.json` pins for SDK 57, read from the
  // packed tarball, never guessed. The founder's Expo Go moved off SDK 54 with
  // its store update, so the WO-4.0d re-target (57 → 54) is reversed; the
  // rulings that admitted each dependency stand unchanged.
  it('the approved set, and NO other runtime dep', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['react-native-svg']).toBe('15.15.4');
    expect(pkg.dependencies['expo-haptics']).toBe('~57.0.2');
    expect(pkg.dependencies['expo-font']).toBe('~57.0.3');
    expect(pkg.dependencies['expo-file-system']).toBe('~57.0.6');
    expect(pkg.dependencies['expo-crypto']).toBe('~57.0.2');
    // STUDIO-GALLERY-1 (founder ruling 2026-07-25): « HE WANTS TO UPLOAD FROM HIS
    // DEVICE, not only capture » — gallery for hero and details, camera-only for
    // the PROOF role on native. The picker is the only way to obtain a library URI.
    //
    // PINNED EXACTLY after BOUTIK-WEB-W2 caught the cost of not pinning: this
    // entry was the gate's one `toBeDefined()`, and it let `^57.0.6` — the NEXT
    // SDK's line — ship against SDK 54 (`bundledNativeModules.json` says
    // ~17.0.11). The web target exploded at require (`createPermissionHook is
    // not a function`); the next NATIVE build would have paired mismatched
    // native code with the SDK 54 runtime. A gate that only checks presence
    // cannot catch a wrong generation. (SDK 57 now: ~57.0.16, same source.)
    expect(pkg.dependencies['expo-image-picker']).toBe('~57.0.16');
    const before = new Set([
      '@platform/i18n', '@platform/ui-tokens', 'expo', 'expo-camera',
      'expo-image-manipulator', 'expo-status-bar', 'expo-updates', 'react', 'react-native',
      // TAXONOMIE-CANON-1 (founder order 2026-09-16: « fix the 3 that is still
      // open » — the category list's home is platform-contracts): the wizard's
      // shelves now come from the platform's own data package (canon 3.14.0),
      // pure data, RN-safe, no intra-family dep — a first-party package, not a
      // third-party dependency.
      '@platform/taxonomy',
    ]);
    const added = Object.keys(pkg.dependencies).filter((d) => !before.has(d));
    // WO-FP-BOUTIK adds NO new runtime dep (the FP fonts are assets; gradients
    // use the already-approved react-native-svg). The WO-FP-PIXEL web harness
    // deps (react-dom/react-native-web) were REMOVED with the visual pipeline —
    // fidelity is VALUE MATCH ONLY (founder order 2026-07-17): the property
    // gate compares style data to the Phase-0 table; nothing renders.
    //
    // BOUTIK-WEB-W1 (Boutik-Plus-Web North Star, founder-confirmed 2026-07-26):
    // react-native-web and react-dom RETURN — under a different authority than
    // the one that removed them. Then they were a test harness (still removed;
    // fidelity stays value-match); now they are the PRODUCT's web platform:
    // Boutik+ ships a web target from this same codebase. @expo/metro-runtime
    // is the metro web entry those two need.
    expect(added.sort()).toEqual([
      '@expo/metro-runtime',
      'expo-crypto', 'expo-file-system', 'expo-font', 'expo-haptics', 'expo-image-picker',
      'react-dom', 'react-native-svg', 'react-native-web',
    ]);
  });
});
