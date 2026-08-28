/**
 * QUARTIERS DE OUAGADOUGOU — the official répartition, complete.
 *
 * SOURCE (the up-to-date administrative truth): the arrondissements-et-
 * secteurs répartition of the urban commune of Ouagadougou — 12
 * arrondissements, 55 secteurs — supplied VERBATIM by the founder on
 * 2026-08-28 (« This the up to date quartiers for Ouagadougou, update this
 * to everywhere in the apps »). It replaces the 2026-08-22 press-snippet
 * reconstruction of Loi n°066-2009/AN wholesale: names are kept exactly as
 * he printed them, secteur by secteur (the inline markers), including where
 * the new répartition spells a name differently from the old module
 * (Dassasgo, Rimkiéta, Zagtouli, plain Gounghin…).
 *
 * DETERMINISTIC DATA (Law 5): a static list, no service call, no
 * inference. The picker that consumes it never refuses a buyer whose
 * quartier is missing — the screen offers her typed text instead
 * (villages rattachés and new lotissements exist; the wire accepts any
 * bounded string, so completeness here is comfort, never a gate).
 *
 * The same module ships in shop-plus (apps/buyer-pwa) — content drift
 * between the two copies is caught by each repo's pin tests.
 */

export const QUARTIERS_PAR_ARRONDISSEMENT: readonly {
  readonly arrondissement: number;
  readonly quartiers: readonly string[];
}[] = [
  { arrondissement: 1, quartiers: [
    /* secteur 1 */ 'Bilbalogho',
    /* secteur 2 */ 'Oscar Yaar', 'Saint-Léon', 'Zone commerciale',
    /* secteur 3 */ 'Koulouba', 'Rotonde', 'Université de Ouagadougou',
    /* secteur 4 */ 'Aéroport', 'Boince Yaar', 'Zangouettin', 'Cité All', 'Kamsonghin',
    /* secteur 5 */ 'Samandin',
    /* secteur 6 */ 'Petit Paris',
  ] },
  { arrondissement: 2, quartiers: [
    /* secteur 7 */ 'Gounghin',
    /* secteur 8 */ 'Hamdalaye', 'Larlé', 'Marché du 10',
    /* secteur 9 */ 'Baskuy Yaar', 'Kolog-Naba', 'Ouidi',
    /* secteur 10 */ 'Cité An III', 'Sankariaré', 'Paspanga',
    /* secteur 11 */ 'Dapoya', 'Nimnin',
  ] },
  { arrondissement: 3, quartiers: [
    /* secteur 12 */ 'Naab Pougo',
    /* secteur 13 */ 'Yaoghin', 'Zongho',
    /* secteur 14 */ 'Noncin', 'Rimkiéta',
    /* secteur 15 */ 'Toécin', 'Kilwin',
    /* secteur 16 */ 'Tampouy',
  ] },
  { arrondissement: 4, quartiers: [
    /* secteur 17 */ 'Koulweoghin', 'Tanghin',
    /* secteur 18 */ 'Somgandé',
    /* secteur 19 */ 'Toudoubwéogo', 'Zone industrielle de Kossodo',
    /* secteur 20 */ 'Polesgo',
  ] },
  { arrondissement: 5, quartiers: [
    /* secteur 21 */ 'ENAREF Cogeb',
    /* secteur 22 */ 'Zogona', 'Zone du Bois',
    /* secteur 23 */ '1200 Logements', 'Dagnoin', 'Wemtenga',
    /* secteur 24 */ 'Kalgondin', 'Ouaga Inter', 'Toeyibin', 'SIAO', 'Silmissin',
  ] },
  { arrondissement: 6, quartiers: [
    /* secteur 25 */ 'Pagalayiri',
    /* secteur 26 */ 'Cissin', 'Pissy',
    /* secteur 27 */ 'Bongnaam',
    /* secteur 28 */ 'Kouritenga', 'Sonré',
    /* secteur 29 */ 'Azimo/Socogib', 'Songnaaba',
  ] },
  { arrondissement: 7, quartiers: [
    /* secteur 30 */ 'Nagrin',
    /* secteur 31 */ 'Bonheur-Ville', 'Waa-Paasi', 'Belle-Ville',
    /* secteur 32 */ 'Sandogo',
    /* secteur 33 */ 'Zagtouli',
  ] },
  { arrondissement: 8, quartiers: [
    /* secteur 34 */ 'Darsalam',
    /* secteur 35 */ 'Basseko', 'Nonghin',
    /* secteur 36 */ 'Bissighin',
  ] },
  { arrondissement: 9, quartiers: [
    /* secteur 37 */ 'Marcoussis', 'Yagma',
    /* secteur 38 */ 'Kamboincé', 'Zoodnoma', 'Watinoma', 'Kossoghin', 'Silmiyiri',
    /* secteur 39 */ 'Babouang Rouanga', 'Toudwéogo',
    /* secteur 40 */ 'Dapaweoghin', 'Toéghin',
  ] },
  { arrondissement: 10, quartiers: [
    /* secteur 41 */ 'Nioko II',
    /* secteur 42 */ 'Bendogo', 'Wayalghin',
    /* secteur 43 */ 'Dassasgo', 'Goundrin',
    /* secteur 44 */ 'Quatorze-Yaar',
    /* secteur 45 */ 'Djikof', 'Taabtenga',
  ] },
  { arrondissement: 11, quartiers: [
    /* secteur 46 */ 'Zone Une', 'Katr-Yaar',
    /* secteur 47 */ 'Rayongo', 'Yamtenga',
    /* secteur 48 */ 'Karpala non loti',
    /* secteur 49 */ 'Baskuy',
    /* secteur 50 */ 'Karpala', 'Lalnouyiri',
    /* secteur 51 */ 'Sanyiri',
  ] },
  { arrondissement: 12, quartiers: [
    /* secteur 52 */ 'Patte d’Oie',
    /* secteur 53 */ 'Trame d’Accueil',
    /* secteur 54 */ 'Ouaga 2000',
    /* secteur 55 */ 'Kossyam',
  ] },
];

/** Accent/case fold — the H2 discipline (NFD, engine-stable), never ICU. */
function plier(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The flat picker list: every quartier once, alphabetical (folded compare
 *  with a raw tiebreak — a total, deterministic order, Law 5). */
export const QUARTIERS_OUAGADOUGOU: readonly string[] = [
  ...new Set(QUARTIERS_PAR_ARRONDISSEMENT.flatMap((a) => a.quartiers)),
].sort((a, b) => {
  const fa = plier(a);
  const fb = plier(b);
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
});

/**
 * The picker's filter: a DETERMINISTIC substring match, accents and case
 * folded on both sides (never a relevance score — Law 5). Empty query →
 * the whole list. No match → [] and the SCREEN keeps his typed text.
 */
export function filtrerQuartiers(query: string): readonly string[] {
  const q = plier(query.trim());
  if (q === '') return QUARTIERS_OUAGADOUGOU;
  return QUARTIERS_OUAGADOUGOU.filter((nom) => plier(nom).includes(q));
}
