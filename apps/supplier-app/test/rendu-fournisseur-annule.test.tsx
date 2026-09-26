import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';

/**
 * ═══ RENDU-RÉEL — WHAT THE SUPPLIER SEES WHEN AN ORDER ENDS WITHOUT HIM (REMBOURSABLE-1) ═══
 *
 *   · F-02 — the founder cancelled a paid order (« Annuler et rembourser »):
 *     the supplier's card says Boutik+ did it — never « vous avez refusé » —
 *     and asks nothing of him.
 *   · F-08 — the rider refused the colis at pickup: the card stops saying
 *     « Remis au coursier » and says the colis stays with him, with no return
 *     code to type (the colis never left).
 *
 * ⚠ CONTRACT-CERTIFIED: the rows are `/fulfillment/mine` as
 * `services/offer-service/test/annuler-rembourser.e2e.test.ts` proves them on
 * the real Worker — `fulfillment.refusPar: 'fondateur'` beside `refusedAt`, and
 * `fulfillment.pickupRefusedAt` beside the handover it follows.
 */

const CODE = 'FOURN-ANNULE-1';

const ligne = (orderId: string, productName: string, fulfillment: Record<string, unknown>, colis?: readonly string[]) => ({
  orderId,
  productName,
  productVersionId: `pv-${orderId}`,
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-09-26T07:00:00.000Z',
  zoneTo: '',
  sellerBasePrice: 9_000,
  fulfillment,
  ...(colis !== undefined ? { colis: { packageId: 'pkg-1', orderIds: [...colis] } } : {}),
});

const mine = (orders: unknown[]): Route[] => [
  (path) => (path === '/fulfillment/mine' ? { status: 200, json: { ok: true, orders: orders as never } } : null),
  (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
];

const REMIS = { acceptedAt: '2026-09-26T07:10:00.000Z', readyAt: '2026-09-26T07:30:00.000Z', handedOverAt: '2026-09-26T08:00:00.000Z' };

beforeEach(() => {
  wiredEnv();
  storage({ 'boutik.fournisseur.code': CODE });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('F-02 — an order the founder cancelled', () => {
  it('leaves « Commandes », and the archive says Boutik+ cancelled it — never « vous avez refusé »', async () => {
    wire(mine([ligne('ord-annule', 'Bazin riche', { acceptedAt: '2026-09-26T07:10:00.000Z', refusedAt: '2026-09-26T09:00:00.000Z', refusPar: 'fondateur' })]));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    expect(screen.shows('Bazin riche'), 'a cancelled order still asks for his hands').toBe(false);
    expect(screen.canPress('Accepter la commande')).toBe(false);
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Bazin riche'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts()).toContain('Boutik+ a annulé cette commande. Le client sera remboursé. Ne la préparez pas.');
    expect(screen.shows('Vous avez refusé'), 'his cancel told as the supplier\'s own refusal').toBe(false);
    expect(screen.canPress('Je ne peux pas fournir')).toBe(false);
    screen.unmount();
  });

  it('inside a colis, the cancelled article is named as such while the rest still waits for him', async () => {
    wire(
      mine([
        ligne('c1', 'Pagne wax', { refusedAt: '2026-09-26T09:00:00.000Z', refusPar: 'fondateur' }, ['c1', 'c2']),
        ligne('c2', 'Sac en cuir', {}, ['c1', 'c2']),
      ].map((l) => (Object.keys(l.fulfillment).length === 0 ? { ...l, fulfillment: undefined } : l))),
    );
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    expect(screen.shows('Sac en cuir'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts()).toContain('Annulé par Boutik+. Le client sera remboursé.');
    expect(screen.shows('Refusé par vous'), 'the founder\'s cancel told as his refusal').toBe(false);
    screen.unmount();
  });
});

describe('F-08 — the rider refused the colis at pickup', () => {
  it('leaves « En route » for the archive, says the colis stays with him, and asks for no return code', async () => {
    wire(mine([ligne('ord-ramassage', 'Panier tressé', { ...REMIS, pickupRefusedAt: '2026-09-26T08:05:00.000Z' })]));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('En route');
    await screen.settle();
    expect(screen.shows('Panier tressé'), 'a refused colis still reads as on the road').toBe(false);
    expect(screen.shows('Remis au coursier')).toBe(false);
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Panier tressé'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts()).toContain(
      "Le coursier n'a pas pris le colis. La commande est annulée. Le client sera remboursé. Le colis reste chez vous.",
    );
    expect(screen.shows('est remboursé'), 'a refund claimed done').toBe(false);
    expect(screen.canPress('Vérifier le code de retour'), 'a return code for a colis that never left').toBe(false);
    screen.unmount();
  });

  it('a colis refused whole at pickup is ONE card, in the archive, with the same sentence', async () => {
    wire(
      mine([
        ligne('c1', 'Pagne wax', { ...REMIS, pickupRefusedAt: '2026-09-26T08:05:00.000Z' }, ['c1', 'c2']),
        ligne('c2', 'Sac en cuir', { ...REMIS, pickupRefusedAt: '2026-09-26T08:05:00.000Z' }, ['c1', 'c2']),
      ]),
    );
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Pagne wax'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().filter((t) => t.startsWith("Le coursier n'a pas pris le colis."))).toHaveLength(1);
    expect(screen.canPress('Vérifier le code de retour')).toBe(false);
    screen.unmount();
  });
});
