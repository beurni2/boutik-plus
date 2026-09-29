import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Wire } from './rendu';
import { armerSelecteur, desarmerSelecteur, ouvertures } from './doubles/expo-image-picker';
import { armerManipulateur } from './doubles/expo-image-manipulator';
import { armerLectureDataUri, desarmerLecture } from './doubles/expo-file-system';
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
 * challenge is minted per order and REPLACES the last one; the photo store
 * mints a fresh `media/<uuid v4>` per upload; « prêt » is accepted only for
 * the order's live challenge and a photo the store minted (the real door's
 * F-39 rule), and then marks the order ready — which the next list read shows.
 */
function livre(articles: Article[]): { routes: Route[]; photos: string[]; defis: Map<string, string> } {
  const photos: string[] = [];
  const defis = new Map<string, string>();
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
      n += 1;
      const challenge = `srch-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      defis.set(String(body?.['orderId']), challenge);
      return { status: 200, json: { ok: true, challenge, expiresAt: '2026-09-29T08:10:00.000Z' } };
    },
    (path) => {
      if (path !== '/media') return null;
      const ref = `media/0f8fad5b-d9cb-469f-a165-${String(photos.length + 1).padStart(12, '0')}`;
      photos.push(ref);
      return { status: 201, json: { ref, contentType: 'image/jpeg', width: 16, height: 16, byteLength: JPEG.length } };
    },
    (path, body) => {
      if (path !== '/fulfillment/ready') return null;
      const orderId = String(body?.['orderId']);
      const photoRef = body?.['photoRef'] as { ref?: string } | undefined;
      if (defis.get(orderId) !== body?.['readinessChallenge']) {
        return { status: 409, json: { ok: false, reason: 'challenge_missing_or_mismatched' } };
      }
      if (!photos.includes(String(photoRef?.ref))) return { status: 400, json: { ok: false, reason: 'photo_not_uploaded' } };
      const a = articles.find((x) => x.orderId === orderId)!;
      a.fulfillment.readyAt = '2026-09-29T08:02:00.000Z';
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

  it('a colis: ONE photo uploaded, then for EACH article its own challenge and its own « prêt » under that same photo → the card says « Prêt, preuve reçue »', async () => {
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
    for (const [o, pv] of [['ord-c1', 'pv-pagne'], ['ord-c2', 'pv-sandales']] as const) {
      const defi = rang(w, '/fulfillment/ready/challenge', o);
      const pret = rang(w, '/fulfillment/ready', o);
      expect(defi, `${o}: no challenge`).toBeGreaterThan(photo);
      expect(pret, `${o}: « prêt » never sent`).toBeGreaterThan(defi);
      expect(w.calls[pret]!.body, o).toMatchObject({
        orderId: o, variant: pv, qty: 1, availableConfirmed: true,
        photoRef: { ref: b.photos[0] }, readinessChallenge: b.defis.get(o),
      });
    }
    expect(articles.every((a) => a.fulfillment.readyAt !== undefined), 'an article of the bag was left not ready').toBe(true);
    expect(screen.shows('Prêt, preuve reçue'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Envoyer la preuve')).toBe(false);
    screen.unmount();
  });
});
