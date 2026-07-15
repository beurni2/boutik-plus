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
  | 'confiance'
  // WO-FP-BOUTIK (founder device review #6) — the Mes-recettes obligation
  // DETAIL, an ADDITIVE node reached from `recettes`. A render view over the
  // EXISTING settlement read model (verbatim obligation, B+I-05); no new data
  // path, no money computed. SP#001 additive-journey doctrine: every existing
  // edge/state/money number byte-identical; this only APPENDS a node + one edge.
  | 'recette';

export const START: Screen = 'accueil';

/** Forward edges only — « Retour » pops the stack and is always available. */
export const JOURNEY: Record<Screen, readonly Screen[]> = {
  // WO-FP-BOUTIK (device review #1): the accueil « Vendre un nouveau produit »
  // primary CTA targets `nouveau`; the FP rewire moved that CTA onto accueil
  // without this edge, so `go('nouveau')` no-op'd (dead CTA). ADDITIVE edge —
  // every pre-existing accueil target is byte-identical; only `nouveau` appended.
  accueil: ['onboarding', 'produits', 'echeances', 'recettes', 'moderation', 'confiance', 'nouveau'],
  onboarding: ['produits'],
  produits: ['nouveau', 'offre', 'corrective'],
  nouveau: ['photo'],
  photo: ['offre'],
  offre: ['pret'],
  pret: ['produits', 'corrective'],
  corrective: ['pret', 'echeances'],
  // WO-FP-BOUTIK (device review #3): an échéance row wires to the correction
  // flow; `corrective` already reaches `pret`/`echeances` (existing edges).
  echeances: ['produits', 'corrective'],
  // WO-FP-BOUTIK (device review #6): `recette` detail appended (additive edge).
  recettes: ['produits', 'recette'],
  moderation: ['produits'],
  confiance: ['produits'],
  recette: ['produits'],
};
