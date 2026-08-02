import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { varianteChamp, variantesParDefaut } from '../src/v2/categorie-details';
import { initialState, reduce, type S } from '../src/v2/machine';

/**
 * CAPTURE-PAR-CATEGORIE-1 — « Détails & stock » knows the category.
 *
 * The three laws under test: only clothing is pre-filled « S, M, L » (a shoe
 * is never born with shirt sizes — the founder's exact complaint); the field
 * wears the category's own label + example, generic for any string the chips
 * did not produce (the category list is an open ⏳ — no refusals here); and
 * the machine swaps a DEFAULT on category change but never clobbers text he
 * typed.
 */

const WIZ_CATS = ['Mode femme', 'Mode homme', 'Chaussures', 'Sacs', 'Tissus', 'Beauté scellée', 'Maison', 'Enfant'];

describe('variantesParDefaut — only clothing earns a pre-fill', () => {
  it('the three clothing categories get « S, M, L »; the other five start EMPTY', () => {
    for (const cat of ['Mode femme', 'Mode homme', 'Enfant']) expect(variantesParDefaut(cat), cat).toBe('S, M, L');
    for (const cat of ['Chaussures', 'Sacs', 'Tissus', 'Beauté scellée', 'Maison']) expect(variantesParDefaut(cat), cat).toBe('');
  });

  it('an unknown category (free string by canon) gets NO pre-fill, never a throw', () => {
    expect(variantesParDefaut('Pièces détachées moto')).toBe('');
  });

  /** A plain-object lookup answered TRUTHY for these and slipped past `??` —
   *  the renderer then got an undefined key and `t()` throws (white screen).
   *  Canon says `category` is a free string, so the guard must be real. */
  it('a prototype-named category is just an unknown category, never a crash', () => {
    for (const evil of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(variantesParDefaut(evil), evil).toBe('');
    }
  });
});

describe('varianteChamp — the field wears the category, and every key exists', () => {
  it('maps the eight wizard categories to their own clothes', () => {
    expect(varianteChamp('Mode femme').labelKey).toBe('publier.variantes_tailles');
    expect(varianteChamp('Mode homme').labelKey).toBe('publier.variantes_tailles');
    expect(varianteChamp('Enfant').labelKey).toBe('publier.variantes_tailles');
    expect(varianteChamp('Chaussures').labelKey).toBe('publier.variantes_pointures');
    expect(varianteChamp('Sacs').labelKey).toBe('publier.variantes_modeles');
    expect(varianteChamp('Maison').labelKey).toBe('publier.variantes_modeles');
    expect(varianteChamp('Tissus').labelKey).toBe('publier.variantes_coupe');
    expect(varianteChamp('Beauté scellée').labelKey).toBe('publier.variantes_contenances');
    expect(varianteChamp('Autre chose entièrement').labelKey).toBe('publier.variantes_generique');
  });

  it('prototype-named categories get the GENERIC clothes — not an undefined key that throws', () => {
    for (const evil of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(varianteChamp(evil).labelKey, evil).toBe('publier.variantes_generique');
      expect(varianteChamp(evil).exempleKey, evil).toBe('publier.variantes_generique_ex');
    }
  });

  it('every label AND example key any category can emit exists in the catalog', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{
      key: string;
      fr: string;
      register: string;
    }>;
    const byKey = new Map(cat.map((e) => [e.key, e]));
    for (const c of [...WIZ_CATS, 'inconnu']) {
      const { labelKey, exempleKey } = varianteChamp(c);
      for (const k of [labelKey, exempleKey]) {
        const entry = byKey.get(k);
        expect(entry, `missing catalog key: ${k} (cat ${c})`).toBeDefined();
        expect(entry!.fr.length).toBeGreaterThan(0);
        expect(['neutral', 'money', 'selling']).toContain(entry!.register);
      }
    }
  });
});

describe('the machine — a DEFAULT swaps with the category; typed text NEVER does', () => {
  const withCat = (s: S, cat: string): S => reduce(s, { t: 'WIZ_SET', patch: { cat } }).s;

  it('fresh wizard (Mode femme, « S, M, L ») → Chaussures empties; back to clothing refills', () => {
    const s0 = initialState();
    expect(s0.wiz.cat).toBe('Mode femme');
    expect(s0.wiz.sizes).toBe(variantesParDefaut('Mode femme')); // the reset IS the default — the swap law's precondition
    const s1 = withCat(s0, 'Chaussures');
    expect(s1.wiz.sizes).toBe('');
    const s2 = withCat(s1, 'Mode homme');
    expect(s2.wiz.sizes).toBe('S, M, L');
  });

  it('text he typed survives EVERY category change', () => {
    const s0 = initialState();
    const typed = reduce(s0, { t: 'WIZ_SET', patch: { sizes: '37, 38, 39' } }).s;
    for (const cat of WIZ_CATS) {
      expect(withCat(typed, cat).wiz.sizes, cat).toBe('37, 38, 39');
    }
  });

  it('typing the OTHER category’s default is still HIS text — « S, M, L » under Chaussures stays', () => {
    const s0 = withCat(initialState(), 'Chaussures'); // sizes now ''
    const typed = reduce(s0, { t: 'WIZ_SET', patch: { sizes: 'S, M, L' } }).s;
    // 'S, M, L' ≠ variantesParDefaut('Chaussures') ('') — so it is typed text.
    expect(withCat(typed, 'Sacs').wiz.sizes).toBe('S, M, L');
  });

  it('a patch that names sizes ALONGSIDE cat is honored verbatim — no second write', () => {
    const s = reduce(initialState(), { t: 'WIZ_SET', patch: { cat: 'Tissus', sizes: 'coupe 3 m' } }).s;
    expect(s.wiz.cat).toBe('Tissus');
    expect(s.wiz.sizes).toBe('coupe 3 m');
  });
});
