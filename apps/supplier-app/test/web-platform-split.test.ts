import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bytesFromUri } from '../src/supply/uri-bytes.web';

/**
 * BOUTIK-WEB-W2 — the platform-split rules, each protecting a specific
 * defect class:
 *
 *   · `expo-camera` must never enter the WEB import graph. Its web build
 *     spins a QR worker that fetches jsQR from a CDN at import time (W1
 *     finding) — an external fetch on every boot, and dead weight on a
 *     surface the founder ruled camera-free (W-D1).
 *   · every `.web.*` module needs its NATIVE sibling — Metro resolves the
 *     bare specifier per platform, and a `.web` file without a base file
 *     breaks the ANDROID bundle, which no vitest run would catch.
 *   · the web byte-reader is tested BY VALUE — it feeds the master hash,
 *     and a wrong read there becomes a false record at publish.
 */
const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const importSpecs = (src: string) =>
  [...src.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]!);

describe('the web import graph stays camera-free (BOUTIK-WEB-W2)', () => {
  it('studio-real (shared) imports no expo-camera — the split exists so the phase machine is platform-free', () => {
    expect(importSpecs(read('src/v2/studio-real.tsx'))).not.toContain('expo-camera');
  });

  it('the web shoot screen imports neither expo-camera nor the capture module that types against it', () => {
    const specs = importSpecs(read('src/v2/studio-shoot.web.tsx'));
    expect(specs).not.toContain('expo-camera');
    expect(specs.some((s) => s.includes('studio/capture'))).toBe(false);
  });

  it('the NATIVE shoot screen still owns the camera — moved, not lost', () => {
    expect(importSpecs(read('src/v2/studio-shoot.tsx'))).toContain('expo-camera');
  });

  it('the web byte-reader imports no expo-file-system — that package has no web behaviour to fall back on', () => {
    expect(importSpecs(read('src/supply/uri-bytes.web.ts'))).not.toContain('expo-file-system');
  });
});

describe('every .web module has its native sibling — a missing base file breaks the ANDROID bundle', () => {
  it('each src/**/*.web.ts(x) sits beside the file Metro falls back to', () => {
    const webFiles = readdirSync(join(appDir, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.web\.tsx?$/.test(f));
    expect(webFiles.length).toBeGreaterThan(0);
    for (const f of webFiles) {
      const base = join(appDir, 'src', f.replace(/\.web\.(tsx?)$/, '.$1'));
      expect(existsSync(base), `${f} has no native sibling`).toBe(true);
    }
  });

  it('and each pair exports the same names — a web-only export is a native-only crash', () => {
    const pairs = [
      ['src/v2/studio-shoot.tsx', 'src/v2/studio-shoot.web.tsx'],
      ['src/supply/uri-bytes.ts', 'src/supply/uri-bytes.web.ts'],
    ] as const;
    for (const [native, web] of pairs) {
      const names = (f: string) =>
        new Set([...read(f).matchAll(/^export (?:async )?(?:function|const|interface|type) (\w+)/gm)].map((m) => m[1]!));
      const nativeNames = names(native);
      for (const n of names(web)) {
        // every WEB export must exist natively; native may export MORE (types)
        expect(nativeNames.has(n), `${web} exports ${n}, ${native} does not`).toBe(true);
      }
    }
  });
});

describe('bytesFromUri (web) — the master-hash feeder, by value', () => {
  it('reads a data: URI back to the exact bytes', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x03]);
    const b64 = Buffer.from(bytes).toString('base64');
    const out = await bytesFromUri(`data:application/octet-stream;base64,${b64}`);
    expect([...out]).toEqual([...bytes]);
  });

  it('a failed read throws rather than returning empty — an empty master hash would be a false record', async () => {
    await expect(bytesFromUri('data:;base64,!!!!')).rejects.toThrow();
  });
});
