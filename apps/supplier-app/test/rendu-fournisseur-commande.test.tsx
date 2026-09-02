import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';
import { formatF } from '../src/v2/money';

/**
 * ═══ RENDU-RÉEL — THE SUPPLIER'S ORDER CARD, DRIVEN ═══
 *
 * FOUNDER, 2026-09-02, with his screenshot of « Mes commandes »: « on the
 * supplier's console do not show the address of the buyer but only the price
 * the product was listed for ».
 *
 * The card's meta line read « {zoneTo} · Tout est payé · 10 000 FCFA » — the
 * buyer's quartier, in the supplier's hands. The buyer's whereabouts are the
 * same privacy class as her number (GEO-ACHAT-1's law: the pin and the number
 * go to the delivery organiser and nowhere else); the supplier's screen is
 * not on that road. What he needs is what he listed the product for — and
 * `sellerBasePrice` IS that byte (the /mine allowlist carries his base price,
 * never the buyer's total).
 *
 * Written RED before the fix, per the standing order: a screen fact the
 * founder has hit once must never be able to reach him twice. The wire is
 * contract-certified to `readCommandeRow` — every required field present and
 * well-typed, or the reader DROPS the row and this walk would prove nothing
 * over an empty list.
 */

const CODE = 'FOURN-TEST-1';
const ZONE_ACHETEUSE = '1200 Logements';
const PRIX_LISTE = 10_000;

const routes: Route[] = [
  (path) =>
    path === '/fulfillment/mine'
      ? {
          status: 200,
          json: {
            ok: true,
            orders: [
              {
                orderId: 'ord-1',
                productName: 'Bazin',
                productVersionId: 'pv-1',
                offerVersion: 'ov-1',
                paymentMode: 'FULL_PREPAY',
                paidAt: '2026-09-02T07:00:00.000Z',
                zoneTo: ZONE_ACHETEUSE,
                sellerBasePrice: PRIX_LISTE,
              },
            ],
          },
        }
      : null,
  (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
];

beforeEach(() => {
  wiredEnv();
  storage({ 'boutik.fournisseur.code': CODE });
  wire(routes);
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('FOURNISSEUR-PRIX — the order card names the product and its listed price, never where the buyer lives', () => {
  it('« Commandes » shows the card with the listed price and no buyer zone, and its one action is pressable', async () => {
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();

    // 1. the tree survived the tap and the card is there — the product by name.
    expect(screen.shows('Bazin'), `the card did not render. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    // 2. THE PRICE HE LISTED, and the payment fact, on the meta line.
    expect(screen.shows(formatF(PRIX_LISTE)), 'the listed price is not on the card').toBe(true);
    expect(screen.shows('Tout est payé'), 'the payment fact left the card').toBe(true);

    // 3. THE BUYER'S ZONE IS NOWHERE ON HIS SCREEN — not on the meta line, not
    //    anywhere else the tree renders. The founder's order, as a fact of the
    //    rendered tree rather than of a source line.
    expect(
      screen.shows(ZONE_ACHETEUSE),
      `the buyer's zone « ${ZONE_ACHETEUSE} » is on the supplier's screen. On screen: ${JSON.stringify(screen.texts())}`,
    ).toBe(false);

    // 4. …and the card's primary action stands and is pressable — the removal
    //    took nothing else with it.
    expect(screen.canPress('Accepter la commande'), 'the accept action is gone or dead').toBe(true);

    screen.unmount();
  });

  it('CONTROL — the wire really carried the zone, so « not shown » is a screen fact and not an empty fixture', async () => {
    // The row's zone is a required field of the /mine reader; a fixture that
    // dropped it would drop the ROW, and the assertion above would pass over
    // nothing. This mounts the same wire and proves the card is present at
    // all — the negative above is only meaningful beside this positive.
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    expect(screen.shows('Bazin')).toBe(true);
    expect(screen.shows("Aucune commande pour l'instant")).toBe(false);
    screen.unmount();
  });
});
