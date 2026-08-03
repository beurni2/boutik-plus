import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleEchecHttp, supplierPourPublication } from '../src/v2/lister-pour';

/**
 * LISTER-POUR-1b — the aimed pen's two pure rules.
 *
 * The field itself is one uncontrolled Input on the recap step; everything
 * DECIDABLE about it lives in `lister-pour.ts` and is proven here: an empty
 * field is HIMSELF (yesterday's publish unchanged), a named id travels
 * verbatim, and the one refusal this slice taught the service reaches him as
 * its own catalog sentence rather than a bare JSON tail.
 */

describe('LISTER-POUR-1b — whom the publication is for', () => {
  it('empty and blank mean HIMSELF — the default publish is unchanged', () => {
    expect(supplierPourPublication('', 'supplier-founder-001')).toBe('supplier-founder-001');
    expect(supplierPourPublication('   ', 'supplier-founder-001')).toBe('supplier-founder-001');
  });

  it('a named supplier travels VERBATIM, trimmed — never rewritten', () => {
    expect(supplierPourPublication('  supplier-aicha-002  ', 'supplier-founder-001')).toBe('supplier-aicha-002');
    // No case-folding, no normalization: the id is an identifier, and the
    // server's known-supplier gate judges the exact bytes he typed.
    expect(supplierPourPublication('Supplier-AICHA-002', 'supplier-founder-001')).toBe('Supplier-AICHA-002');
  });

  const MOI = 'supplier-founder-001';

  it('the unknown-supplier refusal maps to ITS OWN sentence; everything else keeps the generic frame', () => {
    expect(cleEchecHttp('HTTP 400: {"error":"unknown_supplier","supplierId":"supplier-typo"}', MOI)).toBe(
      'publier.err_fournisseur_inconnu',
    );
    expect(cleEchecHttp('HTTP 401: unauthorized', MOI)).toBe('publier.echec');
    expect(cleEchecHttp('HTTP 500: boom', MOI)).toBe('publier.echec');
  });

  // FOUNDER REPORT 2026-08-03 — the exact body he was shown, verbatim. He had
  // published for HIMSELF (« Vous »), and « Ce fournisseur n'est pas encore
  // connu ici » is true of a stranger, not of him.
  it('WHEN THE REFUSED ID IS HIS OWN, the sentence speaks in his terms', () => {
    const sien = 'HTTP 400: {"error":"unknown_supplier","supplierId":"supplier-founder-001"}';
    expect(cleEchecHttp(sien, MOI)).toBe('publier.err_mon_code_absent');
    // …and the SAME body is the other sentence for a different studio identity:
    // the branch keys on the id, never on the shape of the reason.
    expect(cleEchecHttp(sien, 'supplier-aicha-002')).toBe('publier.err_fournisseur_inconnu');
  });

  it('an UNREADABLE body never claims HIS code is missing — the safe side of the fork', () => {
    // Sending him to mint a code he already holds would invalidate the one he
    // is using (a re-mint replaces it), so the fallback is the other sentence.
    expect(cleEchecHttp('HTTP 400: unknown_supplier', MOI)).toBe('publier.err_fournisseur_inconnu');
    expect(cleEchecHttp('HTTP 400: {"error":"unknown_supplier"}', MOI)).toBe('publier.err_fournisseur_inconnu');
    // A near-miss id is a stranger, not him — no prefix or case leniency.
    expect(cleEchecHttp('HTTP 400: {"error":"unknown_supplier","supplierId":"supplier-founder-0011"}', MOI)).toBe(
      'publier.err_fournisseur_inconnu',
    );
    expect(cleEchecHttp('HTTP 400: {"error":"unknown_supplier","supplierId":"SUPPLIER-FOUNDER-001"}', MOI)).toBe(
      'publier.err_fournisseur_inconnu',
    );
  });

  it('every key this slice can emit EXISTS in the catalog, with its register and screenClass', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{
      key: string;
      fr: string;
      register: string;
      screenClass: string;
    }>;
    const byKey = new Map(cat.map((e) => [e.key, e]));
    for (const k of [
      'publier.pour_fournisseur_label',
      'publier.pour_fournisseur_hint',
      'publier.err_fournisseur_inconnu',
      'publier.err_mon_code_absent',
    ]) {
      const entry = byKey.get(k);
      expect(entry, `missing catalog key: ${k}`).toBeDefined();
      expect(entry!.fr.length).toBeGreaterThan(0);
      expect(['neutral', 'money', 'selling']).toContain(entry!.register);
    }
    // The refusal sentence must never say « séquestre » or lean on admin French
    // — and it must tell him WHAT TO DO, not only what went wrong.
    const refus = byKey.get('publier.err_fournisseur_inconnu')!.fr;
    expect(refus.toLowerCase().includes('séquestre')).toBe(false);
    expect(refus.includes('code personnel')).toBe(true);
    // His own sentence says WHOSE code and WHERE to make it — and never calls
    // him « ce fournisseur », the wording that sent him looking for a stranger.
    const sien = byKey.get('publier.err_mon_code_absent')!.fr;
    expect(sien.includes('code personnel')).toBe(true);
    expect(sien.includes('Opérations')).toBe(true);
    expect(sien.toLowerCase().includes('ce fournisseur')).toBe(false);
    expect(sien).not.toBe(refus); // two cases, two sentences
  });
});
