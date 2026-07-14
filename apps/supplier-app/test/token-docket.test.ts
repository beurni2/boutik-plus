import { readFileSync } from 'node:fs';
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
