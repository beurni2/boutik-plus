import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — EVERY PAID ORDER CAN BE REFUNDED (REMBOURSABLE-1) ═══
 *
 * AUDIT-B+2 F-02, F-08, F-10, F-61, F-69, on the founder's Commandes tab. The
 * four questions, for this slice's roads:
 *   · did the tree survive — « Annuler et rembourser » asks first, and both of
 *     its answers leave a live card;
 *   · present, pressable and WIRED — the cancel posts `{orderId}` alone on HIS
 *     key; « Signaler » posts `{reason}` alone on key C; each lands its own
 *     sentence, the replay included;
 *   · a failed act leaves a way out — a lost cancel says so and the button is
 *     still there; a failed read says so in one sentence;
 *   · he reaches the next step — a cancelled order moves to Incidents.
 * Plus the marks the book now carries: a delivered, handed-over, returned or
 * pickup-refused order is classed from the BOOK even with no other key on the
 * device, and the buyers' contacts are read ONCE for the tab, never per card.
 *
 * ⚠ CONTRACT-CERTIFIED: book rows are `/fulfillment/orders` as
 * `services/offer-service/test/annuler-rembourser.e2e.test.ts` proves them on
 * the real Worker (the new marks `handedOverAt`, `deliveredAt`, `returnedAt`,
 * `pickupRefusedAt`, and `refusPar: 'fondateur'` beside `refusedAt`); the
 * cancel answers are that suite's (`200 annulee` / `200 already_refused` /
 * `409 already_ready`). Shop+'s dispatch rows carry the key set its own suite
 * pins, and its refusal route answers as `buyer-ladder-do.ts` does (`200` with
 * `replay: true` on a repeat, `409 already_recorded`, `422 no_contact_on_order`).
 */

const OPS_KEY_SLOT = 'boutik.operateur.cle';
const CLE_C_SLOT = 'boutik.livraisons.cle';

const BASE = {
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  zoneTo: 'Gounghin',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-09-26T07:00:01.000Z',
};
const commande = (orderId: string, productName: string, fulfillment?: Record<string, unknown>) => ({
  ...BASE,
  orderId,
  productVersionId: `pv-${orderId}`,
  productName,
  paidAt: '2026-09-26T07:00:00.000Z',
  ...(fulfillment !== undefined ? { fulfillment } : {}),
});

const ATTENTE = commande('ord-attente', 'Bazin riche');
const PRETE = commande('ord-prete', 'Sac en cuir', { acceptedAt: '2026-09-26T07:10:00.000Z', readyAt: '2026-09-26T07:30:00.000Z' });
const REMISE = commande('ord-remise', 'Pagne wax', {
  acceptedAt: '2026-09-26T07:10:00.000Z', readyAt: '2026-09-26T07:30:00.000Z', handedOverAt: '2026-09-26T08:00:00.000Z',
});
const LIVREE = commande('ord-livree', 'Chaussures', {
  acceptedAt: '2026-09-26T07:10:00.000Z', readyAt: '2026-09-26T07:30:00.000Z',
  handedOverAt: '2026-09-26T08:00:00.000Z', deliveredAt: '2026-09-26T09:00:00.000Z',
});
const RAMASSAGE_REFUSE = commande('ord-ramassage', 'Panier tressé', {
  acceptedAt: '2026-09-26T07:10:00.000Z', readyAt: '2026-09-26T07:30:00.000Z',
  handedOverAt: '2026-09-26T08:00:00.000Z', pickupRefusedAt: '2026-09-26T08:05:00.000Z',
});
const REVENUE = commande('ord-revenue', 'Robe brodée', {
  acceptedAt: '2026-09-26T07:10:00.000Z', readyAt: '2026-09-26T07:30:00.000Z',
  handedOverAt: '2026-09-26T08:00:00.000Z', returnedAt: '2026-09-26T11:00:00.000Z',
});

/** The book, and what it becomes once HIS cancel lands. */
function livre(orders: () => readonly unknown[]): Route {
  return (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: orders() as never } } : null);
}
const contacts: Route = (path) =>
  path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null;
const preuve: Route = (path) =>
  path === '/fulfillment/order-evidence'
    ? { status: 200, json: { ok: true, evidence: { photoRef: { ref: 'media/p', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' }, confirmedAt: '2026-09-26T07:30:00.000Z' } } }
    : null;

const ligneShop = (orderId: string, remboursement: unknown, phone: string | null = '70123456') => ({
  ok: true,
  exists: true,
  orderId,
  state: 'confirmed',
  createdAt: '2026-09-26T07:00:00.000Z',
  contact: phone === null ? null : { phone, quartier: 'Gounghin', repere: 'Face à la pharmacie' },
  productVersionId: `pv-${orderId}`,
  zoneTo: 'Gounghin',
  remboursement,
});

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('F-02 — « Annuler et rembourser », HIS act on an order nobody will serve', () => {
  it('asks first; « Garder la commande » keeps it; the second press posts {orderId} alone on his key, and the order moves to Incidents said as HIS act', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    let annulee = false;
    const fil = wire([
      (path, body, _s, headers) =>
        path === '/fulfillment/order/annuler'
          ? headers['authorization'] === 'Bearer cle-ops' && JSON.stringify(body) === JSON.stringify({ orderId: 'ord-attente' })
            ? ((annulee = true), { status: 200, json: { ok: true, status: 'annulee', refusedAt: '2026-09-26T12:00:00.000Z' } })
            : { status: 400, json: { ok: false, reason: 'malformed' } }
          : null,
      livre(() => [
        annulee ? { ...ATTENTE, fulfillment: { refusedAt: '2026-09-26T12:00:00.000Z', refusPar: 'fondateur' } } : ATTENTE,
        PRETE,
      ]),
      contacts,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();

    await screen.press('Bazin riche');
    expect(screen.canPress('Annuler et rembourser'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press('Annuler et rembourser');
    // ONE PRESS REFUNDS NOTHING: the question, and the way out.
    expect(fil.calls.some((c) => c.path === '/fulfillment/order/annuler')).toBe(false);
    expect(screen.shows('La cliente sera remboursée en entier.')).toBe(true);
    expect(screen.canPress('Garder la commande')).toBe(true);
    await screen.press('Garder la commande');
    expect(screen.canPress('Annuler et rembourser'), 'the tree survived the way out').toBe(true);
    expect(fil.calls.some((c) => c.path === '/fulfillment/order/annuler')).toBe(false);

    await screen.press('Annuler et rembourser');
    await screen.press('Oui, annuler et rembourser');
    await screen.settle();
    const posts = fil.calls.filter((c) => c.path === '/fulfillment/order/annuler');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toEqual({ orderId: 'ord-attente' });
    expect(posts[0]!.headers['authorization']).toBe('Bearer cle-ops');

    // It left « À traiter »…
    expect(screen.shows('Bazin riche'), 'a cancelled order still waits to be prepared').toBe(false);
    // …and Incidents says it was HIS act, never the supplier's refusal.
    await screen.press('Incidents');
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Annulée')).toBe(true);
    expect(screen.texts()).toContain('Vous avez annulé cette commande. La cliente sera remboursée.');
    expect(screen.shows('Le fournisseur a refusé'), 'his cancel told as the supplier\'s refusal').toBe(false);
    expect(screen.shows('est remboursée'), 'a refund claimed done before Shop+ says so').toBe(false);
    screen.unmount();
  });

  it('a lost answer says so, keeps the card, and the button presses again', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    const fil = wire([
      (path) => (path === '/fulfillment/order/annuler' ? { status: 503, json: { ok: false } } : null),
      livre(() => [ATTENTE]),
      contacts,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Bazin riche');
    await screen.press('Annuler et rembourser');
    await screen.press('Oui, annuler et rembourser');
    await screen.settle();
    expect(fil.calls.some((c) => c.path === '/fulfillment/order/annuler'), 'the act was never sent').toBe(true);
    expect(screen.shows("L'annulation n'a pas abouti. Réessayez.")).toBe(true);
    expect(screen.canPress('Annuler et rembourser'), 'no way left to retry').toBe(true);
    screen.unmount();
  });

  it('already made ready while he looked: said in words, nothing claimed', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    wire([
      (path) => (path === '/fulfillment/order/annuler' ? { status: 409, json: { ok: false, reason: 'already_ready' } } : null),
      livre(() => [ATTENTE]),
      contacts,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Bazin riche');
    await screen.press('Annuler et rembourser');
    await screen.press('Oui, annuler et rembourser');
    await screen.settle();
    expect(screen.shows('Le colis est déjà prêt : il ne peut plus être annulé ici.')).toBe(true);
    expect(screen.shows('Vous avez annulé'), 'a cancel claimed that the book refused').toBe(false);
    screen.unmount();
  });

  it('a refused key sends him back to the door', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    wire([
      (path) => (path === '/fulfillment/order/annuler' ? { status: 401, json: { error: 'unauthorized' } } : null),
      livre(() => [ATTENTE]),
      contacts,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Bazin riche');
    await screen.press('Annuler et rembourser');
    await screen.press('Oui, annuler et rembourser');
    await screen.settle();
    expect(screen.canPress('Ouvrir'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('never offered on an order Shop+ is already refunding, even before « prêt » and with no refusal on the book', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire([
      livre(() => [ATTENTE]),
      contacts,
      (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
      (path) =>
        path === '/checkout/dispatch'
          ? { status: 200, json: { ok: true, orders: [ligneShop('ord-attente', { etat: 'en_cours' })] } }
          : null,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Incidents');
    await screen.press('Bazin riche');
    expect(screen.canPress('Retirer cette commande'), 'the card did not open').toBe(true);
    expect(screen.canPress('Annuler et rembourser'), 'a second refund offered on one already running').toBe(false);
    screen.unmount();
  });

  it('never offered once the parcel is ready, nor on an order already refunding', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    wire([
      livre(() => [PRETE, commande('ord-refusee', 'Tissu', { refusedAt: '2026-09-26T08:00:00.000Z' })]),
      contacts,
      preuve,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Prêt à livrer');
    await screen.press('Sac en cuir');
    expect(screen.canPress('Annuler et rembourser')).toBe(false);
    await screen.press('Incidents');
    await screen.press('Tissu');
    expect(screen.canPress('Retirer cette commande'), 'the card did not open').toBe(true);
    // An ended order waits for no one (verifier MINOR): no « En attente depuis ».
    expect(screen.shows('En attente depuis'), 'an ended order told it is still waiting').toBe(false);
    expect(screen.canPress('Annuler et rembourser')).toBe(false);
    screen.unmount();
  });
});

describe('F-08 + F-61 — finished orders are classed from the book, with no other key on the device', () => {
  it('handed over → En route; delivered → Terminées; refused at pickup and returned → Incidents; nothing falls back to « Prêt à livrer »', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    const fil = wire([livre(() => [PRETE, REMISE, LIVREE, RAMASSAGE_REFUSE, REVENUE]), contacts, preuve]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    // No Shop+ key, no Séra key: no other Worker was asked.
    expect(fil.calls.some((c) => c.path.startsWith('/checkout/'))).toBe(false);

    await screen.press('Prêt à livrer');
    expect(screen.shows('Sac en cuir')).toBe(true);
    for (const nom of ['Pagne wax', 'Chaussures', 'Panier tressé', 'Robe brodée']) {
      expect(screen.shows(nom), `${nom} fell back to « Prêt à livrer »`).toBe(false);
    }
    await screen.press('En route');
    expect(screen.shows('Pagne wax')).toBe(true);
    await screen.press('Terminées');
    expect(screen.shows('Chaussures')).toBe(true);
    await screen.press('Incidents');
    expect(screen.shows('Panier tressé')).toBe(true);
    expect(screen.shows('Robe brodée')).toBe(true);
    expect(screen.texts()).toContain("Le coursier n'a pas pris le colis. La commande est annulée. La cliente sera remboursée.");
    expect(screen.shows('Refusé au ramassage')).toBe(true);
    // A made-ready order is on Séra's road even from Incidents: no cancel is
    // offered that the book would only refuse (mutation A3 survived without this).
    for (const nom of ['Panier tressé', 'Robe brodée']) {
      await screen.press(nom);
      expect(screen.canPress('Retirer cette commande'), `${nom}: the card did not open`).toBe(true);
      expect(screen.shows('En attente depuis'), `${nom}: an ended order told it is still waiting`).toBe(false);
      expect(screen.canPress('Annuler et rembourser'), `${nom}: a cancel offered after « prêt »`).toBe(false);
      await screen.press(nom);
    }
    screen.unmount();
  });

  it('a read that fails is said in ONE sentence at the top, never silently', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire([
      livre(() => [PRETE, LIVREE]),
      contacts,
      (path) => (path === '/checkout/gains' ? { status: 503, json: { ok: false } } : null),
      (path) => (path === '/checkout/dispatch' ? { status: 503, json: { ok: false } } : null),
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    const phrase = 'Une partie des informations n’a pas pu être lue. Chaque commande est rangée d’après votre carnet.';
    expect(screen.texts().filter((t) => t === phrase)).toHaveLength(1);
    // …and the book still classes what it knows.
    await screen.press('Terminées');
    expect(screen.shows('Chaussures')).toBe(true);
    screen.unmount();
  });
});

describe('F-61 — a Shop+ read cut short by its page cap is said as partial', () => {
  it('every page answers « next »: the sweep stops at its cap and the one sentence appears', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    const fil = wire([
      livre(() => [PRETE]),
      contacts,
      (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
      (path, _b, search) =>
        path === '/checkout/dispatch'
          ? { status: 200, json: { ok: true, orders: [], next: `p${Number(search.get('cursor')?.slice(1) ?? '0') + 1}` } }
          : null,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(fil.calls.filter((c) => c.path === '/checkout/dispatch').length).toBeGreaterThan(1);
    expect(screen.shows('Une partie des informations n’a pas pu être lue.'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });
});

describe('F-69 — the buyers\' contacts are read ONCE for the tab, never again per card', () => {
  it('opening a « Prêt à livrer » card reuses the tab\'s read: her number is there, and no second read was made', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    const fil = wire([
      livre(() => [PRETE]),
      contacts,
      preuve,
      (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
      (path) => (path === '/checkout/dispatch' ? { status: 200, json: { ok: true, orders: [ligneShop('ord-prete', null)] } } : null),
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    const avant = fil.calls.filter((c) => c.path === '/checkout/dispatch').length;
    expect(avant).toBe(1);
    await screen.press('Prêt à livrer');
    await screen.press('Sac en cuir');
    await screen.settle();
    expect(screen.shows('70 12 34 56'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(fil.calls.filter((c) => c.path === '/checkout/dispatch').length, 'the card re-read every buyer').toBe(avant);
    screen.unmount();
  });
});

describe('F-10 — « Signaler » is back, under Incidents, and it is wired', () => {
  const routesSignaler = (refusal: Route): Route[] => [
    refusal,
    livre(() => [REVENUE, RAMASSAGE_REFUSE, commande('ord-refusee', 'Tissu', { refusedAt: '2026-09-26T08:00:00.000Z' })]),
    contacts,
    (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
    (path) =>
      path === '/checkout/dispatch'
        ? {
            status: 200,
            json: {
              ok: true,
              orders: [
                ligneShop('ord-revenue', { etat: 'rien' }),
                ligneShop('ord-ramassage', { etat: 'en_cours' }),
                ligneShop('ord-refusee', { etat: 'en_cours' }),
              ],
            },
          }
        : null,
  ];
  const versIncident = async (refusal: Route) => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    const fil = wire(routesSignaler(refusal));
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Incidents');
    await screen.press('Robe brodée');
    return { fil, screen };
  };

  it('a real reason posts {reason} alone on key C, and the answer is said', async () => {
    const { fil, screen } = await versIncident((path) =>
      path === '/checkout/dispatch/ord-revenue/refusal'
        ? { status: 200, json: { ok: true, record: {}, rung: 'standard', escalated: false } }
        : null,
    );
    expect(screen.canPress('Signaler'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press('Signaler');
    await screen.press("Elle a changé d'avis");
    await screen.settle();
    const post = fil.calls.find((c) => c.path === '/checkout/dispatch/ord-revenue/refusal');
    expect(post, 'the reason was never sent').toBeDefined();
    expect(post!.body).toEqual({ reason: 'change_of_mind' });
    expect(post!.headers['authorization']).toBe('Bearer cle-c');
    expect(screen.shows('C\'est noté.')).toBe(true);
    screen.unmount();
  });

  it('a repeat of the same reason (replay) is the same « noted »', async () => {
    const { screen } = await versIncident((path) =>
      path === '/checkout/dispatch/ord-revenue/refusal'
        ? { status: 200, json: { ok: true, record: {}, rung: 'standard', escalated: false, replay: true } }
        : null,
    );
    await screen.press('Signaler');
    await screen.press("Elle a changé d'avis");
    await screen.settle();
    expect(screen.shows('C\'est noté.')).toBe(true);
    screen.unmount();
  });

  it('a different reason already noted is said as such (409), and no number says so (422)', async () => {
    const deja = await versIncident((path) =>
      path === '/checkout/dispatch/ord-revenue/refusal'
        ? { status: 409, json: { ok: false, reason: 'already_recorded', recorded: 'honest_absence' } }
        : null,
    );
    await deja.screen.press('Signaler');
    await deja.screen.press("Elle a changé d'avis");
    await deja.screen.settle();
    expect(deja.screen.shows('Cette commande a déjà une note.')).toBe(true);
    deja.screen.unmount();

    const sans = await versIncident((path) =>
      path === '/checkout/dispatch/ord-revenue/refusal'
        ? { status: 422, json: { ok: false, reason: 'no_contact_on_order' } }
        : null,
    );
    await sans.screen.press('Signaler');
    await sans.screen.press("Elle a changé d'avis");
    await sans.screen.settle();
    expect(sans.screen.shows('Pas de numéro utilisable sur cette commande.')).toBe(true);
    sans.screen.unmount();
  });

  it('a key C Shop+ refuses sends the card to its door, said as refused — never a fold that silently vanishes', async () => {
    const { screen } = await versIncident((path) =>
      path === '/checkout/dispatch/ord-revenue/refusal' ? { status: 401, json: { error: 'unauthorized' } } : null,
    );
    await screen.press('Signaler');
    await screen.press("Elle a changé d'avis");
    await screen.settle();
    expect(screen.shows("Cette clé n'est pas la bonne."), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Ouvrir'), 'no way back to type the key').toBe(true);
    screen.unmount();
  });

  it('never offered where it would blame her for our failure: refused by the supplier, or at pickup', async () => {
    const { screen } = await versIncident(() => null);
    screen.unmount();
    storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
    wire(routesSignaler(() => null));
    for (const nom of ['Panier tressé', 'Tissu']) {
      const s = await mountEcran(<SCommandesReel />);
      await s.settle();
      await s.press('Incidents');
      await s.press(nom);
      expect(s.canPress('Retirer cette commande'), `${nom}: the card did not open`).toBe(true);
      expect(s.canPress('Signaler'), `${nom}: « Signaler » would blame the buyer`).toBe(false);
      s.unmount();
    }
  });
});

describe('F-37 — « Retirer » waits for a refund notice that has not left yet', () => {
  it('the book\'s 409 refus_en_attente is said in words, the order stays, and « Retirer » presses again', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    const fil = wire([
      (path) =>
        path === '/fulfillment/order/retirer' ? { status: 409, json: { ok: false, reason: 'refus_en_attente' } } : null,
      livre(() => [commande('ord-refusee', 'Tissu', { refusedAt: '2026-09-26T08:00:00.000Z' })]),
      contacts,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Incidents');
    await screen.press('Tissu');
    await screen.press('Retirer cette commande');
    await screen.press('Oui, retirer');
    await screen.settle();
    expect(fil.calls.some((c) => c.path === '/fulfillment/order/retirer')).toBe(true);
    expect(screen.shows('Le remboursement de la cliente n’est pas encore parti.'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Tissu')).toBe(true);
    expect(screen.canPress('Retirer cette commande')).toBe(true);
    screen.unmount();
  });
});

describe('F-37 — the sweep says which rows it kept for a refund notice', () => {
  it('a row the book keeps (refus_en_attente) is counted apart and said, never « pas pu »', async () => {
    storage({ [OPS_KEY_SLOT]: 'cle-ops' });
    wire([
      (path, body) =>
        path === '/fulfillment/order/retirer'
          ? body?.['orderId'] === 'ord-refusee'
            ? { status: 409, json: { ok: false, reason: 'refus_en_attente' } }
            : { status: 200, json: { ok: true, status: 'retire', orderId: String(body?.['orderId']) } }
          : null,
      livre(() => [commande('ord-refusee', 'Tissu', { refusedAt: '2026-09-26T08:00:00.000Z' }), REVENUE]),
      contacts,
    ]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    await screen.press('Incidents');
    await screen.press("Retirer les commandes d'essai");
    await screen.press('Oui, tout retirer');
    await screen.settle();
    expect(screen.shows('Gardées pour l’instant : 1.'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows("n'ont pas pu l'être"), 'a deliberate wait counted as a failure').toBe(false);
    screen.unmount();
  });
});
