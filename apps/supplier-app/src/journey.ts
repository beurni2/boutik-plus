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
  | 'echeances';

export const START: Screen = 'accueil';

/** Forward edges only — « Retour » pops the stack and is always available. */
export const JOURNEY: Record<Screen, readonly Screen[]> = {
  accueil: ['onboarding', 'produits', 'echeances'],
  onboarding: ['produits'],
  produits: ['nouveau', 'offre', 'corrective'],
  nouveau: ['photo'],
  photo: ['offre'],
  offre: ['pret'],
  pret: ['produits', 'corrective'],
  corrective: ['pret', 'echeances'],
  echeances: ['produits'],
};
