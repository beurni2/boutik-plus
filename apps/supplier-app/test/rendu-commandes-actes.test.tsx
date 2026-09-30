import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — « Noter : j'ai appelé » and « Enregistrer la fiche » say
 * when they fail (AUDIT-B+2 F-67) ═══
 *
 * Both acts cleared their busy state and said nothing when the call failed,
 * and a refused key was swallowed: he tapped, nothing changed, and nothing
 * told him why. The four questions, for these two acts: the tree survives a
 * failed tap · each act is pressable and CALLS its door · a failure is SAID
 * and the act stays his to press again · a refused key takes him to the key
 * door, as every other act on this tab does.
 *
 * The book's doors (`offer-service fulfillment-do.ts`): `/fulfillment/relance`
 * answers 200, 401 on a bad key, 404 `unknown_order`; `/fulfillment/supplier-
 * contact` answers 200, 401, 400 on a malformed card. A 503 is the network's.
 */

const OPS_KEY_SLOT = 'boutik.operateur.cle';

const ATTENTE = {
  orderId: 'ord-attente',
  productVersionId: 'pv-bazin',
  productName: 'Bazin riche',
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-09-30T08:00:00.000Z',
  zoneTo: 'Gounghin',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-09-30T08:00:01.000Z',
};

function livre(relance: { status: number; json: Record<string, unknown> }, carte: { status: number; json: Record<string, unknown> }): Route[] {
  return [
    (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [ATTENTE] } } : null),
    (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
    (path, body) => {
      if (path !== '/fulfillment/relance') return null;
      if (typeof body?.['orderId'] !== 'string') return { status: 400, json: { ok: false, reason: 'malformed' } };
      return relance;
    },
    (path, body) => {
      if (path !== '/fulfillment/supplier-contact') return null;
      if (typeof body?.['supplierId'] !== 'string' || typeof body?.['name'] !== 'string') {
        return { status: 400, json: { ok: false, reason: 'malformed' } };
      }
      return carte;
    },
  ];
}

const OK = { status: 200, json: { ok: true } };
const PANNE = { status: 503, json: { error: 'unavailable' } };
const CLE_REFUSEE = { status: 401, json: { error: 'unauthorized' } };

beforeEach(() => {
  wiredEnv();
  storage({ [OPS_KEY_SLOT]: 'cle-ops' });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

async function ouvrir(routes: Route[]) {
  const w = wire(routes);
  const screen = await mountEcran(<SCommandesReel />);
  await screen.settle();
  await screen.press('Bazin riche');
  return { w, screen };
}

describe('F-67 — « Noter : j’ai appelé » says when it failed', () => {
  it('the network fails: the sentence says the call was not noted, and the act stays his', async () => {
    const { w, screen } = await ouvrir(livre(PANNE, OK));
    await screen.press('Noter : j’ai appelé');
    expect(w.calls.filter((c) => c.path === '/fulfillment/relance').length, 'the tap reached the door').toBe(1);
    expect(screen.shows("L'appel n'a pas été noté. Réessayez."), 'the failure must be SAID').toBe(true);
    expect(screen.shows('Appel noté'), 'nothing was noted').toBe(false);
    expect(screen.canPress('Noter : j’ai appelé'), 'the act stays his to press again').toBe(true);
    screen.unmount();
  });

  it('a refused key takes him to the key door — never swallowed', async () => {
    const { screen } = await ouvrir(livre(CLE_REFUSEE, OK));
    await screen.press('Noter : j’ai appelé');
    expect(screen.shows('Votre clé d’opérateur'), 'a refused key must reach the key door').toBe(true);
    screen.unmount();
  });

  it('an order the book no longer knows is said, and the list is read again', async () => {
    const { w, screen } = await ouvrir(livre({ status: 404, json: { ok: false, reason: 'unknown_order' } }, OK));
    const avant = w.calls.filter((c) => c.path === '/fulfillment/orders').length;
    await screen.press('Noter : j’ai appelé');
    expect(screen.shows("Cette commande n'est plus dans le livre."), 'the stale row is named').toBe(true);
    expect(w.calls.filter((c) => c.path === '/fulfillment/orders').length, 'the list is asked again').toBeGreaterThan(avant);
    screen.unmount();
  });

  it('a noted call still says « Appel noté »', async () => {
    const { screen } = await ouvrir(livre(OK, OK));
    await screen.press('Noter : j’ai appelé');
    expect(screen.shows('Appel noté')).toBe(true);
    expect(screen.shows("n'a pas été noté")).toBe(false);
    screen.unmount();
  });
});

describe('F-67 — « Enregistrer la fiche » says when it failed', () => {
  async function remplirEtEnregistrer(screen: Awaited<ReturnType<typeof ouvrir>>['screen']): Promise<void> {
    await screen.type('Awa Couture', 'Nom du fournisseur');
    await screen.type('70 11 22 33', 'Numéro de téléphone');
    await screen.press('Enregistrer la fiche');
  }

  it('the network fails: the sentence says the card was not saved, and the act stays his', async () => {
    const { w, screen } = await ouvrir(livre(OK, PANNE));
    await remplirEtEnregistrer(screen);
    expect(w.calls.filter((c) => c.path === '/fulfillment/supplier-contact').length, 'the tap reached the door').toBe(1);
    expect(screen.shows("La fiche n'a pas été enregistrée. Réessayez."), 'the failure must be SAID').toBe(true);
    expect(screen.canPress('Enregistrer la fiche')).toBe(true);
    screen.unmount();
  });

  it('a refused key takes him to the key door — never swallowed', async () => {
    const { screen } = await ouvrir(livre(OK, CLE_REFUSEE));
    await remplirEtEnregistrer(screen);
    expect(screen.shows('Votre clé d’opérateur')).toBe(true);
    screen.unmount();
  });

  it('a card the book refuses as malformed says what to check', async () => {
    const { screen } = await ouvrir(livre(OK, { status: 400, json: { ok: false, reason: 'malformed' } }));
    await remplirEtEnregistrer(screen);
    expect(screen.shows('Vérifiez le nom et le numéro.')).toBe(true);
    screen.unmount();
  });
});
