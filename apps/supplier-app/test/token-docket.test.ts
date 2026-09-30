import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_COLOUR_DOCKET } from '../src/ui/fp';

/**
 * WO-FP-BOUTIK — THE TOKEN-FIDELITY GATE, extended to the Faso Premium groups.
 *
 * The founder's law (takeover packet): "zero hand-copied hex anywhere; extend
 * the token gate to the new groups with a planted-hex negative." This gate
 * enforces exactly that on the render layer:
 *
 *  1. App.tsx / kit.tsx / signature.tsx / anim.tsx carry ZERO hex/rgba — every
 *     colour resolves to a canon token or the single app-local module (fp.ts).
 *  2. fp.ts hardcodes hex ONLY in the APP_COLOUR_DOCKET — the prototype-only
 *     tones canon leaves in Grand Teint this wave (band/skeleton/ribbon). Any
 *     canonical value (paper, ink, accent…) is REFERENCED from @platform/ui-tokens,
 *     never copied: a hand-copied token hex is an undocketed literal and FAILS.
 *  3. Every docketed value BYTE-MATCHES a cited line in the committed brief
 *     (design-reference/handoff_redesign/) — derived-from-pixel-source, not invented.
 *  4. A PLANTED hex (undocketed app-local, or a hand-copied canonical token)
 *     FAILS the completeness check — the gate is non-vacuous.
 *
 * Dimensions are app-local pixel-source (canon: frame/grab/list-pad geometry is
 * app-local this wave), held as named constants in fp.ts (D/R) derived from the
 * HANDOFF — so this gate is HEX-focused, per the founder's explicit wording.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const briefDir = join(appDir, '../..', 'design-reference/handoff_redesign');
const BRIEF: Record<string, string> = {
  HANDOFF: readFileSync(join(briefDir, 'Boutik Plus - HANDOFF.md'), 'utf8'),
  Redesign: readFileSync(join(briefDir, 'Boutik Plus - Redesign.dc.html'), 'utf8'),
};

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const HEX = /#[0-9A-Fa-f]{3,8}\b/g;
const RGBA = /rgba?\([^)]*\)/g;
const colourLiterals = (src: string): Set<string> => {
  const code = stripComments(src);
  return new Set([...code.matchAll(HEX)].map((m) => m[0]).concat([...code.matchAll(RGBA)].map((m) => m[0])));
};

const RENDER_FILES = ['App.tsx', 'src/ui/kit.tsx', 'src/ui/signature.tsx', 'src/ui/anim.tsx'];

describe('WO-FP-BOUTIK token-fidelity gate — Faso Premium groups', () => {
  it('the render layer carries ZERO hand-copied hex/rgba (fp.ts is the only home)', () => {
    for (const f of RENDER_FILES) {
      const lits = colourLiterals(read(f));
      expect([...lits], `${f} carries hand-copied colour literals`).toEqual([]);
    }
  });

  it('fp.ts hardcodes EXACTLY the docketed app-local tones — nothing else, nothing stale', () => {
    const literals = colourLiterals(read('src/ui/fp.ts'));
    const docket = new Set<string>(APP_COLOUR_DOCKET.map((d) => d.value));
    // every literal in fp.ts is docketed (no undocketed hex, incl. a copied token)…
    for (const lit of literals) expect(docket.has(lit), `undocketed hex literal ${lit} in fp.ts`).toBe(true);
    // …and every docketed value is actually still a literal in fp.ts (docket not stale)
    for (const v of docket) expect(literals.has(v), `docketed ${v} no longer in fp.ts`).toBe(true);
  });

  it('every docketed app-local tone BYTE-MATCHES a cited line in the committed brief', () => {
    for (const { value, file, where } of APP_COLOUR_DOCKET) {
      const src = BRIEF[file];
      expect(src, `docket file ${file} present`).toBeTruthy();
      expect(src!.includes(value), `${value} (${where}): committed brief ${file} must contain "${value}"`).toBe(true);
    }
  });

  it('PLANTED-HEX NEGATIVE: an undocketed app-local hex, AND a hand-copied canonical token hex, both FAIL', () => {
    const fpSrc = read('src/ui/fp.ts');
    const docket = new Set<string>(APP_COLOUR_DOCKET.map((d) => d.value));
    const passesCompleteness = (src: string): boolean => {
      const lits = colourLiterals(src);
      for (const lit of lits) if (!docket.has(lit)) return false;
      return true;
    };
    // the real fp.ts passes
    expect(passesCompleteness(fpSrc)).toBe(true);
    // plant an undocketed app-local hex → FAIL
    const planted = fpSrc.replace('export const R = {', "const _plantedArt = '#ABCDEF';\nexport const R = {");
    expect(planted).not.toBe(fpSrc);
    expect(passesCompleteness(planted), 'an undocketed #ABCDEF must fail the gate').toBe(false);
    // plant a HAND-COPIED CANONICAL TOKEN hex (boutik accent) → FAIL (THE TOKEN WINS)
    const leaked = fpSrc.replace('export const R = {', "const _leakAccent = '#0B5B47';\nexport const R = {");
    expect(passesCompleteness(leaked), 'a hand-copied canonical token hex must fail the gate (reference it, never copy)').toBe(false);
  });

  it('fp.ts REFERENCES the canonical groups from @platform/ui-tokens (never re-declares them)', () => {
    const fp = read('src/ui/fp.ts');
    expect(fp).toMatch(/import \{[\s\S]*?\} from '@platform\/ui-tokens'/);
    for (const grp of ['sharedColour', 'boutikColour', 'radius', 'geometry', 'motion']) {
      expect(fp, `fp.ts imports ${grp} from canon`).toMatch(new RegExp(`\\b${grp}\\b`));
    }
    // the canonical accent is referenced, and its hex is NOT hand-copied
    expect(colourLiterals(fp).has('#0B5B47'), 'boutik accent hex must not be hand-copied in fp.ts').toBe(false);
  });
});

/**
 * AUDIT-B+2 F-59 — THE LIVE SCREENS. The gate above read only the parked E1
 * render files, while the console and the supplier page painted 20 colour
 * literals of their own (a separator tone in no palette, hand-rolled pill
 * pairs, a `borderRadius: 999`). Every source file under `src/` is now read,
 * and the only homes a colour may be written in are the token layer — each
 * named, each for its reason.
 */
const TOKEN_LAYER: Record<string, string> = {
  'src/ui/fp.ts': 'the docketed Faso Premium tones (checked above)',
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
