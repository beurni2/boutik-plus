import { describe, expect, it } from 'vitest';
import { etatPillule, fondsPillule, fondsVue } from '../src/fonds/view';
import type { LivreFonds, ReclamationRow } from '../src/fonds/service';

/**
 * FONDS-CONSOLE-B+ — the pure decision layer, pinned:
 *  · every read state maps to a DESIGNED vue (no state falls through to a lie);
 *  · groups appear in canon fault order and only when non-empty;
 *  · figures PASS THROUGH untouched — this console never recomputes a franc
 *    (Ten Laws #2: the Worker's committed/solvency figures are the truth);
 *  · both pill maps are total.
 */

function row(over: Partial<ReclamationRow>): ReclamationRow {
  return {
    orderId: 'cmd-1',
    faute: 'seller',
    etat: 'opened',
    montantFcfa: 1_000,
    motif: 'x',
    preuve: 'p',
    ouverteLe: '2026-08-06T00:00:00.000Z',
    clienteDabord: true,
    ...over,
  };
}

function livre(reclamations: readonly ReclamationRow[]): LivreFonds {
  return {
    figures: { soldeFcfa: 100_000, declareLe: '2026-08-06', engagesFcfa: 13_000, resteFcfa: 87_000, etatFonds: 'HEALTHY' },
    reclamations,
    nonReconnues: 0,
  };
}

describe('fondsVue — every read state answers with a designed vue', () => {
  it('loading and not_configured map to their own kinds with catalog keys', () => {
    expect(fondsVue({ kind: 'loading' })).toEqual({ kind: 'loading' });
    expect(fondsVue({ kind: 'not_configured' })).toEqual({ kind: 'not_configured', message: 'fonds.non_configure' });
  });

  it('bad_key gets ITS OWN sentence — never a network excuse', () => {
    const vue = fondsVue({ kind: 'lecture', lecture: { ok: false, reason: 'bad_key' } });
    expect(vue).toEqual({ kind: 'bad_key', message: 'fonds.cle_refusee' });
  });

  it('unreachable maps to failed with the retryable sentence', () => {
    const vue = fondsVue({ kind: 'lecture', lecture: { ok: false, reason: 'unreachable' } });
    expect(vue).toEqual({ kind: 'failed', message: 'fonds.injoignable' });
  });

  it('an empty book is the encouraging vide, not a failure', () => {
    const vue = fondsVue({ kind: 'lecture', lecture: { ok: true, livre: livre([]) } });
    expect(vue.kind).toBe('livre');
    if (vue.kind === 'livre') {
      expect(vue.vide).toBe(true);
      expect(vue.groupes).toEqual([]);
    }
  });

  it('groups appear in canon fault order, only when non-empty, rows intact', () => {
    const rows = [
      row({ orderId: 'c-plat', faute: 'platform_system' }),
      row({ orderId: 'c-sell-2', faute: 'seller', etat: 'resolved', reglementRef: 'momo-1' }),
      row({ orderId: 'c-buy', faute: 'buyer', clienteDabord: false }),
      row({ orderId: 'c-sell-1', faute: 'seller' }),
    ];
    const vue = fondsVue({ kind: 'lecture', lecture: { ok: true, livre: livre(rows) } });
    expect(vue.kind).toBe('livre');
    if (vue.kind === 'livre') {
      expect(vue.vide).toBe(false);
      // canon order: seller · buyer · platform — provider/unresolved absent (empty)
      expect(vue.groupes.map((g) => g.faute)).toEqual(['seller', 'buyer', 'platform_system']);
      expect(vue.groupes[0]?.rows.map((r) => r.orderId)).toEqual(['c-sell-2', 'c-sell-1']);
      // figures pass through by REFERENCE — nothing recomputed, nothing copied wrong
      expect(vue.livre.figures.engagesFcfa).toBe(13_000);
      expect(vue.livre.figures.resteFcfa).toBe(87_000);
    }
  });
});

describe('the pill maps are total — no state can render unlabeled', () => {
  it('every claim state has a label key and a tone', () => {
    expect(etatPillule('opened')).toEqual({ labelKey: 'fonds.etat_ouverte', tone: 'attente' });
    expect(etatPillule('under_review')).toEqual({ labelKey: 'fonds.etat_examen', tone: 'attente' });
    expect(etatPillule('resolved')).toEqual({ labelKey: 'fonds.etat_reglee', tone: 'ok' });
    expect(etatPillule('closed_no_payout')).toEqual({ labelKey: 'fonds.etat_classee', tone: 'pause' });
  });

  it('the fund pill: solid, under-tension, and the honest unknown', () => {
    expect(fondsPillule('HEALTHY')).toEqual({ labelKey: 'fonds.solide', tone: 'ok' });
    expect(fondsPillule('CRITICAL')).toEqual({ labelKey: 'fonds.sous_tension', tone: 'attente' });
    expect(fondsPillule(null)).toEqual({ labelKey: 'fonds.a_declarer', tone: 'pause' });
  });
});
