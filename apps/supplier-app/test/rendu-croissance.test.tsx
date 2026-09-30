import React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { installerDocument, retirerDocument } from './doubles/document';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';
import { SOperations } from '../src/operations/screen';
import { SAccueilReel } from '../src/accueil/screen';
import { SCommandesReel } from '../src/commandes/screen';
import { SProduitsReal } from '../src/v2/produits-real';
import { initialState } from '../src/v2/machine';

/**
 * CROISSANCE-1 · CATALOGUE-PAGES-1 (AUDIT-B+2 slice 5: F-04 d, F-05, F-89 c)
 * — the screens that now read a page at a time, and the refresh that now rests
 * while nobody looks, WALKED on the real screens.
 *
 * The four questions, each asked below of the screen that changed: did the tree
 * survive · is the next act present, pressable and wired · does an act that
 * cannot finish leave a way out · can he reach the next step.
 *
 * Only host boundaries are doubled: `fetch` (through `wire`), the browser
 * storage, and — new here — the browser `document`, whose bounds are written
 * at the top of `doubles/document.ts`. The paging stand-ins below answer the
 * way the real Worker does (`pageDeLIndex`, `pageDuCarnet`): rows after the
 * cursor, `next` while more remain, and a page may be SHORTER than asked — the
 * Worker caps every page. The real Worker's paging is proven on workerd in
 * `services/offer-service/test/catalogue-pages.e2e.test.ts`.
 */

const CODE = 'BF-QZHG-XAUP-B7QL-UCRK';
const OPS = 'cle-ops-fondateur';
const PHOTOS = 'cle-photos-fondateur';
const OPS_SLOT = 'boutik.operateur.cle';
const PHOTOS_SLOT = 'boutik.photos.cle';
const MOI = 'supplier-founder-001';
const COUPE = 'supplier-coupe-005';
const REF = 'media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REF2 = 'media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Rows after the cursor, `next` while more remain — the Worker's paging, with its own page cap. */
function paginer<T extends Record<string, unknown>>(
  rows: readonly T[],
  cle: keyof T,
  search: URLSearchParams,
  plafond: number,
): { page: T[]; next?: string } {
  const demande = Number(search.get('limit') ?? rows.length);
  const cursor = search.get('cursor');
  const start = cursor === null ? 0 : rows.findIndex((r) => r[cle] === cursor) + 1;
  const page = rows.slice(start, start + Math.min(demande, plafond));
  const end = start + page.length;
  return end < rows.length ? { page, next: String(page[page.length - 1]![cle]) } : { page };
}

async function minute(screen: Screen): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  await screen.settle();
}

beforeEach(() => {
  wiredEnv();
});

afterEach(() => {
  vi.useRealTimers();
  retirerDocument();
  delete process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'];
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
  delete (globalThis as { fetch?: unknown }).fetch;
});

/* ─────────────────────────── his page ─────────────────────────── */

const commande = (orderId: string, productName: string) => ({
  orderId, productName, productVersionId: `pv-${orderId}`, offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY', paidAt: '2026-09-20T07:00:00.000Z', sellerBasePrice: 10_000,
});
const produit = (i: number) => ({
  offerId: `offer-${String(i).padStart(3, '0')}`, productVersionId: `pv-${i}`, name: `Produit numéro ${i}`,
  category: 'fashion_bags_fabrics', basePrice: 6_000, available: 4, assetRefs: [],
});

describe('F-04 d — his minute refresh rests while his tab is hidden', () => {
  it('visible: every minute · hidden: nothing, for five minutes · back: one read AT ONCE, and the order that came meanwhile is on his screen', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const doc = installerDocument();
    storage({ 'boutik.fournisseur.code': CODE });
    const commandes = [commande('ord-1', 'Bazin')];
    const w = wire([
      (path) => (path === '/fulfillment/mine' ? { status: 200, json: { ok: true, orders: commandes as never } } : null),
      (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    const lus = (): number => w.calls.filter((c) => c.path === '/fulfillment/mine').length;

    const avant = lus();
    await minute(screen);
    expect(lus(), 'while he looks, the minute refresh still runs').toBe(avant + 1);

    await act(async () => { doc.cacher(); });
    const cache = lus();
    for (let i = 0; i < 5; i += 1) await minute(screen);
    expect(lus(), 'a hidden tab reads NOTHING').toBe(cache);

    commandes.push(commande('ord-2', 'Pagne tissé'));
    await act(async () => { doc.montrer(); });
    await screen.settle();
    expect(lus(), 'back in front of him: one read at once, not a minute later').toBe(cache + 1);
    expect(screen.shows('Pagne tissé'), `the order paid while he was away is there. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    await minute(screen);
    expect(lus()).toBe(cache + 2);
    screen.unmount();
    expect(doc.abonnes, 'leaving the screen lets go of the page').toBe(0);
  });
});

describe('F-05 — « Mes produits » reads a page at a time and shows them all', () => {
  it('45 products over two pages: the one only on page two is on his screen', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const produits = Array.from({ length: 45 }, (_, i) => produit(i + 1));
    const w = wire([
      (path, _b, search) => {
        if (path !== '/offers/mine') return null;
        const { page, next } = paginer(produits, 'offerId', search, 40);
        return { status: 200, json: next === undefined ? { items: page as never } : { items: page as never, next } };
      },
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    expect(w.calls.filter((c) => c.path === '/offers/mine')).toHaveLength(2);
    expect(screen.shows('Produit numéro 45'), `page two reached his screen. On screen: ${JSON.stringify(screen.texts().slice(0, 12))}`).toBe(true);
    expect(screen.shows('Produit numéro 1')).toBe(true);
    expect(screen.shows('Une partie seulement de vos produits est affichée.')).toBe(false);
    screen.unmount();
  });

  it('a list longer than the pages he may read says it is partial — never a short list dressed as the whole', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    let n = 0;
    wire([
      (path) => {
        if (path !== '/offers/mine') return null;
        n += 1;
        return { status: 200, json: { items: [produit(n)] as never, next: `offer-${String(n).padStart(3, '0')}` } };
      },
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    expect(screen.shows('Une partie seulement de vos produits est affichée.'), `on screen: ${JSON.stringify(screen.texts().slice(0, 8))}`).toBe(true);
    expect(screen.shows('Produit numéro 1')).toBe(true);
    screen.unmount();
  });
});

/* ─────────────────────────── his console ─────────────────────────── */

const ordre = (i: number) => ({
  orderId: `ord-${String(i).padStart(3, '0')}`, productVersionId: `pv-${i}`, productName: `Article ${i}`,
  productPhotoRef: '', offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
  paidAt: `2026-09-20T0${i}:00:00.000Z`, zoneTo: 'Gounghin', sellerBasePrice: 10_000,
  supplierId: MOI, supplierResolved: true, registeredAt: `2026-09-20T0${i}:00:01.000Z`,
});

function autour(codes: () => Record<string, unknown>[]): Route[] {
  return [
    (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes: codes() as never } } : null),
    (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  ];
}

describe('F-89 c — his board arrives in pages and rests while hidden', () => {
  it('three orders on pages of two: every one is on his board; hidden, the board reads nothing; back, it reads at once', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const doc = installerDocument();
    storage({ [OPS_SLOT]: OPS });
    const ordres = [ordre(1), ordre(2), ordre(3)];
    const w = wire([
      (path, _b, search) => {
        if (path !== '/fulfillment/orders') return null;
        const { page, next } = paginer(ordres, 'orderId', search, 2);
        return { status: 200, json: next === undefined ? { ok: true, orders: page as never } : { ok: true, orders: page as never, next } };
      },
      ...autour(() => []),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    const lus = (): number => w.calls.filter((c) => c.path === '/fulfillment/orders').length;
    expect(lus(), 'one board read = two pages').toBe(2);
    // The board counts the orders waiting on a call: three means page two was
    // joined to page one — a board that stopped at the first page says two.
    expect(screen.shows('3 commande(s) attendent un appel'), `on screen: ${JSON.stringify(screen.texts().slice(0, 8))}`).toBe(true);
    expect(screen.shows('Lecture partielle : le carnet est très long')).toBe(false);

    await act(async () => { doc.cacher(); });
    for (let i = 0; i < 3; i += 1) await minute(screen);
    expect(lus(), 'a hidden console reads nothing').toBe(2);
    await act(async () => { doc.montrer(); });
    await screen.settle();
    expect(lus(), 'back: the whole board, at once').toBe(4);
    screen.unmount();
  });

  it('a book longer than the pages he may read is said to be partial on the board', async () => {
    storage({ [OPS_SLOT]: OPS });
    let n = 0;
    wire([
      (path) => {
        if (path !== '/fulfillment/orders') return null;
        n += 1;
        return { status: 200, json: { ok: true, orders: [{ ...ordre((n % 9) + 1), orderId: `ord-long-${n}` }] as never, next: `ord-long-${n}` } };
      },
      ...autour(() => []),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    expect(screen.shows('Lecture partielle : le carnet est très long, certaines commandes ne sont pas affichées.'), `on screen: ${JSON.stringify(screen.texts().slice(0, 10))}`).toBe(true);
    screen.unmount();
  });
});

/* The two other screens that read the same book (verifier MINOR 7). */

const PARTIEL = 'Lecture partielle : le carnet est très long, certaines commandes ne sont pas affichées.';

/** Pages of two over `ordres`; `sansFin` answers `next` forever — a book past his page cap. */
function carnet(ordres: readonly ReturnType<typeof ordre>[], sansFin: boolean): Route {
  let n = 0;
  return (path, _b, search) => {
    if (path !== '/fulfillment/orders') return null;
    if (sansFin) {
      n += 1;
      return { status: 200, json: { ok: true, orders: [{ ...ordre((n % 9) + 1), orderId: `ord-long-${n}` }] as never, next: `ord-long-${n}` } };
    }
    const { page, next } = paginer(ordres, 'orderId', search, 2);
    return { status: 200, json: next === undefined ? { ok: true, orders: page as never } : { ok: true, orders: page as never, next } };
  };
}

describe('F-89 c — Accueil counts the whole book across pages, and says when it could not', () => {
  it('three orders on pages of two: « 3 » paid sales, no partial line — the tree lives and « Ouvrir les Commandes » is there', async () => {
    storage({ [OPS_SLOT]: OPS });
    const w = wire([carnet([ordre(1), ordre(2), ordre(3)], false)]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey={OPS} />);
    expect(w.calls.filter((c) => c.path === '/fulfillment/orders'), 'one read = two pages').toHaveLength(2);
    expect(screen.shows('Article 3'), `page two reached his Accueil. On screen: ${JSON.stringify(screen.texts().slice(0, 14))}`).toBe(true);
    expect(screen.shows(PARTIEL)).toBe(false);
    expect(screen.shows('Ouvrir les Commandes'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('a book longer than the pages he may read: the counts stand, and the line says they are not everything', async () => {
    storage({ [OPS_SLOT]: OPS });
    wire([carnet([], true)]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey={OPS} />);
    expect(screen.shows(PARTIEL), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Ouvrir les Commandes'), 'the way on to Commandes survives the partial read').toBe(true);
    screen.unmount();
  });
});

describe('F-89 c — Commandes shows the whole book across pages, and says when it could not', () => {
  it('three orders on pages of two: the one only on page two is in his book, no partial banner', async () => {
    storage({ [OPS_SLOT]: OPS });
    const w = wire([carnet([ordre(1), ordre(2), ordre(3)], false), ...autour(() => [])]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(w.calls.filter((c) => c.path === '/fulfillment/orders'), 'one read = two pages').toHaveLength(2);
    expect(screen.shows('Article 3'), `page two reached Commandes. On screen: ${JSON.stringify(screen.texts().slice(0, 16))}`).toBe(true);
    expect(screen.shows('Article 1')).toBe(true);
    expect(screen.shows(PARTIEL)).toBe(false);
    screen.unmount();
  });

  it('a book longer than the pages he may read: the banner says so above the orders it did read', async () => {
    storage({ [OPS_SLOT]: OPS });
    wire([carnet([], true), ...autour(() => [])]);
    const screen = await mountEcran(<SCommandesReel />);
    await screen.settle();
    expect(screen.shows(PARTIEL), `on screen: ${JSON.stringify(screen.texts().slice(0, 16))}`).toBe(true);
    expect(screen.shows('Article 2'), 'the orders it did read are still in his book').toBe(true);
    screen.unmount();
  });
});

describe('F-05 — a cut that cannot finish taking his products off sale SAYS so, and « Terminer » finishes it', () => {
  it('the door shuts, the product walk stops half-way: his row says what is still on sale; « Terminer » walks the rest and the line leaves', async () => {
    storage({ [OPS_SLOT]: OPS });
    let coupe = false;
    let suitePanne = true;
    const w = wire([
      (path) => {
        if (path !== '/fulfillment/supplier-code/revoke') return null;
        coupe = true;
        return { status: 200, json: { ok: true, status: 'revoked', supplierId: COUPE, produits: 20, suite: 'offer-019' } };
      },
      (path) => {
        if (path !== '/fulfillment/supplier-acces/suite') return null;
        if (suitePanne) return { status: 503, json: { ok: false } };
        return { status: 200, json: { ok: true, supplierId: COUPE, produits: 7 } };
      },
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
      ...autour(() => [{ supplierId: COUPE, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true, ...(coupe ? { revokedAt: '2026-09-27T08:00:00.000Z' } : {}) }]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press("Couper l'accès");
    await screen.settle();
    expect(screen.shows('Son accès est coupé, mais certains de ses produits sont encore en vente.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Terminer'), 'the way out is there and pressable').toBe(true);

    suitePanne = false;
    await screen.press('Terminer');
    await screen.settle();
    const fin = w.calls.filter((c) => c.path === '/fulfillment/supplier-acces/suite').at(-1);
    expect(fin?.body, '« Terminer » walks from the start, and names the CUT — never a second code').toEqual({ supplierId: COUPE, acte: 'revoke' });
    expect(w.calls.filter((c) => c.path === '/fulfillment/supplier-code/revoke'), 'the door act itself ran once').toHaveLength(1);
    expect(screen.shows('Son accès est coupé, mais certains de ses produits sont encore en vente.')).toBe(false);
    screen.unmount();
  });
});

describe('F-05 — the unfinished-walk line outlives every other act and a reload (verifier MAJOR 2)', () => {
  it('A\'s walk stops; he then cuts B and reloads the console: A\'s line and « Terminer » are still there, and leave only when it finishes', async () => {
    const store = storage({ [OPS_SLOT]: OPS });
    const coupes = new Set<string>();
    let suitePanne = true;
    wire([
      (path, body) => {
        if (path !== '/fulfillment/supplier-code/revoke') return null;
        const id = String(body?.['supplierId'] ?? '');
        coupes.add(id);
        // A's walk has more pages; B's finishes in one
        return { status: 200, json: { ok: true, status: 'revoked', supplierId: id, produits: 20, ...(id === COUPE ? { suite: 'offer-019' } : {}) } };
      },
      (path) => {
        if (path !== '/fulfillment/supplier-acces/suite') return null;
        return suitePanne ? { status: 503, json: { ok: false } } : { status: 200, json: { ok: true, supplierId: COUPE, produits: 4 } };
      },
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
      ...autour(() => [COUPE, 'supplier-autre-006'].map((id) => ({
        supplierId: id, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true, ...(coupes.has(id) ? { revokedAt: '2026-09-27T08:00:00.000Z' } : {}),
      }))),
    ]);
    const LIGNE = 'Son accès est coupé, mais certains de ses produits sont encore en vente.';
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press("Couper l'accès", 0); // A first
    await screen.settle();
    expect(screen.shows(LIGNE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    await screen.press("Couper l'accès", 0); // then B — the only « Couper » left
    await screen.settle();
    expect(screen.shows(LIGNE), 'another act did not erase A\'s line').toBe(true);
    expect(store.has('boutik.produits.inacheves'), 'the device keeps it').toBe(true);
    screen.unmount();

    const apres = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    expect(apres.shows(LIGNE), 'a reload did not erase it either').toBe(true);
    suitePanne = false;
    await apres.press('Terminer');
    await apres.settle();
    expect(apres.shows(LIGNE), 'finished: the line leaves').toBe(false);
    expect(store.has('boutik.produits.inacheves')).toBe(false);
    apres.unmount();
  });
});

describe('F-05 — a cut whose product walk failed outright is not called finished', () => {
  it('the door shuts but the service could not walk his products at all (produits: null): his row says so', async () => {
    storage({ [OPS_SLOT]: OPS });
    wire([
      (path) => (path === '/fulfillment/supplier-code/revoke' ? { status: 200, json: { ok: true, status: 'revoked', supplierId: COUPE, produits: null } } : null),
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
      ...autour(() => [{ supplierId: COUPE, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press("Couper l'accès");
    await screen.settle();
    expect(screen.shows('Son accès est coupé, mais certains de ses produits sont encore en vente.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Terminer')).toBe(true);
    screen.unmount();
  });
});

describe('F-05 — an erase that stops between pages destroys the photographs of what it DID erase', () => {
  it('page one erased two products, page two failed: both photographs are destroyed, and his row says to press again', async () => {
    // the media port resolves only on a wired build (the upload key is a build
    // setting; the revoke key is the one he typed — PHOTOS below)
    process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = 'cle-media-upload';
    storage({ [OPS_SLOT]: OPS, [PHOTOS_SLOT]: PHOTOS });
    let pages = 0;
    const w = wire([
      (path, body) => {
        if (path !== '/fulfillment/supplier/effacer') return null;
        if (body?.['etape'] === 'verifier') return { status: 200, json: { ok: true, supplierId: COUPE, verifie: true } };
        pages += 1;
        if (pages === 1) return { status: 200, json: { ok: true, supplierId: COUPE, supprimes: 2, refs: [REF, REF2], fini: false, suite: 'offer-voisin' } };
        return { status: 503, json: { ok: false } };
      },
      (path, body, _s, headers) => {
        if (path !== '/media/revoke') return null;
        if (headers['x-write-key'] !== PHOTOS) return { status: 401, json: { error: 'unauthorized' } };
        return { status: 200, json: { status: 'revoked', ref: String(body?.['ref'] ?? '') } };
      },
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
      ...autour(() => [{ supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' }]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press('Supprimer définitivement');
    await screen.press('Oui, tout effacer');
    await screen.settle();

    expect(w.calls.filter((c) => c.path === '/media/revoke').map((c) => c.body?.['ref']), 'the erased products\' photographs are destroyed now — a replay can never name them again').toEqual([REF, REF2]);
    expect(screen.shows('Une partie seulement de ses produits est effacée. Appuyez encore pour finir.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Supprimer définitivement'), 'and pressing again is possible').toBe(true);
    screen.unmount();
  });
});

describe('F-05 — Produits reads the whole inventory a page at a time', () => {
  const ligne = (i: number) => ({
    offerId: `offer-${String(i).padStart(3, '0')}`, productVersionId: `pv-${i}`, name: `Tissu ${i}`,
    category: 'fashion_bags_fabrics', basePrice: 7_000, resellerCommission: 700, available: 3, assetRefs: [], supplierId: MOI,
  });
  const monter = () =>
    mountEcran(<SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={{ current: { rows: null, asOf: null } }} />);

  it('three products on pages of two: all three are on his Produits', async () => {
    storage({ [OPS_SLOT]: OPS });
    const lignes = [ligne(1), ligne(2), ligne(3)];
    const w = wire([
      (path, _b, search) => {
        if (path !== '/offers/inventaire') return null;
        const { page, next } = paginer(lignes, 'offerId', search, 2);
        return { status: 200, json: { asOf: '2026-09-27T08:00:00.000Z', items: page as never, ...(next !== undefined ? { next } : {}) } };
      },
      (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } } : null),
    ]);
    const screen = await monter();
    expect(w.calls.filter((c) => c.path === '/offers/inventaire')).toHaveLength(2);
    for (const nom of ['Tissu 1', 'Tissu 2', 'Tissu 3']) expect(screen.shows(nom), `${nom}. On screen: ${JSON.stringify(screen.texts().slice(0, 16))}`).toBe(true);
    expect(screen.shows('Liste partielle : le catalogue est très long')).toBe(false);
    screen.unmount();
  });

  it('an inventory longer than the pages he may read is said to be partial', async () => {
    storage({ [OPS_SLOT]: OPS });
    let n = 0;
    wire([
      (path) => {
        if (path !== '/offers/inventaire') return null;
        n += 1;
        return { status: 200, json: { asOf: '2026-09-27T08:00:00.000Z', items: [ligne(n)] as never, next: `offer-${String(n).padStart(3, '0')}` } };
      },
      (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } } : null),
    ]);
    const screen = await monter();
    expect(screen.shows('Liste partielle : le catalogue est très long, certains produits ne sont pas affichés.'), `on screen: ${JSON.stringify(screen.texts().slice(0, 10))}`).toBe(true);
    screen.unmount();
  });
});

/* ─────────────────────────── the revendeuses board (F-72) ─────────────────────────── */

describe('F-72 — the revendeuses board joins its pages and never ranks a row nobody finished reading', () => {
  const CLE_C = 'cle-c-suivi';
  const autourRev: Route[] = [
    (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
    (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
    (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
    (path) => (path === '/reseller/accounts' ? { status: 200, json: { ok: true, accounts: [] } } : null),
  ];
  const ligne = (accountId: string, name: string, ventes: number, suite = false) => ({
    accountId, name, state: 'active', ventes, netFcfa: ventes * 2_500, incomplet: false, ...(suite ? { suite: true } : {}),
  });
  async function versSuivi(): Promise<Screen> {
    process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
    storage({ [OPS_SLOT]: OPS, 'boutik.livraisons.cle': CLE_C });
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press('Revendeuses');
    await screen.press('Suivi des revendeuses');
    await screen.settle();
    return screen;
  }

  it('Awa\'s three sales arrive split over two pages: ONE row, « 3 vente(s) », ranked first — not two rows of her', async () => {
    const pages: Record<string, Record<string, unknown>> = {
      '': { ok: true, lignes: [ligne('rs-awa', 'Awa', 2, true)], total: 3, next: 'rs-awa~2' },
      'rs-awa~2': { ok: true, lignes: [ligne('rs-awa', 'Awa', 1), ligne('rs-fanta', 'Fanta', 1)], total: 3, next: 'rs-salif~0' },
      'rs-salif~0': { ok: true, lignes: [ligne('rs-salif', 'Salif', 0)], total: 3 },
    };
    const w = wire([
      (path, _b, search) => (path === '/reseller/suivi' ? { status: 200, json: pages[search.get('cursor') ?? '']! as never } : null),
      ...autourRev,
    ]);
    const screen = await versSuivi();
    expect(w.calls.filter((c) => c.path === '/reseller/suivi'), 'three pages were asked for').toHaveLength(3);
    expect(screen.shows('3 vente(s)'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().filter((x) => x === 'Awa'), 'one row of her, not two').toHaveLength(1);
    expect(screen.shows('Lecture partielle')).toBe(false);
    screen.unmount();
  });

  it('an account paused between two pages is served again behind the cursor: her row is counted ONCE', async () => {
    const pages: Record<string, Record<string, unknown>> = {
      '': { ok: true, lignes: [ligne('rs-awa', 'Awa', 2)], total: 2, next: 'rs-fanta~' },
      // Awa was paused meanwhile: she now sorts after Fanta and comes back whole
      'rs-fanta~': { ok: true, lignes: [ligne('rs-fanta', 'Fanta', 1), { ...ligne('rs-awa', 'Awa', 2), state: 'paused' }], total: 2 },
    };
    wire([
      (path, _b, search) => (path === '/reseller/suivi' ? { status: 200, json: pages[search.get('cursor') ?? '']! as never } : null),
      ...autourRev,
    ]);
    const screen = await versSuivi();
    expect(screen.shows('2 vente(s)'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('4 vente(s)'), 'her two sales were not doubled').toBe(false);
    screen.unmount();
  });

  it('a board longer than the pages he may read: the unfinished row is last, with no rank and no total, and the board says how many it read', async () => {
    let n = 0;
    wire([
      (path) => {
        if (path !== '/reseller/suivi') return null;
        n += 1;
        return n === 1
          ? { status: 200, json: { ok: true, lignes: [ligne('rs-fanta', 'Fanta', 1), ligne('rs-mariam', 'Mariam', 1, true)], total: 4, next: 'rs-mariam~1' } }
          : { status: 200, json: { ok: true, lignes: [ligne('rs-mariam', 'Mariam', 1, true)], total: 4, next: `rs-mariam~${n}` } };
      },
      ...autourRev,
    ]);
    const screen = await versSuivi();
    expect(screen.shows('Lecture partielle : 2 revendeuses lues sur 4. Les autres ne sont pas affichées.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // Mariam: at least what was read, never a rank, never a total dressed as whole
    expect(screen.shows('au moins 25 vente(s) · Lecture partielle')).toBe(true);
    const textes = screen.texts();
    expect(textes.indexOf('Fanta'), 'the whole row comes first').toBeLessThan(textes.indexOf('Mariam'));
    expect(textes[textes.indexOf('Mariam') - 1], 'her rank slot says « — »').toBe('—');
    expect(textes[textes.indexOf('Fanta') - 1], 'Fanta keeps her rank').toBe('1');
    screen.unmount();
  });
});
