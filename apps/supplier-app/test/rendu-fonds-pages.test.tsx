import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, type ReactTestInstance } from 'react-test-renderer';
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
const INTROUVABLE = "Cette commande n'est pas dans la liste lue chez Shop+. Son remboursement ne peut donc pas être lu ici.";
const ILLISIBLE = "Son remboursement n'a pas pu être lu. Réessayez, ou regardez la commande dans Commandes.";
const PLUS_ANCIENNES = 'Voir les réclamations plus anciennes';
const INJOIGNABLE = 'Le registre ne répond pas';
const LECTURE = 'Lecture du remboursement chez Shop+…';

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

/** Holds back every request whose address `aRetenir` names until `lacher()`;
 *  each is then answered by the book as it is AT THAT MOMENT, as a slow
 *  network does. Only `fetch` is wrapped. `demandes` is every address the
 *  screen asked for, in order, at the moment it asked. */
function retenir(aRetenir: (url: string) => boolean): { readonly demandes: string[]; lacher(): void } {
  const reel = globalThis.fetch;
  const demandes: string[] = [];
  let ouvrir: () => void = () => undefined;
  const tenue = new Promise<void>((r) => {
    ouvrir = r;
  });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    demandes.push(String(input));
    if (aRetenir(String(input))) await tenue;
    return reel(input, init);
  }) as typeof fetch;
  return { demandes, lacher: () => ouvrir() };
}

/** Two taps on one control before the screen redraws, as a hurried thumb
 *  does: both reach the handler the screen drew. */
async function doubleTape(screen: Screen, label: string): Promise<void> {
  const porteurs = screen.tree.root.findAll((n) => n.children.some((c) => typeof c === 'string' && c.includes(label)));
  expect(porteurs.length, `« ${label} » on screen`).toBeGreaterThan(0);
  let n: ReactTestInstance | null = porteurs[0]!;
  while (n !== null && typeof n.props['onPress'] !== 'function') n = n.parent;
  expect(n, `« ${label} » can be pressed`).not.toBeNull();
  const onPress = n!.props['onPress'] as () => void;
  await act(async () => {
    onPress();
    onPress();
    await Promise.resolve();
  });
  await screen.settle();
}

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

  it('the closed page is asked only once the open claims have answered: a claim closed in between shows once, closed', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    const x = { orderId: 'ord-x01', faute: 'buyer' as const, ouverteLe: h(1) };
    const reste = reclamation({ orderId: 'ord-x02', faute: 'buyer', etat: 'opened', ouverteLe: h(2) });
    const avant = livreFondsSubstitut({ cle: CLE_FONDS, claims: [reclamation({ ...x, etat: 'opened' }), reste], mode: 'pages' });
    const apres = livreFondsSubstitut({ cle: CLE_FONDS, claims: [reclamation({ ...x, etat: 'closed_no_payout', fermeeLe: h(3) }), reste], mode: 'pages' });
    let maintenant = avant;
    wire([(path, body, search, headers) => maintenant.route(path, body, search, headers)]);
    const reseau = retenir((u) => u.includes('part=open'));
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => reseau.demandes.some((u) => u.includes('part=open')), 'the open claims asked');
    expect(reseau.demandes.filter((u) => u.includes('part=closed')), 'no closed page before the open claims answer').toEqual([]);
    // The founder closes ord-x01 while the open claims are on their way.
    maintenant = apres;
    reseau.lacher();
    await attendre(screen, () => screen.shows('ord-x02'), 'the first view');
    expect(fois(screen, 'ord-x01'), 'a claim closed between the reads is never in neither').toBe(1);
    const sa = carte(screen, 'ord-x01', ['ord-x01', 'ord-x02']);
    expect(sa, 'as the book now holds it').toContain('Classée — rien à payer');
    expect(sa).not.toContain('Ouverte');
    screen.unmount();
  }, 30_000);

  it('a first view with no seller-fault claim, then an older page that brings one: Shop+ is read once, and the card gets its refund', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS, [CLE_C_SLOT]: 'cle-c' });
    const g = (n: number): string => `ord-g${String(n).padStart(2, '0')}`;
    // 23 closed buyer claims, except g02 (on the older page), a seller's.
    const livreG = Array.from({ length: 23 }, (_, i) =>
      reclamation({ orderId: g(i + 1), faute: i + 1 === 2 ? 'seller' : 'buyer', etat: 'closed_no_payout', ouverteLe: h(i + 1), fermeeLe: h(60 + i) }),
    );
    const idsG = livreG.map((c) => c.claim.orderId);
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: livreG, mode: 'pages' });
    const fil = wire([livre.route, shop([ligne(g(2), { etat: 'fait' })])]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.canPress(PLUS_ANCIENNES), 'the first view');
    expect(screen.shows(g(2))).toBe(false);
    expect(fil.calls.some((c) => c.path === '/checkout/dispatch'), 'no seller-fault claim shown: nothing asked of Shop+').toBe(false);
    await screen.press(PLUS_ANCIENNES);
    await attendre(screen, () => screen.shows('Cliente remboursée'), 'the refund of the older seller-fault claim');
    expect(carte(screen, g(2), idsG)).toContain('Cliente remboursée');
    expect(screen.shows(LECTURE), 'never « reading » for ever').toBe(false);
    expect(fil.calls.filter((c) => c.path === '/checkout/dispatch').length, 'one Shop+ read').toBe(1);
    for (const x of idsG) expect(fois(screen, x), `${x} shows once`).toBe(1);
    screen.unmount();
  }, 30_000);

  it('« Actualiser » landing while an older page is on its way, after a claim was settled: no gap, nothing twice', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    const avant = livreFondsSubstitut({ cle: CLE_FONDS, claims: PAGE_LIVRE, mode: 'pages' });
    const p01Reglee = reclamation({ orderId: 'ord-p01', faute: 'seller', etat: 'resolved', ouverteLe: h(30), examineeLe: h(90), fermeeLe: h(100) });
    const apres = livreFondsSubstitut({ cle: CLE_FONDS, claims: [p01Reglee, ...PAGE_LIVRE.slice(1)], mode: 'pages' });
    let maintenant = avant;
    wire([(path, body, search, headers) => maintenant.route(path, body, search, headers)]);
    const reseau = retenir((u) => u.includes('before='));
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.canPress(PLUS_ANCIENNES), 'the first view');
    await screen.press(PLUS_ANCIENNES);
    expect(reseau.demandes.filter((u) => u.includes('before=4')), 'the page before 4 is on its way').toHaveLength(1);
    // ord-p01 is settled, then the reload lands before that page does.
    maintenant = apres;
    await screen.press('Actualiser la liste');
    await attendre(screen, () => screen.shows(id(5)) && !screen.shows(id(4)), 'the reload (ord-p01 is now the newest closed claim)');
    reseau.lacher();
    await attendre(screen, () => apres.lus.some((l) => l.includes('before=4')), 'the late page answered');
    await screen.settle();
    expect(fois(screen, id(3)), 'a page asked before the reload is not added after it').toBe(0);
    expect(screen.canPress(PLUS_ANCIENNES), 'the way to what the reload left older').toBe(true);
    await screen.press(PLUS_ANCIENNES);
    await attendre(screen, () => screen.shows(id(1)), 'the older page');
    expect(apres.lus.filter((l) => l.includes('before=')).sort()).toEqual(['/claims?part=closed&limit=20&before=4', '/claims?part=closed&limit=20&before=5']);
    for (const x of PAGE_IDS) expect(fois(screen, x), `${x} shows once`).toBe(1);
    expect(carte(screen, 'ord-p01', PAGE_IDS)).toContain('Réglée');
    expect(screen.shows(PLUS_ANCIENNES), 'the end is reached').toBe(false);
    screen.unmount();
  }, 30_000);

  it('an older page that repeats a claim already shown: it shows once', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: PAGE_LIVRE, mode: 'pages' });
    // The real book never gives one closing number twice. This one answer is
    // forged, the page asked one number too high, only to hold the desk's
    // own rule: a claim already on screen is never added again.
    const unDeTrop: Route = (path, _b, search, headers) =>
      path === '/claims' && search.get('before') === '4'
        ? livre.repondre('/claims', 'part=closed&limit=20&before=5', headers['authorization'])
        : null;
    wire([unDeTrop, livre.route]);
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.canPress(PLUS_ANCIENNES), 'the first view');
    expect(fois(screen, id(4))).toBe(1);
    await screen.press(PLUS_ANCIENNES);
    await attendre(screen, () => screen.shows(id(1)), 'the older page');
    for (const x of PAGE_IDS) expect(fois(screen, x), `${x} shows once`).toBe(1);
    expect(screen.shows(PLUS_ANCIENNES)).toBe(false);
    screen.unmount();
  }, 30_000);

  it('two quick taps on « Voir les réclamations plus anciennes » send ONE page read', async () => {
    storage({ [FONDS_SLOT]: CLE_FONDS });
    const livre = livreFondsSubstitut({ cle: CLE_FONDS, claims: PAGE_LIVRE, mode: 'pages' });
    wire([livre.route]);
    const reseau = retenir((u) => u.includes('before='));
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.canPress(PLUS_ANCIENNES), 'the first view');
    await doubleTape(screen, PLUS_ANCIENNES);
    expect(reseau.demandes.filter((u) => u.includes('before=')), 'one read for two taps').toHaveLength(1);
    reseau.lacher();
    await attendre(screen, () => screen.shows(id(1)), 'the older page');
    for (const x of PAGE_IDS) expect(fois(screen, x), `${x} shows once`).toBe(1);
    expect(screen.shows(PLUS_ANCIENNES)).toBe(false);
    expect(screen.canPress('Nouvelle réclamation'), 'the tree survived the taps').toBe(true);
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

  it('the closed claims are asked only once the open ones have answered: an order whose claim closes in between stays an incident', async () => {
    storage({ [OPS_SLOT]: 'cle-ops', [FONDS_SLOT]: CLE_FONDS });
    const x = { orderId: 'ord-ouverte', faute: 'seller' as const, ouverteLe: h(1) };
    const avant = livreFondsSubstitut({ cle: CLE_FONDS, claims: [reclamation({ ...x, etat: 'opened' })], mode: 'pages' });
    const apres = livreFondsSubstitut({
      cle: CLE_FONDS,
      claims: [reclamation({ ...x, etat: 'resolved', examineeLe: h(2), fermeeLe: h(3) })],
      mode: 'pages',
    });
    let maintenant = avant;
    wire([...ops, (path, body, search, headers) => maintenant.route(path, body, search, headers)]);
    const reseau = retenir((u) => u.includes('part=open'));
    const screen = await mountEcran(<SCommandesReel />);
    await attendre(screen, () => reseau.demandes.some((u) => u.includes('part=open')), 'the open claims asked');
    expect(reseau.demandes.filter((u) => u.includes('part=closed')), 'no closed claims asked before the open ones answer').toEqual([]);
    // The founder settles ord-ouverte while the open claims are on their way.
    maintenant = apres;
    reseau.lacher();
    await attendre(screen, () => avant.lus.length + apres.lus.length >= 2, 'both claim reads answered');
    await screen.settle();
    await screen.press('Incidents');
    expect(screen.shows('Pagne wax'), 'its claim is in one answer at least').toBe(true);
    screen.unmount();
  }, 30_000);
});
