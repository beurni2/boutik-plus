import React from 'react';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { armerSelecteur, desarmerSelecteur, ouvertures } from './doubles/expo-image-picker';
import { armerManipulateur } from './doubles/expo-image-manipulator';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';
import { formatF } from '../src/v2/money';
import { bytesToBase64 } from '../src/studio/normalization';

/**
 * ═══ RENDU-RÉEL — FOURNISSEUR-VRAI-1: the supplier's app tells the truth and lets him in ═══
 *
 * The audit AUDIT-B+2 walked his real screens and found them saying what is not
 * so, or losing what he was doing. Each `describe` below is one of those
 * findings, written RED on the code the audit read, then turned green — the
 * standing order's « a bug he has hit once must never be able to reach him
 * twice », applied to bugs the audit hit on his behalf.
 *
 * Only native and host boundaries are doubled: `fetch`, the browser storage,
 * the OS photo sheet and the image pipeline. The screens, the ports, the row
 * readers, the view decisions and the catalog are the shipped files.
 *
 * ⚠ EVERY ORDER ROW HERE CARRIES NO `zoneTo` — the wire as the server now
 * sends it (F-26, `fulfillment-readiness.e2e`). A reader that still demanded
 * the field would drop every row and every walk below would say so.
 */

const CODE = 'BF-QZHG-XAUP-B7QL-UCRK';
const PRIX = 10_000;

/** One order as `/fulfillment/mine` sends it — contract-certified to
 *  `readCommandeRow` (every required field, well-typed). */
function commande(orderId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderId,
    productName: 'Bazin',
    productVersionId: 'pv-1',
    offerVersion: 'ov-1',
    paymentMode: 'FULL_PREPAY',
    paidAt: '2026-09-20T07:00:00.000Z',
    sellerBasePrice: PRIX,
    ...over,
  };
}

/** One product as `/offers/mine` sends it — certified to `readProduitRow`. */
function produit(offerId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    offerId,
    productVersionId: `pv-${offerId}`,
    name: 'Pagne wax',
    category: 'fashion_bags_fabrics',
    basePrice: 6_000,
    available: 4,
    assetRefs: [],
    ...over,
  };
}

const T = '2026-09-20T09:00:00.000Z';

interface Monde {
  commandes: Record<string, unknown>[];
  produits: Record<string, unknown>[];
  /** The book cannot answer (503) — a network or service hiccup. */
  panne: boolean;
  /** Every read answers 401 — his code was cut or replaced. */
  codeMort: boolean;
}

/**
 * Does this Bearer carry his code? CERTIFIED to the real door by
 * `services/offer-service/test/code-porte.e2e.test.ts`, which proves on real
 * workerd that the door accepts at least these spellings (capitals or not,
 * any separator) — this stand-in grants nothing the real door refuses.
 */
function canon(presented: string): string {
  // The server's own steps, in its order (`codeCanonique`): capitals, 0 → O,
  // only the minted alphabet, « BF » dropped from eighteen letters.
  const lettres = presented.toUpperCase().replace(/0/g, 'O').replace(/[^A-Z2-7]/g, '');
  return lettres.length === 18 && lettres.startsWith('BF') ? lettres.slice(2) : lettres;
}
const sonCode = (bearer: string | undefined): boolean =>
  canon((bearer ?? '').replace(/^Bearer /, '')) === canon(CODE);

function lectures(m: Monde): Route[] {
  const garde = (headers: Record<string, string>): { status: number; json: Record<string, unknown> } | null => {
    if (m.codeMort || !sonCode(headers['authorization'])) return { status: 401, json: { ok: false, reason: 'unauthorized' } };
    if (m.panne) return { status: 503, json: { ok: false } };
    return null;
  };
  return [
    (path, _b, _s, headers) =>
      path === '/fulfillment/mine' ? garde(headers) ?? { status: 200, json: { ok: true, orders: m.commandes } } : null,
    (path, _b, _s, headers) =>
      path === '/offers/mine' ? garde(headers) ?? { status: 200, json: { items: m.produits } } : null,
  ];
}

function monde(over: Partial<Monde> = {}): Monde {
  return { commandes: [], produits: [], panne: false, codeMort: false, ...over };
}

/** The value a field currently holds — a prop the app computed, no pixels. */
function valeurDu(screen: Screen, label: string): unknown {
  const champ = screen.tree.root.findAll(
    (n) => (n.type as unknown) === 'TextInput' && n.props['accessibilityLabel'] === label,
  )[0];
  return champ?.props['value'];
}

/** Press a control that carries an image and no words (a thumbnail). The
 *  harness presses by label; a photo has none, so the tap is found by the
 *  url the app computed for it. */
async function toucherPhoto(screen: Screen, uri: string): Promise<void> {
  const cible = screen.tree.root.findAll((n: ReactTestInstance) =>
    typeof n.props['onPress'] === 'function' &&
    n.findAll((c) => (c.type as unknown) === 'Image' && (c.props['source'] as { uri?: string } | undefined)?.uri === uri).length > 0,
  );
  const innermost = cible.filter((h) => !cible.some((o) => o !== h && h.findAll((x) => x === o).length > 0));
  expect(innermost.length, `no tappable photo for ${uri}`).toBeGreaterThan(0);
  await act(async () => {
    (innermost[0]!.props['onPress'] as () => void)();
    await Promise.resolve();
  });
  await screen.settle();
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
  desarmerSelecteur();
  armerManipulateur(null);
  delete (globalThis as { fetch?: unknown }).fetch;
});

/* ─────────────────────────── the door (F-06, F-25, F-80) ─────────────────────────── */

describe('F-06 · F-25 · F-80 — the code door: plain words, a keyboard that types a code, and it lets him in', () => {
  it('the door speaks plainly, its field asks the phone for capitals and no corrections, and the code typed in sentence case OPENS his app', async () => {
    const store = storage();
    const w = wire(lectures(monde({ produits: [produit('o1')] })));
    const screen = await mountEcran(<FournisseurApp />);

    // 1. the door, in plain words — his words, not an office letter's.
    expect(screen.shows('Votre espace Boutik+'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows("Tapez le code que l'équipe Boutik+ vous a donné.")).toBe(true);
    expect(screen.shows("Ce téléphone garde votre code : vous n'aurez pas à le retaper.")).toBe(true);
    for (const ancien of ['main propre', 'rien d’autre', "rien d'autre", 'Ouvrir mes commandes', 'Mes commandes']) {
      expect(screen.shows(ancien), `« ${ancien} » is still on the door`).toBe(false);
    }

    // 2. the field tells the phone what it is for: a code in capitals, no
    //    auto-correct, no spell-check — props the app set, not pixels.
    const champ = screen.tree.root.findAll(
      (n) => (n.type as unknown) === 'TextInput' && n.props['accessibilityLabel'] === 'Votre code',
    )[0];
    expect(champ, 'the code field is not on the door').toBeDefined();
    expect(champ!.props['autoCapitalize']).toBe('characters');
    expect(champ!.props['autoCorrect']).toBe(false);
    expect(champ!.props['spellCheck']).toBe(false);

    // 3. typed the way a phone types it — and he gets in.
    await screen.type('Bf-qzhg-xaup-b7ql-ucrk', 'Votre code');
    expect(screen.canPress('Ouvrir')).toBe(true);
    await screen.press('Ouvrir');
    await screen.settle();
    expect(screen.shows('Mes produits'), `the door did not open. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Pagne wax'), 'his products did not load behind the door').toBe(true);
    expect(store.get('boutik.fournisseur.code')).toBe('Bf-qzhg-xaup-b7ql-ucrk');
    expect(w.calls.some((c) => c.path === '/offers/mine')).toBe(true);
    screen.unmount();
  });

  it('a code typed with a phone\'s long dash « – » still goes out as a header the browser can send, and opens his app (verifier minor 5)', async () => {
    storage();
    const w = wire(lectures(monde({ produits: [produit('o1')] })));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.type('BF–QZHG–XAUP–B7QL–UCRK', 'Votre code');
    await screen.press('Ouvrir');
    await screen.settle();
    const envoye = w.calls.find((c) => c.path === '/offers/mine')?.headers['authorization'] ?? '';
    expect([...envoye].every((ch) => ch.charCodeAt(0) <= 0x7e), `« ${envoye} » cannot travel in a header`).toBe(true);
    expect(screen.shows('Pagne wax'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('a code the server refuses sends him back to the door, and forgets the dead code', async () => {
    const store = storage({ 'boutik.fournisseur.code': CODE });
    wire(lectures(monde({ codeMort: true })));
    const screen = await mountEcran(<FournisseurApp />);
    expect(screen.shows("Ce code n'est pas le bon."), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press('Entrer le code à nouveau');
    expect(screen.shows('Votre espace Boutik+'), 'the door did not come back').toBe(true);
    expect(store.has('boutik.fournisseur.code')).toBe(false);
    screen.unmount();
  });

  it('a first read that fails offers « Réessayer », and pressing it READS AGAIN and shows the list', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const m = monde({ panne: true, produits: [produit('o1')] });
    const w = wire(lectures(m));
    const screen = await mountEcran(<FournisseurApp />);
    expect(screen.shows('Impossible de joindre le service.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    const avant = w.calls.filter((c) => c.path === '/offers/mine').length;
    m.panne = false;
    await screen.press('Réessayer');
    expect(w.calls.filter((c) => c.path === '/offers/mine').length).toBe(avant + 1);
    expect(screen.shows('Pagne wax')).toBe(true);
    screen.unmount();
  });
});

/* ─────────────────────────── his products (F-07, F-80) ─────────────────────────── */

describe('F-07 · F-80 — « Mes produits » shows every product, frozen ones marked, and his photos open', () => {
  it('a product frozen for stock stays on his list with the reason; the live one counts as live; its photos open in the viewer', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(lectures(monde({
      produits: [
        produit('o1', { name: 'Pagne wax', assetRefs: ['media/h1', 'media/hv', 'media/p1'] }),
        produit('o2', { name: 'Sac en cuir', hiddenReason: 'stock_unconfirmed' }),
      ],
    })));
    const screen = await mountEcran(<FournisseurApp />);
    expect(screen.shows('Pagne wax')).toBe(true);
    expect(screen.shows('Sac en cuir'), `the frozen product vanished. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows("Plus en vente pour le moment : l'équipe Boutik+ doit confirmer votre stock.")).toBe(true);
    expect(screen.shows('1 en ligne chez les revendeuses')).toBe(true);

    // The viewer: closed, then open on the photo he tapped.
    expect(screen.shows('Héro')).toBe(false);
    await toucherPhoto(screen, 'http://media.test/media/h1');
    expect(screen.shows('Héro'), 'the tapped photo did not open').toBe(true);
    screen.unmount();
  });

  it('a shelf where EVERY product is frozen still shows them — never « Pas encore de produit pour vous »', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(lectures(monde({
      produits: [produit('o2', { name: 'Sac en cuir', hiddenReason: 'stock_unconfirmed' })],
    })));
    const screen = await mountEcran(<FournisseurApp />);
    expect(screen.shows('Sac en cuir'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Pas encore de produit pour vous')).toBe(false);
    expect(screen.shows('0 en ligne chez les revendeuses')).toBe(true);
    screen.unmount();
  });
});

/* ─────────────────────────── the money line (F-09, F-23, F-24) ─────────────────────────── */

describe('F-09 — his price on its own line; the payment way alone, and only while the order is moving', () => {
  it('a pay-at-door order to accept: « Votre prix » names his price, the payment way carries NO amount', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(lectures(monde({ commandes: [commande('ord-porte', { paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' })] })));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    const textes = screen.texts();
    expect(textes, 'his price is not on its own line').toContain(`Votre prix : ${formatF(PRIX)}`);
    expect(textes, 'the payment way is not on the card').toContain('Reste à payer à la porte');
    expect(textes.some((t) => t.includes('Reste à payer à la porte') && t.includes(formatF(PRIX))),
      'the door label is still paired with a figure it does not describe').toBe(false);
    expect(screen.canPress('Accepter la commande')).toBe(true);
    screen.unmount();
  });

  it('finished orders keep his price and drop the payment way — nothing « reste à payer » on a delivered order, « Tout est payé » never beside a refund', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(lectures(monde({
      commandes: [
        commande('ord-livree', { productName: 'Livré-porte', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, deliveredAt: T } }),
        commande('ord-refusee', { productName: 'Refusé-payé', fulfillment: { refusedAt: T } }),
        // …and a PARCEL of two, delivered, paid at the door: the same rule on the colis card.
        commande('ord-k1', { productName: 'Colis-un', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', colis: { packageId: 'pkg-l', orderIds: ['ord-k1', 'ord-k2'] }, fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, deliveredAt: T } }),
        commande('ord-k2', { productName: 'Colis-deux', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', colis: { packageId: 'pkg-l', orderIds: ['ord-k1', 'ord-k2'] }, fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, deliveredAt: T } }),
      ],
    })));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Livré');
    expect(screen.shows('Livré-porte'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Refusé-payé')).toBe(true);
    expect(screen.shows('Colis-un')).toBe(true);
    expect(screen.shows('Reste à payer à la porte')).toBe(false);
    expect(screen.shows('Tout est payé')).toBe(false);
    expect(screen.texts().filter((t) => t === `Votre prix : ${formatF(PRIX)}`), 'his price, once per order and once per parcel article').toHaveLength(4);
    screen.unmount();
  });

  it('a parcel still to accept, paid at the door: each article says « Votre prix », the payment way once, with no amount', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const colis = { packageId: 'pkg-a', orderIds: ['ord-a1', 'ord-a2'] };
    wire(lectures(monde({
      commandes: [
        commande('ord-a1', { productName: 'Bazin', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', colis }),
        commande('ord-a2', { productName: 'Pagne', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', colis }),
      ],
    })));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    const textes = screen.texts();
    expect(textes.filter((t) => t === `Votre prix : ${formatF(PRIX)}`), `on screen: ${JSON.stringify(textes)}`).toHaveLength(2);
    expect(textes.filter((t) => t === 'Reste à payer à la porte')).toHaveLength(1);
    expect(screen.canPress('Accepter le colis')).toBe(true);
    screen.unmount();
  });
});

describe('F-23 — the finished count counts what it says', () => {
  it('one delivered, one refused, one returned: « Terminées : 3 », never « Livrés : 3 »; a parcel on the road counts once', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const colis = { packageId: 'pkg-1', orderIds: ['ord-c1', 'ord-c2'] };
    wire(lectures(monde({
      commandes: [
        commande('ord-l', { fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, deliveredAt: T } }),
        commande('ord-r', { fulfillment: { refusedAt: T } }),
        commande('ord-t', { fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T, returnedAt: T } }),
        commande('ord-c1', { colis, fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T } }),
        commande('ord-c2', { colis, fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T } }),
      ],
    })));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Livré');
    expect(screen.shows('Terminées : 3'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().some((t) => t.startsWith('Livrés :'))).toBe(false);
    await screen.press('En route');
    expect(screen.shows('En route : 1'), 'one parcel on the road reads as two').toBe(true);
    screen.unmount();
  });
});

describe('F-24 — the parcel line never says the refund happened before anyone can know it', () => {
  it('an article he refused inside a parcel reads « Le client sera remboursé »', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const colis = { packageId: 'pkg-2', orderIds: ['ord-a', 'ord-b'] };
    wire(lectures(monde({
      commandes: [
        commande('ord-a', { productName: 'Bazin', colis, fulfillment: { refusedAt: T } }),
        commande('ord-b', { productName: 'Pagne', colis, fulfillment: { acceptedAt: T } }),
      ],
    })));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    expect(screen.shows('Refusé par vous. Le client sera remboursé.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Le client est remboursé')).toBe(false);
    screen.unmount();
  });
});

/* ─────────────────────────── the refresh (F-19, F-20) ─────────────────────────── */

describe('F-19 — one failed refresh never wipes his list or what he was typing', () => {
  it('the minute refresh fails: the card stays, the code he was typing stays, a line says the list could not be updated; the next good read clears it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storage({ 'boutik.fournisseur.code': CODE });
    const m = monde({ commandes: [commande('ord-p', { fulfillment: { acceptedAt: T, readyAt: T } })] });
    wire(lectures(m));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.type('KX-42', 'Code du coursier');

    m.panne = true;
    await minute(screen);
    expect(screen.shows('Bazin'), `the card was wiped. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(valeurDu(screen, 'Code du coursier'), 'what he was typing was wiped').toBe('KX-42');
    expect(screen.shows("La liste n'a pas pu être mise à jour. Elle a peut-être changé depuis.")).toBe(true);
    expect(screen.shows('Impossible de joindre le service.')).toBe(false);
    expect(screen.canPress('Vérifier le code')).toBe(true);

    m.panne = false;
    await minute(screen);
    expect(screen.shows("La liste n'a pas pu être mise à jour.")).toBe(false);
    expect(valeurDu(screen, 'Code du coursier')).toBe('KX-42');
    screen.unmount();
  });

  it('a code cut off WHILE his list is on screen still sends him to the door at the next refresh — the kept list never hides a dead code', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storage({ 'boutik.fournisseur.code': CODE });
    const m = monde({ commandes: [commande('ord-p', { fulfillment: { acceptedAt: T, readyAt: T } })] });
    wire(lectures(m));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    expect(screen.shows('Bazin')).toBe(true);
    m.codeMort = true;
    await minute(screen);
    expect(screen.shows("Ce code n'est pas le bon."), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Entrer le code à nouveau')).toBe(true);
    expect(screen.shows('Bazin')).toBe(false);
    screen.unmount();
  });

  it('« Mes produits » keeps his products through a failed refresh too', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storage({ 'boutik.fournisseur.code': CODE });
    const m = monde({ produits: [produit('o1')] });
    wire(lectures(m));
    const screen = await mountEcran(<FournisseurApp />);
    expect(screen.shows('Pagne wax')).toBe(true);
    m.panne = true;
    await minute(screen);
    expect(screen.shows('Pagne wax'), `his products were wiped. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows("La liste n'a pas pu être mise à jour. Elle a peut-être changé depuis.")).toBe(true);
    screen.unmount();
  });
});

describe('F-20 — the code verdict stays in front of him while he hands the parcel over', () => {
  it('pickup: « Code confirmé » survives the minute refresh that moves the order to « En route », until he changes tab', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storage({ 'boutik.fournisseur.code': CODE });
    const ligne = commande('ord-p', { fulfillment: { acceptedAt: T, readyAt: T } as Record<string, string> });
    const m = monde({ commandes: [ligne] });
    wire([
      ...lectures(m),
      (path) => {
        if (path !== '/fulfillment/ramassage/verify') return null;
        (ligne['fulfillment'] as Record<string, string>)['handedOverAt'] = T; // the book's own mark on « confirmé »
        return { status: 200, json: { ok: true, verdict: 'confirme' } };
      },
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.type('KX-42', 'Code du coursier');
    await screen.press('Vérifier le code');
    const verdict = 'Code confirmé. Vous pouvez remettre le colis au coursier.';
    expect(screen.shows(verdict)).toBe(true);

    await minute(screen);
    expect(screen.shows('Rien à préparer pour le moment.'), 'the order did not move on').toBe(true);
    expect(screen.shows(verdict), `the verdict was torn away. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().some((t) => t.includes('Bazin') && t.includes(verdict)), 'the held verdict does not name the product').toBe(true);

    await screen.press('En route');
    await screen.press('Commandes');
    expect(screen.shows(verdict), 'the held verdict outlived a tab change').toBe(false);
    screen.unmount();
  });

  it('the held verdict is BOUNDED: gone two refreshes after its card left — never sitting, hours later, over another parcel waiting for its own check (verifier BLOCKER)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storage({ 'boutik.fournisseur.code': CODE });
    const a = commande('ord-a', { fulfillment: { acceptedAt: T, readyAt: T } as Record<string, string> });
    const m = monde({ commandes: [a] });
    wire([
      ...lectures(m),
      (path) => {
        if (path !== '/fulfillment/ramassage/verify') return null;
        (a['fulfillment'] as Record<string, string>)['handedOverAt'] = T;
        return { status: 200, json: { ok: true, verdict: 'confirme' } };
      },
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.type('KX-42', 'Code du coursier');
    await screen.press('Vérifier le code');
    const verdict = 'Code confirmé. Vous pouvez remettre le colis au coursier.';
    await minute(screen);
    expect(screen.shows(verdict), 'the verdict left with its card').toBe(true);
    await minute(screen);
    await minute(screen);
    expect(screen.shows(verdict), `the verdict outlived its moment. On screen: ${JSON.stringify(screen.texts())}`).toBe(false);

    // A NEW parcel of the same product, ready: its own check, and no verdict over it.
    m.commandes = [a, commande('ord-b', { fulfillment: { acceptedAt: T, readyAt: T } })];
    await minute(screen);
    expect(screen.canPress('Vérifier le code'), 'the new parcel lost its own check').toBe(true);
    expect(screen.shows('Code confirmé'), `a verdict sits over an unchecked parcel. On screen: ${JSON.stringify(screen.texts())}`).toBe(false);
    screen.unmount();
  });

  it('« Actualiser la liste » clears a held verdict at once, and a held verdict never sits over the door\'s refusal', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storage({ 'boutik.fournisseur.code': CODE });
    const a = commande('ord-a', { fulfillment: { acceptedAt: T, readyAt: T } as Record<string, string> });
    // a second order stays on the screen, so the list — and its refresh button — stays
    const m = monde({ commandes: [a, commande('ord-reste', { productName: 'Pagne' })] });
    wire([
      ...lectures(m),
      (path) => {
        if (path !== '/fulfillment/ramassage/verify') return null;
        (a['fulfillment'] as Record<string, string>)['handedOverAt'] = T;
        return { status: 200, json: { ok: true, verdict: 'confirme' } };
      },
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.type('KX-42', 'Code du coursier');
    await screen.press('Vérifier le code');
    const verdict = 'Code confirmé. Vous pouvez remettre le colis au coursier.';
    await minute(screen);
    expect(screen.texts().some((t) => t.includes('Bazin') && t.includes(verdict))).toBe(true);
    await screen.press('Actualiser la liste');
    expect(screen.shows(verdict), 'a refresh by hand left the verdict up').toBe(false);

    // confirm again, then the code dies: the refusal speaks alone
    a['fulfillment'] = { acceptedAt: T, readyAt: T };
    await screen.press('Actualiser la liste');
    await screen.type('KX-43', 'Code du coursier');
    await screen.press('Vérifier le code');
    await minute(screen);
    expect(screen.shows(verdict)).toBe(true);
    m.codeMort = true;
    await minute(screen);
    expect(screen.shows("Ce code n'est pas le bon.")).toBe(true);
    expect(screen.shows(verdict), 'a verdict sits over the refused-code wall').toBe(false);
    screen.unmount();
  });

  it('return: « Code confirmé » for the returned parcel survives the refresh that moves it to the archive', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storage({ 'boutik.fournisseur.code': CODE });
    const ligne = commande('ord-r', { fulfillment: { acceptedAt: T, readyAt: T, handedOverAt: T } as Record<string, string> });
    const m = monde({ commandes: [ligne] });
    wire([
      ...lectures(m),
      (path) => {
        if (path !== '/fulfillment/retour/verify') return null;
        (ligne['fulfillment'] as Record<string, string>)['returnedAt'] = T;
        return { status: 200, json: { ok: true, verdict: 'confirme' } };
      },
    ]);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('En route');
    await screen.type('RT-9', 'Code de retour du coursier');
    await screen.press('Vérifier le code de retour');
    const verdict = 'Code confirmé. Le coursier valide de son côté, puis vous reprenez le colis.';
    expect(screen.shows(verdict)).toBe(true);
    await minute(screen);
    expect(screen.shows('Aucun colis en route.'), 'the parcel did not move on').toBe(true);
    expect(screen.shows(verdict), `the verdict was torn away. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });
});

/* ─────────────────────────── the proof photo (F-21, F-22) ─────────────────────────── */

/** A real JPEG stream (the segment grammar `studio-pick.test.ts` uses), with
 *  an XMP block the app's own strip must remove — so the photo that previews
 *  is the app's real derivative, not bytes this file vouched for. */
const seg = (marker: number, payload: number[]): number[] => {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
};
const JPEG = new Uint8Array([
  [0xff, 0xd8],
  seg(0xe1, [...'http://ns.adobe.com/xap/1.0/\0<x>12.37,-1.52</x>'].map((c) => c.charCodeAt(0))),
  seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
  seg(0xc0, [8, 0, 16, 0, 16, 1, 0x11, 0]),
  seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
  seg(0xda, [1, 0, 0, 0, 63, 0]),
  [0x12, 0x34, 0xff, 0x00, 0x56],
  [0xff, 0xd9],
].flat());

const aPreparer = (): Monde => monde({ commandes: [commande('ord-x', { fulfillment: { acceptedAt: T } })] });

describe('F-21 — a photo the phone cannot open is never a silent dead tap', () => {
  it('an image the phone cannot decode says so in plain words, and the picker stays ready for another', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(lectures(aPreparer()));
    armerSelecteur([{ uri: 'file:///DCIM/IMG_2031.HEIC', mimeType: 'image/heic', fileName: 'IMG_2031.HEIC' }]);
    // the manipulator stays UNARMED: the decode fails, exactly as on a phone
    // that cannot read the file.
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    expect(ouvertures, 'the photo sheet was never opened').toHaveLength(1);
    expect(screen.shows("Cette photo ne s'ouvre pas sur ce téléphone. Choisissez-en une autre."),
      `the refusal is silent. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Choisir la photo du colis')).toBe(true);
    screen.unmount();
  });

  it('bytes the privacy strip cannot prove clean are refused the same way — no throw, no upload', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const w = wire(lectures(aPreparer()));
    armerSelecteur([{ uri: 'file:///DCIM/cassee.jpg', mimeType: 'image/jpeg', fileName: 'cassee.jpg' }]);
    armerManipulateur({ base64: bytesToBase64(new Uint8Array([0x00, 0x01, 0x02, 0x03])), width: 16, height: 16 });
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    expect(screen.shows("Cette photo ne s'ouvre pas sur ce téléphone. Choisissez-en une autre."),
      `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // nothing to send: no photo reached his hand, so the send is not offered
    expect(screen.canPress('Envoyer la preuve')).toBe(false);
    expect(w.calls.some((c) => c.path === '/media')).toBe(false);
    screen.unmount();
  });

  it('backing out of the sheet stays silent', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(lectures(aPreparer()));
    armerSelecteur(null);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    const avant = screen.texts();
    await screen.press('Choisir la photo du colis');
    expect(screen.texts()).toEqual(avant);
    screen.unmount();
  });
});

describe('F-22 — a photo that cannot go always leaves a way out (verifier MAJOR 2)', () => {
  it('the parcel card: the upload fails, the photo stays with « Envoyer la preuve » — and « Choisir une autre photo » opens the sheet again and replaces it', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const colis = { packageId: 'pkg-p', orderIds: ['ord-p1', 'ord-p2'] };
    wire(lectures(monde({
      commandes: [
        commande('ord-p1', { productName: 'Bazin', colis, fulfillment: { acceptedAt: T } }),
        commande('ord-p2', { productName: 'Pagne', colis, fulfillment: { acceptedAt: T } }),
      ],
    })));
    // no media write key on this build: every upload is refused, as a
    // service that refuses the photo for good would refuse it
    delete process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'];
    armerSelecteur([{ uri: 'file:///DCIM/colis.jpg', mimeType: 'image/jpeg', fileName: 'colis.jpg' }]);
    armerManipulateur({ base64: bytesToBase64(JPEG), width: 16, height: 16 });
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    await screen.press('Envoyer la preuve');
    expect(screen.shows("La photo n'a pas pu partir. Réessayez."), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.images().some((u) => u.startsWith('data:image/jpeg;base64,')), 'the photo was thrown away').toBe(true);
    expect(screen.canPress('Envoyer la preuve')).toBe(true);
    expect(screen.canPress('Choisir une autre photo'), 'a photo that can never go leaves no way to pick another').toBe(true);

    await screen.press('Choisir une autre photo');
    expect(ouvertures, 'the sheet did not open again').toHaveLength(2);
    expect(screen.shows("La photo n'a pas pu partir."), 'the old refusal outlived the new photo').toBe(false);
    expect(screen.canPress('Envoyer la preuve')).toBe(true);
    screen.unmount();
  });
});

describe('F-22 — a failed send keeps his photo and the button that sends it again', () => {
  it('the send fails: the photo stays, « Envoyer la preuve » stays pressable, and pressing it really sends again', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    const w = wire([
      ...lectures(aPreparer()),
      (path) => (path === '/fulfillment/ready/challenge' ? { status: 503, json: { ok: false } } : null),
    ]);
    armerSelecteur([{ uri: 'file:///DCIM/colis.jpg', mimeType: 'image/jpeg', fileName: 'colis.jpg' }]);
    armerManipulateur({ base64: bytesToBase64(JPEG), width: 16, height: 16 });
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    const photo = screen.images().find((u) => u.startsWith('data:image/jpeg;base64,'));
    expect(photo, `no preview after the pick. On screen: ${JSON.stringify(screen.texts())}`).toBeDefined();

    await screen.press('Envoyer la preuve');
    expect(screen.shows("L'envoi n'a pas marché. Réessayez."), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.images(), 'the chosen photo was thrown away').toContain(photo);
    expect(screen.canPress('Envoyer la preuve'), 'the sentence says « réessayez » and nothing on screen does it').toBe(true);

    const avant = w.calls.filter((c) => c.path === '/fulfillment/ready/challenge').length;
    await screen.press('Envoyer la preuve');
    expect(w.calls.filter((c) => c.path === '/fulfillment/ready/challenge').length, 'the retry sent nothing').toBe(avant + 1);
    screen.unmount();
  });
});
