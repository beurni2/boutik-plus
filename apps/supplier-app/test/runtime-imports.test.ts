import { readFileSync } from 'node:fs';
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
