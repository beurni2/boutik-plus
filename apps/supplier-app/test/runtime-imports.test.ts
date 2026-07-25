import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Metro-safety ban test (WO-1.4 pre-flight): the v0.3.0 canon ROOTS are
 * RN-safe and the shell imports them DIRECTLY — but @platform/certification
 * is node tooling and must NEVER enter the app runtime graph, nor may any
 * node-only subpath or node builtin. Both quote styles matched (the
 * double-quote evasion is a known, defeated trick).
 */

const appDir = join(import.meta.dirname, '..');
const BANNED = /@platform\/certification|@platform\/contracts\/(drift-check|drift-cli)|@platform\/i18n\/(data-loader|lint-cli)|^node:/;

/**
 * OTA-SAFETY BAN (device incident 2026-07-25 — a WHITE SCREEN at boot).
 *
 * The preview channel ships JS-only `eas update` bundles. A NATIVE module
 * reaches a phone only inside a new binary, so a package added to
 * `package.json` in a JS-only slice is ABSENT from every already-installed
 * build. The moment such a package is imported at the TOP LEVEL of anything the
 * boot graph reaches, the bundle throws before React mounts and the founder
 * gets a white screen — with no error text, on the build he was asked to test.
 *
 * `expo-image-picker` is that package. It must be `require`d lazily, inside the
 * call that uses it, so the app boots on an old binary and only the gallery tap
 * lands in a designed failed state.
 */
const OTA_UNSAFE = ['expo-image-picker'];

describe('OTA safety — a post-binary native dep never sits in the boot import graph', () => {
  it('no source file STATICALLY imports a package the installed binary may not have', () => {
    const files = readdirSync(join(appDir, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      .map((f) => join(appDir, 'src', f));
    files.push(join(appDir, 'App.tsx'));
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const spec of [...source.matchAll(/^import (?!type )[^;]*from ['"]([^'"]+)['"];/gm)].map((m) => m[1]!)) {
        if (OTA_UNSAFE.includes(spec)) offenders.push(`${file.slice(appDir.length + 1)} → ${spec}`);
      }
    }
    expect(offenders, `static import of an OTA-unsafe native dep: ${offenders.join(', ')}`).toEqual([]);
  });

  it('and it IS still reachable lazily — a ban that removed the feature would be no fix at all', () => {
    const native = readFileSync(join(appDir, 'src/studio/pick-native.ts'), 'utf8');
    expect(native).toMatch(/require\('expo-image-picker'\)/);
    expect(native).toMatch(/imagePicker\(\)\.launchImageLibraryAsync/);
  });
});

describe('supplier-app runtime import bans', () => {
  it('App.tsx and src/i18n.ts runtime-import no certification suite, node-only subpath, or node builtin', () => {
    for (const file of ['App.tsx', 'src/i18n.ts']) {
      const source = readFileSync(join(appDir, file), 'utf8');
      const runtimeImports = [...source.matchAll(/^import (?!type )[^;]*from ['"]([^'"]+)['"];/gm)].map((m) => m[1]!);
      expect(runtimeImports.length).toBeGreaterThan(0);
      for (const spec of runtimeImports) {
        expect(spec, `${file} runtime-imports ${spec}`).not.toMatch(BANNED);
      }
    }
  });

  it('the direct canon ROOT import is present — the RN-safe entry is used, not worked around', () => {
    const source = readFileSync(join(appDir, 'App.tsx'), 'utf8');
    expect(source).toMatch(/^import \{[^}]*computeWaterfall[^}]*\} from '@platform\/contracts';/m);
  });
});
