import { describe, expect, it } from 'vitest';
import {
  QUARTIERS_OUAGADOUGOU,
  QUARTIERS_PAR_ARRONDISSEMENT,
  filtrerQuartiers,
} from '../src/v2/quartiers-ouagadougou';

/**
 * QUARTIERS-OUAGA-1 (founder order 2026-08-22): « not all quartiers from
 * Ouagadougou are displayed… source all quartiers from an up to date doc. »
 * The doc is the official répartition of the CURRENT structure — Loi
 * n°066-2009/AN, 12 arrondissements — cross-checked across five independent
 * reproductions (sourced in the module header). This module is a CONTENT COPY
 * of the shop-plus buyer-pwa one (each repo deploys alone; no shared package
 * ships app data yet), and these pins are what catches drift between the two:
 * the same 12 arrondissements, the same dedupe/order law, the same canaries.
 */
describe('the official list — complete, deduped, ordered', () => {
  it('all 12 arrondissements are present, each with its quartiers', () => {
    expect(QUARTIERS_PAR_ARRONDISSEMENT.map((a) => a.arrondissement)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const a of QUARTIERS_PAR_ARRONDISSEMENT) expect(a.quartiers.length).toBeGreaterThan(0);
  });

  it('the flat list is DEDUPED (Dassasgho straddles two arrondissements and appears once) and alphabetical, accent-aware', () => {
    expect(new Set(QUARTIERS_OUAGADOUGOU).size).toBe(QUARTIERS_OUAGADOUGOU.length);
    expect(QUARTIERS_OUAGADOUGOU.filter((q) => q === 'Dassasgho')).toHaveLength(1);
    const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const sorted = [...QUARTIERS_OUAGADOUGOU].sort((a, b) => (fold(a) < fold(b) ? -1 : fold(a) > fold(b) ? 1 : 0));
    expect(QUARTIERS_OUAGADOUGOU).toEqual(sorted);
  });

  it('the count matches the sourced répartition — dozens of quartiers, never a handful', () => {
    expect(QUARTIERS_OUAGADOUGOU.length).toBeGreaterThanOrEqual(70);
  });

  it('the landmark names a supplier expects are all here', () => {
    for (const q of ['Ouaga 2000', "Patte d'Oie", 'Tanghin', 'Karpala', 'Kilwin', 'Rimkièta', 'Hamdalaye', 'Larlé', 'Koulouba', 'Bissighin', 'Kossodo', 'Bendogo', 'Gounghin Sud', 'Gounghin Nord', 'Tampouy', 'Pissy', 'Dassasgho']) {
      expect(QUARTIERS_OUAGADOUGOU).toContain(q);
    }
  });
});

describe('filtrerQuartiers — deterministic, accent- and case-insensitive (Law 5: never a relevance score)', () => {
  it('an empty query answers the whole list', () => {
    expect(filtrerQuartiers('')).toEqual(QUARTIERS_OUAGADOUGOU);
    expect(filtrerQuartiers('   ')).toEqual(QUARTIERS_OUAGADOUGOU);
  });

  it('a substring narrows, accents and case folded both ways', () => {
    expect(filtrerQuartiers('goun')).toEqual(['Gounghin Nord', 'Gounghin Sud']);
    expect(filtrerQuartiers('LARLE')).toEqual(['Larlé', 'Larlé Wéogo']);
    expect(filtrerQuartiers('rimkieta')).toEqual(['Rimkièta']);
  });

  it('no match answers the empty list — the SCREEN keeps his typed text; the list is comfort, never a gate', () => {
    expect(filtrerQuartiers('Zone du Bois')).toEqual([]);
  });
});
