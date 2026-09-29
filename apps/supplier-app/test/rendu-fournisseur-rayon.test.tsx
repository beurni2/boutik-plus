import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';

/**
 * ═══ RENDU-RÉEL — REFUSED AT THE DOOR, BACK ON SALE WHEN HE CONFIRMS ═══
 *
 * RETOUR-RAYON-1 (AUDIT-B+2 F-36, founder ruling 2026-09-28: « back on sale
 * when supplier confirms it »). Over the REAL screen and the REAL port (only
 * `fetch` and the browser storage faked, the book's answers shaped as the
 * real `/mine` gives them — `retour-rayon.e2e.test.ts` pins those fields on
 * workerd): does a door-refused order reach the card where his return code is
 * asked — even when he never confirmed its pickup · does the card say that
 * the code is what puts the article back on sale · does the button CALL the
 * return door · and does the archive then say where the unit stands, only
 * when something actually goes back.
 */

const CODE = 'FOURN-TEST-1';
const CODE_RETOUR = 'RTR-K7M';
const T = '2026-09-28T08:00:00.000Z';

type Marques = Record<string, string>;
interface Ligne {
  orderId: string;
  productName: string;
  fulfillment: Marques;
  colis?: { packageId: string; orderIds: string[] };
}

/** The book, moved as the Worker moves it: a confirmed return code marks the
 *  return and queues the unit (« en_cours »). The walk itself says when the
 *  book's ladder has put it back (« faite »), as the next read would find it. */
function routes(lignes: Ligne[], opts: { verdict: 'confirme' | 'non_confirme' }): Route[] {
  return [
    (path) => {
      if (path !== '/fulfillment/mine') return null;
      return {
        status: 200,
        json: {
          ok: true,
          orders: lignes.map((l) => ({
            orderId: l.orderId, productName: l.productName, productVersionId: `pv-${l.orderId}`, offerVersion: '1',
            paymentMode: 'FULL_PREPAY', paidAt: T, zoneTo: '', sellerBasePrice: 8_000,
            fulfillment: { ...l.fulfillment },
            ...(l.colis !== undefined ? { colis: l.colis } : {}),
          })),
        },
      };
    },
    (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
    (path, body) => {
      if (path !== '/fulfillment/retour/verify') return null;
      if (opts.verdict === 'confirme') {
        const nomme = lignes.find((l) => l.orderId === body?.['orderId']);
        const sac = nomme?.colis !== undefined ? lignes.filter((l) => nomme.colis!.orderIds.includes(l.orderId)) : nomme !== undefined ? [nomme] : [];
        for (const l of sac) {
          if (l.fulfillment['deliveredAt'] !== undefined && l !== nomme) continue;
          l.fulfillment['returnedAt'] = '2026-09-28T12:00:00.000Z';
          if (l.fulfillment['remiseEnVente'] === 'au_retour') l.fulfillment['remiseEnVente'] = 'en_cours';
        }
      }
      return { status: 200, json: { ok: true, verdict: opts.verdict } };
    },
  ];
}

const AU_RETOUR = 'Tapez son code de retour quand il arrive : l’article sera remis en vente.'.replace('’', "'");
const EN_COURS = "L'article est en train d'être remis en vente.";
const FAITE = "L'article est remis en vente.";

beforeEach(() => {
  wiredEnv();
  storage({ 'boutik.fournisseur.code': CODE });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('RETOUR-RAYON-1 — refused at the door: his return code is what puts it back on sale', () => {
  it('pickup never confirmed, refused at the door → it is « En route » back to him, the card says what the code does → the code CALLS the return door → the archive says « en cours », then « remis en vente »', async () => {
    const lignes: Ligne[] = [{
      orderId: 'ord-porte-1', productName: 'Bazin',
      fulfillment: { acceptedAt: T, readyAt: T, refuseePorteAt: T, remiseEnVente: 'au_retour' },
    }];
    const w = wire(routes(lignes, { verdict: 'confirme' }));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('En route');
    await screen.settle();

    expect(screen.shows('Bazin'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows("Le client l'a refusé à la porte. Le coursier vous le ramène.")).toBe(true);
    expect(screen.shows('Remis au coursier.'), 'a refused colis is coming back, not being delivered').toBe(false);
    expect(screen.shows(AU_RETOUR)).toBe(true);
    // the pickup check is not asked again: the colis already left his hands
    expect(screen.shows('Code de ramassage')).toBe(false);
    expect(screen.canPress('Vérifier le code de retour'), 'the way back to sale must be reachable').toBe(true);

    await screen.type(CODE_RETOUR, 'Code de retour du coursier');
    await screen.press('Vérifier le code de retour');
    await screen.settle();
    const act = w.calls.find((c) => c.path === '/fulfillment/retour/verify');
    expect(act, 'the return door was never called — a dead button').toBeDefined();
    expect(act?.body).toEqual({ orderId: 'ord-porte-1', codeRetour: CODE_RETOUR });
    expect(act?.headers['authorization']).toBe(`Bearer ${CODE}`);
    expect(screen.shows('Code confirmé.')).toBe(true);

    await screen.press('Actualiser la liste');
    await screen.settle();
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Vous avez confirmé le code de retour.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows(EN_COURS)).toBe(true);
    expect(screen.shows(FAITE)).toBe(false);

    lignes[0]!.fulfillment['remiseEnVente'] = 'faite'; // the book's ladder ran
    await screen.press('Actualiser la liste');
    await screen.settle();
    expect(screen.shows(FAITE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows(EN_COURS)).toBe(false);
    screen.unmount();
  });

  it('a refusal that never sends the unit home (the item itself was wrong): the card says it is coming back, and NEVER « remis en vente »', async () => {
    const lignes: Ligne[] = [{
      orderId: 'ord-porte-2', productName: 'Sandales',
      fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, refuseePorteAt: T },
    }];
    wire(routes(lignes, { verdict: 'confirme' }));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('En route');
    await screen.settle();
    expect(screen.shows("Le client l'a refusé à la porte. Le coursier vous le ramène."), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('remis en vente')).toBe(false);
    await screen.type(CODE_RETOUR, 'Code de retour du coursier');
    await screen.press('Vérifier le code de retour');
    await screen.settle();
    await screen.press('Actualiser la liste');
    await screen.settle();
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Vous avez confirmé le code de retour.')).toBe(true);
    expect(screen.shows('remis en vente')).toBe(false);
    screen.unmount();
  });

  it('a colis — one article delivered, one refused at the door: only the refused one says it comes back and, after his code, that it is back on sale', async () => {
    const colis = { packageId: 'col-1', orderIds: ['ord-c-1', 'ord-c-2'] };
    const lignes: Ligne[] = [
      { orderId: 'ord-c-1', productName: 'Pagne', colis, fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, deliveredAt: T } },
      { orderId: 'ord-c-2', productName: 'Sac', colis, fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, refuseePorteAt: T, remiseEnVente: 'au_retour' } },
    ];
    const w = wire(routes(lignes, { verdict: 'confirme' }));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('En route');
    await screen.settle();
    expect(screen.shows('Refusé à la porte. Le coursier le ramène.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().filter((x) => x === AU_RETOUR)).toHaveLength(1);
    await screen.type(CODE_RETOUR, 'Code de retour du coursier');
    await screen.press('Vérifier le code de retour');
    await screen.settle();
    // the act names the article still on the road, never the delivered one
    expect(w.calls.find((c) => c.path === '/fulfillment/retour/verify')?.body).toEqual({ orderId: 'ord-c-2', codeRetour: CODE_RETOUR });
    await screen.press('Livré');
    await screen.settle();
    expect(screen.texts().filter((x) => x === EN_COURS), `on screen: ${JSON.stringify(screen.texts())}`).toHaveLength(1);
    lignes[1]!.fulfillment['remiseEnVente'] = 'faite'; // the book's ladder ran
    await screen.press('Actualiser la liste');
    await screen.settle();
    expect(screen.texts().filter((x) => x === FAITE), `on screen: ${JSON.stringify(screen.texts())}`).toHaveLength(1);
    screen.unmount();
  });
});
