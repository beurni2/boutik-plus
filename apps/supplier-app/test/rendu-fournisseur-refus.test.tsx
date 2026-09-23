import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Wire } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';

/**
 * ═══ RENDU-RÉEL — « JE NE PEUX PAS FOURNIR », DRIVEN (REMBOURSEMENT-2) ═══
 *
 * The supplier refuses a paid order he cannot supply (B6.1 « Accept/reject »).
 * The walk answers the four questions on the real screen: the tree survives
 * each tap; the refusal is present, asks once, and is WIRED — the book is
 * called with his code and this order; nothing happens without the second
 * tap; and after it the card leaves « Commandes » for the archive, where it
 * says what happened. A colis already readied is answered honestly. Only
 * `fetch` is faked; the wire is certified to `readCommandeRow` (every
 * required field present) and to the book's own answers.
 */

const CODE = 'FOURN-REFUS-1';
const ORDRE = 'ord-refus-1';

function routes(etat: { refusee: boolean; reponse: { status: number; json: Record<string, unknown> } }): Route[] {
  return [
    (path) =>
      path === '/fulfillment/mine'
        ? {
            status: 200,
            json: {
              ok: true,
              orders: [
                {
                  orderId: ORDRE,
                  productName: 'Pagne wax',
                  productVersionId: 'pv-1',
                  offerVersion: 'ov-1',
                  paymentMode: 'FULL_PREPAY',
                  paidAt: '2026-09-23T07:00:00.000Z',
                  zoneTo: 'Gounghin',
                  sellerBasePrice: 9_000,
                  ...(etat.refusee ? { fulfillment: { refusedAt: '2026-09-23T08:00:00.000Z' } } : {}),
                },
              ],
            },
          }
        : null,
    (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
    (path) => {
      if (path !== '/fulfillment/refuse') return null;
      if (etat.reponse.status === 200) etat.refusee = true;
      return etat.reponse;
    },
  ];
}

let fil: Wire;

beforeEach(() => {
  wiredEnv();
  storage({ 'boutik.fournisseur.code': CODE });
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('REMBOURSEMENT-2 — the supplier refuses a paid order he cannot supply', () => {
  it('asks once, then refuses with HIS code for THIS order; the card leaves « Commandes » and the archive says so', async () => {
    const etat = { refusee: false, reponse: { status: 200, json: { ok: true, status: 'refused', refusedAt: '2026-09-23T08:00:00.000Z' } } };
    fil = wire(routes(etat));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    expect(screen.shows('Pagne wax'), `no card. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // The primary action is still the primary; the refusal whispers beside it.
    expect(screen.canPress('Accepter la commande')).toBe(true);
    expect(screen.canPress('Je ne peux pas fournir'), 'the refusal is missing or dead').toBe(true);

    // First tap: it only asks. Nothing is sent.
    await screen.press('Je ne peux pas fournir');
    expect(screen.shows('Le client sera remboursé'), 'the refusal did not ask first').toBe(true);
    expect(fil.calls.filter((c) => c.path === '/fulfillment/refuse')).toHaveLength(0);
    // « Non » keeps the order, still nothing sent.
    await screen.press('Non, je garde la commande');
    expect(screen.canPress('Accepter la commande')).toBe(true);
    expect(fil.calls.filter((c) => c.path === '/fulfillment/refuse')).toHaveLength(0);

    // Second time, confirmed: the act is WIRED — his code, this order.
    await screen.press('Je ne peux pas fournir');
    await screen.press('Oui, refuser la commande');
    await screen.settle();
    const envoi = fil.calls.filter((c) => c.path === '/fulfillment/refuse');
    expect(envoi).toHaveLength(1);
    expect(envoi[0]!.method).toBe('POST');
    expect(envoi[0]!.body).toEqual({ orderId: ORDRE });
    expect(envoi[0]!.headers['authorization']).toBe(`Bearer ${CODE}`);

    // The book was re-read: nothing left to do on « Commandes »…
    expect(screen.canPress('Accepter la commande'), 'the refused order still asks to be accepted').toBe(false);
    expect(screen.shows('Rien à préparer')).toBe(true);
    // …and the archive tells him what he did.
    await screen.press('Livré');
    await screen.settle();
    expect(screen.shows('Vous avez refusé cette commande'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Je ne peux pas fournir')).toBe(false);
    screen.unmount();
  });

  it('a colis already readied is told honestly — never a refusal pretended', async () => {
    const etat = { refusee: false, reponse: { status: 409, json: { ok: false, reason: 'already_ready' } } };
    fil = wire(routes(etat));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    await screen.press('Je ne peux pas fournir');
    await screen.press('Oui, refuser la commande');
    await screen.settle();
    expect(screen.shows('Le colis est déjà prêt'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Vous avez refusé')).toBe(false);
    screen.unmount();
  });

  it('a refusal the network lost says so, and he can try again', async () => {
    const etat = { refusee: false, reponse: { status: 503, json: { ok: false } } };
    fil = wire(routes(etat));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.settle();
    await screen.press('Je ne peux pas fournir');
    await screen.press('Oui, refuser la commande');
    await screen.settle();
    expect(screen.shows("Le refus n'a pas marché")).toBe(true);
    expect(screen.canPress('Je ne peux pas fournir'), 'no way to try again').toBe(true);
    screen.unmount();
  });
});
