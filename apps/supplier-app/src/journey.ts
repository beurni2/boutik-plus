/**
 * WO-4.1 — the supplier journey as DATA. The App renders a stack over this
 * map; the spine test walks it (BFS from START must reach every screen) so
 * the walkable-world promise is asserted, not assumed. No navigation
 * library: a state stack keeps the bundle inside D17 budgets.
 */

export type Screen =
  | 'accueil'
  | 'onboarding'
  | 'produits'
  | 'nouveau'
  | 'photo'
  | 'offre'
  | 'pret'
  | 'corrective'
  | 'echeances'
  // WO-6.0 — B10/B11 as ADDITIVE journey nodes (founder-ratified). Every
  // existing edge/state/money number is untouched; the map-generic spine
  // test stays green because these are reachable, render, and don't dangle.
  | 'recettes'
  | 'moderation'
  // B2 — the trust/consequence view + statement (B7.2), an ADDITIVE node
  // reachable from accueil; access-based consequences, never money.
  | 'confiance';

export const START: Screen = 'accueil';

/** Forward edges only — « Retour » pops the stack and is always available. */
export const JOURNEY: Record<Screen, readonly Screen[]> = {
  accueil: ['onboarding', 'produits', 'echeances', 'recettes', 'moderation', 'confiance'],
  onboarding: ['produits'],
  produits: ['nouveau', 'offre', 'corrective'],
  nouveau: ['photo'],
  photo: ['offre'],
  offre: ['pret'],
  pret: ['produits', 'corrective'],
  corrective: ['pret', 'echeances'],
  echeances: ['produits'],
  recettes: ['produits'],
  moderation: ['produits'],
  confiance: ['produits'],
};
