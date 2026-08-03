import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chipsProduits, fournisseursALire, fusionner, montreAttribution, TOUS } from '../src/v2/produits-filtre';

/**
 * PRODUITS-PAR-FOURNISSEUR — the founder monitors every supplier from his own
 * Produits screen. These are the decisions, pure; the read stays dumb.
 */

const MOI = 'supplier-founder-001';
const row = (name: string) => ({ offerId: `o-${name}`, productVersionId: `pv-${name}`, name, category: 'c', basePrice: 1, resellerCommission: 0, available: 1, assetRefs: [] }) as never;

describe('the chips — Tous, Vous, then the others', () => {
  it('folds his own id into « Vous » and sorts the rest', () => {
    const chips = chipsProduits([MOI, 'supplier-zoe-003', 'supplier-aicha-002'], MOI);
    expect(chips.map((c) => c.id)).toEqual([TOUS, '', 'supplier-aicha-002', 'supplier-zoe-003']);
    expect(chips[0]!.labelKey).toBe('produits.filtre_tous');
    expect(chips[1]!.labelKey).toBe('produits.filtre_vous');
    expect(chips[2]!.labelKey).toBeNull(); // ids are identifiers, not copy
  });

  it('NO OTHER SUPPLIER ⇒ NO CHIP ROW: a filter that cannot filter is chrome', () => {
    expect(chipsProduits([MOI], MOI)).toEqual([]);
    expect(chipsProduits([], MOI)).toEqual([]);
    expect(chipsProduits(['', MOI], MOI)).toEqual([]); // the '' sentinel is not a supplier
  });
});

describe('the fan-out plan — « Tous » is composed, never asked for', () => {
  it('TOUS reads HIM FIRST, then the others in chip order', () => {
    expect(fournisseursALire(TOUS, ['supplier-zoe-003', MOI, 'supplier-aicha-002'], MOI)).toEqual([
      MOI, 'supplier-aicha-002', 'supplier-zoe-003',
    ]);
  });

  it('a named supplier reads THAT ONE only; « Vous » reads his own id', () => {
    expect(fournisseursALire('supplier-aicha-002', [MOI, 'supplier-aicha-002'], MOI)).toEqual(['supplier-aicha-002']);
    expect(fournisseursALire('', [MOI], MOI)).toEqual([MOI]);
  });

  it('the plan is DETERMINISTIC — the same roster in any order plans the same reads', () => {
    const a = fournisseursALire(TOUS, ['b', 'a', MOI], MOI);
    const b = fournisseursALire(TOUS, [MOI, 'a', 'b', 'a'], MOI);
    expect(a).toEqual(b); // loi 5: no ranking, no scoring, no surprise
  });
});

describe('the merge — every row tagged by the read that fetched it', () => {
  it('keeps plan order and each supplier’s own order, and never re-sorts products', () => {
    const merged = fusionner([
      { supplierId: MOI, rows: [row('mien-2'), row('mien-1')] },
      { supplierId: 'supplier-aicha-002', rows: [row('aicha-1')] },
    ]);
    expect(merged.map((m) => m.row.name)).toEqual(['mien-2', 'mien-1', 'aicha-1']);
    expect(merged.map((m) => m.supplierId)).toEqual([MOI, MOI, 'supplier-aicha-002']);
  });

  it('THE TAG COMES FROM THE READ, not from the row — a scoped list carries no supplierId', () => {
    // If this ever read a field off the row it would be undefined for every
    // row, silently attributing every product to nobody.
    const merged = fusionner([{ supplierId: 'supplier-aicha-002', rows: [row('x')] }]);
    expect(merged[0]!.supplierId).toBe('supplier-aicha-002');
    expect('supplierId' in merged[0]!.row).toBe(false);
  });
});

describe('the attribution line appears only when it teaches something', () => {
  it('one supplier ⇒ silent; more than one ⇒ shown', () => {
    expect(montreAttribution([MOI])).toBe(false);
    expect(montreAttribution([MOI, MOI])).toBe(false); // the same read twice is still one supplier
    expect(montreAttribution([MOI, 'supplier-aicha-002'])).toBe(true);
  });
});

describe('every key these chips can emit EXISTS in the catalog', () => {
  it('tous + vous, register-tagged', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{ key: string; fr: string; register: string }>;
    const byKey = new Map(cat.map((e) => [e.key, e]));
    for (const k of ['produits.filtre_tous', 'produits.filtre_vous']) {
      const e = byKey.get(k);
      expect(e, `missing catalog key: ${k}`).toBeDefined();
      expect(e!.fr.length).toBeGreaterThan(0);
      expect(['neutral', 'money', 'selling']).toContain(e!.register);
    }
  });
});
