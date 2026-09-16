import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';

/**
 * ═══ RENDU-RÉEL — THE SUPPLIER'S RETURN CHECK, DRIVEN ═══
 *
 * RETOUR-VIVANT-1 (Séra SE6.2, the supplier's half). The buyer refused; the
 * coursier is back at the stall with the sealed colis and says his RETURN
 * code. Over the REAL screen and the REAL port (only `fetch` and the browser
 * storage faked): is the field on the EN ROUTE card and its button pressable ·
 * does the button actually CALL the return door with the typed code · does
 * the verdict name the act · and, once the book carries the return mark, does
 * the row leave « En route » for the archive with its own sentence.
 */

const CODE = 'FOURN-TEST-1';
const CODE_RETOUR = 'RTR-K7M';

interface Livre {
  /** The book's marks for the one order — the walk moves them as Séra's
   *  verdict would (the Worker writes `returnedAt` on `confirme`). */
  fulfillment: Record<string, string>;
  verdict: 'confirme' | 'non_confirme';
}

function routes(livre: Livre): Route[] {
  return [
    (path) =>
      path === '/fulfillment/mine'
        ? {
            status: 200,
            json: {
              ok: true,
              orders: [
                {
                  orderId: 'ord-retour-1',
                  productName: 'Bazin',
                  productVersionId: 'pv-1',
                  offerVersion: 'ov-1',
                  paymentMode: 'FULL_PREPAY',
                  paidAt: '2026-09-17T07:00:00.000Z',
                  zoneTo: 'Gounghin',
                  sellerBasePrice: 8_000,
                  fulfillment: { ...livre.fulfillment },
                },
              ],
            },
          }
        : null,
    (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
    (path) => {
      if (path !== '/fulfillment/retour/verify') return null;
      if (livre.verdict === 'confirme') livre.fulfillment['returnedAt'] = '2026-09-17T12:00:00.000Z';
      return { status: 200, json: { ok: true, verdict: livre.verdict } };
    },
  ];
}

beforeEach(() => {
  wiredEnv();
  storage({ 'boutik.fournisseur.code': CODE });
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('RETOUR-VIVANT — the return check on the « En route » card', () => {
  it('the field and its button are on the en-route card; a typed code CALLS the return door with exactly {orderId, codeRetour}; « confirmé » names the act and the row moves to the archive', async () => {
    const livre: Livre = { fulfillment: { acceptedAt: '2026-09-17T08:00:00.000Z', readyAt: '2026-09-17T09:00:00.000Z', handedOverAt: '2026-09-17T10:00:00.000Z' }, verdict: 'confirme' };
    const w = wire(routes(livre));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('En route');
    await screen.settle();

    // The card is on screen, on the road, with the return check under it.
    expect(screen.shows('Bazin'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Remis au coursier.')).toBe(true);
    expect(screen.shows('Le coursier vous rapporte le colis ?'), 'the return check must sit on the en-route card').toBe(true);
    expect(screen.canPress('Vérifier le code de retour'), 'the verify button is absent or dead').toBe(true);
    // …and the RAMASSAGE check is not here — a colis on the road is not handed over twice.
    expect(screen.shows('Code de ramassage')).toBe(false);

    await screen.type(CODE_RETOUR, 'Code de retour du coursier');
    await screen.press('Vérifier le code de retour');
    await screen.settle();

    // The port was CALLED — the question a source scan cannot answer — with
    // the typed code under ITS OWN field name and his code as the Bearer.
    const act = w.calls.find((c) => c.path === '/fulfillment/retour/verify');
    expect(act, 'the return door was never called — a dead button').toBeDefined();
    expect(act?.body).toEqual({ orderId: 'ord-retour-1', codeRetour: CODE_RETOUR });
    expect(act?.headers['authorization']).toBe(`Bearer ${CODE}`);
    expect(w.calls.some((c) => c.path === '/fulfillment/ramassage/verify')).toBe(false);

    // The verdict names the act, in his words — and STAYS under his eyes: the
    // card is not torn away the instant he typed the code (the coursier still
    // validates on his phone before the colis changes hands).
    expect(screen.shows('Code confirmé.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Bazin')).toBe(true);

    // On his next refresh the book carries the mark: the row left « En route »
    // and sits in the archive with its own sentence.
    await screen.press('Actualiser la liste');
    await screen.settle();
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Colis revenu chez vous.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Livré au client.'), 'a return must never read as a delivery').toBe(false);
    await screen.press('En route');
    await screen.settle();
    expect(screen.shows('Bazin'), 'the returned row must have left « En route »').toBe(false);
    screen.unmount();
  });

  it('a wrong code says « ne reprenez pas » and moves nothing', async () => {
    const livre: Livre = { fulfillment: { acceptedAt: '2026-09-17T08:00:00.000Z', readyAt: '2026-09-17T09:00:00.000Z', handedOverAt: '2026-09-17T10:00:00.000Z' }, verdict: 'non_confirme' };
    const w = wire(routes(livre));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('En route');
    await screen.settle();
    await screen.type('AAA-AAA', 'Code de retour du coursier');
    await screen.press('Vérifier le code de retour');
    await screen.settle();
    expect(screen.shows('Code non confirmé. Ne reprenez pas le colis.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(w.calls.filter((c) => c.path === '/fulfillment/retour/verify')).toHaveLength(1);
    // Still on the road: the card, the field and the button are all still there.
    expect(screen.shows('Bazin')).toBe(true);
    expect(screen.canPress('Vérifier le code de retour')).toBe(true);
    screen.unmount();
  });
});
