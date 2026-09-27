import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — THE 2-HOUR ANSWER CLOCK, AS EACH PERSON SEES IT (DELAI-ACCEPTATION-1) ═══
 *
 *   · The supplier: an order waiting for his answer says until when he may
 *     answer and what happens after — before it happens; accepting it takes
 *     the line away. An order the clock cancelled says HE did not answer —
 *     never « Boutik+ a annulé », never « vous avez refusé » — and asks
 *     nothing of him.
 *   · The founder: the cancelled order sits in Incidents, said as the clock's
 *     act — never « Vous avez annulé ».
 *
 * ⚠ CONTRACT-CERTIFIED: the rows are `/fulfillment/mine` and
 * `/fulfillment/orders` as `services/offer-service/test/delai-acceptation.e2e.test.ts`
 * proves them on the real Worker — `repondreAvant` on an unanswered order,
 * `fulfillment.refusPar: 'delai'` beside `refusedAt` once cancelled.
 */

const CODE = 'FOURN-DELAI-1';

const ligne = (orderId: string, productName: string, extra: Record<string, unknown>, colis?: readonly string[]) => ({
  orderId,
  productName,
  productVersionId: `pv-${orderId}`,
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-09-27T07:00:00.000Z',
  zoneTo: '',
  sellerBasePrice: 9_000,
  ...extra,
  ...(colis !== undefined ? { colis: { packageId: 'pkg-1', orderIds: [...colis] } } : {}),
});

const offres: Route = (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null);

beforeEach(() => {
  wiredEnv();
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('DELAI-ACCEPTATION-1 — the supplier is told the deadline before it passes', () => {
  it('an order waiting for him says « Répondez avant 09:00 »; « Accepter » is there and pressable; once accepted, the line is gone', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    let acceptee = false;
    const fil = wire([
      (path) =>
        path === '/fulfillment/mine'
          ? {
              status: 200,
              json: {
                ok: true,
                orders: [
                  acceptee
                    ? ligne('ord-1', 'Bazin riche', { fulfillment: { acceptedAt: '2026-09-27T07:20:00.000Z' } })
                    : ligne('ord-1', 'Bazin riche', { repondreAvant: '2026-09-27T09:00:00.000Z' }),
                ] as never,
              },
            }
          : null,
      (path) =>
        path === '/fulfillment/accept'
          ? ((acceptee = true), { status: 200, json: { ok: true, status: 'accepted', acceptedAt: '2026-09-27T07:20:00.000Z' } })
          : null,
      offres,
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    expect(screen.texts(), `On screen: ${JSON.stringify(screen.texts())}`).toContain(
      'Répondez avant 09:00. Sinon, la commande sera annulée et le client remboursé.',
    );
    expect(screen.canPress('Accepter la commande')).toBe(true);
    await screen.press('Accepter la commande');
    await screen.settle();
    expect(fil.calls.filter((c) => c.path === '/fulfillment/accept')).toHaveLength(1);
    expect(screen.shows('Répondez avant'), 'the deadline still shown on an order he answered').toBe(false);
    screen.unmount();
  });

  it('a colis waiting for him says its EARLIEST deadline, once', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire([
      (path) =>
        path === '/fulfillment/mine'
          ? {
              status: 200,
              json: {
                ok: true,
                orders: [
                  ligne('c1', 'Pagne wax', { repondreAvant: '2026-09-27T10:30:00.000Z' }, ['c1', 'c2']),
                  ligne('c2', 'Sac en cuir', { repondreAvant: '2026-09-27T09:15:00.000Z' }, ['c1', 'c2']),
                ] as never,
              },
            }
          : null,
      offres,
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    const lignes = screen.texts().filter((t) => t.startsWith('Répondez avant'));
    expect(lignes, `On screen: ${JSON.stringify(screen.texts())}`).toEqual([
      'Répondez avant 09:15. Sinon, la commande sera annulée et le client remboursé.',
    ]);
    screen.unmount();
  });
});

describe('DELAI-ACCEPTATION-1 — an order the clock cancelled, on his page', () => {
  it('leaves « Commandes »; the archive says HE did not answer in 2 hours — never « Boutik+ a annulé », never « vous avez refusé »', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire([
      (path) =>
        path === '/fulfillment/mine'
          ? { status: 200, json: { ok: true, orders: [ligne('ord-2', 'Robe brodée', { fulfillment: { refusedAt: '2026-09-27T09:00:05.000Z', refusPar: 'delai' } })] as never } }
          : null,
      offres,
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    expect(screen.shows('Robe brodée'), 'a cancelled order still asks for his hands').toBe(false);
    expect(screen.canPress('Accepter la commande')).toBe(false);
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Robe brodée'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts()).toContain(
      "Vous n'avez pas répondu dans les 2 heures. La commande est annulée et le client sera remboursé. Ne la préparez pas.",
    );
    expect(screen.shows('Boutik+ a annulé'), 'the clock told as the founder\'s act').toBe(false);
    expect(screen.shows('Vous avez refusé'), 'the clock told as his own refusal').toBe(false);
    expect(screen.canPress('Je ne peux pas fournir')).toBe(false);
    screen.unmount();
  });

  it('inside a colis, the article the clock cancelled is named as such while the rest still waits for him', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire([
      (path) =>
        path === '/fulfillment/mine'
          ? {
              status: 200,
              json: {
                ok: true,
                orders: [
                  ligne('c1', 'Pagne wax', { fulfillment: { refusedAt: '2026-09-27T09:00:05.000Z', refusPar: 'delai' } }, ['c1', 'c2']),
                  ligne('c2', 'Sac en cuir', { repondreAvant: '2026-09-27T11:00:00.000Z' }, ['c1', 'c2']),
                ] as never,
              },
            }
          : null,
      offres,
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    expect(screen.shows('Sac en cuir'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts()).toContain('Annulé : pas de réponse dans les 2 heures. Le client sera remboursé.');
    expect(screen.shows('Annulé par Boutik+'), 'the clock told as the founder\'s act').toBe(false);
    screen.unmount();
  });
});

describe('DELAI-ACCEPTATION-1 — the founder\'s Commandes says it was the clock', () => {
  it('the cancelled order is in Incidents with « Annulée » and the clock\'s sentence — never « Vous avez annulé »', async () => {
    process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
    storage({ 'boutik.operateur.cle': 'cle-ops' });
    wire([
      (path) =>
        path === '/fulfillment/orders'
          ? {
              status: 200,
              json: {
                ok: true,
                orders: [{
                  orderId: 'ord-3', productVersionId: 'pv-ord-3', productName: 'Chaussures', productPhotoRef: '', offerVersion: 'ov-1',
                  paymentMode: 'FULL_PREPAY', paidAt: '2026-09-27T07:00:00.000Z', zoneTo: 'Gounghin', sellerBasePrice: 9_000,
                  supplierId: 'sup-1', supplierResolved: true, registeredAt: '2026-09-27T07:00:01.000Z',
                  fulfillment: { refusedAt: '2026-09-27T09:00:05.000Z', refusPar: 'delai' },
                }] as never,
              },
            }
          : null,
      (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Incidents');
    expect(screen.shows('Chaussures'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Annulée')).toBe(true);
    expect(screen.texts()).toContain(
      "Annulée automatiquement : le fournisseur n'a pas répondu dans les 2 heures. La cliente sera remboursée.",
    );
    expect(screen.shows('Vous avez annulé'), 'the clock told as his own act').toBe(false);
    expect(screen.shows('Le fournisseur a refusé'), 'the clock told as the supplier\'s refusal').toBe(false);
    screen.unmount();
  });
});
