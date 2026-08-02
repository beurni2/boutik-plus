import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFileSync as readSrc } from 'node:fs';
import { chipChoisi, chipsFournisseurs, pourFournisseurHintKey, type FournisseursRead } from '../src/v2/lister-pour-choix';
import { supplierPourPublication } from '../src/v2/lister-pour';

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

/**
 * THE DoD INVARIANT ITSELF — « the selection that publishes is exactly the one
 * he sees marked » (verifier BLOCKER 2026-08-02: it was not, and NOTHING in
 * this suite noticed — the picker's whole wiring could be deleted and 601/601
 * stayed green). The marking is now DERIVED, so it can be asserted against the
 * real publish rule rather than against a copy of it.
 */
describe('chipChoisi — the marked chip IS the supplier that publishes', () => {
  const SIEN = 'supplier-founder-001';

  it('for every value he can hold, the marked chip resolves to the SAME supplier as the publish', () => {
    for (const valeur of ['', '   ', SIEN, `  ${SIEN}  `, 'supplier-aicha-002', '  supplier-aicha-002  ', 'Supplier-AICHA-002']) {
      const marque = chipChoisi(valeur, SIEN);
      const publie = supplierPourPublication(valeur, SIEN);
      // A chip id of '' IS « Vous », which publishes for himself.
      const supplierDuChip = marque === '' ? SIEN : marque;
      expect(supplierDuChip, `mismatch for ${JSON.stringify(valeur)}`).toBe(publie);
    }
  });

  it('typing his OWN id marks « Vous » — never a picker with nothing chosen', () => {
    expect(chipChoisi(SIEN, SIEN)).toBe('');
    expect(chipChoisi(`  ${SIEN} `, SIEN)).toBe('');
  });

  it('the marked chip EXISTS among the chips — a marking that points at nothing is a lie', () => {
    for (const valeur of ['', SIEN, 'supplier-aicha-002']) {
      const chips = chipsFournisseurs(['supplier-aicha-002', 'supplier-zoe-003', valeur], SIEN);
      expect(chips.some((c) => c.id === chipChoisi(valeur, SIEN)), `no chip for ${JSON.stringify(valeur)}`).toBe(true);
    }
  });

  it('the screen MARKS with chipChoisi and PUBLISHES the same value — the two-copy defect cannot return', () => {
    const screens2 = readSrc(new URL('../src/v2/screens2.tsx', import.meta.url), 'utf8');
    // The marking reads the SAME `fournisseur.value` the wrapper publishes…
    expect(screens2).toContain('active={chipChoisi(fournisseur.value, fournisseur.sienId) === c.id}');
    // …and the tap writes through the single setter, with no local mirror.
    expect(screens2).toContain('onPress={() => fournisseur.onChange(c.id)}');
    expect(screens2, 'a second copy of the selection is back').not.toMatch(/pourSel/);
    const lister = readSrc(new URL('../src/v2/lister-real.tsx', import.meta.url), 'utf8');
    // The wrapper's ONE value feeds the screen and the session alike.
    expect(lister).toContain('session.current.pourFournisseur = v;');
    expect(lister).toContain('value: pour,');
  });
});

describe('pourFournisseurHintKey — every read state names its own sentence', () => {
  const cases: readonly [FournisseursRead, number, string][] = [
    [{ kind: 'sans_cle' }, 0, 'publier.pour_sans_cle_hint'],
    [{ kind: 'chargement' }, 0, 'publier.pour_chargement_hint'],
    [{ kind: 'echec' }, 0, 'publier.pour_echec_hint'],
    [{ kind: 'liste', ids: ['supplier-aicha-002'] }, 1, 'publier.pour_fournisseur_hint'],
    // A SUCCESSFUL read with nobody else is its OWN state (verifier MAJOR): it
    // must not tell him to touch a fournisseur chip that does not exist.
    [{ kind: 'liste', ids: [] }, 0, 'publier.pour_liste_vide_hint'],
  ];

  it('maps each of the five states to a distinct key', () => {
    const keys = cases.map(([read, autres, key]) => {
      expect(pourFournisseurHintKey(read, autres)).toBe(key);
      return key;
    });
    expect(new Set(keys).size).toBe(5);
  });

  it('the empty roster never wears the populated sentence', () => {
    const vide = pourFournisseurHintKey({ kind: 'liste', ids: [] }, 0);
    const plein = pourFournisseurHintKey({ kind: 'liste', ids: ['x'] }, 1);
    expect(vide).not.toBe(plein);
  });

  it('every key the picker can emit EXISTS in the catalog, non-empty, register-tagged', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{
      key: string;
      fr: string;
      register: string;
    }>;
    const byKey = new Map(cat.map((e) => [e.key, e]));
    for (const k of ['publier.pour_chips_vous', 'publier.pour_reessayer', ...cases.map(([, , key]) => key)]) {
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
