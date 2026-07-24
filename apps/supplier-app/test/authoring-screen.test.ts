import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/i18n';

/**
 * SUPPLIER-AUTHORING-1 part 2 — THE SCREEN, asserted at the source level.
 *
 * There is no RN renderer in this suite (see preview-banner.test.ts), so these
 * are source assertions in the shape df2-device-review.test.ts already uses for
 * App.tsx. They are not decoration: each one pins a property the founder ruled
 * on, and each would fail if the screen drifted back to the failure it replaces.
 */

const appDir = join(import.meta.dirname, '..');
const screen = readFileSync(join(appDir, 'src/v2/publier.tsx'), 'utf8');
const shell = readFileSync(join(appDir, 'src/v2/AppV2.tsx'), 'utf8');
const authoring = readFileSync(join(appDir, 'src/supply/authoring.ts'), 'utf8');
const keys = new Set(catalog.map((e) => e.key));

describe('every user-facing string comes from the catalog (Contract §10.5)', () => {
  it('every t(...) key the screen uses EXISTS — t() throws at runtime on a miss, so this must fail in CI first', () => {
    const used = [...screen.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1] as string);
    expect(used.length).toBeGreaterThan(15); // the screen is string-heavy; a collapse to 0 must not pass
    const missing = used.filter((k) => !keys.has(k));
    expect(missing, `catalog keys referenced by the screen but absent: ${missing.join(', ')}`).toEqual([]);
  });

  it('carries NO inline French sentence — no user-facing literal outside the catalog', () => {
    // JSX text nodes and string props holding accented/word-y French would be
    // inline copy. Comments are excluded (they are not rendered).
    const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const jsxText = [...code.matchAll(/>\s*([A-Za-zÀ-ÿ][^<>{}\n]{6,})\s*</g)].map((m) => m[1] as string);
    expect(jsxText, `inline JSX copy found: ${jsxText.join(' | ')}`).toEqual([]);
  });
});

describe('the typed refusals all reach a designed French string', () => {
  it('EVERY FieldError in the union has a catalog key in ERROR_KEY — none can render blank', () => {
    // the union, parsed from the source of record rather than restated here
    const block = authoring.slice(authoring.indexOf('export type FieldError'), authoring.indexOf('/** The category floor'));
    const union = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
    expect(union).toContain('base_price_below_floor');
    expect(union.length).toBe(8);

    const mapBlock = screen.slice(screen.indexOf('const ERROR_KEY'), screen.indexOf('};', screen.indexOf('const ERROR_KEY')));
    for (const member of union) {
      const m = new RegExp(`${member}:\\s*'([^']+)'`).exec(mapBlock);
      expect(m, `FieldError '${member}' has no ERROR_KEY entry`).not.toBeNull();
      expect(keys.has((m as RegExpExecArray)[1] as string), `ERROR_KEY['${member}'] points at a missing catalog key`).toBe(true);
    }
  });
});

describe('« non configuré » is a CONDITION, never an error (founder ruling)', () => {
  it('the unconfigured notice renders with the INFO tone — not danger, not warn', () => {
    expect(screen).toMatch(/<Banner tone="info">\{t\('publier\.non_configure'\)\}<\/Banner>/);
    expect(screen).not.toMatch(/tone="danger">\{t\('publier\.non_configure'\)/);
    expect(screen).not.toMatch(/tone="warn">\{t\('publier\.non_configure'\)/);
  });

  it('the string itself neither blames nor promises — no « erreur », no draft-keeping claim', () => {
    const entry = catalog.find((e) => e.key === 'publier.non_configure');
    expect(entry).toBeDefined();
    const fr = (entry as { fr: string }).fr;
    expect(fr).not.toMatch(/erreur|échec|impossible|désolé/i);
    // it must not promise that what he typed is kept — nothing persists a draft yet
    expect(fr).not.toMatch(/gardé|conservé|enregistré|sauvegardé/i);
    // and it must say plainly that nothing was sent, so it cannot read as success
    expect(fr).toMatch(/envoyé/i);
  });

  it('the primary action is DISABLED when the service is null — he never taps into a dead end', () => {
    expect(screen).toMatch(/disabled=\{service === null \|\| sending\}/);
  });
});

describe('nothing on this screen can look like success without being one', () => {
  it('the published branch is reached ONLY from a PublishState of kind published', () => {
    expect(screen).toMatch(/if \(state\?\.kind === 'published'\)/);
  });

  it('the seller net rendered is the SERVICE’s figure, and is omitted when absent', () => {
    // rendered only under the presence check — never a local computation
    expect(screen).toMatch(/state\.sellerNetFcfa !== undefined &&/);
    expect(screen).toMatch(/formatF\(state\.sellerNetFcfa\)/);
    // the screen must not compute money: no fee()/net() from the demo money helpers
    expect(screen).not.toMatch(/\b(fee|net)\(/);
  });

  it('the offer reference is shown — it is his only way to check the product afterwards', () => {
    expect(screen).toMatch(/t\('publier\.reference'\)/);
    expect(screen).toMatch(/\{state\.offerId\}/);
  });

  it('a refusal and a failure both render the SERVICE’s own words verbatim', () => {
    expect(screen).toMatch(/t\('publier\.refuse'\)\}\\n\$\{state\.reason\}/);
    expect(screen).toMatch(/t\('publier\.echec'\)\}\\n\$\{state\.reason\}/);
  });
});

describe('the screen writes through the seam, and the demo adapter is not in reach', () => {
  it('it resolves the REAL service and imports no demo module', () => {
    expect(screen).toMatch(/resolveSupplyService/);
    expect(screen).not.toMatch(/from '\.\.\/supply\/demo'/);
    expect(screen).not.toMatch(/DemoSupplyService/);
  });

  it('ids are minted from the OS CSPRNG path, never Math.random', () => {
    expect(screen).toMatch(/mintCommandId\(\)/);
    expect(screen).not.toMatch(/Math\.random/);
  });

  it('a CSPRNG failure becomes an honest failed state, never a weaker id', () => {
    expect(screen).toMatch(/catch \(err\)[\s\S]{0,200}setState\(\{ kind: 'failed'/);
  });
});

describe('the shell routes « Lister un produit » to the REAL screen', () => {
  it('view `add` renders SPublier — the S20 demo wizard is no longer rendered anywhere', () => {
    expect(shell).toMatch(/v\.s === 'add' \?[\s\S]{0,700}<SPublier onBack=/);
    expect(shell).not.toMatch(/<S20Wizard/);
    expect(shell).not.toMatch(/S20Wizard,/); // and it is not imported
  });
});

describe('the FCFA fields open a number pad (a 1GB Android in sunlight, not a laptop)', () => {
  it('base price, commission and stock all request number-pad', () => {
    const numeric = [...screen.matchAll(/keyboardType="number-pad"/g)];
    expect(numeric).toHaveLength(3);
    for (const field of ['champ_prix', 'champ_commission', 'champ_stock']) {
      expect(screen).toMatch(new RegExp(`${field}'\\)[^\\n]*keyboardType="number-pad"`));
    }
  });
});
