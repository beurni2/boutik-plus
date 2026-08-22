/**
 * QUARTIERS DE OUAGADOUGOU — the official répartition, complete.
 *
 * SOURCE (the up-to-date administrative truth): Loi n°066-2009/AN
 * (22 décembre 2009) reorganising the urban commune of Ouagadougou into
 * 12 arrondissements — the structure in force today (the December 2012
 * amendment added secteur 24 to arrondissement 5: a secteur change, not a
 * quartier change). The quartier-par-arrondissement répartition below is
 * the official list as published, reproduced identically by multiple
 * Burkinabè outlets (Wakat Séra · aOuaga.com · Tinganews · Laborpresse ·
 * Nei Yibeogo) and cross-checked across five of those reproductions on
 * 2026-08-22.
 *
 * Names are kept as officially printed, with light typographic
 * normalisation only (capitalisation and spacing — « gounghin Nord » →
 * « Gounghin Nord »; « Nioko1 » → « Nioko 1 »). « Dassasgho » straddles
 * arrondissements 10 and 11 in the official répartition and appears in
 * both, under the one spelling this codebase already uses; the flat list
 * dedupes it.
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
  { arrondissement: 1, quartiers: ['Bilbalogo', 'Saint Léon', 'Zangouettin', 'Tiedpalogo', 'Koulouba', 'Kamsonghin', 'Samandin', 'Gounghin Sud', 'Gandin', 'Mankougoudou'] },
  { arrondissement: 2, quartiers: ['Paspanga', 'Ouidi', 'Larlé', 'Kologh Naba', 'Dapoya 2', 'Nemnin', 'Niogsin', 'Hamdalaye', 'Gounghin Nord', 'Baoghin'] },
  { arrondissement: 3, quartiers: ['Camp militaire', 'Naababpougo', 'Kienbaoghin', 'Zongo', 'Koumdayonré', 'Nonsin', 'Rimkièta', 'Tampouy', 'Kilwin'] },
  { arrondissement: 4, quartiers: ['Tanghin', 'Sambin Barrage', 'Somgandé', 'Zone industrielle', 'Nioko 2', 'Bendogo', 'Toukin'] },
  { arrondissement: 5, quartiers: ['Zogona', 'Wemtenga', 'Dagnoën', 'Ronsin', 'Kalgondin'] },
  { arrondissement: 6, quartiers: ['Cissin', 'Kouritenga', 'Pissy'] },
  { arrondissement: 7, quartiers: ['Nagrin', 'Yaoghin', 'Sandogo', 'Kankasin', 'Boassa'] },
  { arrondissement: 8, quartiers: ['Zaghtouli', 'Zongo Nabitenga', 'Sogpèlcé', 'Bissighin', 'Bassinko', 'Dar-es-Salam', 'Silmiougou', 'Gantin'] },
  { arrondissement: 9, quartiers: ['Bangpooré', 'Larlé Wéogo', 'Marcoussis', 'Silmiyiri', 'Wob Riguéré', 'Ouapassi'] },
  { arrondissement: 10, quartiers: ['Kossodo', 'Wayalghin', 'Godin', 'Nioko 1', 'Dassasgho', 'Taabtenga'] },
  { arrondissement: 11, quartiers: ['Dassasgho', 'Yemtenga', 'Karpala', 'Lanoayiri', 'Dayongo', 'Ouidtenga'] },
  { arrondissement: 12, quartiers: ["Patte d'Oie", 'Ouaga 2000', "Trame d'accueil Ouaga 2000"] },
];

/** Accent/case fold — the H2 discipline (NFD, engine-stable), never ICU. */
function plier(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The flat picker list: every quartier once, alphabetical (folded compare
 *  with a raw tiebreak — a total, deterministic order, SP-I11). */
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
 * folded on both sides (never a relevance score — SP-I11). Empty query →
 * the whole list. No match → [] and the SCREEN offers the typed text.
 */
export function filtrerQuartiers(query: string): readonly string[] {
  const q = plier(query.trim());
  if (q === '') return QUARTIERS_OUAGADOUGOU;
  return QUARTIERS_OUAGADOUGOU.filter((nom) => plier(nom).includes(q));
}
