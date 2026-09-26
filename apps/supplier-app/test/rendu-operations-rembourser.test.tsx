import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SOperations } from '../src/operations/screen';
import { SProduitsReal } from '../src/v2/produits-real';
import { initialState } from '../src/v2/machine';

/**
 * ═══ RENDU-RÉEL — THE OPÉRATIONS CONSOLE, FOR REMBOURSABLE-1 ═══
 *
 *   · F-02 — cutting a supplier's access is never blind to his open paid
 *     orders: the row says how many, beside « Couper l'accès ».
 *   · F-33 — erasing a supplier, or deleting a product, while a buyer is paying
 *     for one of his units is refused in words he can act on, and nothing is
 *     taken from the screen.
 *   · F-69 — opening the console with key C reads no buyer's contact at all,
 *     the door is called « Clé Shop+ », and a refused key C still sends him
 *     back to type it again.
 *
 * ⚠ CONTRACT-CERTIFIED to the offer Worker's answers as
 * `services/offer-service/test/annuler-rembourser.e2e.test.ts` proves them:
 * `commandesOuvertes` on each code row, `409 {ok:false, reason:
 * 'paiement_en_cours'}` from the erase, `409 {error: 'unite_reservee'}` from the
 * delete.
 */

const OPS = 'cle-ops';
const OUVERT = 'supplier-ouvert-001';
const COUPE = 'supplier-coupe-002';
const CALME = 'supplier-calme-003';

function console_(codes: Record<string, unknown>[]): Route[] {
  return [
    (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes } } : null),
    (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
    (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  ];
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer.test';
  process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = 'cle-media';
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('F-02 — « Couper l\'accès » is never blind to the buyers still waiting on him', () => {
  it('the rows of suppliers with open paid orders say how many — before the cut and after it; a supplier with none says nothing', async () => {
    storage({ 'boutik.operateur.cle': OPS, 'boutik.photos.cle': 'cle-revoke' });
    wire(
      console_([
        { supplierId: OUVERT, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true, commandesOuvertes: 2 },
        { supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-09-20T15:00:00.000Z', commandesOuvertes: 1 },
        { supplierId: CALME, mintedAt: '2026-08-03T08:00:00.000Z', revelable: true, commandesOuvertes: 0 },
      ]),
    );
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    expect(screen.texts(), `On screen: ${JSON.stringify(screen.texts())}`).toContain(
      '2 commandes payées ne sont pas terminées. Couper l’accès ne les annule pas : voyez-les dans Commandes.',
    );
    expect(screen.texts()).toContain(
      '1 commande payée n’est pas terminée. Couper l’accès ne l’annule pas : voyez-la dans Commandes.',
    );
    expect(screen.texts().filter((t) => t.includes('pas terminée'))).toHaveLength(2);
    // The cut itself stays one reachable tap — the warning informs, it never blocks
    // (a leaked code must always be killable at once).
    expect(screen.canPress('Couper l’accès') || screen.canPress("Couper l'accès")).toBe(true);
    screen.unmount();
  });
});

describe('F-33 — nothing vanishes while a buyer is paying', () => {
  it('the erase is refused by name while a unit is held, and the supplier stays on screen with his way back', async () => {
    storage({ 'boutik.operateur.cle': OPS, 'boutik.photos.cle': 'cle-revoke' });
    const w = wire([
      (path) =>
        path === '/fulfillment/supplier/effacer' ? { status: 409, json: { ok: false, reason: 'paiement_en_cours' } } : null,
      ...console_([{ supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-09-20T15:00:00.000Z', commandesOuvertes: 0 }]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    await screen.press('Supprimer définitivement');
    await screen.press('Oui, tout effacer');
    await screen.settle();
    expect(w.calls.some((c) => c.path === '/fulfillment/supplier/effacer')).toBe(true);
    expect(screen.shows('Une cliente est en train de payer un de ses produits. Réessayez dans un quart d’heure.')).toBe(true);
    // No photograph was destroyed for an erase that did not happen.
    expect(w.calls.some((c) => c.path === '/media/revoke')).toBe(false);
    expect(screen.canPress('Redonner un code')).toBe(true);
    screen.unmount();
  });

  it('a product delete is refused by name while a unit is held: the fiche stays, and he can try again', async () => {
    storage({ 'boutik.operateur.cle': OPS });
    // The inventory row as the product walk's own stand-in answers it.
    const ligne = {
      offerId: 'offer-moi', productVersionId: 'pv-moi', name: 'Bazin du fondateur', category: 'fashion_bags_fabrics',
      basePrice: 10_000, resellerCommission: 1_000, available: 5, assetRefs: [], supplierId: 'supplier-founder-001',
    };
    wire([
      (path) => (path === '/offers/delete' ? { status: 409, json: { error: 'unite_reservee' } } : null),
      (path) => (path === '/offers/inventaire' ? { status: 200, json: { asOf: '2026-09-26T08:00:00.000Z', items: [ligne] } } : null),
      (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
    ]);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId="supplier-founder-001" cache={cache} />,
    );
    await screen.settle();
    await screen.press('Bazin du fondateur');
    await screen.press('Supprimer ce produit');
    await screen.press('Oui, supprimer');
    await screen.settle();
    expect(screen.shows('Une cliente est en train de payer ce produit. Réessayez dans un quart d’heure.'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Vérifiez le réseau'), 'a deliberate refusal blamed on the network').toBe(false);
    expect(screen.shows('Bazin du fondateur')).toBe(true);
    expect(screen.canPress('Supprimer ce produit')).toBe(true);
    screen.unmount();
  });
});

describe('F-69 — opening the console reads no buyer\'s contact', () => {
  const reseller: Route[] = [
    (path) => (path === '/reseller/accounts' ? { status: 200, json: { ok: true, accounts: [] } } : null),
    (path) => (path === '/reseller/suivi' ? { status: 200, json: { ok: true, lignes: [] } } : null),
    (path) => (path === '/reseller/codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
  ];

  it('with key C on the device, Revendeuses opens and not one dispatch page is read', async () => {
    storage({ 'boutik.operateur.cle': OPS, 'boutik.livraisons.cle': 'cle-c' });
    const w = wire([...reseller, ...console_([])]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    await screen.press('Revendeuses');
    await screen.settle();
    expect(w.calls.some((c) => c.path === '/checkout/dispatch'), 'the console pulled every buyer\'s contact').toBe(false);
    expect(screen.canPress('Aider une cliente Shop+'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('without key C the door is « Clé Shop+ »; a key the reseller reads refuse sends him back to type it', async () => {
    storage({ 'boutik.operateur.cle': OPS });
    wire([
      (path, _b, _s, headers) =>
        path.startsWith('/reseller/') && headers['authorization'] === 'Bearer mauvaise-cle' ? { status: 401, json: { error: 'unauthorized' } } : null,
      ...console_([]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    await screen.press('Revendeuses');
    await screen.settle();
    expect(screen.shows('Clé Shop+')).toBe(true);
    expect(screen.shows('Livraisons'), 'the door still says « Livraisons »').toBe(false);
    await screen.type('mauvaise-cle');
    await screen.press('Ouvrir avec la clé Shop+');
    await screen.settle();
    expect(screen.shows("Cette clé n'est pas la bonne. Vérifiez ce que vous avez tapé.")).toBe(true);
    expect(screen.canPress('Ressaisir la clé')).toBe(true);
    screen.unmount();
  });
});
