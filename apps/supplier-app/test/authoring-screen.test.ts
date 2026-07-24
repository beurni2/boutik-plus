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

  it('carries NO inline French sentence — neither a JSX text node NOR a string prop', () => {
    // The earlier version of this test matched text nodes only while its comment
    // claimed it also covered string props — and props are the likelier leak here,
    // since every real string on this screen is passed as one (verifier finding).
    const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const jsxText = [...code.matchAll(/>\s*([A-Za-zÀ-ÿ][^<>{}\n]{6,})\s*</g)].map((m) => m[1] as string);
    // string props: label="…", title='…' etc. Two+ words with a letter each, i.e.
    // a sentence rather than an identifier like "number-pad" or "supplier-founder-001".
    const props = [...code.matchAll(/\b[a-zA-Z]+=("|')([^"'\n]{6,})\1/g)]
      .map((m) => m[2] as string)
      .filter((v) => /^[A-Za-zÀ-ÿ]/.test(v) && /[A-Za-zÀ-ÿ]\s+[A-Za-zÀ-ÿ]/.test(v));
    const found = [...jsxText, ...props];
    expect(found, `inline copy found (must live in the catalog): ${found.join(' | ')}`).toEqual([]);
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
  it('the success wording exists in EXACTLY ONE place, inside the published branch', () => {
    // The earlier version asserted only that the `if` existed, which says nothing
    // about ONLY — a second success-rendering path elsewhere would have kept it
    // green (verifier finding). This pins the count and the location.
    expect(screen).toMatch(/if \(state\?\.kind === 'published'\)/);
    const successUses = [...screen.matchAll(/t\('publier\.publie'\)/g)];
    expect(successUses).toHaveLength(1);
    const branch = screen.slice(screen.indexOf("if (state?.kind === 'published')"), screen.indexOf('// ── THE FORM'));
    expect(branch).toContain("t('publier.publie')"); // …and it is inside that branch
  });

  it('an IDEMPOTENT answer does NOT render the plain success wording', () => {
    // idempotent means an EARLIER attempt is what is live; the form stayed
    // editable in between, so « c'est publié » alone could be false about his money.
    expect(screen).toMatch(/state\.alreadyRegistered \?[\s\S]{0,160}t\('publier\.deja_enregistre'\)/);
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

  it('a refusal renders the SERVICE’s own words verbatim', () => {
    expect(screen).toMatch(/t\('publier\.refuse'\)\}\\n\$\{state\.reason\}/);
  });

  it('only the `http` cause may claim the service answered — network and device get their own words', () => {
    // « voici ce que le service a répondu » over an offline error is a falsehood,
    // and offline is the likely failure on a phone in Ouagadougou.
    expect(screen).toMatch(/state\.cause === 'network' \?[\s\S]{0,120}t\('publier\.echec_reseau'\)/);
    expect(screen).toMatch(/state\.cause === 'device' \?[\s\S]{0,120}t\('publier\.echec_appareil'\)/);
    expect(screen).toMatch(/state\.cause === 'http' \? 'publier\.echec' : 'publier\.echec_illisible'/);
    // the offline state is NOT a red alert wall — the doctrine's designed state
    expect(screen).not.toMatch(/tone="danger">\{t\('publier\.echec_reseau'\)/);
  });

  it('the in-flight guard is released even if publish THROWS — no permanently dead button', () => {
    // there is no error boundary in this app; without the finally the guard would
    // latch and the primary action would be dead for the rest of the mount.
    expect(screen).toMatch(/\} finally \{\s*\n\s*inFlight\.current = false;\s*\n\s*\}/);
  });
});

describe('the failure strings say only what is true', () => {
  it('the network string does NOT claim the service answered', () => {
    const fr = (k: string) => (catalog.find((e) => e.key === k) as { fr: string }).fr;
    expect(fr('publier.echec_reseau')).not.toMatch(/répondu|réponse|service/i);
    expect(fr('publier.echec_appareil')).not.toMatch(/répondu|réponse|service/i);
    // …and both state plainly that nothing was sent
    expect(fr('publier.echec_reseau')).toMatch(/rien n'a été envoyé/i);
    expect(fr('publier.echec_appareil')).toMatch(/rien n'a été envoyé/i);
  });

  it('no string promises an ability the app does not have (there is no edit path)', () => {
    const fr = (k: string) => (catalog.find((e) => e.key === k) as { fr: string }).fr;
    // « Vous pourrez en ajouter plus tard » promised photo editing that exists nowhere:
    // decideCreateOffer answers `collision` for a second command, and no update route exists.
    expect(fr('publier.sans_photo')).not.toMatch(/plus tard|pourrez|modifier/i);
  });

  it('« Terminer » does not promise a products list — the board is still seeded fiction', () => {
    const fr = (k: string) => (catalog.find((e) => e.key === k) as { fr: string }).fr;
    expect(fr('publier.retour')).not.toMatch(/produits/i);
  });
});

describe('the screen writes through the seam, and the demo adapter is not in reach', () => {
  it('it resolves the REAL service and imports no demo module', () => {
    expect(screen).toMatch(/resolveSupplyService/);
    expect(screen).not.toMatch(/from '\.\.\/supply\/demo'/);
    expect(screen).not.toMatch(/DemoSupplyService/);
  });

  it('ids are minted from the OS CSPRNG path, never Math.random', () => {
    // the mint function handed to retainIdentity IS the canon command-id mint
    // (expo-crypto → globalThis.crypto.randomUUID); there is no other id source.
    expect(screen).toMatch(/import \{ mintCommandId \} from '\.\.\/offline\/commandId'/);
    expect(screen).toMatch(/retainIdentity\([^)]*,\s*mintCommandId\)/);
    expect(screen).not.toMatch(/Math\.random/);
  });

  it('a CSPRNG failure becomes an honest failed state, never a weaker id', () => {
    expect(screen).toMatch(/catch \(err\)[\s\S]{0,250}setState\(\{ kind: 'failed'/);
  });

  it('the double-tap guard is a REF, not the async `sending` state — two taps cannot both fire', () => {
    // `setState` is asynchronous: a guard reading `state` sees the pre-render
    // value on a stalled JS thread, and two taps become two products.
    expect(screen).toMatch(/if \(inFlight\.current\) return;\s*\n\s*inFlight\.current = true;/);
    expect(screen).not.toMatch(/if \(state\?\.kind === 'sending'\) return;/);
    // and it is released on BOTH exits, or the button is dead forever
    const guardReleases = [...screen.matchAll(/inFlight\.current = false;/g)];
    expect(guardReleases).toHaveLength(2); // the CSPRNG-failure path and the answered path
  });

  it('a RETRY reuses the attempt’s identity — the commandId is not re-minted per tap', () => {
    expect(screen).toMatch(/identity\.current = retainIdentity\(identity\.current, mintCommandId\)/);
    // the three ids are spread from the retained identity, never minted inline
    expect(screen).toMatch(/\.\.\.identity\.current,/);
    expect(screen).not.toMatch(/commandId: mintCommandId\(\)/);
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
