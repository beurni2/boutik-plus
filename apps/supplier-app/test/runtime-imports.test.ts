import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

/**
 * CONFIG-PLUGIN GATE (device incident 2026-07-25 — the gallery button did
 * nothing when tapped).
 *
 * A native dependency that ships an Expo CONFIG PLUGIN needs that plugin listed
 * in `app.json`, because the plugin is what injects the iOS usage descriptions
 * into the built app. Without `NSPhotoLibraryUsageDescription`, iOS refuses to
 * present the photo library and `launchImageLibraryAsync` resolves
 * `canceled: true` **with no UI at all** — a button that looks dead.
 *
 * `expo-image-picker` AND `expo-camera` were both missing from `app.json` while
 * both were in `package.json`. Autolinking pulls the native code in; only the
 * plugin supplies the permission strings. The next native build would have had
 * no camera permission either.
 */
describe('every dependency shipping a config plugin is declared in app.json', () => {
  it('no dep that injects an iOS permission sentence is missing from app.json', () => {
    const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const app = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8')) as {
      expo: { plugins?: (string | [string, unknown])[] };
    };
    const declared = new Set((app.expo.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p)));
    // SCOPED TO WHAT THIS GATE CAN PROVE: plugins that inject an iOS usage
    // description. That is the class that produced the dead button, and it is
    // detected from the plugin's own bytes rather than a hand-kept list.
    // `expo-updates` and `expo-file-system` also ship plugins and are NOT here
    // — neither injects a usage description, and expo-updates' runtime config
    // is deliberately written by CI (`eas update:configure`), never committed.
    // Both are named in JOURNAL.md as reported-not-filled rather than skipped.
    const missing = Object.keys(pkg.dependencies).filter((dep) => {
      const pluginDir = join(appDir, 'node_modules', dep, 'plugin', 'build');
      if (!existsSync(pluginDir)) return false;
      const injectsPermission = readdirSync(pluginDir)
        .filter((f) => f.endsWith('.js'))
        .some((f) => readFileSync(join(pluginDir, f), 'utf8').includes('UsageDescription'));
      return injectsPermission && !declared.has(dep);
    });
    expect(missing, `permission-injecting plugin not in app.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('the picker and the camera carry FRENCH permission sentences — iOS shows these verbatim', () => {
    const app = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8')) as {
      expo: { plugins: (string | [string, Record<string, string>])[] };
    };
    const entry = (name: string) =>
      app.expo.plugins.find((p): p is [string, Record<string, string>] => Array.isArray(p) && p[0] === name);
    const picker = entry('expo-image-picker');
    const camera = entry('expo-camera');
    expect(picker?.[1].photosPermission).toMatch(/Boutik\+/);
    expect(picker?.[1].photosPermission).toMatch(/photos/i);
    expect(camera?.[1].cameraPermission).toMatch(/Boutik\+/);
    // no English leaking into a dialog a market seller reads
    for (const s of [picker?.[1].photosPermission, camera?.[1].cameraPermission]) {
      expect(s).not.toMatch(/\b(allow|access|photo library|camera)\b/i);
    }
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
