import React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { armerSelecteur, desarmerSelecteur } from './doubles/expo-image-picker';
import { armerManipulateur } from './doubles/expo-image-manipulator';
import { armerLectureDataUri, desarmerLecture } from './doubles/expo-file-system';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';
import { SCommandesReel } from '../src/commandes/screen';
import { bytesToBase64 } from '../src/studio/normalization';

/**
 * ═══ RENDU-RÉEL — NO SCREEN WAITS FOREVER (PREUVE-PRETE-1, AUDIT-B+2 F-27) ═══
 *
 * A socket that stalls is not a throw: before this slice the screen sat on
 * « Envoi en cours… », « On vérifie le code… » (while the coursier waited) or
 * the Commandes loading card, with no way out, and every refresh was skipped.
 * The standing order's third question — « does an act that fires by itself
 * leave a way out when it fails » — asked of the one failure no test had
 * staged: the answer that never comes.
 *
 * THE STALL, and why it is honest: only `fetch` is faked. A stalled call is a
 * promise that never settles UNTIL its request is aborted — exactly what a
 * browser does with a dead socket and an `AbortController`. The clock is moved,
 * not waited for. Nothing of the app is stubbed.
 */

const CODE = 'FOURN-DELAI-1';
const T = '2026-09-29T08:00:00.000Z';

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

/** Calls to these paths hang until aborted; each one is counted. */
function bloquer(chemins: Set<string>): { bloques: string[] } {
  const bloques: string[] = [];
  const reel = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = (input: string, init?: RequestInit): Promise<Response> => {
    const path = new URL(input, 'http://boutik.test').pathname;
    if (!chemins.has(path)) return reel(input, init);
    bloques.push(path);
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
  };
  return { bloques };
}

async function attendre(screen: Screen, ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await screen.settle();
}

const commande = (orderId: string, fulfillment: Record<string, string>): Record<string, unknown> => ({
  orderId, productName: 'Bazin', productVersionId: 'pv-bazin', offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY', paidAt: T, sellerBasePrice: 8_000,
  // a new order carries no progress block at all, as the real list sends it
  ...(Object.keys(fulfillment).length > 0 ? { fulfillment } : {}),
});
const sonLivre = (orders: Record<string, unknown>[]): Route[] => [
  (path) => (path === '/fulfillment/mine' ? { status: 200, json: { ok: true, orders } } : null),
  (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
  (path, body) =>
    path === '/fulfillment/ready/challenge'
      ? { status: 200, json: { ok: true, challenge: `srch-00000000-0000-4000-8000-00000000000${String(body?.['orderId']).length % 10}`, expiresAt: '2026-09-29T08:10:00.000Z' } }
      : null,
];

beforeEach(() => {
  vi.useFakeTimers();
  wiredEnv();
});
afterEach(() => {
  vi.useRealTimers();
  desarmerSelecteur();
  armerManipulateur(null);
  desarmerLecture();
  delete process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'];
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('F-27 — his page: every wait ends, on a sentence and a button that tries again', () => {
  it('the photo upload never answers: « Envoyer la preuve » gives up with « La photo n’a pas pu partir. Réessayez. », keeps his photo, and the button sends again', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = 'test-walk-media-write-key';
    armerSelecteur([{ uri: 'file:///DCIM/colis.jpg', mimeType: 'image/jpeg', fileName: 'colis.jpg' }]);
    armerManipulateur({ base64: bytesToBase64(JPEG), width: 16, height: 16 });
    armerLectureDataUri();
    wire(sonLivre([commande('ord-d1', { acceptedAt: T })]));
    const { bloques } = bloquer(new Set(['/media']));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.press('Choisir la photo du colis');
    await screen.press('Envoyer la preuve');
    expect(bloques, 'the photo never left').toEqual(['/media']);
    expect(screen.canPress('Envoyer la preuve'), 'a send in flight must not be pressable twice').toBe(false);

    // an honest slow upload is not cut at the read ceiling…
    await attendre(screen, 12_000);
    expect(screen.shows("La photo n'a pas pu partir. Réessayez."), 'a slow photo was cut like a read').toBe(false);
    // …only at its own
    await attendre(screen, 18_000);
    expect(screen.shows("La photo n'a pas pu partir. Réessayez."), `still waiting: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.images().some((u) => u.startsWith('data:image/jpeg;base64,')), 'his photo was thrown away').toBe(true);
    expect(screen.canPress('Envoyer la preuve')).toBe(true);
    await screen.press('Envoyer la preuve');
    expect(bloques, 'the retry sent nothing').toEqual(['/media', '/media']);
    screen.unmount();
  });

  it('the pickup check never answers while the coursier waits: « On vérifie le code… » gives up with its sentence, and « Vérifier le code » checks again', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(sonLivre([commande('ord-d2', { acceptedAt: T, readyAt: T })]));
    const { bloques } = bloquer(new Set(['/fulfillment/ramassage/verify']));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    await screen.type('RAM-K7M', 'Code du coursier');
    await screen.press('Vérifier le code');
    expect(screen.shows('On vérifie le code…'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    // the Worker is asking Séra meanwhile: two hops are not cut at one hop's ceiling…
    await attendre(screen, 12_000);
    expect(screen.shows('On vérifie le code…'), 'the check was cut while Séra could still answer').toBe(true);
    // …only at the relay's own
    await attendre(screen, 13_000);
    expect(screen.shows('On vérifie le code…'), 'still « on vérifie » after the ceiling').toBe(false);
    expect(screen.shows('Pas de réponse pour le moment. Réessayez.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Vérifier le code')).toBe(true);
    await screen.press('Vérifier le code');
    expect(bloques).toHaveLength(2);
    screen.unmount();
  });

  it('his product photos never answer: his ORDERS still land at once — the photo read no longer holds the list', async () => {
    storage({ 'boutik.fournisseur.code': CODE });
    wire(sonLivre([commande('ord-d3', {})]));
    bloquer(new Set(['/offers/mine']));
    const screen = await mountEcran(<FournisseurApp />);
    await screen.press('Commandes');
    expect(screen.shows('Bazin'), `the list waited on the photos: ${JSON.stringify(screen.texts())}`).toBe(true);
    await attendre(screen, 12_000);
    expect(screen.shows('Bazin'), 'the photo read giving up took the list with it').toBe(true);
    screen.unmount();
  });
});

describe('F-27 — the founder’s Commandes: the loading card always ends', () => {
  it('the book never answers: « Lecture des commandes… » becomes « La liste n’est pas arrivée. » with « Réessayer », which reads again', async () => {
    storage({ 'boutik.operateur.cle': 'cle-ops' });
    let enPanne = true;
    wire([
      (path) =>
        path === '/fulfillment/orders'
          ? { status: 200, json: { ok: true, orders: [{
              orderId: 'ord-c1', productName: 'Pagne wax', productVersionId: 'pv-c1', productPhotoRef: '', offerVersion: 'ov-1',
              paymentMode: 'FULL_PREPAY', paidAt: T, zoneTo: 'Gounghin', sellerBasePrice: 9_000,
              supplierId: 'sup-1', supplierResolved: true, registeredAt: T,
            }] } }
          : null,
      (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
    ]);
    const reel = globalThis.fetch;
    let bloques = 0;
    (globalThis as { fetch: unknown }).fetch = (input: string, init?: RequestInit): Promise<Response> => {
      if (enPanne && new URL(input, 'http://boutik.test').pathname === '/fulfillment/orders') {
        bloques += 1;
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        });
      }
      return reel(input, init);
    };
    const screen = await mountEcran(<SCommandesReel />);
    expect(screen.shows('Lecture des commandes…')).toBe(true);

    await attendre(screen, 12_000);
    expect(screen.shows('Lecture des commandes…'), 'the loading card has no way out').toBe(false);
    expect(screen.shows('La liste n’est pas arrivée.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Réessayer')).toBe(true);

    enPanne = false;
    await screen.press('Réessayer');
    await screen.settle();
    expect(bloques).toBe(1);
    expect(screen.shows('Pagne wax'), `the retry did not read again: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });
});
