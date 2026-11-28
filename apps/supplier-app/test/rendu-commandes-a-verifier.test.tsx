import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — « À VÉRIFIER » ON HIS COMMANDES TAB ═══
 *
 * The founder sees what needs checking without asking anyone. This walk drives
 * the real tab over the dispatch page the REAL Shop+ Worker served (captured by
 * its own seam test, `a-verifier.e2e.test.ts`, and never edited by hand) and
 * answers:
 *   · did the tree survive — the tab mounts over nine real rows, two of them in
 *     his book and seven not yet;
 *   · present AND wired — the key-C rows and the count of refused payment
 *     messages are both CALLED with his key C, and what they say is on screen;
 *   · an order with a blocked refund keeps its refund pill AND gains « À
 *     vérifier » beside it; a clean order gains nothing;
 *   · pressing an order opens its alerts in plain words, with how long ago;
 *   · the orders the book does not hold yet are listed above the segments with
 *     no contact, and open the same way;
 *   · one of them, whose payment had failed after the provider took the money,
 *     shows its refund as Shop+ gives it beside « À vérifier », until the
 *     provider confirms it — and no franc Shop+ did not give;
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
  | 'montant_faux' | 'paye_apres_echec' | 'paiement_en_attente' | 'propre' | 'remboursement_bloque' | 'fiche_pleine'
  | 'fournisseur_jamais_prevenu' | 'fiche_pleine_fournisseur' | 'montant_faux_apres_echec',
  string
>;
const PAGE = JSON.parse(capture.pages[0]!) as { ok: true; orders: Record<string, unknown>[] };
/** The buyer's contact the seam gave the orders that carry one. */
const CONTACT = { phone: '70 33 44 55', quartier: 'Tampouy', repere: 'Derrière la mosquée' };
/** The two in-book orders, the seven off-book ones, the eight flagged — from the capture. */
const HORS_CARNET = [
  R.montant_faux, R.paye_apres_echec, R.paiement_en_attente, R.fiche_pleine, R.fournisseur_jamais_prevenu, R.fiche_pleine_fournisseur,
  R.montant_faux_apres_echec,
];

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

/** The strings on the ONE card whose control carries this order number, so
 *  « beside » means on the same card, never only somewhere on the screen. */
const surLaCarte = (screen: Screen, orderId: string): string[] => {
  const brut = (n: ReactTestInstance): string => n.children.map((c) => (typeof c === 'string' ? c : brut(c))).join('');
  const portant = screen.tree.root.findAll((n) => typeof n.props['onPress'] === 'function' && brut(n).includes(orderId));
  const cartes = portant.filter((h) => !portant.some((o) => o !== h && h.findAll((x) => x === o).length > 0));
  expect(cartes, `one card carries ${orderId}`).toHaveLength(1);
  return cartes[0]!.findAllByType('Text' as never).map(brut).filter((t) => t !== '');
};
/** Shop+ gives the console a refund STATE, never a franc: no figure in francs anywhere. */
const sansMontant = (screen: Screen): void => {
  for (const t of screen.texts()) expect(/\d[\s\u00a0\u202f]?(F|FCFA)\b/.test(t), `an amount on screen: « ${t} »`).toBe(false);
};
const BANNIERE_BLOQUE_UN = 'Un remboursement est bloqué. Il est dans « Incidents ».';
/** His book holds only the clean order: every captured blocked refund is then on
 *  an order Shop+ flags that the book does not hold, listed above the segments. */
const livreSansBloquee = (): Route[] => [
  (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [PROPRE] } } : null),
  ...routesAvec(dlqUn),
];

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
  it('the head counts eight orders and one refused payment message, both read with his key C', async () => {
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

    // Eight of the nine real rows carry alerts; the clean one does not.
    expect(screen.texts(), `On screen: ${JSON.stringify(screen.texts())}`).toContain('8 commandes à vérifier');
    expect(screen.texts()).toContain('Un message de paiement refusé à lire');
    // Under « À traiter »: the seven off-book cards carry the pill; the clean
    // order there carries none.
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.texts().filter((t) => t === 'À vérifier').length).toBe(7);
    screen.unmount();
  });

  it('the blocked order keeps its refund pill and gains « À vérifier »; opening it says why, with how long ago', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire(routesAvec(dlqUn));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    // The clean order, in « À traiter »: no second pill on its card.
    expect(screen.shows('Bazin riche')).toBe(true);
    // The one blocked refund in his book is counted, exactly, and pointed at
    // « Incidents »; the blocked one not in his book is not counted there.
    expect(screen.texts().filter((t) => t === BANNIERE_BLOQUE_UN)).toHaveLength(1);
    expect(screen.shows('remboursements sont bloqués')).toBe(false);
    await screen.press('Incidents');
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.texts()).toContain('Remboursement bloqué');
    // Its card: both pills. Seven off-book cards + this one = eight « À vérifier ».
    expect(screen.texts().filter((t) => t === 'À vérifier').length).toBe(8);

    await screen.press('Sac en cuir');
    expect(screen.canPress('Retirer cette commande'), 'the card did not open').toBe(true);
    // Its time is the Worker's own clock (masked in the capture): the sentence is pinned.
    expect(screen.shows(
      "Un message de refus de Séra n'a pas pu être lu. À ce moment-là, le remboursement n'a pas pu commencer. · ",
    ), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('the orders not yet in his book are listed without contact, and open to their alerts', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire(routesAvec(dlqUn));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    for (const id of HORS_CARNET) {
      expect(screen.texts(), `${id} missing`).toContain(id);
    }
    expect(screen.texts().filter((t) => t === 'Cette commande n\'apparaît pas dans le carnet ci-dessous.').length).toBe(7);
    // Never her contact: two of these rows carry it (the seam's own input), and
    // not one of its bytes reaches the screen — nor any phone shape at all.
    const jamais = () => {
      for (const t of screen.texts()) {
        for (const octet of [CONTACT.phone, CONTACT.quartier, CONTACT.repere]) expect(t.includes(octet), `« ${octet} » on screen`).toBe(false);
        expect(/\b\d{2} \d{2} \d{2} \d{2}\b/.test(t), t).toBe(false);
      }
    };
    jamais();

    await screen.press(R.montant_faux);
    expect(screen.texts()).toContain('Le montant payé ne correspond pas au prix de la commande. · il y a 2 heures');
    // The alarm's own time is masked in the capture: the sentence is pinned.
    expect(screen.shows(
      "Le service de paiement n'a pas répondu à temps pour le paiement de la cliente. Regardez si la commande est confirmée. · ",
    ), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    // The supplier never told: its card opens to that sentence, and still no contact.
    await screen.press(R.fournisseur_jamais_prevenu);
    expect(screen.shows("Cette commande est payée, mais le fournisseur n'a pas été prévenu à temps. · ")).toBe(true);
    jamais();

    // The full records: what the cap could not keep is said, with no number.
    const coupees = "D'autres alertes de cette commande n'ont pas pu être gardées.";
    await screen.press(R.fiche_pleine);
    expect(screen.texts().filter((t) => t === coupees)).toHaveLength(1);
    // One off-book card is open at a time: this one replaces the last.
    await screen.press(R.fiche_pleine_fournisseur);
    expect(screen.texts().filter((t) => t === coupees)).toHaveLength(1);
    expect(screen.texts().filter((t) => t.startsWith("Cette commande est payée, mais le fournisseur n'a pas été prévenu à temps."))).toHaveLength(1);
    jamais();

    await screen.press(R.paye_apres_echec);
    expect(screen.texts()).toContain(
      'Le service de paiement dit que la cliente a payé. Mais la commande était déjà notée comme non payée. · il y a 2 heures',
    );
    screen.unmount();
  });

  it('the order whose payment had failed after the provider took the money shows its refund as Shop+ gives it, beside the alert; the other one shows the alert and no refund', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    // Shop+'s own word on both orders, as captured: a re-capture that changes it
    // goes red here, never quietly under the screen.
    const ligne = (id: string) => PAGE.orders.find((r) => r['orderId'] === id)!;
    expect(ligne(R.paye_apres_echec)['state']).toBe('payment_failed');
    expect(ligne(R.paye_apres_echec)['remboursement']).toEqual({ etat: 'bloque', raison: 'sans_confirmation' });
    expect(ligne(R.montant_faux_apres_echec)['state']).toBe('payment_failed');
    expect(ligne(R.montant_faux_apres_echec)['remboursement']).toBeNull();
    wire(routesAvec(dlqUn));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    const SANS_CONFIRMATION =
      "Le service de paiement n'a pas encore confirmé ce remboursement. Appelez le service de paiement avec ce numéro de commande.";
    const HORS = "Cette commande n'apparaît pas dans le carnet ci-dessous.";
    // Its card, whole and in order: the refund pill, then « À vérifier » beside it,
    // then why the refund cannot finish by itself.
    expect(surLaCarte(screen, R.paye_apres_echec)).toEqual([
      R.paye_apres_echec, 'Remboursement bloqué', 'À vérifier', 'pv-rr-1 · Ouagadougou', SANS_CONFIRMATION, HORS,
    ]);
    // Every other card not in his book is exactly what it was: no refund pill, no reason.
    for (const id of HORS_CARNET.filter((x) => x !== R.paye_apres_echec)) {
      expect(surLaCarte(screen, id), id).toEqual([id, 'À vérifier', 'pv-rr-1 · Ouagadougou', HORS]);
    }
    // One refund pill on the whole « À traiter » view, the one Shop+ gave.
    expect(screen.texts().filter((t) => t === 'Remboursement bloqué')).toHaveLength(1);
    for (const autre of ['Remboursement en cours', 'Cliente remboursée', 'Rien à rembourser']) {
      expect(screen.shows(autre), autre).toBe(false);
    }
    sansMontant(screen);

    // Opened: both of its alerts in his words, the refund still said on its card.
    await screen.press(R.paye_apres_echec);
    const PAYE_APRES_ECHEC =
      'Le service de paiement dit que la cliente a payé. Mais la commande était déjà notée comme non payée. · il y a 2 heures';
    expect(screen.texts()).toContain(PAYE_APRES_ECHEC);
    // The refund's stuck mark carries the time the Worker's own clock wrote when it
    // was captured (a real time no test can choose; the seam checks only its form),
    // so the sentence is pinned and not how long ago.
    expect(screen.shows(
      "Le remboursement a été demandé, mais le service de paiement ne l'a pas confirmé à temps. · ",
    ), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(surLaCarte(screen, R.paye_apres_echec)).toContain('Remboursement bloqué');
    sansMontant(screen);

    // The one whose amount was wrong: its alert, and still no refund anywhere but the other card.
    await screen.press(R.montant_faux_apres_echec);
    expect(screen.texts().filter((t) => t === PAYE_APRES_ECHEC)).toHaveLength(1);
    expect(screen.shows('Le remboursement a été demandé')).toBe(false);
    expect(surLaCarte(screen, R.montant_faux_apres_echec)).toEqual([R.montant_faux_apres_echec, 'À vérifier', 'pv-rr-1 · Ouagadougou', HORS]);
    expect(screen.texts().filter((t) => t === 'Remboursement bloqué')).toHaveLength(1);
    sansMontant(screen);
    screen.unmount();
  });

  it('a refund still under way on an order not in his book reads « Remboursement en cours », with no reason line and no franc', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    // CONSTRUCTED, NOT CAPTURED: the captured row of the order paid after a failed
    // payment, with only its refund and its alerts set to the form Shop+ gives
    // before its stuck limit (a refund under way, the one alert). That row form
    // is in Shop+'s recording, and the harness checks it like any captured page.
    const capturee = PAGE.orders.find((r) => r['orderId'] === R.paye_apres_echec)!;
    const alerte = (capturee['aVerifier'] as { elements: { classe: string }[] }).elements.find(
      (e) => e.classe === 'genuine_webhook_after_local_failure',
    )!;
    const enCours = { ...capturee, remboursement: { etat: 'en_cours' }, aVerifier: { elements: [alerte], coupees: 0 } };
    wire([
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [PROPRE] } } : null),
      (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
      (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
      (path) => (path === '/checkout/dispatch' ? { status: 200, json: { ok: true, orders: [enCours] } } : null),
      dlqUn,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    expect(surLaCarte(screen, R.paye_apres_echec), `On screen: ${JSON.stringify(screen.texts())}`).toEqual([
      R.paye_apres_echec, 'Remboursement en cours', 'À vérifier', 'pv-rr-1 · Ouagadougou',
      "Cette commande n'apparaît pas dans le carnet ci-dessous.",
    ]);
    // Under way is not blocked: no red banner, and no « Appelez le service de paiement ».
    expect(screen.shows('Remboursement bloqué')).toBe(false);
    expect(screen.shows('bloqué')).toBe(false);
    expect(screen.shows('Appelez le service de paiement')).toBe(false);
    sansMontant(screen);

    await screen.press(R.paye_apres_echec);
    expect(screen.texts()).toContain(
      'Le service de paiement dit que la cliente a payé. Mais la commande était déjà notée comme non payée. · il y a 2 heures',
    );
    expect(surLaCarte(screen, R.paye_apres_echec)).toContain('Remboursement en cours');
    sansMontant(screen);
    screen.unmount();
  });

  it('a blocked refund on an order not in his book never sends him to « Incidents », where it is not', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    // Both captured blocked refunds are then off his book; each says so on its own card.
    wire(livreSansBloquee());
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(surLaCarte(screen, R.remboursement_bloque)).toContain('Remboursement bloqué');
    expect(surLaCarte(screen, R.paye_apres_echec)).toContain('Remboursement bloqué');
    expect(screen.shows('Il est dans « Incidents »'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(false);
    expect(screen.shows('Ils sont dans « Incidents »')).toBe(false);
    // The tree stands, and « Incidents » holds no order of his book.
    await screen.press('Incidents');
    expect(screen.shows('Sac en cuir')).toBe(false);
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
    expect(screen.texts()).toContain('8 commandes à vérifier');
    await screen.press('Incidents');
    expect(screen.texts()).toContain('Remboursement bloqué');
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

  it('a clean tab: the rows and the count are read, and nothing on screen says there is anything to check', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    // The ONE page here not captured whole: the recorded envelope holding exactly
    // the captured clean row, its bytes unchanged. The harness checks it like any page.
    const propre = PAGE.orders.find((r) => r['orderId'] === R.propre)!;
    const fil = wire([
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [PROPRE] } } : null),
      (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
      (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
      (path) => (path === '/checkout/dispatch' ? { status: 200, json: { ok: true, orders: [propre] } } : null),
      (path, _b, search) =>
        path === '/checkout/dlq' && search.toString() === 'compte=1' ? { status: 200, json: { ok: true, held: 0, dropped: 0, oversize: 0 } } : null,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(fil.calls.some((c) => c.path === '/checkout/dispatch'), 'the rows were never read').toBe(true);
    expect(fil.calls.filter((c) => c.path === '/checkout/dlq')).toHaveLength(1);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('À vérifier'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(false);
    expect(screen.shows('à vérifier')).toBe(false);
    expect(screen.shows('message de paiement refusé')).toBe(false);
    expect(screen.shows('messages de paiement refusés')).toBe(false);
    expect(screen.shows("n'apparaît pas dans le carnet")).toBe(false);
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
