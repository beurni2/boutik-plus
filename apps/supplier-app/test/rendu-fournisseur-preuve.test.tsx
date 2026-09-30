import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Wire } from './rendu';
import { armerSelecteur, desarmerSelecteur, ouvertures } from './doubles/expo-image-picker';
import { armerManipulateur } from './doubles/expo-image-manipulator';
import { armerLectureDataUri, desarmerLecture } from './doubles/expo-file-system';
import { installerHistorique, retirerHistorique } from './doubles/historique';
import { CryptoDigestAlgorithm, digest } from './doubles/expo-crypto';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';
import { hexOfDigest } from '../src/supply/media-wire';
import { bytesToBase64 } from '../src/studio/normalization';

/**
 * ═══ RENDU-RÉEL — « ENVOYER LA PREUVE », PRESSED FOR REAL (PREUVE-PRETE-1, AUDIT-B+2 F-16) ═══
 *
 * Readiness is what lets Séra send a coursier, and no walk had ever pressed
 * the button that makes it — only its failures. This walks the way it is
 * meant to go, on his real screen: choose the photo → « Envoyer la preuve » →
 * the card says « Prêt, preuve reçue ». And it asks the four questions: the
 * tree survives both taps · the send is WIRED, in the order the law needs
 * (a fresh challenge, then the photo under the upload key, then « prêt »
 * naming THAT photo and THAT challenge) · a parcel sends ONE photo and one
 * « prêt » per article · he reaches the next step.
 *
 * Only native and host boundaries are doubled: `fetch`, the browser storage,
 * the OS photo sheet, the image pipeline and the file reader (armed to read
 * only the photo the app itself encoded — certified byte for byte against the
 * web page's reader in `rendu-harness.test.ts`). The stand-in answers are the
 * real doors' shapes — `preuve-prete.e2e.test.ts` drives the same ports
 * against the real offer and media Workers and asks their ledgers.
 */

const CODE = 'FOURN-PREUVE-1';
const CLE_MEDIA = 'test-walk-media-write-key';
const T = '2026-09-29T08:00:00.000Z';

/** A small clean JPEG the app's own privacy strip accepts. */
const seg = (marker: number, payload: number[]): number[] => {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
};
const JPEG = new Uint8Array([
  0xff, 0xd8,
  ...seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
  ...seg(0xc0, [8, 0, 16, 0, 16, 1, 0x11, 0]),
  ...seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
  ...seg(0xda, [1, 0, 0, 0, 63, 0]),
  0x12, 0x34, 0x56,
  0xff, 0xd9,
]);

interface Article {
  orderId: string;
  productName: string;
  productVersionId: string;
  colis?: { packageId: string; orderIds: string[] };
  fulfillment: { acceptedAt?: string; readyAt?: string };
}

/**
 * The book and the photo store, answering as the real doors answer: a
 * challenge REPLACES the last one and, named on any article of a colis, is
 * minted for every article of it accepted and not yet ready (CODE-COLIS-1 —
 * one code per parcel, as the real door mints it); the photo store
 * refuses any key but the upload key with its one identical 401, and mints a
 * fresh `media/<uuid v4>` per upload; « prêt » is accepted only for the
 * order's live challenge and a ref of the minted SHAPE with an image type (the
 * real door's F-39 rule — it checks the shape, it does not ask the store), and
 * then marks the order ready — which the next list read shows. That « prêt »
 * names THIS upload is asserted on the call itself, not left to this copy.
 */
function livre(
  articles: Article[],
  /** Orders whose next « prêt » is lost on the way (the network), once each. */
  perdus: Set<string> = new Set(),
): { routes: Route[]; photos: string[]; defis: Map<string, string> } {
  const photos: string[] = [];
  const defis = new Map<string, string>();
  const confirmes = new Map<string, string>();
  let n = 0;
  const routes: Route[] = [
    (path) =>
      path === '/fulfillment/mine'
        ? {
            status: 200,
            json: {
              ok: true,
              orders: articles.map((a) => ({
                orderId: a.orderId, productName: a.productName, productVersionId: a.productVersionId, offerVersion: 'ov-1',
                paymentMode: 'FULL_PREPAY', paidAt: T, sellerBasePrice: 8_000,
                fulfillment: { ...a.fulfillment },
                ...(a.colis !== undefined ? { colis: a.colis } : {}),
              })),
            },
          }
        : null,
    (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
    (path, body) => {
      if (path !== '/fulfillment/ready/challenge') return null;
      // the real door: an order already ready is refused by name, no code minted
      if (articles.find((a) => a.orderId === body?.['orderId'])?.fulfillment.readyAt !== undefined) {
        return { status: 409, json: { ok: false, reason: 'already_ready' } };
      }
      n += 1;
      const challenge = `srch-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      const nomme = articles.find((a) => a.orderId === body?.['orderId']);
      for (const a of articles) {
        const duSac = a === nomme || (nomme?.colis !== undefined && nomme.colis.orderIds.includes(a.orderId));
        if (duSac && (a === nomme || (a.fulfillment.acceptedAt !== undefined && a.fulfillment.readyAt === undefined))) {
          defis.set(a.orderId, challenge);
        }
      }
      return { status: 200, json: { ok: true, challenge, expiresAt: '2026-09-29T08:10:00.000Z' } };
    },
    (path, _b, _s, headers) => {
      if (path !== '/media') return null;
      if (headers['x-write-key'] !== CLE_MEDIA) return { status: 401, json: { error: 'unauthorized' } };
      const ref = `media/0f8fad5b-d9cb-469f-a165-${String(photos.length + 1).padStart(12, '0')}`;
      photos.push(ref);
      return { status: 201, json: { ref, contentType: 'image/jpeg', width: 16, height: 16, byteLength: JPEG.length } };
    },
    (path, body) => {
      if (path !== '/fulfillment/ready') return null;
      const orderId = String(body?.['orderId']);
      const photoRef = body?.['photoRef'] as { ref?: string } | undefined;
      if (perdus.delete(orderId)) return { status: 503, json: { ok: false } };
      // the real door: a replay of the confirmed act is absorbed, any other act on a ready order refused
      const deja = articles.find((x) => x.orderId === orderId)?.fulfillment.readyAt;
      if (deja !== undefined) {
        return confirmes.get(orderId) === body?.['readinessChallenge']
          ? { status: 200, json: { ok: true, status: 'already_ready', confirmedAt: deja } }
          : { status: 409, json: { ok: false, reason: 'already_ready' } };
      }
      if (defis.get(orderId) !== body?.['readinessChallenge']) {
        return { status: 409, json: { ok: false, reason: 'challenge_missing_or_mismatched' } };
      }
      const minted = /^media\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(photoRef?.ref));
      if (!minted || !String((photoRef as { mimeType?: string } | undefined)?.mimeType).startsWith('image/')) {
        return { status: 400, json: { ok: false, reason: 'photo_not_uploaded' } };
      }
      const a = articles.find((x) => x.orderId === orderId)!;
      a.fulfillment.readyAt = '2026-09-29T08:02:00.000Z';
      confirmes.set(orderId, String(body?.['readinessChallenge']));
      return { status: 200, json: { ok: true, status: 'ready', confirmedAt: a.fulfillment.readyAt } };
    },
  ];
  return { routes, photos, defis };
}

/** Where each act landed in the calls — « in order » is asserted, never assumed. */
const rang = (w: Wire, path: string, orderId?: string): number =>
  w.calls.findIndex((c) => c.path === path && (orderId === undefined || c.body?.['orderId'] === orderId));

async function empreinte(uri: string): Promise<string> {
  const bytes = new Uint8Array(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'));
  return hexOfDigest(await digest(CryptoDigestAlgorithm.SHA256, bytes));
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = CLE_MEDIA;
  storage({ 'boutik.fournisseur.code': CODE });
  armerSelecteur([{ uri: 'file:///DCIM/colis.jpg', mimeType: 'image/jpeg', fileName: 'colis.jpg' }]);
  armerManipulateur({ base64: bytesToBase64(JPEG), width: 16, height: 16 });
  armerLectureDataUri();
});

afterEach(() => {
  desarmerSelecteur();
  armerManipulateur(null);
  desarmerLecture();
  delete process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'];
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('F-57 (LISTER-VRAI-1) — the phone\'s Back puts a picked photo down, and does not leave the page', () => {
  afterEach(() => retirerHistorique());

  it('pick the photo → Back → the photo is put down and « Choisir la photo du colis » is back; nothing was sent', async () => {
    const nav = installerHistorique();
    const articles: Article[] = [{ orderId: 'ord-p1', productName: 'Bazin', productVersionId: 'pv-bazin', fulfillment: { acceptedAt: T } }];
    const w = wire(livre(articles).routes);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    expect(screen.canPress('Envoyer la preuve')).toBe(true);
    expect(nav.entrees, 'a picked photo is a layer').toBe(1);

    nav.retour();
    await screen.settle();
    await screen.settle();
    expect(screen.shows('Envoyer la preuve'), 'Back put the photo down').toBe(false);
    expect(screen.canPress('Choisir la photo du colis')).toBe(true);
    expect(nav.sorties, 'and the page is still here').toBe(0);
    expect(w.calls.some((c) => c.path === '/media'), 'nothing was sent').toBe(false);
    screen.unmount();
  });
});

describe('F-16 — « Envoyer la preuve » pressed for real: the proof goes, in order, and the card says « Prêt, preuve reçue »', () => {
  it('one order: choose the photo → send → a fresh challenge, THEN the photo under the upload key, THEN « prêt » naming that photo and that challenge → « Prêt, preuve reçue »', async () => {
    const articles: Article[] = [{ orderId: 'ord-p1', productName: 'Bazin', productVersionId: 'pv-bazin', fulfillment: { acceptedAt: T } }];
    const b = livre(articles);
    const w = wire(b.routes);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    expect(ouvertures, 'the photo sheet was never opened').toHaveLength(1);
    const apercu = screen.images().find((u) => u.startsWith('data:image/jpeg;base64,'));
    expect(apercu, `no photo in his hand after the pick. On screen: ${JSON.stringify(screen.texts())}`).toBeDefined();
    expect(screen.canPress('Envoyer la preuve')).toBe(true);

    await screen.press('Envoyer la preuve');
    await screen.settle();

    // WIRED, and in the order the law needs
    const defi = rang(w, '/fulfillment/ready/challenge', 'ord-p1');
    const photo = rang(w, '/media');
    const pret = rang(w, '/fulfillment/ready', 'ord-p1');
    expect(defi, 'no challenge was asked').toBeGreaterThanOrEqual(0);
    expect(photo, 'the photo was never uploaded — a dead « Envoyer »').toBeGreaterThan(defi);
    expect(pret, '« prêt » was never sent').toBeGreaterThan(photo);
    const envoi = w.calls[photo]!;
    expect(envoi.method).toBe('POST');
    expect(envoi.headers['x-write-key'], 'the photo went without the upload key').toBe(CLE_MEDIA);
    const confirmation = w.calls[pret]!;
    expect(confirmation.headers['authorization']).toBe(`Bearer ${CODE}`);
    expect(confirmation.body).toMatchObject({
      orderId: 'ord-p1',
      photoRef: { ref: b.photos[0], sha256: await empreinte(apercu!), mimeType: 'image/jpeg' },
      readinessChallenge: b.defis.get('ord-p1'),
      qty: 1,
      variant: 'pv-bazin',
      availableConfirmed: true,
    });

    // he reaches the next step
    expect(screen.shows('Prêt, preuve reçue'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Envoyer la preuve'), 'the proof is in: nothing left to send').toBe(false);
    expect(w.calls.filter((c) => c.path === '/media'), 'one tap, one upload').toHaveLength(1);
    screen.unmount();
  });

  it('a colis (CODE-COLIS-1): ONE photo uploaded, ONE code for the parcel, then for EACH article its own « prêt » under that same code and photo → the card says « Prêt, preuve reçue »', async () => {
    const colis = { packageId: 'col-p', orderIds: ['ord-c1', 'ord-c2'] };
    const articles: Article[] = [
      { orderId: 'ord-c1', productName: 'Pagne', productVersionId: 'pv-pagne', colis, fulfillment: { acceptedAt: T } },
      { orderId: 'ord-c2', productName: 'Sandales', productVersionId: 'pv-sandales', colis, fulfillment: { acceptedAt: T } },
    ];
    const b = livre(articles);
    const w = wire(b.routes);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    await screen.press('Envoyer la preuve');
    await screen.settle();

    expect(w.calls.filter((c) => c.path === '/media'), 'a colis sends its photo once').toHaveLength(1);
    const photo = rang(w, '/media');
    const defis = w.calls.filter((c) => c.path === '/fulfillment/ready/challenge');
    expect(defis, 'one code for the parcel, not one per article').toHaveLength(1);
    const defi = rang(w, '/fulfillment/ready/challenge');
    expect(defi, 'no code was asked after the photo').toBeGreaterThan(photo);
    const code = b.defis.get('ord-c1');
    expect(code).toBeDefined();
    for (const [o, pv] of [['ord-c1', 'pv-pagne'], ['ord-c2', 'pv-sandales']] as const) {
      const pret = rang(w, '/fulfillment/ready', o);
      expect(pret, `${o}: « prêt » never sent`).toBeGreaterThan(defi);
      expect(w.calls[pret]!.body, o).toMatchObject({
        orderId: o, variant: pv, qty: 1, availableConfirmed: true,
        photoRef: { ref: b.photos[0] }, readinessChallenge: code,
      });
    }
    expect(articles.every((a) => a.fulfillment.readyAt !== undefined), 'an article of the bag was left not ready').toBe(true);
    expect(screen.shows('Prêt, preuve reçue'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Envoyer la preuve')).toBe(false);
    screen.unmount();
  });
  it('verifier MINOR 1 — a colis whose second « prêt » was lost: « Réessayer » keeps the photo, the next tap asks a code for what is LEFT and finishes the bag → « Prêt, preuve reçue »', async () => {
    const colis = { packageId: 'col-q', orderIds: ['ord-q1', 'ord-q2'] };
    const articles: Article[] = [
      { orderId: 'ord-q1', productName: 'Pagne', productVersionId: 'pv-pagne', colis, fulfillment: { acceptedAt: T } },
      { orderId: 'ord-q2', productName: 'Sandales', productVersionId: 'pv-sandales', colis, fulfillment: { acceptedAt: T } },
    ];
    const b = livre(articles, new Set(['ord-q2']));
    const w = wire(b.routes);
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    await screen.press('Envoyer la preuve');
    await screen.settle();
    // the first tap readied the pagne; the sandals' « prêt » was lost
    expect(articles[0]!.fulfillment.readyAt, 'the first article was not readied').toBeDefined();
    expect(articles[1]!.fulfillment.readyAt).toBeUndefined();
    expect(screen.shows("L'envoi n'a pas marché. Réessayez."), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Envoyer la preuve'), 'no way to finish the bag').toBe(true);

    const avant = w.calls.length;
    await screen.press('Envoyer la preuve');
    await screen.settle();
    const retry = w.calls.slice(avant).filter((c) => c.path !== '/fulfillment/mine' && c.path !== '/offers/mine')
      .map((c) => `${c.path}${c.body?.['orderId'] !== undefined ? `:${String(c.body['orderId'])}` : ''}`);
    // the ready pagne is named, refused by name, and sent no second « prêt »
    expect(retry).toEqual(['/media', '/fulfillment/ready/challenge:ord-q1', '/fulfillment/ready/challenge:ord-q2', '/fulfillment/ready:ord-q2']);
    expect(articles.every((a) => a.fulfillment.readyAt !== undefined), 'the bag was left half ready').toBe(true);
    expect(screen.shows('Prêt, preuve reçue'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });
});
