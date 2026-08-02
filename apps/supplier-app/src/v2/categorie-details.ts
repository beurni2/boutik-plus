/**
 * CAPTURE-PAR-CATEGORIE-1 — « Détails & stock » finally KNOWS the category
 * (founder order 2026-08-02: « on Détails & stock it's always the same thing
 * no matter the category »). Two pure decisions and nothing else: what the
 * machine may PRE-FILL into `sizes` for a category, and which label + example
 * the field wears.
 *
 * The category stays a FREE display string (canon `TrimmedNonEmptyString`,
 * commerce.ts §5) — nothing here invents a facts schema or narrows the open
 * category-list Decision (⏳): a string the eight chips did not produce gets
 * the generic clothes and NO pre-fill, never a refusal.
 */

/**
 * What the machine may write into `sizes` UNASKED. Only clothing earns a
 * pre-fill: S/M/L is a true default for garments and a false one for
 * everything else (shoes come in pointures, fabric in coupes — the founder's
 * exact complaint). Everyone else starts EMPTY: an empty field is honest;
 * « S, M, L » on a sealed-beauty listing is not.
 */
export function variantesParDefaut(cat: string): string {
  return cat === 'Mode femme' || cat === 'Mode homme' || cat === 'Enfant' ? 'S, M, L' : '';
}

export interface VarianteChamp {
  /** Catalog key for the field's label — also the recap row's label. */
  readonly labelKey: string;
  /** Catalog key for the one-line example under the field. */
  readonly exempleKey: string;
}

const TAILLES: VarianteChamp = { labelKey: 'publier.variantes_tailles', exempleKey: 'publier.variantes_tailles_ex' };
const MODELES: VarianteChamp = { labelKey: 'publier.variantes_modeles', exempleKey: 'publier.variantes_modeles_ex' };

/**
 * A MAP, not an object literal (verifier finding, 2026-08-02): a plain-object
 * lookup walks `Object.prototype`, so a category named `constructor` or
 * `toString` returned a truthy non-entry, slipped past `??`, and handed the
 * renderer an undefined key — `t()` throws on that, so a free-string category
 * (canon: `TrimmedNonEmptyString`, list still an open ⏳) would have been a
 * white screen instead of the generic clothes this module promises.
 */
const CHAMP: ReadonlyMap<string, VarianteChamp> = new Map([
  ['Mode femme', TAILLES],
  ['Mode homme', TAILLES],
  ['Enfant', TAILLES],
  ['Chaussures', { labelKey: 'publier.variantes_pointures', exempleKey: 'publier.variantes_pointures_ex' }],
  ['Sacs', MODELES],
  ['Maison', MODELES],
  ['Tissus', { labelKey: 'publier.variantes_coupe', exempleKey: 'publier.variantes_coupe_ex' }],
  ['Beauté scellée', { labelKey: 'publier.variantes_contenances', exempleKey: 'publier.variantes_contenances_ex' }],
]);

const GENERIQUE: VarianteChamp = { labelKey: 'publier.variantes_generique', exempleKey: 'publier.variantes_generique_ex' };

/** The field's clothes for a category — generic for any unknown string. */
export function varianteChamp(cat: string): VarianteChamp {
  return CHAMP.get(cat) ?? GENERIQUE;
}
