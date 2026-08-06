import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/i18n';

/**
 * AUDIT-B+1 F17 — 22 USER-FACING FRENCH SENTENCES BYPASSED THE CATALOG.
 *
 * Law 6 / Contract §10.5: "Strings live in the i18n catalog with `register`
 * tags — never inline." The copy-lint runs on ONE file (`run-gates.sh` lints
 * `i18n/catalog.json` and nothing else), so a sentence written straight into
 * JSX was linted by nothing at all: not for reading level, not for register,
 * not for banned administrative vocabulary.
 *
 * Three of the 22 were money-register sentences the supplier reads while
 * deciding whether to trust us with her stock — and when they were finally
 * moved into the catalog the lint failed on four of them immediately
 * (reading-level budgets, two at 2.75 and 3.00 syllables/word). They had been
 * shipping in that state.
 *
 * This test is the part that KEEPS it fixed: the migration alone would rot the
 * first time someone types a sentence into JSX again.
 */

/**
 * EVERY v2 file, not the three this slice happened to touch. A verifier found
 * the first version hardcoded to 3 of 13 and reported it as a false guarantee;
 * it was right.
 */
const racineApp = join(import.meta.dirname, '..');
const tsxSous = (rel: string): string[] =>
  readdirSync(join(racineApp, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxSous(`${rel}/${e.name}`) : e.name.endsWith('.tsx') ? [`${rel}/${e.name}`] : [],
  );
/** src/v2 AND src/ui/v2 — the comment below counts both, so the scan must too. */
const V2 = [...tsxSous('src/v2'), ...tsxSous('src/ui/v2')];
const lire = (rel: string): string => readFileSync(join(import.meta.dirname, '..', rel), 'utf8');

/**
 * A rendered JSX text literal: `{'…'}` / `{"…"}` holding a run of French prose.
 * The 15-character floor is the audit's own probe — below it live legitimate
 * short tokens (separators, units) that are not sentences.
 *
 * ⚠ CORRECTION TO THE AUDIT, and the reason this regex is not its regex.
 * The report scanned with a single class `\{["'][^"']{15,}["']\}`, whose body
 * excludes BOTH quote characters — so it stops dead at the first apostrophe
 * and cannot see a double-quoted French sentence, which is most of them.
 * It reported 22. Scanning per quote style finds 30. Two of the three
 * money sentences the report itself named by line number
 * (screens2.tsx:259 « La cliente paie… », screens2.tsx:669 « …jamais une
 * somme bloquée ») are apostrophe-carrying doubles that its own count could
 * never have included.
 */
const LITTERAL_JSX = /\{'[A-ZÀ-Ýa-zà-ÿ][^']{14,}'\}|\{"[A-ZÀ-Ýa-zà-ÿ][^"]{14,}"\}/g;

/**
 * ⚠ WHAT THIS TEST DOES NOT COVER — stated so it is never read as a complete
 * Law 6 guarantee. It checks ONE shape: a quoted string inside a JSX
 * expression, `{'…'}` / `{"…"}`. A fresh-context verifier defeated it in
 * several other shapes. MEASURED residue across src/v2 + src/ui/v2, counting
 * RAW MATCHES of two named patterns (a second verifier counted UNIQUE
 * MULTI-WORD strings and got a different 23/30 split for the same total — the
 * definition is stated here so the number is checkable rather than folkloric):
 *   `/(?:label|title|sub|legend|placeholder|hint)=["'][A-ZÀ-Ý…][^"']{9,}["']/`
 *      → **33** component props
 *   `/>\s*[A-ZÀ-Ý][^<>{}\n]{14,}\s*</`
 *      → **19** bare JSX text children
 * **52 user-facing strings still inline.** Several are money-register, e.g.
 * screens2.tsx « Commission revendeuse (vous la financez) » and screens1.tsx
 * « Lister un produit — gratuit ».
 *
 * They are NOT fixed here. Migrating 52 prop-and-child strings is its own
 * slice — each needs a key, a register tag, and a reading-level pass — and
 * bolting it onto this one is how a small finding turns into a session.
 * Recorded in JOURNAL.md as the named follow-up (AUDIT-B+1 F17 wave 2) so it
 * is a known open item rather than a silent gap behind a green test.
 */

describe('Law 6 — user-facing French lives in the catalog, never inline in JSX', () => {
  it.each(V2)('%s carries no inline French sentence', (rel) => {
    const trouves = lire(rel).match(LITTERAL_JSX) ?? [];
    expect(
      trouves,
      `inline French found — move it to i18n/catalog.json with a register tag, or the copy-lint never sees it:\n${trouves.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * CONTROL — without this the test above passes just as happily against a
   * broken regex, an unreadable file, or a scan pointed at nothing.
   */
  it('CONTROL: the scan DOES catch a planted inline sentence', () => {
    const plante = `      <Text style={x}>{'Votre argent arrive sous 24 heures, promis.'}</Text>`;
    expect(plante.match(LITTERAL_JSX), 'the scan is blind — every result above is meaningless').toHaveLength(1);
  });

  it('CONTROL: the scan does NOT fire on short tokens or on {t(...)} calls', () => {
    expect(`<Text>{'\u00b7'}</Text>`.match(LITTERAL_JSX)).toBeNull();
    expect(`<Text>{tr('fp.onboarding_pitch')}</Text>`.match(LITTERAL_JSX)).toBeNull();
  });

  /** The apostrophe hole that made the audit undercount — pinned so the
   *  regex can never regress to the class that misses double-quoted French. */
  it('CONTROL: the scan catches a DOUBLE-quoted sentence containing an apostrophe', () => {
    const double = `<Text>{"Voir le parcours d'inscription vendeur"}</Text>`;
    expect(double.match(LITTERAL_JSX), 'the apostrophe hole is back — the census undercounts again').toHaveLength(1);
  });

  /**
   * The 22 keys this slice created must EXIST and be tagged. A migration that
   * silently dropped a sentence would otherwise pass the scan above — the
   * screen would simply say nothing.
   */
  it('every fp.* key added by the F17 migration is present, non-empty and register-tagged', () => {
    const fp = catalog.filter((e) => e.key.startsWith('fp.'));
    expect(fp.length, 'the F17 migration keys vanished from the catalog').toBe(27);
    for (const entry of fp) {
      expect(entry.fr.trim().length, `${entry.key} is empty`).toBeGreaterThan(0);
      expect(['money', 'selling', 'neutral'], `${entry.key} has no valid register`).toContain(entry.register);
    }
  });

  /**
   * The money sentences specifically. These state the 5 % seller fee and who
   * pays a buyer refund — B+I-12/B+I-13 in the supplier's own words. If one is
   * ever retagged away from `register: money` it silently leaves the calm,
   * precise money register the lint enforces.
   */
  it.each([
    'fp.accueil_gratuite_note',
    'fp.montant_verrouille',
    'fp.pas_de_compte_interne',
    'fp.faute_fonds_protection',
    'fp.onboarding_conditions',
    'fp.onboarding_momo_note',
  ])('%s stays in the money register', (key) => {
    const entry = catalog.find((e) => e.key === key);
    expect(entry, `${key} is missing from the catalog`).toBeDefined();
    expect(entry?.register).toBe('money');
  });

  /** B+I-12 in prose: a seller fault never costs the seller money. */
  it('the protection-fund sentence still says the money is NOT the seller’s', () => {
    const fr = catalog.find((e) => e.key === 'fp.faute_fonds_protection')?.fr ?? '';
    expect(fr).toContain('fonds de protection');
    expect(fr, 'the « jamais votre argent » promise was edited away').toMatch(/[Jj]amais votre argent/);
  });
});
