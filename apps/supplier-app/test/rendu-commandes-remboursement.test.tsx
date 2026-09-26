import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — A REFUNDED ORDER ON HIS COMMANDES TAB (REMBOURSEMENT-2) ═══
 *
 * Founder, 2026-09-23: « There is no alert for you when a refund gets stuck or
 * the provider refuses it. » This walk drives the real tab with his two keys
 * and answers, for this road:
 *   · did the tree survive — the board mounts over refund states and the
 *     Incidents chip opens;
 *   · present AND wired — the key-C read is CALLED with his key C, and a
 *     blocked refund is said at the TOP, whatever segment is open;
 *   · the refusing or refunding order never sits in a relay queue (« À
 *     traiter » / « Prêt à livrer »), and its card offers no nudge to prepare
 *     it; an ordinary waiting order keeps its nudge;
 *   · without key C the board still works, and a supplier-refused order still
 *     leaves the relay queues on the book's own word.
 *
 * ⚠ CONTRACT-CERTIFIED: the dispatch rows below carry EXACTLY the key set the
 * Shop+ Worker serves (`shop-plus services/storefront-service/test/
 * dispatch.e2e.test.ts` pins `contact, createdAt, exists, ok, orderId,
 * productVersionId, remboursement, state, zoneTo`), with `remboursement` in
 * the Worker's own words (`order-do.ts` remboursementPourOperateur: null |
 * {etat en_cours|fait|rien} | {etat bloque, raison …}). The book rows are the
 * offer-service's `/fulfillment/orders` shape, `fulfillment.refusedAt` as the
 * supplier's refusal writes it (`fulfillment-do.ts` /refuse).
 */

const OPS_KEY_SLOT = 'boutik.operateur.cle';
const CLE_C_SLOT = 'boutik.livraisons.cle';

const BASE = {
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  zoneTo: 'Gounghin',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-09-23T07:00:01.000Z',
};

/** Refused by its supplier — the book says so; Shop+ is refunding it. */
const REFUSEE = {
  ...BASE,
  orderId: 'ord-refusee',
  productVersionId: 'pv-pagne',
  productName: 'Pagne wax',
  paidAt: '2026-09-23T07:00:00.000Z',
  fulfillment: { acceptedAt: '2026-09-23T07:10:00.000Z', refusedAt: '2026-09-23T07:20:00.000Z' },
};

/** Ready and relayed, then refused home by Séra — its refund is blocked. */
const BLOQUEE = {
  ...BASE,
  orderId: 'ord-bloquee',
  productVersionId: 'pv-sac',
  productName: 'Sac en cuir',
  paidAt: '2026-09-23T06:00:00.000Z',
  fulfillment: { acceptedAt: '2026-09-23T06:10:00.000Z', readyAt: '2026-09-23T06:30:00.000Z' },
};

/** An ordinary paid order, waiting on its supplier. */
const ORDINAIRE = {
  ...BASE,
  orderId: 'ord-ordinaire',
  productVersionId: 'pv-bazin',
  productName: 'Bazin riche',
  paidAt: '2026-09-23T08:00:00.000Z',
};

const ligne = (orderId: string, remboursement: unknown) => ({
  ok: true,
  exists: true,
  orderId,
  state: 'paid',
  createdAt: '2026-09-23T06:00:00.000Z',
  contact: null,
  productVersionId: 'pv',
  zoneTo: 'Gounghin',
  remboursement,
});

const routes: Route[] = [
  (path) =>
    path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [REFUSEE, BLOQUEE, ORDINAIRE] } } : null,
  (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
  (path) =>
    path === '/checkout/dispatch'
      ? {
          status: 200,
          json: {
            ok: true,
            orders: [
              ligne('ord-refusee', { etat: 'en_cours' }),
              ligne('ord-bloquee', { etat: 'bloque', raison: 'refus_du_prestataire' }),
              ligne('ord-ordinaire', null),
            ],
          },
        }
      : null,
];

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('REMBOURSEMENT-2 — refunds on the founder’s Commandes tab', () => {
  it('a blocked refund is said at the top; refunding orders leave the relay queues for Incidents, each saying why', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    const fil = wire(routes);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    // WIRED: the key-C read was called, with HIS key C.
    const lecture = fil.calls.filter((c) => c.path === '/checkout/dispatch');
    expect(lecture.length, 'the refund read was never made').toBeGreaterThan(0);
    expect(lecture[0]!.headers['authorization']).toBe('Bearer cle-c');

    // The alert, at the top of the segment he lands on.
    expect(screen.shows('Un remboursement est bloqué'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // « À traiter » holds the ordinary order only — never the refused one.
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Pagne wax'), 'a refused order still waits to be prepared').toBe(false);
    // « Prêt à livrer » does not offer the blocked one for a relay.
    await screen.press('Prêt à livrer');
    expect(screen.shows('Sac en cuir'), 'a refunding order sits in the relay queue').toBe(false);
    expect(screen.shows('Un remboursement est bloqué')).toBe(true);

    // Incidents: both, each with its own words.
    await screen.press('Incidents');
    expect(screen.shows('Pagne wax')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.shows('Remboursement bloqué')).toBe(true);
    expect(screen.shows('Le service de paiement a refusé de rembourser la cliente. Appelez le service de paiement')).toBe(true);
    expect(screen.shows('Remboursement en cours')).toBe(true);
    expect(screen.texts()).toContain('Le fournisseur a refusé cette commande.');
    // Verifier MAJOR: nothing on the tab may claim a refund Shop+ has not confirmed.
    expect(screen.shows('est remboursé'), 'a refund still en cours is claimed done').toBe(false);
    expect(screen.shows('Cliente remboursée')).toBe(false);

    // The refused card opens (the tree survives) and offers no nudge to prepare it.
    await screen.press('Pagne wax');
    expect(screen.canPress('Retirer cette commande'), 'the card did not open').toBe(true);
    // An ended order waits for no one (verifier MINOR): no « En attente depuis ».
    expect(screen.shows('En attente depuis'), 'an ended order told it is still waiting').toBe(false);
    expect(screen.canPress('Noter : j’ai appelé'), 'a nudge to prepare a refused order').toBe(false);
    screen.unmount();
  });

  it('an ordinary waiting order keeps its nudge (the guard is not a blanket removal)', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire(routes);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Bazin riche');
    expect(screen.canPress('Noter : j’ai appelé')).toBe(true);
    screen.unmount();
  });

  it('without key C the board still works; the book alone still moves a supplier-refused order to Incidents', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    const fil = wire(routes);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    expect(fil.calls.some((c) => c.path === '/checkout/dispatch')).toBe(false);
    expect(screen.shows('Remboursement bloqué')).toBe(false);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Pagne wax')).toBe(false);
    await screen.press('Incidents');
    expect(screen.shows('Pagne wax')).toBe(true);
    expect(screen.shows('Refusée')).toBe(true);
    expect(screen.texts()).toContain('Le fournisseur a refusé cette commande.');
    // Without Shop+'s word, nothing is said about her money at all.
    expect(screen.shows('rembours'), 'a refund claimed with no refund read').toBe(false);
    screen.unmount();
  });
});
