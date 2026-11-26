import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — « À VÉRIFIER » ON HIS COMMANDES TAB ═══
 *
 * The founder sees what needs checking without asking anyone. This walk drives
 * the real tab over the dispatch page the REAL Shop+ Worker served (captured by
 * its own seam test, `a-verifier.e2e.test.ts`, and never edited by hand) and
 * answers:
 *   · did the tree survive — the tab mounts over six real rows, two of them in
 *     his book and four not yet;
 *   · present AND wired — the key-C rows and the count of refused payment
 *     messages are both CALLED with his key C, and what they say is on screen;
 *   · an order with a blocked refund keeps its refund pill AND gains « À
 *     vérifier » beside it; a clean order gains nothing;
 *   · pressing an order opens its alerts in plain words, with how long ago;
 *   · the orders the book does not hold yet are listed above the segments with
 *     no contact, and open the same way;
 *   · a count that cannot be read is said so, never shown as zero.
 *
 * Only `globalThis.fetch` is faked. The book rows are the offer-service's
 * `/fulfillment/orders` shape; the dispatch page is Shop+'s exact bytes.
 */

const OPS_KEY_SLOT = 'boutik.operateur.cle';
const CLE_C_SLOT = 'boutik.livraisons.cle';

const capture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/a-verifier-lignes.json'), 'utf8'),
) as { roles: Record<string, string>; pages: string[] };
const R = capture.roles as Record<
  'montant_faux' | 'paye_apres_echec' | 'paiement_en_attente' | 'propre' | 'remboursement_bloque' | 'fiche_pleine',
  string
>;
const PAGE = JSON.parse(capture.pages[0]!) as Record<string, unknown>;

const BASE = {
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  zoneTo: 'Gounghin',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-11-26T09:00:01.000Z',
  paidAt: '2026-11-26T09:00:00.000Z',
};
/** In his book, nothing to check. */
const PROPRE = { ...BASE, orderId: R.propre, productVersionId: 'pv-bazin', productName: 'Bazin riche' };
/** In his book, its refund blocked — Shop+ flags it too. */
const BLOQUEE = {
  ...BASE,
  orderId: R.remboursement_bloque,
  productVersionId: 'pv-sac',
  productName: 'Sac en cuir',
  fulfillment: { acceptedAt: '2026-11-26T09:10:00.000Z', readyAt: '2026-11-26T09:20:00.000Z' },
};

const routesAvec = (dlq: Route): Route[] => [
  (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [PROPRE, BLOQUEE] } } : null),
  (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
  (path) => (path === '/checkout/dispatch' ? { status: 200, json: PAGE } : null),
  dlq,
];
/**
 * The harness's call log keeps the path only, so the count door keeps its own:
 * every query it was asked with. It answers ONLY exactly `?compte=1` — any
 * other query (the full book included) gets the 404 the harness then refuses.
 */
const requetesDlq: string[] = [];
const dlqUn: Route = (path, _b, search) => {
  if (path !== '/checkout/dlq') return null;
  requetesDlq.push(search.toString());
  return search.toString() === 'compte=1' ? { status: 200, json: { ok: true, held: 1, dropped: 0, oversize: 0 } } : null;
};
const dlqRefuse: Route = (path) => (path === '/checkout/dlq' ? { status: 401, json: { error: 'unauthorized' } } : null);

beforeEach(() => {
  wiredEnv();
  requetesDlq.length = 0;
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  // Two hours and a quarter after the alerts' fixed time: « il y a 2 heures ».
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-26T11:45:00.000Z'));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('« À vérifier » — what Shop+ flags, on the founder’s Commandes tab', () => {
  it('the head counts five orders and one refused payment message, both read with his key C', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    const fil = wire(routesAvec(dlqUn));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    const lecture = fil.calls.filter((c) => c.path === '/checkout/dispatch');
    expect(lecture.length, 'the key-C rows were never read').toBeGreaterThan(0);
    const compte = fil.calls.filter((c) => c.path === '/checkout/dlq');
    expect(compte.length, 'the refused-messages count was never read').toBe(1);
    expect(compte[0]!.headers['authorization']).toBe('Bearer cle-c');
    // Exactly the count, never the full book.
    expect(requetesDlq).toEqual(['compte=1']);

    // Five of the six real rows carry alerts; the clean one does not.
    expect(screen.texts(), `On screen: ${JSON.stringify(screen.texts())}`).toContain('5 commandes à vérifier');
    expect(screen.texts()).toContain('Un message de paiement refusé à lire');
    screen.unmount();
  });

  it('the blocked order keeps its refund pill and gains « À vérifier »; opening it says why, with how long ago', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire(routesAvec(dlqUn));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    // The clean order, in « À traiter »: no second pill on its card.
    expect(screen.shows('Bazin riche')).toBe(true);
    await screen.press('Incidents');
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.texts()).toContain('Remboursement bloqué');
    // Its card: both pills. Four off-book cards + this one = five « À vérifier ».
    expect(screen.texts().filter((t) => t === 'À vérifier').length).toBe(5);

    await screen.press('Sac en cuir');
    expect(screen.canPress('Retirer cette commande'), 'the card did not open').toBe(true);
    expect(screen.texts()).toContain(
      'Le message de refus de Séra n’a pas pu être lu : le remboursement n’a pas commencé. · il y a 2 heures'.replace(/’/g, "'"),
    );
    screen.unmount();
  });

  it('the orders not yet in his book are listed without contact, and open to their alerts', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire(routesAvec(dlqUn));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    for (const id of [R.montant_faux, R.paye_apres_echec, R.paiement_en_attente, R.fiche_pleine]) {
      expect(screen.texts(), `${id} missing`).toContain(id);
    }
    expect(screen.texts().filter((t) => t === 'Cette commande n\'est pas encore dans le carnet du fournisseur.').length).toBe(4);
    // Never her contact: the captured rows carry none for these, and the cards
    // show no phone shape at all.
    expect(screen.texts().some((t) => /\b\d{2} \d{2} \d{2} \d{2}\b/.test(t))).toBe(false);

    await screen.press(R.montant_faux);
    expect(screen.texts()).toContain('Le montant payé ne correspond pas au prix de la commande. · il y a 2 heures');
    expect(screen.texts()).toContain(
      'Le paiement de la cliente attend toujours la réponse du service de paiement. La commande n\'est pas encore confirmée. · il y a 2 heures',
    );

    // The full record: what the cap could not keep is said, once.
    await screen.press(R.fiche_pleine);
    expect(screen.texts()).toContain('Et 3 autres alertes que la fiche n\'a pas pu garder.');

    await screen.press(R.paye_apres_echec);
    expect(screen.texts()).toContain(
      'Le service de paiement dit que la cliente a payé. Mais la commande était déjà notée comme non payée. · il y a 2 heures',
    );
    screen.unmount();
  });

  it('a count that cannot be read is said so — never shown as zero — and the rest of the tab stands', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    // The line drops on the count alone: fetch rejects, as it does offline.
    wire(routesAvec((path) => {
      if (path === '/checkout/dlq') throw new TypeError('Failed to fetch');
      return null;
    }));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(screen.texts()).toContain(
      'Le nombre de messages de paiement refusés n\'a pas pu être lu. Réessayez plus tard.',
    );
    expect(screen.shows('message de paiement refusé à lire')).toBe(false);
    expect(screen.texts()).toContain('5 commandes à vérifier');
    screen.unmount();
  });

  it('a later reload that finds key C refused takes the count away — a number is shown only when it was read', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    // The first read of the rows answers; every later one is refused (the
    // key was rotated). The reload is the one « Noter : j’ai appelé » makes.
    let lectures = 0;
    const fil = wire([
      (path) => {
        if (path !== '/checkout/dispatch') return null;
        lectures += 1;
        return lectures === 1 ? { status: 200, json: PAGE } : { status: 401, json: { error: 'unauthorized' } };
      },
      (path, body) =>
        path === '/fulfillment/relance' && typeof body?.['orderId'] === 'string' ? { status: 200, json: { ok: true } } : null,
      ...routesAvec(dlqUn),
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(screen.texts()).toContain('Un message de paiement refusé à lire');

    await screen.press('Bazin riche');
    await screen.press('Noter : j’ai appelé');
    await screen.settle();
    expect(lectures, 'the tab was not read again').toBeGreaterThan(1);
    expect(fil.calls.filter((c) => c.path === '/checkout/dlq').length, 'the count was asked again').toBe(1);
    expect(screen.shows('message de paiement refusé à lire'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(false);
    // The tree survived: the book is still there.
    expect(screen.shows('Bazin riche')).toBe(true);
    screen.unmount();
  });

  it('without key C nothing is read from Shop+ and nothing is claimed', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    const fil = wire(routesAvec(dlqRefuse));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(fil.calls.some((c) => c.path === '/checkout/dispatch' || c.path === '/checkout/dlq')).toBe(false);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('à vérifier')).toBe(false);
    expect(screen.shows('À vérifier')).toBe(false);
    screen.unmount();
  });
});
