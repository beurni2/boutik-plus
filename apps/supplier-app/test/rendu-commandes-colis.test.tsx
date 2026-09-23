import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — A COLIS WHOSE SUPPLIER REFUSED ONE ARTICLE (verifier M1) ═══
 *
 * COLIS-FOURNISSEUR-1: « a supplier refusing one article tells Séra it is
 * cancelled so the rest travels ». The founder opens the article that is
 * still coming, on the REAL Commandes tab, and composes its course: the
 * compose must name only what travels, or Séra refuses it and the rest of the
 * bag can never leave his console.
 *
 * ⚠ CONTRACT-CERTIFIED to Séra's `/ops/task` (sera
 * `services/logistics-service/worker/logistics-do.ts`, `lireArticles` over
 * `voyageursDe`): `articles` may name only the package's TRAVELLING orders —
 * a member whose funding fact is `cancelled` is not one — each once, each a
 * short line; any member composes the package. The book rows are the
 * offer-service's `/fulfillment/orders` shape, `fulfillment.refusedAt` as the
 * supplier's refusal writes it; the dispatch rows carry the Shop+ Worker's
 * key set (dispatch.e2e pins it).
 */

const OPS_KEY_SLOT = 'boutik.operateur.cle';
const CLE_C_SLOT = 'boutik.livraisons.cle';
const SERA_SLOT = 'boutik.coursiers.cle';
const COLIS = { packageId: 'pkg-colis-refus', orderIds: ['c1', 'c2'] };

const BASE = {
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  zoneTo: 'Ouagadougou',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-09-23T07:00:01.000Z',
  colis: COLIS,
};
/** Refused by its supplier before « prêt ». */
const C1 = { ...BASE, orderId: 'c1', productVersionId: 'pv-c1', productName: 'Pagne wax', paidAt: '2026-09-23T07:00:00.000Z', fulfillment: { acceptedAt: '2026-09-23T07:10:00.000Z', refusedAt: '2026-09-23T07:20:00.000Z' } };
/** Ready: the rest of the bag. */
const C2 = { ...BASE, orderId: 'c2', productVersionId: 'pv-c2', productName: 'Sac en cuir', paidAt: '2026-09-23T07:00:00.000Z', fulfillment: { acceptedAt: '2026-09-23T07:10:00.000Z', readyAt: '2026-09-23T07:40:00.000Z' } };

const dispatch = (orderId: string, remboursement: unknown, contact: unknown) => ({
  ok: true, exists: true, orderId, state: 'paid', createdAt: '2026-09-23T07:00:00.000Z',
  contact, productVersionId: `pv-${orderId}`, zoneTo: 'Ouagadougou', remboursement,
});

const LIBRE = { riderId: 'r-1', displayName: 'Issa', certified: true, assignable: true, shift: { status: 'on_shift' } };

function routes(): { routes: Route[]; admise: { v: boolean } } {
  const admise = { v: false };
  const voyage = ['c2']; // c1's funding fact is `cancelled` on Séra's book
  return {
    admise,
    routes: [
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [C1, C2] } } : null),
      (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
      (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
      (path) =>
        path === '/checkout/dispatch'
          ? {
              status: 200,
              json: {
                ok: true,
                orders: [
                  dispatch('c1', { etat: 'en_cours' }, null),
                  dispatch('c2', null, { phone: '70 00 00 00', quartier: 'Zogona', repere: "À l'échangeur, portail vert" }),
                ],
              },
            }
          : null,
      (path, _body, query) =>
        path === '/fulfillment/order-evidence' && query.get('orderId') === 'c2'
          ? { status: 200, json: { ok: true, photoRef: { ref: 'media/pret-c2.jpg', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' }, readyAt: C2.fulfillment.readyAt, qty: 1, variant: '' } }
          : null,
      (path) =>
        path === '/ops/board'
          ? {
              status: 200,
              json: {
                ok: true,
                board: {
                  queued: admise.v ? [{ taskId: 't-colis', orderId: 'c2', admittedAt: '2026-09-23T09:00:00.000Z', window: {}, location: {}, colis: { orderIds: voyage } }] : [],
                  riders: [LIBRE],
                  assignments: [],
                },
              },
            }
          : null,
      (path, body) => {
        if (path !== '/ops/task') return null;
        if (typeof body?.['command_id'] !== 'string' || typeof body?.['orderId'] !== 'string' || !COLIS.orderIds.includes(body['orderId'] as string)) {
          return { status: 400, json: { ok: false, reason: 'malformed' } };
        }
        const articles = body['articles'];
        if (articles !== undefined) {
          const ok =
            Array.isArray(articles) &&
            articles.length <= voyage.length &&
            new Set(articles.map((a) => (a as Record<string, unknown>)['orderId'])).size === articles.length &&
            articles.every((a) => {
              const r = a as Record<string, unknown>;
              return voyage.includes(r['orderId'] as string) && typeof r['libelle'] === 'string' && r['libelle'].trim() !== '' && r['libelle'].length <= 80;
            });
          if (!ok) return { status: 400, json: { ok: false, reason: 'articles_malformed' } };
        }
        admise.v = true;
        return { status: 200, json: { ok: true, admitted: true, duplicate: false, taskId: 't-colis' } };
      },
    ],
  };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://logistics.test';
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
  delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
});

describe('COLIS-FOURNISSEUR-1 — the rest of a colis still leaves the founder’s console', () => {
  it('the supplier refused the pagne: the bag’s course names only the sac, Séra admits it, and he reaches the rider choice', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c', [SERA_SLOT]: 'cle-sera' });
    const { routes: r } = routes();
    const fil = wire(r);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    await screen.press('Prêt à livrer');
    await screen.settle();
    expect(screen.shows('Sac en cuir'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press('Sac en cuir · Ouagadougou');
    await screen.settle();
    expect(screen.canPress('Créer la course'), `no compose. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press('Créer la course');
    await screen.settle();

    const sent = fil.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body?.['articles'], 'a refused article named on the compose').toEqual([{ orderId: 'c2', libelle: 'Sac en cuir' }]);
    expect(screen.shows('Choisissez un coursier libre'), `stuck after compose. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Confier à Issa')).toBe(true);
    screen.unmount();
  });
});
