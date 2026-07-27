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

describe('the W2 verifier deviations stay fixed (source tripwires — a comment could fool them, a rewrite cannot)', () => {
  it('ONE busy guard: the native shoot screen takes the parent ref and declares none of its own — a second ref lets a gallery tap race a mid-flight capture', () => {
    const shoot = read('src/v2/studio-shoot.tsx');
    expect(shoot).not.toMatch(/const busy = useRef/);
    expect(shoot).toMatch(/busy\.current/);
    expect(read('src/v2/studio-real.tsx')).toMatch(/busy=\{busy\}/);
  });

  it('the permission gate bridges the null frame after a seen grant — without it the « Autoriser » screen flashes between every kept photo and the next viewfinder', () => {
    const shoot = read('src/v2/studio-shoot.tsx');
    expect(shoot).toMatch(/cameraGrantedOnce/);
    expect(shoot).toMatch(/permission === null \? !cameraGrantedOnce : !permission\.granted/);
  });
});

describe('the W3 drop container rules (source tripwires on the web shoot screen)', () => {
  const shootWeb = read('src/v2/studio-shoot.web.tsx');

  it('dragover AND drop both preventDefault — the first makes the pane a target, the second stops the browser navigating to the image', () => {
    expect(shootWeb).toMatch(/dragover/);
    expect([...shootWeb.matchAll(/e\.preventDefault\(\)/g)].length).toBeGreaterThanOrEqual(2);
  });

  it('EVERY dropped file is taken (STUDIO-BATCH-1) — multi-selection parity with the picker', () => {
    expect(shootWeb).toMatch(/for \(let i = 0; i < files\.length/);
    // and no lone files[0] shortcut survives to silently drop the rest
    expect(shootWeb).not.toMatch(/files\?\.\[0\]/);
  });

  it('the object URL is NEVER revoked — it is the masterUri the publish path hashes; revoking it would turn the master hash into a false record', () => {
    expect(shootWeb).toMatch(/URL\.createObjectURL/);
    expect(shootWeb).not.toMatch(/revokeObjectURL/);
  });

  it('the drop feeds the SHARED funnel through onDropAssets — no decode, strip, or upload happens in the screen', () => {
    expect(shootWeb).toMatch(/assets\.push\(\{ uri: URL\.createObjectURL\(file\), mimeType: file\.type, fileName: file\.name \}\)/);
    expect(shootWeb).toMatch(/onDropAssets\(assets\)/);
    expect(shootWeb).not.toMatch(/stripJpegMetadata|assertExifFree|ImageManipulator/);
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
