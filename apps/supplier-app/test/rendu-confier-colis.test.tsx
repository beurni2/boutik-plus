import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { ConfierCoursier } from '../src/commandes/confier';
import type { PaidOrderRow } from '../src/operations/service';
import type { LivraisonRow } from '../src/operations/dispatch-service';

/**
 * ═══ RENDU-RÉEL — ONE COURSE FOR ONE COLIS, ON THE FOUNDER'S CONSOLE ═══
 *
 * Founder ruling 2026-09-23 (« build option 1 », decision a): a colis is ONE
 * course — one rider, one stop. Whichever article of it he opens on
 * « Prêt à livrer », « Créer la course » composes the SAME course: under the
 * colis's first order, one command id for the bag, the articles named for
 * the rider's door (decision c). Once it is on Séra's board, every article
 * of the colis reads that one task — so no screen offers a second compose,
 * and he reaches « Choisissez un coursier » from either article.
 *
 * ⚠ CONTRACT-CERTIFIED to Séra's `/ops/board` and `/ops/task` (sera
 * `services/logistics-service/worker/logistics-do.ts`): a queued package
 * carries `colis: {orderIds}` (board()), a malformed compose is refused 400
 * as the door does, and `articles` must name orders of the package, each
 * once, each a short line (lireArticles) — the double refuses the same.
 */

const CLE_SLOT = 'boutik.coursiers.cle';
const COLIS = { packageId: 'pkg-colis-1', orderIds: ['c1', 'c2'] };

const ligne = (orderId: string, productName: string): PaidOrderRow => ({
  orderId,
  productVersionId: `pv-${orderId}`,
  productName,
  productPhotoRef: '',
  offerVersion: 'v1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-09-23T07:00:00.000Z',
  zoneTo: 'Ouagadougou',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-09-23T07:00:01.000Z',
  colis: COLIS,
});

const ARTICLES = [
  { orderId: 'c1', libelle: 'Pagne wax' },
  { orderId: 'c2', libelle: 'Sac en cuir' },
];

const BUYER: LivraisonRow = {
  orderId: 'c2',
  state: 'paid',
  createdAt: '2026-09-23T07:00:00.000Z',
  contact: { phone: '70 00 00 00', quartier: 'Zogona', repere: "À l'échangeur, portail vert" },
  productVersionId: 'pv-c2',
  zoneTo: 'Ouagadougou',
};

const LIBRE = { riderId: 'r-1', displayName: 'Issa', certified: true, assignable: true, shift: { status: 'on_shift' } };

/** Séra's book, as the door keeps it: nothing queued until the compose admits
 *  the colis under its first order; then the board shows ONE queued task
 *  naming both articles. */
function seraColis(): { routes: Route[]; etat: { admise: boolean } } {
  const etat = { admise: false };
  const tableau: Route = (path) =>
    path === '/ops/board'
      ? {
          status: 200,
          json: {
            ok: true,
            board: {
              queued: etat.admise
                ? [{ taskId: 't-colis', orderId: 'c1', admittedAt: '2026-09-23T09:00:00.000Z', window: {}, location: {}, colis: { orderIds: ['c1', 'c2'] } }]
                : [],
              riders: [LIBRE],
              assignments: [],
            },
          },
        }
      : null;
  const compose: Route = (path, body) => {
    if (path !== '/ops/task') return null;
    const loc = body?.['location'] as Record<string, unknown> | undefined;
    const win = body?.['window'] as Record<string, unknown> | undefined;
    if (typeof body?.['command_id'] !== 'string' || typeof body?.['orderId'] !== 'string' || loc === undefined || win === undefined) {
      return { status: 400, json: { ok: false, reason: 'malformed' } };
    }
    // lireArticles: only orders of the package, each once, each a short line.
    const articles = body['articles'];
    if (articles !== undefined) {
      const ok =
        Array.isArray(articles) &&
        articles.length <= COLIS.orderIds.length &&
        new Set(articles.map((a) => (a as Record<string, unknown>)['orderId'])).size === articles.length &&
        articles.every((a) => {
          const r = a as Record<string, unknown>;
          return COLIS.orderIds.includes(r['orderId'] as string) && typeof r['libelle'] === 'string' && r['libelle'].trim() !== '' && r['libelle'].length <= 80;
        });
      if (!ok) return { status: 400, json: { ok: false, reason: 'articles_malformed' } };
    }
    // The package's task is named by its first order (`colis_tete_attendue`).
    if (body['orderId'] !== 'c1') return { status: 422, json: { ok: false, admitted: false, reason: 'colis_tete_attendue' } };
    etat.admise = true;
    return { status: 200, json: { ok: true, admitted: true, duplicate: false, taskId: 't-colis' } };
  };
  return { routes: [tableau, compose], etat };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://logistics.test';
  storage({ [CLE_SLOT]: 'cle-ops-test' });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('COLIS-FOURNISSEUR-1 — « Créer la course » for a colis', () => {
  it('opened on the SECOND article, it composes the colis under its FIRST order with both names, and he reaches the rider choice', async () => {
    const { routes } = seraColis();
    const w = wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ligne('c2', 'Sac en cuir')} buyer={BUYER} articles={ARTICLES} />);
    await screen.settle();

    expect(screen.canPress('Créer la course'), `no compose. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press('Créer la course');
    await screen.settle();

    const sent = w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body?.['orderId'], 'the colis must be composed under its first order').toBe('c1');
    expect(sent[0]!.body?.['command_id']).toBe('cmd-boutik-tache-c1');
    expect(sent[0]!.body?.['articles']).toEqual(ARTICLES);
    expect(sent[0]!.headers['authorization']).toBe('Bearer cle-ops-test');

    // The next step, reached from the article the task is NOT named after.
    expect(screen.shows('Choisissez un coursier libre'), `stuck after compose. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Confier à Issa')).toBe(true);
    expect(screen.canPress('Créer la course'), 'a second compose offered for the same colis').toBe(false);
    screen.unmount();
  });

  it('once the colis is on the board, EITHER article opens straight on the rider choice — no second course is offered', async () => {
    const { routes, etat } = seraColis();
    etat.admise = true;
    const w = wire(routes);
    for (const [id, nom] of [['c1', 'Pagne wax'], ['c2', 'Sac en cuir']] as const) {
      const screen = await mountEcran(<ConfierCoursier row={ligne(id, nom)} buyer={{ ...BUYER, orderId: id }} articles={ARTICLES} />);
      await screen.settle();
      expect(screen.shows('Choisissez un coursier libre'), `${id}: ${JSON.stringify(screen.texts())}`).toBe(true);
      expect(screen.canPress('Créer la course')).toBe(false);
      screen.unmount();
    }
    expect(w.calls.filter((c) => c.path === '/ops/task')).toHaveLength(0);
  });
});
