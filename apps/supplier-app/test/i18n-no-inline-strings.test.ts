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
 *
 * LISTER-VRAI-1 (AUDIT-B+2 F-91, « F17 wave 2 ») — the first version read
 * `.tsx` files in three folders for ONE shape, and the residue it could not see
 * (the wizard's money labels, the dock, the waiting times, the product sheet's
 * detail rows, the photo captions) was all live. Now: every file of every
 * folder the two web pages load, `.ts` AND `.tsx`, five shapes, and every
 * exception NAMED below with the reason it is not copy.
 */

const racineApp = join(import.meta.dirname, '..');
const sous = (rel: string): string[] =>
  readdirSync(join(racineApp, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sous(`${rel}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${rel}/${e.name}`] : [],
  );
const lire = (rel: string): string => readFileSync(join(racineApp, rel), 'utf8');

/** Every folder the console (`AppV2`) and the supplier page (`FournisseurApp`)
 *  load, plus the two top-level modules they import. */
const DOSSIERS = [
  'src/v2', 'src/ui', 'src/fonds', 'src/accueil', 'src/commandes', 'src/coursiers', 'src/fournisseur',
  'src/gains', 'src/offline', 'src/operations', 'src/studio', 'src/supply',
] as const;

/**
 * EXCEPTION 1 — files inside those folders that the two web pages never load:
 * the E1 app's own kit (`App.tsx` imports them; neither web root does). Pinned
 * by the control below: no scanned file imports any of them.
 */
const HORS_PAGES = [
  'src/ui/anim.tsx', 'src/ui/fonts.ts', 'src/ui/fp.ts', 'src/ui/icons.tsx', 'src/ui/kit.tsx', 'src/ui/motion.ts',
  'src/ui/sfnt.ts', 'src/ui/signature.tsx', 'src/offline/expoStore.ts', 'src/offline/queue.ts',
  'src/studio/viewfinder.ts', 'src/supply/demo.ts', 'src/v2/seed.ts', 'src/v2/quartiers-ouagadougou.ts',
] as const;

/**
 * EXCEPTION 2 — data, not copy.
 * - `categorie-details.ts`: the category NAMES are the value the offer carries
 *   on the wire (`category`) and Shop+ reads back; routing them through the
 *   catalog would change what is stored, not what is said.
 * - `ui/v2/styles.ts`: its words are the pixel gate's ORACLE — the designed
 *   frames' own text, which `pixel-property-diff` looks up in the frames. They
 *   are never rendered; the control below pins that no live file reads them.
 */
const DONNEES = ['src/v2/categorie-details.ts', 'src/ui/v2/styles.ts'] as const;

/**
 * EXCEPTION 3 — the machine's frozen §9.5 publish branch, word for word. The
 * console's wizard never reaches it (`lister-real.tsx` intercepts « Publier »;
 * `rendu-lister-vrai` walks it and finds no demo toast), and the founder's
 * technique is to make the path unreachable, never to edit it. `Mode femme` is
 * the wizard's first category — a category VALUE (exception 2). Any other
 * string in `machine.ts` fails.
 */
const MACHINE_FIGEE = new Set([
  'Mode femme',
  'Robe brodée bogolan',
  'Envoyé en modération — catégorie, allégations, photos',
  'Modération : approuvé — en ligne chez les revendeuses',
]);

const FICHIERS = [...DOSSIERS.flatMap(sous), 'src/i18n.ts', 'src/reseau.ts'].filter(
  (f) => !(HORS_PAGES as readonly string[]).includes(f) && !(DONNEES as readonly string[]).includes(f),
);

/** Comments are prose about the code, not prose on the screen. */
const sansCommentaires = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/gm, (m, p: string) => p + ' '.repeat(m.length - p.length));

/**
 * SHAPE 1 — a rendered JSX literal `{'…'}` / `{"…"}`, 15 characters or more.
 * Escape-aware, and any first character: the first version stopped at `\'`
 * and ignored strings starting with «, • or a digit (the audit's measure).
 */
const LITTERAL_JSX = /\{'((?:[^'\\\n]|\\.){15,})'\}|\{"((?:[^"\\\n]|\\.){15,})"\}/g;

/** SHAPE 2 — a quoted value on a prop a person reads or hears. */
const PROP =
  /\b(?:label|title|placeholder|accessibilityLabel|accessibilityHint|hint|legend|sub|overline|caption|message)=(?:"([^"\n]*)"|'([^'\n]*)'|\{'((?:[^'\\\n]|\\.)*)'\}|\{"((?:[^"\\\n]|\\.)*)"\}|\{`([^`]*)`\})/g;

/** SHAPE 3 — bare JSX text between a tag and its closing tag. */
const ENFANT = />([^<>{}\n]*[A-Za-zÀ-ÿ]{3,}[^<>{}\n]*)<\//g;

/** SHAPE 4 — the machine's toast, `toast(ns, '…')`: any literal at all. */
const TOAST = /\btoast\(\s*[\w.]+\s*,\s*(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;

/**
 * SHAPE 5 — ANY string literal that reads as French prose, in `.ts` as much as
 * `.tsx`: two words side by side, or an accented letter or a guillemet. This
 * is what catches a label in a tuple (`['Prix de base', …]`), a return value in
 * a pure view (`return \`il y a ${n} min\``), a caption table.
 */
const LITTERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
const PROSE = (s: string): boolean =>
  /(?<![0-9A-Za-z])[A-Za-zÀ-ÿ]{2,}[  ]+[A-Za-zÀ-ÿ'’]{2,}(?![0-9A-Za-z(])/.test(s) || /[À-ÿ«»]/.test(s);
/** In a template, a word right after an interpolation is a unit or a sentence
 *  going on (`${n} jours`, `il y a ${n} min`) — the waiting-time shape. */
const MOT_APRES = /\}[  ]+[A-Za-zÀ-ÿ]{2,}/;
const estProse = (m: RegExpMatchArray): boolean =>
  m[3] === undefined
    ? PROSE(m[1] ?? m[2] ?? '')
    : PROSE(m[3].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ')) || MOT_APRES.test(m[3]);

/**
 * Where a prose literal is NOT copy, by what stands right before it:
 * - `t(` / `tr(` — a catalog call (keys never read as prose; belt and braces);
 * - `console.…(` / `new …Error(` — for the developer, never on a screen;
 * - `reason:` — the diagnostic a failure carries; every screen shows it only
 *   UNDER a catalog sentence (`publier.echec`, `studio.echec`…), never alone;
 * - `where:` — a design token's provenance note (`ui/v2/palette.ts`), read by
 *   the token audit, never by a person on a screen.
 */
const PAS_COPIE = /(?:\bconsole\.\w+|\bnew \w*Error|\bt|\btr)\(\s*$|\b(?:reason|where):\s*$/;

function trouve(rel: string): string[] {
  const code = sansCommentaires(lire(rel));
  const ligne = (i: number) => code.slice(0, i).split('\n').length;
  const hits: string[] = [];
  for (const m of code.matchAll(LITTERAL_JSX)) hits.push(`${rel}:${ligne(m.index)} [jsx] ${m[0]}`);
  for (const m of code.matchAll(PROP)) {
    const v = m[1] ?? m[2] ?? m[3] ?? m[4] ?? (m[5] ?? '').replace(/\$\{[^}]*\}/g, '');
    if (/[A-Za-zÀ-ÿ]{3,}/.test(v)) hits.push(`${rel}:${ligne(m.index)} [prop] ${m[0]}`);
  }
  for (const m of code.matchAll(ENFANT)) hits.push(`${rel}:${ligne(m.index)} [texte] ${m[1]!.trim()}`);
  for (const m of code.matchAll(TOAST)) {
    if (!(rel === 'src/v2/machine.ts' && MACHINE_FIGEE.has(m[2]!))) hits.push(`${rel}:${ligne(m.index)} [toast] ${m[2]}`);
  }
  for (const m of code.matchAll(LITTERAL)) {
    const brut = m[1] ?? m[2] ?? m[3] ?? '';
    if (!estProse(m)) continue;
    if (PAS_COPIE.test(code.slice(Math.max(0, m.index - 60), m.index))) continue;
    if (rel === 'src/v2/machine.ts' && MACHINE_FIGEE.has(brut)) continue;
    hits.push(`${rel}:${ligne(m.index)} [prose] ${brut.slice(0, 80)}`);
  }
  return [...new Set(hits)];
}

describe('Law 6 — user-facing French lives in the catalog, never inline', () => {
  it.each(FICHIERS)('%s carries no inline French', (rel) => {
    const trouves = trouve(rel);
    expect(
      trouves,
      `inline French found — move it to i18n/catalog.json with a register tag, or the copy-lint never sees it:\n${trouves.join('\n')}`,
    ).toEqual([]);
  });

  it('the scan reads what ships: .ts AND .tsx, the live screens of both pages', () => {
    for (const f of [
      'src/v2/screens2.tsx', 'src/v2/screens1.tsx', 'src/v2/components.tsx', 'src/v2/machine.ts', 'src/v2/lister-real.tsx',
      'src/commandes/view.ts', 'src/supply/produits-view.ts', 'src/fournisseur/FournisseurApp.tsx', 'src/ui/limite-erreur.tsx',
    ]) expect(FICHIERS, `${f} is outside the scan`).toContain(f);
  });

  /** Exception 1 stays true: nothing the scan reads imports an excluded file. */
  it('CONTROL: no scanned file imports a file the scan leaves out as « never loaded »', () => {
    for (const exclu of HORS_PAGES) {
      const nom = exclu.replace(/^.*\//, '').replace(/\.tsx?$/, '');
      const importeurs = FICHIERS.filter((f) =>
        // a type-only import is erased at build: it loads nothing
        new RegExp(`^(?!import type)[^\\n]*(?:from|require\\()\\s*['"][^'"]*/${nom}['"]`, 'm').test(sansCommentaires(lire(f))),
      );
      expect(importeurs, `${exclu} is loaded after all — it must be scanned`).toEqual([]);
    }
  });

  /** Exception 2 stays true: no live file renders the pixel gate's oracle words. */
  it('CONTROL: no live file reads the words in ui/v2/styles.ts', () => {
    const ORACLE =
      /\b(?:STATUS_PILL|PRODUCT_PILL)\b|\bC19\.ORDER\b|\bC22\.(?:SUB_\w+|MODE_[AB])\b|\bC(?:14|28)\.label\b|\bC39\.CAPTION\b|\bC40\.LEGEND_\w+|\bC48\.OVERLINE\b/;
    for (const f of FICHIERS) expect(sansCommentaires(lire(f)), `${f} renders the oracle's words`).not.toMatch(ORACLE);
    // C37's pill words are read by `MetersList` — whose every call site passes
    // no rows, so they can never render. Assert the CALL SITES, not the guard.
    const appels = FICHIERS.flatMap((f) => sansCommentaires(lire(f)).match(/<MetersList\b[^>]*>/g) ?? []);
    expect(appels.length, 'the MetersList call site vanished — re-check this control').toBeGreaterThan(0);
    for (const a of appels) expect(a, 'MetersList is given rows: its C37 words would render').toMatch(/rows=\{\[\]\}/);
  });

  /**
   * CONTROLS — without these every result above passes just as happily
   * against a broken regex, an unreadable file, or a scan pointed at nothing.
   * Each plants the shape it guards and asserts the scan sees it.
   */
  const plante = (code: string): string[] => {
    const hits: string[] = [];
    for (const re of [LITTERAL_JSX, PROP, ENFANT, TOAST]) for (const m of code.matchAll(re)) hits.push(m[0]);
    for (const m of code.matchAll(LITTERAL)) if (estProse(m)) hits.push(m[0]);
    return hits;
  };

  it('CONTROL: the scan DOES catch a planted inline sentence', () => {
    const p = `      <Text style={x}>{'Votre argent arrive sous 24 heures, promis.'}</Text>`;
    expect(p.match(LITTERAL_JSX), 'the scan is blind — every result above is meaningless').toHaveLength(1);
  });

  it('CONTROL: the scan does NOT fire on short tokens or on {t(...)} calls', () => {
    expect(`<Text>{'·'}</Text>`.match(LITTERAL_JSX)).toBeNull();
    expect(`<Text>{tr('fp.onboarding_pitch')}</Text>`.match(LITTERAL_JSX)).toBeNull();
    expect(plante(`<Text>{tr('fp.onboarding_pitch')}</Text>`)).toEqual([]);
    expect(plante(`const SHADOW = { card: '0 1px 2px rgba(28,22,15,0.04)' };`)).toEqual([]);
  });

  /** The apostrophe hole that made the first audit undercount. */
  it('CONTROL: the scan catches a DOUBLE-quoted sentence containing an apostrophe', () => {
    expect(`<Text>{"Voir le parcours d'inscription vendeur"}</Text>`.match(LITTERAL_JSX)).toHaveLength(1);
  });

  /** F-91's measured misses: an escaped apostrophe, a « or • or digit start. */
  it('CONTROL: the scan catches \\\', «, • and a leading digit', () => {
    expect(`<Text>{'Aujourd\\'hui votre argent part'}</Text>`.match(LITTERAL_JSX)).toHaveLength(1);
    expect(`<Text>{'« Produit prêt » quand tout est emballé'}</Text>`.match(LITTERAL_JSX)).toHaveLength(1);
    expect(`<Text>{'• photos sans prix sur le produit'}</Text>`.match(LITTERAL_JSX)).toHaveLength(1);
    expect(`<Text>{'2 photos de plus, puis Continuer'}</Text>`.match(LITTERAL_JSX)).toHaveLength(1);
  });

  it('CONTROL: the four other shapes each catch their plant', () => {
    expect(plante(`<C07BtnPrimary label="Envoyer" onPress={go} />`).length).toBeGreaterThan(0);
    expect(plante(`<BackBtn accessibilityLabel={'Retour'} />`).length).toBeGreaterThan(0);
    expect(plante(`<Text style={s.t}>Prix & commission</Text>`)).toContain('>Prix & commission</');
    expect(plante(`ns = toast(ns, 'Ok', fx);`).length).toBeGreaterThan(0);
    expect(plante(`const ROWS = [['Prix de base', b]] as const;`).length).toBeGreaterThan(0);
    expect(plante('return `il y a ${n} min`;').length).toBeGreaterThan(0);
    expect(plante(`const L = ['Héro'];`).length, 'an accent alone makes it copy').toBeGreaterThan(0);
  });

  it('CONTROL: a comment is not copy, a `reason:` diagnostic is not copy', () => {
    const code = sansCommentaires(`// Le produit est en ligne\n/* « Voir » la fiche */\nconst x = 1;`);
    expect(plante(code)).toEqual([]);
    expect(PAS_COPIE.test(`return { ok: false, cause: 'network', reason: `)).toBe(true);
  });

  /**
   * The 22 keys this slice created must EXIST and be tagged. A migration that
   * silently dropped a sentence would otherwise pass the scan above — the
   * screen would simply say nothing.
   */
  it('every fp.* key added by the F17 migration is present, non-empty and register-tagged', () => {
    const fp = catalog.filter((e) => e.key.startsWith('fp.'));
    // 27 → 2 (LISTER-VRAI-1, 2026-09-30): 23 lived only on the demo screens
    // deleted on his « make room »; `fp.studio_guide` and `fp.moderation_note`
    // promised checks that never ran (F-46) and were removed.
    expect(fp.length, 'the F17 migration keys vanished from the catalog').toBe(2);
    for (const entry of fp) {
      expect(entry.fr.trim().length, `${entry.key} is empty`).toBeGreaterThan(0);
      expect(['money', 'selling', 'neutral'], `${entry.key} has no valid register`).toContain(entry.register);
    }
  });

  /**
   * The money labels specifically. If one is ever retagged away from
   * `register: money` it silently leaves the calm, precise money register the
   * lint enforces. (LISTER-VRAI-1: the wave-2 wizard and fiche money labels
   * join the one still on his home screen.)
   */
  it.each([
    'fp.accueil_gratuite_note',
    'publier.champ_prix',
    'publier.ligne_commission',
    'publier.net',
    'publier.recoit_vente',
    'publier.commission_montant',
  ])('%s stays in the money register', (key) => {
    const entry = catalog.find((e) => e.key === key);
    expect(entry, `${key} is missing from the catalog`).toBeDefined();
    expect(entry?.register).toBe('money');
  });
});
