import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { SZoneFonds } from '../src/fonds/zone';
import { SCommandesReel } from '../src/commandes/screen';
import { livreFondsSubstitut, reclamation, type FauteStockee, type ReclamationStockee } from './livre-fonds-substitut';

/**
 * ═══ RENDU-RÉEL — THE FUND DESK SAYS WHAT IS TRUE ABOUT THE BUYER'S REFUND,
 * SHOWS IT, AND READS ONLY WHAT IT SHOWS ═══
 *
 * Two real screens of his console, driven: the « Fonds » zone and the
 * Commandes tab. Only `fetch` and his browser storage are doubled.
 *
 *   · A seller-fault claim does not refund the buyer, and the card now says
 *     so. Beside it, the desk shows that order's refund as Shop+ judges it, in
 *     the Commandes tab's own pill words, read through the key-C read the
 *     console already makes — and where it cannot read it, it says so and
 *     never guesses.
 *   · The desk reads the figures, the open claims and ONE page of closed
 *     claims; « Voir les réclamations plus anciennes » brings the next page
 *     and goes away at the end. An open claim is never behind a page.
 *   · The Commandes tab reads the open claims and the 100 most recently
 *     closed — never the whole book, never the figures.
 *   · Against the book still live before the paged reading (it ignores the
 *     page and answers everything), every claim shows once, with no button.
 *
 * ⚠ CERTIFIED STAND-INS: the fund book is `livre-fonds-substitut.ts`, checked
 * against the real book in both readings (`livre-fonds-substitut.e2e.test.ts`);
 * the Shop+ rows carry the Worker's own key set and are checked against its
 * recorded answers by the harness.
 */

const CLE_FONDS = 'cle-fonds-walk';
const FONDS_SLOT = 'boutik.fonds.cle';
const CLE_C_SLOT = 'boutik.livraisons.cle';
const OPS_SLOT = 'boutik.operateur.cle';

const NE_REMBOURSE_PAS = 'Cette réclamation ne rembourse pas la cliente.';
const ANCIENNE_LIGNE = 'Cliente à rembourser en premier';
const SELON_SHOP = 'Son remboursement, selon Shop+';
const SANS_CLE = 'Pour voir ici si la cliente est remboursée, entrez une fois la clé Shop+ dans la zone Revendeuses.';
const AUCUN = "Shop+ n'a aucun remboursement pour cette commande.";
const INTROUVABLE = "Shop+ n'a pas envoyé cette commande dans sa liste. Son remboursement ne peut donc pas être lu ici.";
const ILLISIBLE = "Son remboursement n'a pas pu être lu. Réessayez, ou regardez la commande dans Commandes.";
const PLUS_ANCIENNES = 'Voir les réclamations plus anciennes';
const INJOIGNABLE = 'Le registre ne répond pas';

/** A Shop+ key-C row with exactly the Worker's key set (see the Commandes
 *  refund walk for where it is pinned). The rows Shop+'s own suite recorded
 *  with a done or blocked refund all carry what it flags to check (that
 *  refund went through a stuck or refused step first), so these do too; and
 *  a done refund is only ever recorded on an order already `refunded`. */
const A_VERIFIER = (classe: string) => ({ elements: [{ classe, le: '2026-11-20T08:30:00.000Z' }], coupees: 0 });
const etatDe = (remboursement: unknown): string | null =>
  remboursement !== null && typeof remboursement === 'object' && 'etat' in remboursement
    ? (remboursement as { etat: string }).etat
    : null;
const ligne = (orderId: string, remboursement: unknown) => ({
  ok: true,
  exists: true,
  orderId,
  state: etatDe(remboursement) === 'fait' ? 'refunded' : 'confirmed',
  createdAt: '2026-11-20T06:00:00.000Z',
  contact: { phone: '70 11 22 33', quartier: 'Gounghin', repere: 'Face à la pharmacie' },
  productVersionId: 'pv',
  zoneTo: 'Gounghin',
  remboursement,
  aVerifier:
    etatDe(remboursement) === 'fait'
      ? A_VERIFIER('stuck_remboursement')
      : etatDe(remboursement) === 'bloque'
        ? A_VERIFIER('provider_refused_refund')
        : null,
});

const shop = (rows: readonly ReturnType<typeof ligne>[]): Route => (path, _b, _s, headers) =>
  path === '/checkout/dispatch'
    ? headers['authorization'] === 'Bearer cle-c'
      ? { status: 200, json: { ok: true, orders: [...rows] } }
      : { status: 401, json: { error: 'unauthorized' } }
    : null;

const h = (n: number): string => `2026-11-${String(10 + Math.floor(n / 24)).padStart(2, '0')}T${String(n % 24).padStart(2, '0')}:00:00.000Z`;

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_PROTECTION_BASE'] = 'http://fonds.test';
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_PROTECTION_BASE'];
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 100 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

/** What one claim's card says: its texts, from its order id to the next card's. */
function carte(screen: Screen, orderId: string, ids: readonly string[]): string[] {
  const textes = screen.texts();
  const debut = textes.indexOf(orderId);
  expect(debut, `the card of ${orderId} is on screen: ${JSON.stringify(textes)}`).toBeGreaterThanOrEqual(0);
  const suite = textes.findIndex((t, i) => i > debut && ids.includes(t));
  return textes.slice(debut, suite === -1 ? undefined : suite);
}

const fois = (screen: Screen, texte: string): number => screen.texts().filter((t) => t === texte).length;

describe('a seller-fault claim says what is true, and shows the buyer’s refund beside it', () => {
  const LIVRE: ReclamationStockee[] = [
    reclamation({ orderId: 'ord-rembourse', faute: 'seller', etat: 'opened', ouverteLe: h(1) }),
    reclamation({ orderId: 'ord-bloque', faute: 'seller', etat: 'under_review', ouverteLe: h(2), examineeLe: h(3) }),
    reclamation({ orderId: 'ord-sans-remb', faute: 'seller', etat: 'opened', ouverteLe: h(4) }),
    reclamation({ orderId: 'ord-absente', faute: 'seller', etat: 'closed_no_payout', ouverteLe: h(5), fermeeLe: h(6) }),
    reclamation({ orderId: 'ord-cliente', faute: 'buyer', etat: 'opened', ouverteLe: h(7) }),
  ];
  const IDS = LIVRE.map((c) => c.claim.orderId);
  const SHOP = [
    // Another order's refund comes FIRST: a desk that took any row would show it.
    ligne('ord-autre', { etat: 'fait' }),
    ligne('ord-rembourse', { etat: 'fait' }),
    ligne('ord-bloque', { etat: 'bloque', raison: 'refus_du_prestataire' }),
    ligne('ord-sans-remb', null),
    ligne('ord-cliente', { etat: 'fait' }),
  ];

  it('the old line is gone; each seller card says it refunds no one, then that order’s own refund in the Commandes words', async () => {
    const stored = storage({ [FONDS_SLOT]: CLE_FONDS, [CLE_C_SLOT]: 'cle-c' });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: LIVRE, mode: 'pages' });
    const fil = wire([livre.route, shop(SHOP)]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows('Cliente remboursée'), 'the refund beside the claim');

    expect(screen.shows(ANCIENNE_LIGNE), 'the old line still reads as a refund under way').toBe(false);
    expect(fois(screen, NE_REMBOURSE_PAS), 'one line per seller-fault claim').toBe(4);

    const rembourse = carte(screen, 'ord-rembourse', IDS);
    expect(rembourse).toContain(NE_REMBOURSE_PAS);
    expect(rembourse).toContain(SELON_SHOP);
    expect(rembourse, 'its own refund, done').toContain('Cliente remboursée');

    const bloque = carte(screen, 'ord-bloque', IDS);
    expect(bloque).toContain('Remboursement bloqué');
    expect(bloque).toContain('Le service de paiement a refusé de rembourser la cliente. Appelez le service de paiement avec ce numéro de commande.');
    expect(bloque, 'a blocked refund is never called done').not.toContain('Cliente remboursée');

    const sans = carte(screen, 'ord-sans-remb', IDS);
    expect(sans, 'Shop+ holds no refund for it, said as that').toContain(AUCUN);
    expect(sans.join(' '), 'no refund word on a guess').not.toMatch(/Cliente remboursée|Rien à rembourser|Remboursement en cours/);

    const absente = carte(screen, 'ord-absente', IDS);
    expect(absente, 'an order Shop+ did not send is said as one').toContain(INTROUVABLE);
    expect(absente.join(' '), 'never another order’s refund').not.toMatch(/Cliente remboursée|Rien à rembourser|Remboursement/);

    const cliente = carte(screen, 'ord-cliente', IDS);
    expect(cliente, 'a buyer-fault claim carries no seller line').not.toContain(NE_REMBOURSE_PAS);
    expect(cliente).not.toContain(SELON_SHOP);

    // WIRED: one key-C read, with HIS key C; nothing new asked of Shop+.
    const lectures = fil.calls.filter((c) => c.path === '/checkout/dispatch');
    expect(lectures.length, 'the key-C read, made once').toBe(1);
    expect(lectures[0]!.headers['authorization']).toBe('Bearer cle-c');
    expect(fil.calls.every((c) => c.path === '/checkout/dispatch' || c.path === '/claims' || c.path === '/fund'), 'no new Shop+ door').toBe(true);
    expect(stored.get(CLE_C_SLOT)).toBe('cle-c');

    // « Actualiser » reads the book and the refunds again; the tree survives.
    await screen.press('Actualiser la liste');
    await attendre(screen, () => fil.calls.filter((c) => c.path === '/checkout/dispatch').length === 2, 'the refunds read again');
    await attendre(screen, () => screen.shows('Cliente remboursée'), 'the refund back on screen');
    expect(screen.canPress('Nouvelle réclamation'), 'the desk is still usable').toBe(true);
    screen.unmount();
  }, 30_000);

  it('with no key C on this device, each seller card says where to type it, and nothing is asked of Shop+', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: LIVRE, mode: 'pages' });
    const fil = wire([livre.route, shop(SHOP)]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows(NE_REMBOURSE_PAS), 'the seller cards');
    expect(fois(screen, SANS_CLE), 'the honest sentence on each seller card').toBe(4);
    expect(screen.shows('Cliente remboursée') || screen.shows(AUCUN), 'no refund said without reading it').toBe(false);
    expect(fil.calls.some((c) => c.path === '/checkout/dispatch')).toBe(false);
    screen.unmount();
  }, 30_000);

  it('a key C Shop+ refuses: « not read », and the key stays on the device (the desk never clears it)', async () => {
    const stored = storage({ [FONDS_SLOT]: CLE_FONDS, [CLE_C_SLOT]: 'cle-c-perimee' });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: LIVRE, mode: 'pages' });
    const fil = wire([livre.route, shop(SHOP)]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows(ILLISIBLE), 'the « not read » sentence');
    expect(fois(screen, ILLISIBLE)).toBe(4);
    expect(fil.calls.filter((c) => c.path === '/checkout/dispatch').length).toBe(1);
    expect(stored.get(CLE_C_SLOT), 'the desk rewrote or cleared key C').toBe('cle-c-perimee');
    expect(screen.shows('Cliente remboursée')).toBe(false);
    screen.unmount();
  }, 30_000);

  it('a Shop+ read that fails: « not read », and « Actualiser » gets the refund once Shop+ answers', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS, [CLE_C_SLOT]: 'cle-c' });
    let panne = true;
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: LIVRE, mode: 'pages' });
    const enPanne: Route = (path) => (panne && path === '/checkout/dispatch' ? { status: 503, json: {} } : null);
    wire([enPanne, livre.route, shop(SHOP)]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows(ILLISIBLE), 'the « not read » sentence');
    expect(screen.shows('Cliente remboursée')).toBe(false);
    panne = false;
    await screen.press('Actualiser la liste');
    await attendre(screen, () => screen.shows('Cliente remboursée'), 'the refund after the retry');
    expect(screen.shows(ILLISIBLE)).toBe(false);
    screen.unmount();
  }, 30_000);

  it('a book with no seller-fault claim asks nothing of Shop+', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS, [CLE_C_SLOT]: 'cle-c' });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: [LIVRE[4]!], mode: 'pages' });
    const fil = wire([livre.route, shop(SHOP)]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows('ord-cliente'), 'the buyer claim');
    expect(fil.calls.some((c) => c.path === '/checkout/dispatch')).toBe(false);
    expect(screen.shows(NE_REMBOURSE_PAS)).toBe(false);
    screen.unmount();
  }, 30_000);
});

/** 2 open claims and 23 closed, closed f01 (first) … f23 (last). The fault of
 *  f<n> is FAUTES[(n + 3) % 5], so f02 — on the older page — is a seller's. */
const FAUTES: readonly FauteStockee[] = ['seller', 'buyer', 'payment_provider', 'platform_system', 'unresolved'];
const OUVERTES = [
  reclamation({ orderId: 'ord-p01', faute: 'seller', etat: 'opened', ouverteLe: h(30) }),
  reclamation({ orderId: 'ord-p02', faute: 'buyer', etat: 'under_review', ouverteLe: h(2), examineeLe: h(40) }),
];
const FERMEES = Array.from({ length: 23 }, (_, i) => {
  const n = i + 1;
  return reclamation({
    orderId: `ord-f${String(n).padStart(2, '0')}`,
    faute: FAUTES[(n + 3) % 5]!,
    etat: n % 3 === 0 ? 'resolved' : 'closed_no_payout',
    // Opened in another order than they closed, so the two orders differ.
    ouverteLe: h(50 - n),
    examineeLe: h(55),
    fermeeLe: h(60 + n),
  });
});
const PAGE_LIVRE = [...OUVERTES, ...FERMEES];
const PAGE_IDS = PAGE_LIVRE.map((c) => c.claim.orderId);
const id = (n: number): string => `ord-f${String(n).padStart(2, '0')}`;

describe('the desk reads only what it shows: the open claims and one closed page at a time', () => {
  it('first view: the figures, every open claim, the 20 last closed; « plus anciennes » brings the 3 others and goes away', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS, [CLE_C_SLOT]: 'cle-c' });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: PAGE_LIVRE, mode: 'pages' });
    const fil = wire([livre.route, shop([ligne('ord-p01', { etat: 'fait' }), ligne('ord-f02', { etat: 'en_cours' })])]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows('ord-p01'), 'the first view');

    expect([...livre.lus].sort(), 'exactly the three reads, never the whole book').toEqual(
      ['/claims?part=closed&limit=20', '/claims?part=open', '/fund'].sort(),
    );
    expect(fois(screen, 'ord-p01'), 'an open claim is never behind a page').toBe(1);
    expect(fois(screen, 'ord-p02')).toBe(1);
    for (let n = 4; n <= 23; n += 1) expect(fois(screen, id(n)), `${id(n)} on the first page`).toBe(1);
    for (let n = 1; n <= 3; n += 1) expect(fois(screen, id(n)), `${id(n)} waits on the next page`).toBe(0);

    // In a group: the open claims first, then the newest closed first.
    const textes = screen.texts();
    const vendeur = ['ord-p01', id(22), id(17), id(12), id(7)].map((x) => textes.indexOf(x));
    expect(vendeur.every((v, i) => v >= 0 && (i === 0 || v > vendeur[i - 1]!)), `seller group order: ${JSON.stringify(vendeur)}`).toBe(true);

    expect(screen.canPress(PLUS_ANCIENNES), 'older claims remain: the way to them').toBe(true);
    await screen.press(PLUS_ANCIENNES);
    await attendre(screen, () => screen.shows(id(1)), 'the older page');

    expect(livre.lus.filter((l) => l.startsWith('/claims?part=closed&limit=20&before=')), 'the next page, from where the last one stopped').toEqual([
      '/claims?part=closed&limit=20&before=4',
    ]);
    expect(livre.lus.includes('/claims'), 'the whole book was read').toBe(false);
    for (const x of PAGE_IDS) expect(fois(screen, x), `${x} shows once`).toBe(1);
    expect(screen.shows(PLUS_ANCIENNES), 'the end is reached: no button that leads nowhere').toBe(false);
    // The older seller claim gets its refund from the read already made.
    expect(carte(screen, id(2), PAGE_IDS)).toContain('Remboursement en cours');
    expect(fil.calls.filter((c) => c.path === '/checkout/dispatch').length, 'one Shop+ read for the whole view').toBe(1);
    expect(screen.canPress('Nouvelle réclamation'), 'the tree survived the tap').toBe(true);
    screen.unmount();
  }, 30_000);

  it('an older page that fails says the book did not answer, keeps what is shown, and keeps the button', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    let panne = true;
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: PAGE_LIVRE, mode: 'pages' });
    const enPanne: Route = (path, _b, search) => (panne && path === '/claims' && search.has('before') ? { status: 503, json: {} } : null);
    wire([enPanne, livre.route]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.canPress(PLUS_ANCIENNES), 'the button');
    await screen.press(PLUS_ANCIENNES);
    await attendre(screen, () => screen.shows(INJOIGNABLE), 'the failed page said');
    expect(fois(screen, 'ord-p01'), 'what was shown is kept').toBe(1);
    expect(fois(screen, id(23))).toBe(1);
    expect(fois(screen, id(1))).toBe(0);
    expect(screen.canPress(PLUS_ANCIENNES), 'the way to try again').toBe(true);
    panne = false;
    await screen.press(PLUS_ANCIENNES);
    await attendre(screen, () => screen.shows(id(1)), 'the older page on the second try');
    expect(screen.shows(INJOIGNABLE)).toBe(false);
    expect(screen.shows(PLUS_ANCIENNES)).toBe(false);
    for (const x of PAGE_IDS) expect(fois(screen, x), `${x} shows once`).toBe(1);
    screen.unmount();
  }, 30_000);

  it('against the book still live today (it ignores the page and answers all): every claim once, no button', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: PAGE_LIVRE, mode: 'ancien' });
    wire([livre.route]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows('ord-p01'), 'the first view');
    expect([...livre.lus].sort(), 'the desk asked for pages').toEqual(['/claims?part=closed&limit=20', '/claims?part=open', '/fund'].sort());
    for (const x of PAGE_IDS) expect(fois(screen, x), `${x} shows once`).toBe(1);
    expect(screen.shows(PLUS_ANCIENNES), 'no « see older » that leads nowhere').toBe(false);
    expect(screen.shows('ne s’affichent pas') || screen.shows("ne s'affichent pas"), 'nothing was dropped as unreadable').toBe(false);
    screen.unmount();
  }, 30_000);

  it('a claim settled between the two reads shows once, as settled', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    const reglee = { orderId: 'ord-r01', faute: 'seller' as const, ouverteLe: h(1) };
    const encore = reclamation({ orderId: 'ord-r02', faute: 'buyer', etat: 'opened', ouverteLe: h(2) });
    // The open claims are read just before the founder settles ord-r01; the
    // closed page and the figures just after: each answer is the real book's
    // at its own moment.
    const avant = livreFondsSubstitut({ cle: CLE_FONDS, claims: [reclamation({ ...reglee, etat: 'opened' }), encore], mode: 'pages' });
    const apres = livreFondsSubstitut({
      cle: CLE_FONDS,
      claims: [reclamation({ ...reglee, etat: 'resolved', examineeLe: h(3), fermeeLe: h(4) }), encore],
      mode: 'pages',
    });
    const parMoment: Route = (path, body, search, headers) =>
      (path === '/claims' && search.get('part') === 'open' ? avant : apres).route(path, body, search, headers);
    wire([parMoment]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.shows('ord-r02'), 'the first view');
    expect([...avant.lus, ...apres.lus].sort()).toEqual(['/claims?part=closed&limit=20', '/claims?part=open', '/fund'].sort());
    expect(fois(screen, 'ord-r01'), 'in both answers, shown once').toBe(1);
    const sa = carte(screen, 'ord-r01', ['ord-r01', 'ord-r02']);
    expect(sa, 'as the book now holds it').toContain('Réglée');
    expect(sa).not.toContain('Ouverte');
    expect(fois(screen, 'ord-r02')).toBe(1);
    screen.unmount();
  }, 30_000);
});

describe('the Commandes tab files a claimed order under « Incidents » from two bounded reads', () => {
  const COMMANDE = {
    productPhotoRef: '',
    offerVersion: 'ov-1',
    paymentMode: 'FULL_PREPAY',
    zoneTo: 'Gounghin',
    sellerBasePrice: 9_000,
    supplierId: 'sup-1',
    supplierResolved: true,
    registeredAt: '2026-11-20T07:00:01.000Z',
    paidAt: '2026-11-20T07:00:00.000Z',
  };
  const ORDERS = [
    { ...COMMANDE, orderId: 'ord-ouverte', productVersionId: 'pv-1', productName: 'Pagne wax' },
    { ...COMMANDE, orderId: 'ord-fermee', productVersionId: 'pv-2', productName: 'Sac en cuir' },
    { ...COMMANDE, orderId: 'ord-vieille', productVersionId: 'pv-3', productName: 'Bazin riche' },
  ];
  const ops: Route[] = [
    (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: ORDERS } } : null),
    (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  ];
  /** One open claim; 101 closed: ord-vieille first of all, ord-fermee last. */
  const LIVRE = [
    reclamation({ orderId: 'ord-ouverte', faute: 'seller', etat: 'opened', ouverteLe: h(1) }),
    reclamation({ orderId: 'ord-vieille', faute: 'buyer', etat: 'closed_no_payout', ouverteLe: h(2), fermeeLe: h(10) }),
    ...Array.from({ length: 99 }, (_, i) =>
      reclamation({ orderId: `ord-k${String(i).padStart(3, '0')}`, faute: 'unresolved', etat: 'closed_no_payout', ouverteLe: h(3), fermeeLe: h(11 + i) }),
    ),
    reclamation({ orderId: 'ord-fermee', faute: 'seller', etat: 'resolved', ouverteLe: h(4), examineeLe: h(5), fermeeLe: h(200) }),
  ];

  it('the open claims and the 100 last closed — never the whole book, never the figures', async () => {
    storage({ [OPS_SLOT]: 'cle-ops', [FONDS_SLOT]: CLE_FONDS });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: LIVRE, mode: 'pages' });
    wire([...ops, livre.route]);
    const screen = await mountEcran(<SCommandesReel />);
    await attendre(screen, () => livre.lus.length >= 2, 'the claims read');
    await screen.settle();

    expect([...livre.lus].sort(), 'two bounded reads').toEqual(['/claims?part=closed&limit=100', '/claims?part=open']);
    await screen.press('Incidents');
    expect(screen.shows('Pagne wax'), 'an order with an open claim is an incident').toBe(true);
    expect(screen.shows('Sac en cuir'), 'an order whose claim just closed stays an incident').toBe(true);
    expect(screen.shows('Pour voir les incidents ici'), 'the book was read: no « not linked »').toBe(false);
    // The bound, said in the code: a claim closed before the last 100 no
    // longer files its order here.
    expect(screen.shows('Bazin riche')).toBe(false);
    await screen.press('À traiter');
    expect(screen.shows('Bazin riche')).toBe(true);
    screen.unmount();
  }, 30_000);

  it('against the book still live today, both answers are the whole book: every claimed order is an incident', async () => {
    storage({ [OPS_SLOT]: 'cle-ops', [FONDS_SLOT]: CLE_FONDS });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: LIVRE, mode: 'ancien' });
    wire([...ops, livre.route]);
    const screen = await mountEcran(<SCommandesReel />);
    await attendre(screen, () => livre.lus.length >= 2, 'the claims read');
    await screen.settle();
    expect(livre.lus.includes('/fund'), 'the figures are not this tab’s business').toBe(false);
    await screen.press('Incidents');
    for (const nom of ['Pagne wax', 'Sac en cuir', 'Bazin riche']) expect(screen.shows(nom), nom).toBe(true);
    screen.unmount();
  }, 30_000);
});
