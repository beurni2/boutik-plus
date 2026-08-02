import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chipsFournisseurs, pourFournisseurHintKey, type FournisseursRead } from '../src/v2/lister-pour-choix';

/**
 * LISTER-POUR-2 — the supplier picker's pure decisions.
 *
 * What must hold: « Vous » leads and his own id is FOLDED into it (two chips
 * meaning the same publication is a failed 5-second test); every other active
 * supplier gets exactly one chip, sorted for French eyes; and every read
 * state — including the two failures — names its own hint, so the screen can
 * never show a list-shaped silence.
 */

describe('chipsFournisseurs — « Vous » first, one chip per OTHER supplier', () => {
  it('folds his own id into « Vous » instead of showing it twice', () => {
    const chips = chipsFournisseurs(['supplier-founder-001', 'supplier-aicha-002'], 'supplier-founder-001');
    expect(chips.map((c) => c.id)).toEqual(['', 'supplier-aicha-002']);
    expect(chips[0]!.labelKey).toBe('publier.pour_chips_vous');
    expect(chips[1]!.labelKey).toBeNull();
  });

  it('dedupes, drops the empty sentinel, and sorts the others fr-wise', () => {
    const chips = chipsFournisseurs(
      ['supplier-zoe', 'supplier-aicha', '', 'supplier-zoe', 'supplier-éla'],
      'supplier-founder-001',
    );
    // '' is « Vous » itself, never a second anonymous chip; 'é' sorts with 'e'
    // under fr collation rather than after 'z' (the byte-order failure).
    expect(chips.map((c) => c.id)).toEqual(['', 'supplier-aicha', 'supplier-éla', 'supplier-zoe']);
  });

  it('an empty roster still yields « Vous » — the picker is never blank', () => {
    const chips = chipsFournisseurs([], 'supplier-founder-001');
    expect(chips).toEqual([{ id: '', labelKey: 'publier.pour_chips_vous' }]);
  });
});

describe('pourFournisseurHintKey — every read state names its own sentence', () => {
  const cases: readonly [FournisseursRead, string][] = [
    [{ kind: 'sans_cle' }, 'publier.pour_sans_cle_hint'],
    [{ kind: 'chargement' }, 'publier.pour_chargement_hint'],
    [{ kind: 'echec' }, 'publier.pour_echec_hint'],
    [{ kind: 'liste', ids: [] }, 'publier.pour_fournisseur_hint'],
  ];

  it('maps each of the four states to a distinct key', () => {
    const keys = cases.map(([read, key]) => {
      expect(pourFournisseurHintKey(read)).toBe(key);
      return key;
    });
    expect(new Set(keys).size).toBe(4);
  });

  it('every key the picker can emit EXISTS in the catalog, non-empty, register-tagged', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{
      key: string;
      fr: string;
      register: string;
    }>;
    const byKey = new Map(cat.map((e) => [e.key, e]));
    for (const k of ['publier.pour_chips_vous', ...cases.map(([, key]) => key)]) {
      const entry = byKey.get(k);
      expect(entry, `missing catalog key: ${k}`).toBeDefined();
      expect(entry!.fr.length).toBeGreaterThan(0);
      expect(['neutral', 'money', 'selling']).toContain(entry!.register);
    }
    // The two fallback hints must still tell him the TYPED path works — the
    // field under them is the 1b input, and a hint that only laments would
    // strand him (« what to do », not just « what went wrong »).
    for (const k of ['publier.pour_sans_cle_hint', 'publier.pour_echec_hint']) {
      expect(byKey.get(k)!.fr.includes('identifiant')).toBe(true);
    }
  });
});
