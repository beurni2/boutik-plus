import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — A FINISHED ORDER WHOSE CONTACT SHOP+ HOLDS BACK SAYS SO ═══
 *
 * Once her order is over, Shop+ stops handing her phone, map pin and voice
 * note to the dispatch view and marks the row `contactMasque: true`. The
 * founder must read « the order is over, her contact is no longer shown »,
 * never « she left none », which would be untrue.
 *
 * On the real Commandes tab, Terminées: the tree survives, the card opens,
 * the sentence is the held-back one, no phone and no « Écouter » appear.
 *
 * Native boundaries doubled, nothing of the app: `globalThis.fetch` (the
 * harness's wire, which checks every Shop+ answer against the recorded
 * forms) and `localStorage`. ITS BOUND: it claims nothing about appearance.
 */

const OPS_KEY_SLOT = 'boutik.operateur.cle';
const CLE_C_SLOT = 'boutik.livraisons.cle';

const LIVREE = {
  orderId: 'ord-finie',
  productVersionId: 'pv-finie',
  productName: 'Pagne tissé',
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-11-27T07:00:00.000Z',
  zoneTo: 'Gounghin',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-11-27T07:00:01.000Z',
  fulfillment: {
    acceptedAt: '2026-11-27T07:10:00.000Z',
    readyAt: '2026-11-27T07:40:00.000Z',
    handedOverAt: '2026-11-27T08:00:00.000Z',
    deliveredAt: '2026-11-27T09:00:00.000Z',
  },
};

const ligne = {
  ok: true,
  exists: true,
  orderId: 'ord-finie',
  // Shop+ has no « delivered » order state: a delivered order's row still reads « confirmed ».
  state: 'confirmed',
  createdAt: '2026-11-27T07:00:00.000Z',
  contact: null,
  productVersionId: 'pv-finie',
  zoneTo: 'Gounghin',
  remboursement: null,
  aVerifier: null,
  contactMasque: true,
};

/** Refused at her door and brought back: it lands in Incidents. */
const REVENUE = {
  ...LIVREE,
  orderId: 'ord-revenue',
  productVersionId: 'pv-revenue',
  productName: 'Robe brodée',
  fulfillment: {
    acceptedAt: '2026-11-27T07:10:00.000Z',
    readyAt: '2026-11-27T07:40:00.000Z',
    handedOverAt: '2026-11-27T08:00:00.000Z',
    returnedAt: '2026-11-27T11:00:00.000Z',
  },
};
const ligneRevenue = { ...ligne, orderId: 'ord-revenue', state: 'confirmed', productVersionId: 'pv-revenue', remboursement: { etat: 'rien' } };

const routes: Route[] = [
  (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [LIVREE, REVENUE] } } : null),
  (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
  (path) => (path === '/checkout/dlq' ? { status: 200, json: { ok: true, held: 0, dropped: 0, oversize: 0 } } : null),
  (path) => (path === '/checkout/dispatch' ? { status: 200, json: { ok: true, orders: [ligne, ligneRevenue] } } : null),
  (path) => (path === '/fulfillment/order-evidence' ? { status: 404, json: { ok: false, reason: 'not_ready' } } : null),
];

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('a finished order whose contact Shop+ holds back', () => {
  it('says the order is over and her contact is no longer shown; never « she left none », no phone, no « Écouter »', async () => {
    wire(routes);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Terminées');
    await screen.press('Pagne tissé');
    await screen.settle();
    expect(screen.shows('Commande terminée : son contact n’est plus affiché.'), JSON.stringify(screen.texts())).toBe(true);
    expect(screen.shows('La cliente n’a pas laissé de contact.')).toBe(false);
    expect(screen.canPress('Écouter le repère (sa voix)')).toBe(false);
    expect(screen.texts().some((x) => /\d\d \d\d \d\d \d\d/.test(x))).toBe(false);
    screen.unmount();
  });

  it('« Signaler » stays on a returned order whose contact is held back: Shop+ finds her number itself', async () => {
    wire(routes);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Incidents');
    await screen.press('Robe brodée');
    await screen.settle();
    expect(screen.canPress('Signaler'), JSON.stringify(screen.texts())).toBe(true);
    await screen.press('Signaler');
    expect(screen.canPress("Elle a changé d'avis"), 'the reasons open: the act is wired').toBe(true);
    screen.unmount();
  });
});
