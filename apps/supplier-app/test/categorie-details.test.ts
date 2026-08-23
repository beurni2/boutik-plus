import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAYONS, composeVariantes, detailChamps, detailsParDefaut } from '../src/v2/categorie-details';
import { initialState, reduce, type S } from '../src/v2/machine';

/**
 * RAYONS-1 (founder order 2026-08-23): « the categories and the details &
 * stocks are not really professional and well structured like a real listing
 * screens of multi-diverse products » — with his own taxonomy: car seat,
 * stroller · baby room (toddler bed, crib, bassinet) · baby bath (tub, bowls,
 * rug, towels) · baby dining (plate sets, tables, bibs, high chairs) · toys
 * (cars, educational, dolls & cooking, outdoor, bikes) · women's room
 * (vanity, sheets & covers, vases, decor) — « plus many other types ».
 *
 * The laws under test: every product type he named has its category, grouped
 * under a rayon; the eight shipped categories stay choosable (live listings
 * carry them); each category's « Détails & stock » wears ITS OWN structured
 * fields; only clothing is pre-filled « S, M, L » (the shipped law); a
 * single-field category composes to the RAW value (byte-identical to what has
 * always published); a multi-field category composes labeled pairs; and the
 * machine swaps untouched defaults on a category change but keeps typed text
 * while the field set has the same shape. The category stays a FREE string on
 * the wire (canon TrimmedNonEmptyString) — no allowlist, no refusals.
 */

const LEGACY = ['Mode femme', 'Mode homme', 'Chaussures', 'Sacs', 'Tissus', 'Beauté scellée', 'Maison', 'Enfant'];

/** The founder's own product list, mapped to the category that carries it. */
const SIENS = [
  'Siège auto', 'Poussette',
  'Lit petit enfant', 'Lit à barreaux', 'Couffin',
  'Baignoire bébé', 'Bassine de bain', 'Tapis de bain', 'Serviette bébé',
  'Assiettes & couverts enfant', 'Table de repas enfant', 'Bavoir', 'Chaise haute',
  'Petites voitures', 'Jeux éducatifs', 'Poupées & dînette', "Jeux d'extérieur", 'Vélo enfant',
  'Coiffeuse', 'Draps & housses', 'Vase', 'Décoration',
];

const toutes = (): string[] => RAYONS.flatMap((r) => r.categories);

describe('RAYONS — the structured picker data', () => {
  it("every product type the founder named has its category, and the eight shipped ones survive", () => {
    for (const c of [...SIENS, ...LEGACY]) expect(toutes(), c).toContain(c);
  });

  it('every rayon has a title and at least one category; no category appears twice', () => {
    for (const r of RAYONS) {
      expect(r.titre.trim().length).toBeGreaterThan(0);
      expect(r.categories.length).toBeGreaterThan(0);
    }
    expect(new Set(toutes()).size).toBe(toutes().length);
  });
});

describe('detailChamps — each category wears its OWN structured fields', () => {
  it('the legacy eight keep their exact shipped clothes — live listings and habits unchanged', () => {
    expect(detailChamps('Mode femme').map((c) => c.labelKey)).toEqual(['publier.variantes_tailles']);
    expect(detailChamps('Mode homme').map((c) => c.labelKey)).toEqual(['publier.variantes_tailles']);
    expect(detailChamps('Enfant').map((c) => c.labelKey)).toEqual(['publier.variantes_tailles']);
    expect(detailChamps('Chaussures').map((c) => c.labelKey)).toEqual(['publier.variantes_pointures']);
    expect(detailChamps('Sacs').map((c) => c.labelKey)).toEqual(['publier.variantes_modeles']);
    expect(detailChamps('Maison').map((c) => c.labelKey)).toEqual(['publier.variantes_modeles']);
    expect(detailChamps('Tissus').map((c) => c.labelKey)).toEqual(['publier.variantes_coupe']);
    expect(detailChamps('Beauté scellée').map((c) => c.labelKey)).toEqual(['publier.variantes_contenances']);
  });

  it('every NEW category asks 2–3 category-right questions — never the generic single field', () => {
    for (const c of SIENS) {
      const champs = detailChamps(c);
      expect(champs.length, c).toBeGreaterThanOrEqual(2);
      expect(champs.length, c).toBeLessThanOrEqual(3);
      expect(champs.map((x) => x.labelKey), c).not.toContain('publier.variantes_generique');
    }
    // The category-right spot checks a review would make by hand:
    expect(detailChamps('Siège auto').map((c) => c.labelKey)).toContain('publier.champ_age_poids');
    expect(detailChamps('Vélo enfant').map((c) => c.labelKey)).toContain('publier.champ_roues');
    expect(detailChamps('Jeux éducatifs').map((c) => c.labelKey)).toContain('publier.champ_age_conseille');
    expect(detailChamps('Draps & housses').map((c) => c.labelKey)).toContain('publier.champ_dimensions');
  });

  it('an unknown category (free string by canon) gets the generic single field, never a throw', () => {
    expect(detailChamps('Pièces détachées moto').map((c) => c.labelKey)).toEqual(['publier.variantes_generique']);
    for (const evil of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(detailChamps(evil).map((c) => c.labelKey), evil).toEqual(['publier.variantes_generique']);
    }
  });

  it('every label AND example key any category can emit exists in the catalog, register-tagged', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{
      key: string;
      fr: string;
      register: string;
    }>;
    const byKey = new Map(cat.map((e) => [e.key, e]));
    for (const c of [...toutes(), 'inconnu']) {
      for (const champ of detailChamps(c)) {
        for (const k of [champ.labelKey, champ.exempleKey]) {
          const entry = byKey.get(k);
          expect(entry, `missing catalog key: ${k} (cat ${c})`).toBeDefined();
          expect(entry!.fr.length).toBeGreaterThan(0);
          expect(['neutral', 'money', 'selling']).toContain(entry!.register);
        }
      }
    }
  });
});

describe('detailsParDefaut — only clothing earns a pre-fill; lengths always match the fields', () => {
  it('the three clothing categories get « S, M, L » in their one field; everything else starts EMPTY', () => {
    for (const c of ['Mode femme', 'Mode homme', 'Enfant']) expect(detailsParDefaut(c), c).toEqual(['S, M, L']);
    for (const c of ['Chaussures', 'Siège auto', 'Vase', 'inconnu']) {
      const defauts = detailsParDefaut(c);
      expect(defauts.length, c).toBe(detailChamps(c).length);
      expect(defauts.every((v) => v === ''), c).toBe(true);
    }
  });
});

describe('composeVariantes — what actually publishes as the canon variantsNote', () => {
  it('a single-field category composes to the RAW value — byte-identical to what has always published', () => {
    expect(composeVariantes('Chaussures', ['37, 38, 39'])).toBe('37, 38, 39');
    expect(composeVariantes('Mode femme', ['S, M, L'])).toBe('S, M, L');
    expect(composeVariantes('Tissus', ['  coupe 3 m  '])).toBe('coupe 3 m');
  });

  it('a multi-field category composes labeled pairs, skipping what he left empty', () => {
    const note = composeVariantes('Siège auto', ['0-13 kg', '', 'gris, rose']);
    expect(note).toContain('0-13 kg');
    expect(note).toContain('gris, rose');
    expect(note).toContain(' : ');
    expect(note).toContain(' · ');
    expect(note.split(' · ')).toHaveLength(2); // the empty middle field left no residue
  });

  it('all-empty composes to the empty string — an honest nothing, not « : · : »', () => {
    expect(composeVariantes('Siège auto', ['', '', ''])).toBe('');
    expect(composeVariantes('inconnu', [''])).toBe('');
  });
});

describe('the machine — untouched defaults swap with the category; typed text survives a same-shape change', () => {
  const withCat = (s: S, cat: string): S => reduce(s, { t: 'WIZ_SET', patch: { cat } }).s;

  it('fresh wizard (Mode femme, « S, M, L ») → Chaussures empties; back to clothing refills', () => {
    const s0 = initialState();
    expect(s0.wiz.cat).toBe('Mode femme');
    expect(s0.wiz.details).toEqual(detailsParDefaut('Mode femme'));
    const s1 = withCat(s0, 'Chaussures');
    expect(s1.wiz.details).toEqual(['']);
    const s2 = withCat(s1, 'Mode homme');
    expect(s2.wiz.details).toEqual(['S, M, L']);
  });

  it('text he typed survives every SAME-SHAPE category change (the legacy eight are all one field)', () => {
    const s0 = initialState();
    const typed = reduce(s0, { t: 'WIZ_SET', patch: { details: ['37, 38, 39'] } }).s;
    for (const cat of LEGACY) {
      expect(withCat(typed, cat).wiz.details, cat).toEqual(['37, 38, 39']);
    }
  });

  it('a DIFFERENT-SHAPE change swaps to the new fields — old answers under new labels would be false records', () => {
    const s0 = withCat(initialState(), 'Chaussures');
    const typed = reduce(s0, { t: 'WIZ_SET', patch: { details: ['37, 38, 39'] } }).s;
    const s1 = withCat(typed, 'Siège auto');
    expect(s1.wiz.details).toEqual(detailsParDefaut('Siège auto'));
    expect(s1.wiz.details).toHaveLength(3);
  });

  it('untouched NEW-category defaults swap onward too — three empty fields are still defaults', () => {
    const s0 = withCat(initialState(), 'Siège auto');
    expect(s0.wiz.details).toEqual(['', '', '']);
    const s1 = withCat(s0, 'Poussette');
    expect(s1.wiz.details).toEqual(detailsParDefaut('Poussette'));
  });

  it('a patch that names details ALONGSIDE cat is honored verbatim — no second write', () => {
    const s = reduce(initialState(), { t: 'WIZ_SET', patch: { cat: 'Tissus', details: ['coupe 3 m'] } }).s;
    expect(s.wiz.cat).toBe('Tissus');
    expect(s.wiz.details).toEqual(['coupe 3 m']);
  });

  it('the DEMO publish composes the note through the same law — the call site, not just the function', () => {
    let s = initialState();
    s = reduce(s, { t: 'OPEN_WIZ' }).s;
    s = reduce(s, { t: 'WIZ_SET', patch: { cat: 'Siège auto' } }).s;
    s = reduce(s, { t: 'WIZ_SET', patch: { name: 'Siège auto 0+', details: ['0-13 kg', 'Chicco', ''] } }).s;
    for (let i = 0; i < 3; i += 1) s = reduce(s, { t: 'WIZ_NEXT' }).s;
    s = reduce(s, { t: 'STUDIO_APPROVE' }).s; // the studio's own outcome action — photos true, still step 3
    s = reduce(s, { t: 'WIZ_NEXT' }).s; // → step 4
    s = reduce(s, { t: 'WIZ_NEXT' }).s; // T19 — the demo board write
    const publie = Object.values(s.products).find((p) => p.name === 'Siège auto 0+');
    expect(publie).toBeDefined();
    expect(publie!.sizes).toBe(composeVariantes('Siège auto', ['0-13 kg', 'Chicco', '']));
    expect(publie!.sizes).toContain('0-13 kg');
  });
});
