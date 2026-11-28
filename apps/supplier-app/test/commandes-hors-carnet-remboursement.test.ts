import { describe, expect, it } from 'vitest';
import { pilluleCommande, pilluleRemboursement } from '../src/commandes/view';
import type { RemboursementOperateur } from '../src/operations/dispatch-service';
import type { PaidOrderRow } from '../src/operations/service';

/**
 * The refund pill on a card the supplier's book does not hold (« À vérifier »,
 * above the segments): Shop+'s refund state in one word, the SAME word the
 * book's own card says for that state — so the founder never reads two names
 * for one refund. Shop+ gives a state and never a franc; nothing here has one.
 */

/** A paid row as the offer-service's book serves it — only to ask the book's card. */
const LIGNE: PaidOrderRow = {
  orderId: 'ord-1',
  productVersionId: 'pv-1',
  productName: 'Bazin riche',
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-11-26T09:00:00.000Z',
  zoneTo: 'Gounghin',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-11-26T09:00:01.000Z',
};

const ETATS: readonly [RemboursementOperateur, { label: string; ton: 'attente' | 'ok' | 'alerte' }][] = [
  [{ etat: 'en_cours' }, { label: 'commandes.pill_remb_en_cours', ton: 'attente' }],
  [{ etat: 'fait' }, { label: 'commandes.pill_rembourse', ton: 'ok' }],
  [{ etat: 'rien' }, { label: 'commandes.pill_rien_a_rembourser', ton: 'ok' }],
  [{ etat: 'bloque', raison: 'sans_confirmation' }, { label: 'commandes.pill_remb_bloque', ton: 'alerte' }],
  [{ etat: 'bloque', raison: 'refus_du_prestataire' }, { label: 'commandes.pill_remb_bloque', ton: 'alerte' }],
  [{ etat: 'bloque', raison: 'refus_illisible' }, { label: 'commandes.pill_remb_bloque', ton: 'alerte' }],
];

describe('the refund pill of an order not in the book', () => {
  it('says each refund state Shop+ gives in its one word, and nothing when there is no refund', () => {
    for (const [r, attendu] of ETATS) {
      expect(pilluleRemboursement(r), JSON.stringify(r)).toEqual(attendu);
    }
    expect(pilluleRemboursement(undefined)).toBeNull();
  });

  it('says the same word and tone as the book’s own card for every state', () => {
    for (const [r, attendu] of ETATS) {
      expect(pilluleCommande(LIGNE, 'incidents', r), JSON.stringify(r)).toEqual(attendu);
      expect(pilluleRemboursement(r), JSON.stringify(r)).toEqual(pilluleCommande(LIGNE, 'incidents', r));
    }
  });
});
