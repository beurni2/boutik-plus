import { describe, expect, it } from 'vitest';
import { etatPillule, fondsPillule, fondsVue, pilluleRemboursement, remboursementCarte } from '../src/fonds/view';
import { montantEntier } from '../src/fonds/service';
import type { LivreFonds, ReclamationRow } from '../src/fonds/service';
import { pilluleCommande, raisonBlocage } from '../src/commandes/view';
import type { LivraisonRow, RemboursementOperateur } from '../src/operations/dispatch-service';
import type { PaidOrderRow } from '../src/operations/service';

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
    plusAnciennes: null,
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

describe('montantEntier — a money field refuses, never coerces (verifier r1 BLOCKER)', () => {
  it("the trap itself: Number('') is 0, montantEntier('') is a refusal", () => {
    expect(Number('')).toBe(0); // the coercion the blocker names — real
    expect(montantEntier('')).toBeNull(); // and refused here
    expect(montantEntier('   ')).toBeNull();
  });

  it('digits pass, to the franc; everything else refuses', () => {
    expect(montantEntier('11000')).toBe(11_000);
    expect(montantEntier(' 500 ')).toBe(500);
    expect(montantEntier('0')).toBe(0); // an EXPLICIT zero is a statement, not a slip
    expect(montantEntier('-5')).toBeNull();
    expect(montantEntier('1 000')).toBeNull();
    expect(montantEntier('1000.5')).toBeNull();
    expect(montantEntier('1e3')).toBeNull();
    expect(montantEntier('abc')).toBeNull();
    expect(montantEntier('9007199254740993')).toBeNull(); // beyond safe integers
  });
});

describe('the buyer’s refund beside a seller-fault claim — read, or said unread, never guessed', () => {
  const ligne = (orderId: string, remboursement?: RemboursementOperateur): LivraisonRow =>
    ({ orderId, ...(remboursement !== undefined ? { remboursement } : {}) }) as unknown as LivraisonRow;
  const lu = (rows: readonly LivraisonRow[]) => ({ kind: 'lu' as const, rows: new Map(rows.map((r) => [r.orderId, r] as const)) });

  it('each state that is not a read refund has its own sentence', () => {
    expect(remboursementCarte('ord-1', { kind: 'sans_cle' })).toEqual({ kind: 'phrase', phraseKey: 'fonds.remb_sans_cle' });
    expect(remboursementCarte('ord-1', { kind: 'lecture' })).toEqual({ kind: 'phrase', phraseKey: 'fonds.remb_lecture' });
    expect(remboursementCarte('ord-1', { kind: 'illisible' })).toEqual({ kind: 'phrase', phraseKey: 'fonds.remb_illisible' });
    expect(remboursementCarte('ord-1', lu([ligne('ord-2', { etat: 'fait' })])), 'another order’s refund is never this one’s').toEqual({
      kind: 'phrase',
      phraseKey: 'fonds.remb_introuvable',
    });
    expect(remboursementCarte('ord-1', lu([ligne('ord-1')])), 'Shop+ holds no refund for it').toEqual({ kind: 'phrase', phraseKey: 'fonds.remb_aucun' });
  });

  it('a read refund is the order’s own, in the Commandes tab’s pill words and tone, with its blocked reason', () => {
    const rows = [
      ligne('ord-a', { etat: 'fait' }),
      ligne('ord-b', { etat: 'bloque', raison: 'sans_confirmation' }),
      ligne('ord-c', { etat: 'en_cours' }),
    ];
    expect(remboursementCarte('ord-a', lu(rows))).toEqual({ kind: 'pillule', labelKey: 'commandes.pill_rembourse', ton: 'ok', raisonKey: null });
    expect(remboursementCarte('ord-b', lu(rows))).toEqual({
      kind: 'pillule',
      labelKey: 'commandes.pill_remb_bloque',
      ton: 'alerte',
      raisonKey: 'commandes.remb_bloque_sans_confirmation',
    });
    expect(remboursementCarte('ord-c', lu(rows))).toEqual({ kind: 'pillule', labelKey: 'commandes.pill_remb_en_cours', ton: 'attente', raisonKey: null });
  });

  it('the pill can never drift from the Commandes tab’s: every refund state, both maps', () => {
    const commande = { orderId: 'ord-x' } as unknown as PaidOrderRow;
    const etats: RemboursementOperateur[] = [
      { etat: 'en_cours' },
      { etat: 'fait' },
      { etat: 'rien' },
      { etat: 'bloque', raison: 'refus_illisible' },
      { etat: 'bloque', raison: 'refus_du_prestataire' },
      { etat: 'bloque', raison: 'sans_confirmation' },
    ];
    for (const r of etats) {
      const tab = pilluleCommande(commande, 'incidents', r);
      expect(pilluleRemboursement(r), JSON.stringify(r)).toEqual({ labelKey: tab.label, ton: tab.ton });
      const carte = remboursementCarte('ord-x', lu([ligne('ord-x', r)]));
      expect(carte, JSON.stringify(r)).toEqual({ kind: 'pillule', labelKey: tab.label, ton: tab.ton, raisonKey: raisonBlocage(r) });
    }
  });
});

describe('fondsVue keeps the service’s order inside each group, and the page mark', () => {
  it('open claims first, then the closed ones as read, newest closed first', () => {
    const rows = [
      row({ orderId: 'o-1' }),
      row({ orderId: 'o-2', faute: 'buyer', clienteDabord: false }),
      row({ orderId: 'f-9', etat: 'resolved' }),
      row({ orderId: 'f-8', faute: 'buyer', etat: 'closed_no_payout', clienteDabord: false }),
      row({ orderId: 'f-7', etat: 'closed_no_payout' }),
    ];
    const vue = fondsVue({ kind: 'lecture', lecture: { ok: true, livre: { ...livre(rows), plusAnciennes: 7 } } });
    if (vue.kind !== 'livre') throw new Error(vue.kind);
    expect(vue.groupes.map((g) => g.rows.map((r) => r.orderId))).toEqual([['o-1', 'f-9', 'f-7'], ['o-2', 'f-8']]);
    expect(vue.livre.plusAnciennes).toBe(7);
  });
});
