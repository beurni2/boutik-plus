import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FP_FACES, FP_FONT_DIR } from '../src/ui/fonts';

/**
 * BOUTIK-WEB-W1 — the web font map is WELDED to FP_FACES. The map in
 * `web-fonts.ts` must be six LITERAL `require`s (Metro only bundles assets it
 * can see at build time), so it cannot derive from FP_FACES at runtime — this
 * suite is the weld instead. The map's source is read rather than imported
 * because importing it would need a .ttf loader vitest does not have; what is
 * asserted is still VALUES (family names, file paths, files on disk) against
 * the canon table, not the shape of the code.
 */
const appDir = join(import.meta.dirname, '..');
const source = readFileSync(join(appDir, 'src/ui/web-fonts.ts'), 'utf8');

/** Every `'Family': require('<path>.ttf')` row of the literal map. */
const rows = [...source.matchAll(/'([A-Za-z-]+)':\s*require\('([^']+\.ttf)'\)/g)].map((m) => ({
  family: m[1]!,
  path: m[2]!,
}));

describe('web font map covers the Faso Premium faces exactly (BOUTIK-WEB-W1)', () => {
  it('every FP_FACES family has a row, and no row exists outside FP_FACES — a face renamed there without a row here fails HERE, not as a silent web fallback', () => {
    expect(new Set(rows.map((r) => r.family))).toEqual(new Set(FP_FACES.map((f) => f.family)));
    expect(rows).toHaveLength(FP_FACES.length);
  });

  it('each row requires that family\'s OWN file from the faso-premium dir — a crossed pair would load the wrong face under the right name', () => {
    for (const face of FP_FACES) {
      const row = rows.find((r) => r.family === face.family);
      expect(row?.path, face.family).toBe(`../../assets/fonts/faso-premium/${face.file}`);
    }
  });

  it('every required file exists on disk — a deleted asset fails the suite, not the export', () => {
    for (const face of FP_FACES) {
      expect(existsSync(join(appDir, 'assets/fonts', FP_FONT_DIR, face.file)), face.file).toBe(true);
    }
  });

  it('the app root mounts the loader — a map nothing calls loads nothing', () => {
    expect(readFileSync(join(appDir, 'src/v2/AppV2.tsx'), 'utf8')).toMatch(/useWebFonts\(\)/);
  });
});
