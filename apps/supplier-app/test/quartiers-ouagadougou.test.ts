import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  QUARTIERS_OUAGADOUGOU,
  QUARTIERS_PAR_ARRONDISSEMENT,
  filtrerQuartiers,
} from '../src/v2/quartiers-ouagadougou';

/**
 * QUARTIERS-OUAGA-2 (founder order 2026-08-28): « This the up to date
 * quartiers for Ouagadougou, update this to everywhere in the apps. » The
 * source is his message VERBATIM — the arrondissements-et-secteurs
 * répartition, 12 arrondissements / 55 secteurs / 101 quartiers — replacing
 * the 2026-08-22 press-snippet reconstruction. This module is a CONTENT COPY
 * of the shop-plus buyer-pwa one (each repo deploys alone; no shared package
 * ships app data yet), and these pins are what catches drift between the
 * two: the same 12 arrondissements, the same distinct/order law, the same
 * exact count, the same canaries.
 */
describe('the official list — complete, distinct, ordered', () => {
  it('all 12 arrondissements are present, each with its quartiers', () => {
    expect(QUARTIERS_PAR_ARRONDISSEMENT.map((a) => a.arrondissement)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const a of QUARTIERS_PAR_ARRONDISSEMENT) expect(a.quartiers.length).toBeGreaterThan(0);
  });

  it('the flat list is DISTINCT (the 2026-08-28 répartition repeats no name) and alphabetical, accent-aware', () => {
    expect(new Set(QUARTIERS_OUAGADOUGOU).size).toBe(QUARTIERS_OUAGADOUGOU.length);
    const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const sorted = [...QUARTIERS_OUAGADOUGOU].sort((a, b) => (fold(a) < fold(b) ? -1 : fold(a) > fold(b) ? 1 : 0));
    expect(QUARTIERS_OUAGADOUGOU).toEqual(sorted);
  });

  it('the count is EXACTLY the founder\'s répartition: 101 rows, 101 in the flat list', () => {
    // Pinned exact (the QUARTIERS-OUAGA-1 verifier's standing note): the
    // module header claims cross-repo drift is caught by these pins, and a
    // floor lets a dropped or misspelled non-canary name through.
    expect(QUARTIERS_PAR_ARRONDISSEMENT.flatMap((a) => a.quartiers)).toHaveLength(101);
    expect(QUARTIERS_OUAGADOUGOU).toHaveLength(101);
  });

  it('the WHOLE content is pinned — one hash over every name, shared verbatim with the shop-plus copy', () => {
    // The QUARTIERS-OUAGA-2 verifier proved the canary pins let a
    // count-preserving misspelling of a non-canary name through. This
    // closes it: any changed byte in any name breaks this hash — and the
    // SAME constant lives in shop-plus's pin, so a single-repo edit
    // breaks the cross-repo identity too. On a legitimate future list
    // change, recompute from the new module and update BOTH repos in the
    // same slice.
    const hash = createHash('sha256').update(QUARTIERS_OUAGADOUGOU.join('\n'), 'utf8').digest('hex');
    expect(hash).toBe('1109c5d6658fc8ed85c968da39ef9e8fcfed181658eba35c3f7febf0e9dc96e1');
  });

  it('the landmark names a supplier expects are all here, under the 2026-08-28 spellings', () => {
    for (const q of ['Ouaga 2000', 'Patte d’Oie', 'Kossyam', 'Tanghin', 'Karpala', 'Kilwin', 'Rimkiéta', 'Hamdalaye', 'Larlé', 'Koulouba', 'Bissighin', 'Bendogo', 'Gounghin', 'Tampouy', 'Pissy', 'Cissin', 'Somgandé', 'Dassasgo', 'Zagtouli', 'Zone du Bois', '1200 Logements', 'Marché du 10']) {
      expect(QUARTIERS_OUAGADOUGOU).toContain(q);
    }
  });

  it('the retired 2026-08-22 spellings are really gone — a default or fixture still naming one is stale', () => {
    for (const q of ['Gounghin Sud', 'Gounghin Nord', 'Dassasgho', 'Rimkièta', 'Zaghtouli', 'Dar-es-Salam', 'Nioko 1', 'Nioko 2', 'Larlé Wéogo']) {
      expect(QUARTIERS_OUAGADOUGOU).not.toContain(q);
    }
  });
});

describe('filtrerQuartiers — deterministic, accent- and case-insensitive (Law 5: never a relevance score)', () => {
  it('an empty query answers the whole list', () => {
    expect(filtrerQuartiers('')).toEqual(QUARTIERS_OUAGADOUGOU);
    expect(filtrerQuartiers('   ')).toEqual(QUARTIERS_OUAGADOUGOU);
  });

  it('a substring narrows, accents and case folded both ways', () => {
    expect(filtrerQuartiers('goun')).toEqual(['Goundrin', 'Gounghin']);
    expect(filtrerQuartiers('LARLE')).toEqual(['Larlé']);
    expect(filtrerQuartiers('rimkieta')).toEqual(['Rimkiéta']);
    expect(filtrerQuartiers('karpala')).toEqual(['Karpala', 'Karpala non loti']);
  });

  it('no match answers the empty list — the SCREEN keeps his typed text; the list is comfort, never a gate', () => {
    // A real place OUTSIDE the commune's répartition — exactly the
    // villages-rattachés case the free-text road exists for.
    expect(filtrerQuartiers('Tanghin-Dassouri')).toEqual([]);
  });
});
