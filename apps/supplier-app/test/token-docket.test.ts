import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THE TOKEN-FIDELITY GATE. It first guarded the E1 render layer and its
 * docketed Faso Premium module (`src/ui/fp.ts`); AUDIT-B+2 F-60 retired that
 * shell with its module, and F-59 turned the gate onto what the two live pages
 * actually paint (below). The V2 palette keeps its own docket (derived from
 * @platform/ui-tokens or transcribed from the HANDOFF V2, `palette.ts`).
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const HEX = /#[0-9A-Fa-f]{3,8}\b/g;
const RGBA = /rgba?\([^)]*\)/g;
const colourLiterals = (src: string): Set<string> => {
  const code = stripComments(src);
  return new Set([...code.matchAll(HEX)].map((m) => m[0]).concat([...code.matchAll(RGBA)].map((m) => m[0])));
};

/**
 * AUDIT-B+2 F-59 — THE LIVE SCREENS. The gate first read only the parked E1
 * render files, while the console and the supplier page painted 20 colour
 * literals of their own (a separator tone in no palette, hand-rolled pill
 * pairs, a `borderRadius: 999`). Every source file under `src/` is now read,
 * and the only homes a colour may be written in are the token layer — each
 * named, each for its reason.
 */
const TOKEN_LAYER: Record<string, string> = {
  'src/ui/v2/palette.ts': 'the V2 palette: derived from @platform/ui-tokens or docketed (HANDOFF V2 §1.1)',
  'src/ui/v2/tokens.ts': 'the V2 geometry and shadow tokens (their rgba shadows)',
  'src/ui/v2/styles.ts': 'the V2 type roles and shared styles built on the tokens',
};
const tousLesFichiers = (dir: string): string[] =>
  readdirSync(join(appDir, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tousLesFichiers(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  );
const PILL_999 = /borderRadius:\s*999\b/;
const fautes = (src: string): string[] => [...colourLiterals(src), ...(PILL_999.test(stripComments(src)) ? ['borderRadius: 999'] : [])];

describe('AUDIT-B+2 F-59 — no live screen paints a colour of its own', () => {
  it('every file under src/ outside the token layer carries no hex, no rgba, no borderRadius 999', () => {
    const fichiers = tousLesFichiers('src').filter((f) => TOKEN_LAYER[f] === undefined);
    expect(fichiers.length, 'the scan reads the live tree').toBeGreaterThan(80);
    for (const f of ['src/commandes/screen.tsx', 'src/coursiers/zone.tsx', 'src/gains/screen.tsx', 'src/v2/components.tsx']) {
      expect(fichiers, `${f} is scanned`).toContain(f);
    }
    for (const f of fichiers) expect(fautes(read(f)), `${f} paints its own colour — use the palette`).toEqual([]);
  });

  it('PLANTED: a separator hex, a pill rgba and a 999 radius in a live screen each fail', () => {
    const src = read('src/commandes/screen.tsx');
    expect(fautes(src)).toEqual([]);
    expect(fautes(src.replace('borderTopColor: P.divider', "borderTopColor: '#EDE6D8'")).length).toBe(1);
    expect(fautes(src.replace('P.successBg', "'rgba(229,240,229,1)'")).length).toBe(1);
    expect(fautes(`${src}\nconst x = { borderRadius: 999 };`)).toEqual(['borderRadius: 999']);
  });

  it('the token layer is only what it says it is — every named home exists', () => {
    for (const f of Object.keys(TOKEN_LAYER)) expect(() => read(f), f).not.toThrow();
  });
});
