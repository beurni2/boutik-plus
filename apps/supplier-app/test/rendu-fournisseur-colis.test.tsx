import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Wire } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';

/**
 * ═══ RENDU-RÉEL — THE SUPPLIER'S COLIS CARD, DRIVEN (COLIS-FOURNISSEUR-1) ═══
 *
 * Founder ruling 2026-09-23 (« build option 1 »): the articles one buyer paid
 * together from ONE supplier leave in ONE colis — so his screen shows ONE card
 * for them, accepted in one tap, made ready with one photo, handed over on one
 * pickup check. The walk answers the four questions on the real screen: the
 * tree survives each tap; the card's one action is present, pressable and
 * WIRED (the book is called for EVERY article, with his code); a failed act
 * leaves the button there to try again; and the card reaches its next step.
 *
 * ⚠ WHAT THIS WALK CANNOT DRIVE: the photo. Choosing it runs the native
 * picker and the image pipeline, which the doubles refuse on purpose (they
 * make pixels; a fake answer would make the imaging path look proven). The
 * walk stops at « the photo button is there and pressable »; the send that
 * follows is driven by value in `pret-colis.test.ts`.
 *
 * Only `fetch` is faked. The fake book is certified to `readCommandeRow`
 * (every required field present, the colis block well formed — a malformed
 * one DROPS the row) and answers as the real book does: accept is first-wins,
 * the pickup check marks every article of the bag.
 */

const CODE = 'FOURN-COLIS-1';
const PKG = 'pkg-colis-1';

type Marques = { acceptedAt?: string; readyAt?: string; handedOverAt?: string; refusedAt?: string };

interface Livre {
  marques: Record<string, Marques>;
  /** Orders whose accept answers 503 (the network lost it). */
  acceptEnPanne: Set<string>;
}

const ARTICLES = [
  { orderId: 'c1', productName: 'Pagne wax', productVersionId: 'pv-wax', sellerBasePrice: 9_000 },
  { orderId: 'c2', productName: 'Sac en cuir', productVersionId: 'pv-sac', sellerBasePrice: 12_000 },
];

function routes(livre: Livre): Route[] {
  // The lone order was paid later, so the colis card is the first on screen.
  const ligne = (a: (typeof ARTICLES)[number], colis: boolean) => {
    const m = livre.marques[a.orderId] ?? {};
    return {
      ...a,
      offerVersion: 'ov-1',
      paymentMode: 'FULL_PREPAY',
      paidAt: colis ? '2026-09-23T07:00:00.000Z' : '2026-09-23T07:30:00.000Z',
      zoneTo: 'Gounghin',
      ...(Object.keys(m).length > 0 ? { fulfillment: m } : {}),
      ...(colis ? { colis: { packageId: PKG, orderIds: ['c1', 'c2'] } } : {}),
    };
  };
  const seul = { orderId: 's1', productName: 'Beurre de karité', productVersionId: 'pv-karite', sellerBasePrice: 3_000 };
  return [
    (path) =>
      path === '/fulfillment/mine'
        ? { status: 200, json: { ok: true, orders: [...ARTICLES.map((a) => ligne(a, true)), ligne(seul, false)] } }
        : null,
    (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
    (path, body) => {
      if (path !== '/fulfillment/accept') return null;
      const id = String(body?.['orderId']);
      if (livre.acceptEnPanne.has(id)) return { status: 503, json: { ok: false } };
      const m = (livre.marques[id] ??= {});
      const status = m.acceptedAt === undefined ? 'accepted' : 'already_accepted';
      m.acceptedAt ??= '2026-09-23T07:10:00.000Z';
      return { status: 200, json: { ok: true, status, acceptedAt: m.acceptedAt } };
    },
    (path, body) => {
      if (path !== '/fulfillment/refuse') return null;
      const id = String(body?.['orderId']);
      (livre.marques[id] ??= {}).refusedAt = '2026-09-23T07:12:00.000Z';
      return { status: 200, json: { ok: true, status: 'refused', refusedAt: '2026-09-23T07:12:00.000Z' } };
    },
    (path, body) => {
      if (path !== '/fulfillment/ramassage/verify') return null;
      if (body?.['codeRamassage'] !== 'RAM-123') return { status: 200, json: { ok: true, verdict: 'non_confirme' } };
      // The book marks EVERY article of the bag still ready, as the real one does.
      for (const a of ARTICLES) {
        const m = livre.marques[a.orderId];
        if (m?.readyAt !== undefined && m.refusedAt === undefined) m.handedOverAt = '2026-09-23T09:00:00.000Z';
      }
      return { status: 200, json: { ok: true, verdict: 'confirme' } };
    },
  ];
}

const accepts = (fil: Wire) => fil.calls.filter((c) => c.path === '/fulfillment/accept');

beforeEach(() => {
  wiredEnv();
  storage({ 'boutik.fournisseur.code': CODE });
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('COLIS-FOURNISSEUR-1 — one card for one colis', () => {
  it('ONE card holds both articles, ONE tap accepts BOTH with his code, and the card moves on to the photo', async () => {
    const livre: Livre = { marques: {}, acceptEnPanne: new Set() };
    const fil = wire(routes(livre));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();

    expect(screen.shows('Colis · 2 articles'), `no colis card. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Pagne wax')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    // The order alone keeps its own card and its own action.
    expect(screen.shows('Beurre de karité')).toBe(true);
    expect(screen.canPress('Accepter la commande')).toBe(true);
    // A colis is ONE act for him: two cards to handle, not three orders.
    expect(screen.shows('À traiter : 2'), `headline miscounts. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    expect(screen.canPress('Accepter le colis'), 'the colis has no pressable accept').toBe(true);
    await screen.press('Accepter le colis');
    await screen.settle();

    // WIRED: one accept per article, each with his code, in the colis's order.
    expect(accepts(fil).map((c) => c.body?.['orderId'])).toEqual(['c1', 'c2']);
    expect(accepts(fil).every((c) => c.headers['authorization'] === `Bearer ${CODE}`)).toBe(true);
    // The tree survived and the card reached its next step.
    expect(screen.shows('Colis · 2 articles')).toBe(true);
    expect(screen.canPress('Accepter le colis')).toBe(false);
    expect(screen.canPress('Choisir la photo du colis'), `no photo step. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('an accept the network lost SAYS so and leaves the button; the next tap finishes the bag', async () => {
    const livre: Livre = { marques: {}, acceptEnPanne: new Set(['c2']) };
    const fil = wire(routes(livre));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    await screen.press('Accepter le colis');
    await screen.settle();

    expect(screen.shows("L'acceptation n'a pas marché"), `failure not said. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Accepter le colis'), 'no way to try again').toBe(true);

    livre.acceptEnPanne.clear();
    await screen.press('Accepter le colis');
    await screen.settle();
    expect(accepts(fil).map((c) => c.body?.['orderId'])).toEqual(['c1', 'c2', 'c1', 'c2']);
    expect(livre.marques['c2']?.acceptedAt).toBeDefined();
    expect(screen.canPress('Choisir la photo du colis')).toBe(true);
    screen.unmount();
  });

  it('he can refuse ONE article: the book is told for that one only, it stays on the card with its line, the rest still asks for his act', async () => {
    const livre: Livre = { marques: {}, acceptEnPanne: new Set() };
    const fil = wire(routes(livre));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();

    // One « Je ne peux pas fournir » per article of the colis, plus the lone order's.
    await screen.press('Je ne peux pas fournir', 0);
    await screen.settle();
    expect(screen.canPress('Oui, refuser la commande')).toBe(true);
    await screen.press('Oui, refuser la commande');
    await screen.settle();

    const refus = fil.calls.filter((c) => c.path === '/fulfillment/refuse');
    expect(refus.map((c) => c.body?.['orderId'])).toEqual(['c1']);
    expect(screen.shows('Colis · 2 articles')).toBe(true);
    // AUDIT-B+2 F-24 — « sera remboursé »: Boutik+ cannot know the refund
    // happened (it is Shop+'s, confirmed by the provider, and can stall).
    expect(screen.shows('Refusé par vous. Le client sera remboursé.'), `no refused line. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Le client est remboursé')).toBe(false);
    expect(screen.canPress('Accepter le colis')).toBe(true);

    // Accepting now accepts only what is left.
    await screen.press('Accepter le colis');
    await screen.settle();
    expect(accepts(fil).map((c) => c.body?.['orderId'])).toEqual(['c2']);
    expect(screen.canPress('Choisir la photo du colis')).toBe(true);
    screen.unmount();
  });

  it('a READY colis asks for the coursier’s code once; confirmed, the whole bag leaves for « En route »', async () => {
    const pret = { acceptedAt: '2026-09-23T07:10:00.000Z', readyAt: '2026-09-23T08:00:00.000Z' };
    const livre: Livre = { marques: { c1: { ...pret }, c2: { ...pret } }, acceptEnPanne: new Set() };
    const fil = wire(routes(livre));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();

    expect(screen.shows('Prêt, preuve reçue')).toBe(true);
    await screen.type('RAM-123', 'Code du coursier');
    await screen.press('Vérifier le code');
    await screen.settle();

    const verifs = fil.calls.filter((c) => c.path === '/fulfillment/ramassage/verify');
    expect(verifs).toHaveLength(1);
    expect(verifs[0]!.body).toMatchObject({ orderId: 'c1', codeRamassage: 'RAM-123' });
    expect(screen.shows('Code confirmé. Vous pouvez remettre le colis au coursier.')).toBe(true);

    await screen.press('Actualiser la liste');
    await screen.settle();
    expect(screen.shows('Pagne wax'), 'the colis did not leave « Commandes »').toBe(false);
    await screen.press('En route');
    await screen.settle();
    expect(screen.shows('Colis · 2 articles'), `the colis is not en route. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.canPress('Vérifier le code de retour'), 'the return check is missing on the road').toBe(true);
    screen.unmount();
  });
});
