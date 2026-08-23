import { t } from '../i18n';

/**
 * RAYONS-1 — the listing wizard learns to sell MULTI-DIVERSE products
 * (founder order 2026-08-23: « the categories and the details & stocks are
 * not really professional and well structured like a real listing screens of
 * multi-diverse products »), seeded with his own taxonomy: car seat,
 * stroller · baby room · baby bath · baby dining · toys · women's room —
 * « plus many other types of products ».
 *
 * Two structures and three pure decisions, nothing else:
 *   · RAYONS — the picker's shelves: every category, grouped the way a real
 *     store is aisled. UI grouping ONLY — what publishes is the category
 *     string alone.
 *   · detailChamps — which structured questions « Détails & stock » asks for
 *     a category (2–3 for the new taxonomy, the single shipped field for the
 *     legacy eight — live listings and habits unchanged).
 *   · detailsParDefaut / composeVariantes — what the machine may pre-fill
 *     unasked (clothing's « S, M, L », the shipped law, and nothing else),
 *     and how the answers become the ONE canon `variantsNote` string.
 *
 * The category stays a FREE display string (canon `TrimmedNonEmptyString`,
 * commerce.ts §5) — nothing here invents a facts schema or adds an allowlist:
 * a string these shelves did not produce gets the generic single field and NO
 * pre-fill, never a refusal. CAPTURE-PAR-CATEGORIE-1's guard survives whole:
 * lookups are Maps, so a category named `constructor` is just an unknown
 * category, never a prototype hit that hands the renderer an undefined key.
 */

export interface VarianteChamp {
  /** Catalog key for the field's label — also the recap row's label. */
  readonly labelKey: string;
  /** Catalog key for the one-line example under the field. */
  readonly exempleKey: string;
}

export interface Rayon {
  readonly titre: string;
  readonly categories: readonly string[];
}

/**
 * The shelves, in the order he shops them: his named products first (bébé,
 * jouets, maison), the shipped eight after. Titles and category names are
 * taxonomy DATA like the quartier répertoire — proper nouns of the store, not
 * sentences (the field labels and examples live in the catalog, tagged).
 */
export const RAYONS: readonly Rayon[] = [
  { titre: 'Bébé — sortie & voyage', categories: ['Siège auto', 'Poussette'] },
  { titre: 'Bébé — chambre', categories: ['Lit petit enfant', 'Lit à barreaux', 'Couffin'] },
  { titre: 'Bébé — bain', categories: ['Baignoire bébé', 'Bassine de bain', 'Tapis de bain', 'Serviette bébé'] },
  { titre: 'Bébé — repas', categories: ['Chaise haute', 'Assiettes & couverts enfant', 'Table de repas enfant', 'Bavoir'] },
  { titre: 'Jouets & jeux', categories: ['Petites voitures', 'Jeux éducatifs', 'Poupées & dînette', "Jeux d'extérieur", 'Vélo enfant'] },
  { titre: 'Maison & chambre', categories: ['Coiffeuse', 'Draps & housses', 'Vase', 'Décoration', 'Maison'] },
  { titre: 'Mode & tissus', categories: ['Mode femme', 'Mode homme', 'Enfant', 'Chaussures', 'Sacs', 'Tissus'] },
  { titre: 'Beauté', categories: ['Beauté scellée'] },
];

// ── the field vocabulary — one entry per QUESTION, reused across categories ──
const TAILLES: VarianteChamp = { labelKey: 'publier.variantes_tailles', exempleKey: 'publier.variantes_tailles_ex' };
const POINTURES: VarianteChamp = { labelKey: 'publier.variantes_pointures', exempleKey: 'publier.variantes_pointures_ex' };
const MODELES: VarianteChamp = { labelKey: 'publier.variantes_modeles', exempleKey: 'publier.variantes_modeles_ex' };
const COUPE: VarianteChamp = { labelKey: 'publier.variantes_coupe', exempleKey: 'publier.variantes_coupe_ex' };
const CONTENANCES: VarianteChamp = { labelKey: 'publier.variantes_contenances', exempleKey: 'publier.variantes_contenances_ex' };
const AGE_POIDS: VarianteChamp = { labelKey: 'publier.champ_age_poids', exempleKey: 'publier.champ_age_poids_ex' };
const AGE_CONSEILLE: VarianteChamp = { labelKey: 'publier.champ_age_conseille', exempleKey: 'publier.champ_age_conseille_ex' };
const MARQUE: VarianteChamp = { labelKey: 'publier.champ_marque', exempleKey: 'publier.champ_marque_ex' };
const COULEURS: VarianteChamp = { labelKey: 'publier.champ_couleurs', exempleKey: 'publier.champ_couleurs_ex' };
const DIMENSIONS: VarianteChamp = { labelKey: 'publier.champ_dimensions', exempleKey: 'publier.champ_dimensions_ex' };
const MATIERE: VarianteChamp = { labelKey: 'publier.champ_matiere', exempleKey: 'publier.champ_matiere_ex' };
const PIECES: VarianteChamp = { labelKey: 'publier.champ_pieces', exempleKey: 'publier.champ_pieces_ex' };
const ROUES: VarianteChamp = { labelKey: 'publier.champ_roues', exempleKey: 'publier.champ_roues_ex' };

const GENERIQUE: VarianteChamp = { labelKey: 'publier.variantes_generique', exempleKey: 'publier.variantes_generique_ex' };

/**
 * The questions per category. A Map, prototype-safe (the CAPTURE-PAR-
 * CATEGORIE-1 lesson). The legacy eight keep their ONE shipped field so
 * nothing about a live listing's habits or bytes moves; the new taxonomy asks
 * the 2–3 questions a real listing page would.
 */
const CHAMPS: ReadonlyMap<string, readonly VarianteChamp[]> = new Map([
  ['Mode femme', [TAILLES]],
  ['Mode homme', [TAILLES]],
  ['Enfant', [TAILLES]],
  ['Chaussures', [POINTURES]],
  ['Sacs', [MODELES]],
  ['Maison', [MODELES]],
  ['Tissus', [COUPE]],
  ['Beauté scellée', [CONTENANCES]],
  ['Siège auto', [AGE_POIDS, MARQUE, COULEURS]],
  ['Poussette', [MARQUE, COULEURS]],
  ['Lit petit enfant', [DIMENSIONS, MATIERE]],
  ['Lit à barreaux', [DIMENSIONS, MATIERE]],
  ['Couffin', [MATIERE, COULEURS]],
  ['Baignoire bébé', [DIMENSIONS, COULEURS]],
  ['Bassine de bain', [PIECES, COULEURS]],
  ['Tapis de bain', [DIMENSIONS, COULEURS]],
  ['Serviette bébé', [MATIERE, COULEURS]],
  ['Chaise haute', [MARQUE, COULEURS]],
  ['Assiettes & couverts enfant', [PIECES, COULEURS]],
  ['Table de repas enfant', [DIMENSIONS, MATIERE]],
  ['Bavoir', [PIECES, COULEURS]],
  ['Petites voitures', [MODELES, AGE_CONSEILLE]],
  ['Jeux éducatifs', [MODELES, AGE_CONSEILLE]],
  ['Poupées & dînette', [MODELES, AGE_CONSEILLE]],
  ["Jeux d'extérieur", [MODELES, AGE_CONSEILLE]],
  ['Vélo enfant', [ROUES, MODELES]],
  ['Coiffeuse', [DIMENSIONS, MATIERE]],
  ['Draps & housses', [DIMENSIONS, MATIERE]],
  ['Vase', [MATIERE, COULEURS]],
  ['Décoration', [MODELES, MATIERE]],
]);

/** The category's questions — the generic single field for any unknown string. */
export function detailChamps(cat: string): readonly VarianteChamp[] {
  return CHAMPS.get(cat) ?? [GENERIQUE];
}

/**
 * What the machine may write into the fields UNASKED. Only clothing earns a
 * pre-fill (the shipped law): S/M/L is a true default for garments and a
 * false one for everything else. Every other field starts EMPTY — an empty
 * field is honest; an invented dimension on a car seat is not.
 */
export function detailsParDefaut(cat: string): readonly string[] {
  const habits = cat === 'Mode femme' || cat === 'Mode homme' || cat === 'Enfant' ? 'S, M, L' : '';
  return detailChamps(cat).map((_, i) => (i === 0 ? habits : ''));
}

/**
 * The answers → the ONE canon `variantsNote` string. A single-field category
 * composes to the RAW value — byte-identical to what has always published, so
 * no downstream display of a live listing moves. A multi-field category
 * composes « Label : valeur » pairs joined by « · », skipping what he left
 * empty; all-empty is the empty string, never punctuation debris.
 */
export function composeVariantes(cat: string, valeurs: readonly string[]): string {
  const champs = detailChamps(cat);
  if (champs.length === 1) return (valeurs[0] ?? '').trim();
  const parts: string[] = [];
  champs.forEach((c, i) => {
    const v = (valeurs[i] ?? '').trim();
    if (v !== '') parts.push(`${t(c.labelKey)} : ${v}`);
  });
  return parts.join(' · ');
}
