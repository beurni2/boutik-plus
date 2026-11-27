import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Wire } from './rendu';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — HE HEARS HER NOTE WITH HIS OWN KEY, NEVER FROM AN OPEN LINK ═══
 *
 * The buyer's voice note says how to find her home. His console used to hand
 * the browser the open media link; now « Écouter » asks his own door
 * (`GET /fulfillment/repere-audio`, his operations key in the Authorization
 * header, never in a URL), and plays the bytes from a `blob:` address that is
 * released when the card goes away.
 *
 * The four questions, on the real Commandes tab:
 *   · the tree survives every answer (bytes, gone, unreachable, refused key);
 *   · the primary action is present, pressable, and wired to HIS door;
 *   · every way playback stops (pause, end, error) gives the control back;
 *   · a note that cannot come says so, and the order stays usable.
 *
 * Native boundaries doubled, nothing of the app: `globalThis.fetch` (the
 * harness's wire; the one binary answer below wraps it), `localStorage`, and
 * the browser's `Audio` element — which here records what it was given and
 * fires only the events a real element fires. ITS BOUND: it claims nothing
 * about sound or appearance, only what the app handed the element.
 *
 * ⚠ CONTRACT-CERTIFIED: the founder door answers what
 * `services/offer-service/test/repere-audio.e2e.test.ts` proves on workerd
 * (200 bytes + `audio/*` + `private, no-store` · 401 · 404
 * `{error:'not_found'}`); the dispatch rows are recorded Shop+ forms (the
 * harness checks every Shop+ answer).
 */

const OPS_KEY_SLOT = 'boutik.operateur.cle';
const CLE_C_SLOT = 'boutik.livraisons.cle';
const REF = 'media/0f0e0d0c-0b0a-4908-8706-050403020100';
const NOTE = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);

const PRETE = {
  orderId: 'ord-note',
  productVersionId: 'pv-note',
  productName: 'Pagne tissé',
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-11-27T07:00:00.000Z',
  zoneTo: 'Gounghin',
  sellerBasePrice: 9_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-11-27T07:00:01.000Z',
  fulfillment: { acceptedAt: '2026-11-27T07:10:00.000Z', readyAt: '2026-11-27T07:40:00.000Z' },
};

const ligne = (contact: unknown) => ({
  ok: true,
  exists: true,
  orderId: 'ord-note',
  state: 'confirmed',
  createdAt: '2026-11-27T07:00:00.000Z',
  contact,
  productVersionId: 'pv-note',
  zoneTo: 'Gounghin',
  remboursement: null,
  aVerifier: null,
});

const routes = (contact: unknown): Route[] => [
  (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [PRETE] } } : null),
  (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  (path) => (path === '/checkout/gains' ? { status: 200, json: { ok: true, gains: [] } } : null),
  (path) => (path === '/checkout/dlq' ? { status: 200, json: { ok: true, held: 0, dropped: 0, oversize: 0 } } : null),
  (path) => (path === '/checkout/dispatch' ? { status: 200, json: { ok: true, orders: [ligne(contact)] } } : null),
  (path) =>
    path === '/fulfillment/order-evidence'
      ? { status: 404, json: { ok: false, reason: 'not_ready' } }
      : null,
];
const AVEC_NOTE = { phone: '70112233', quartier: 'Gounghin', repere: 'Face à la pharmacie', audioRef: REF };

/** The one binary answer: HIS door, wrapped around the harness wire. */
type Reponse = 'note' | 'absente' | 'refusee' | 'coupee';
function porteNote(fil: Wire, suite: Reponse[]): { appels: { url: string; auth: string | undefined }[] } {
  const appels: { url: string; auth: string | undefined }[] = [];
  const dessous = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input, 'http://boutik.test');
    if (url.pathname !== '/fulfillment/repere-audio') return dessous(input, init);
    const auth = Object.entries((init?.headers ?? {}) as Record<string, string>).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
    appels.push({ url: url.toString(), auth });
    fil.calls.push({ path: url.pathname, method: init?.method ?? 'GET', body: null, headers: auth === undefined ? {} : { authorization: auth } });
    const r = suite.length > 1 ? suite.shift()! : suite[0]!;
    if (r === 'coupee') throw new TypeError('Failed to fetch');
    if (r === 'refusee') return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (r === 'absente') return Response.json({ error: 'not_found' }, { status: 404 });
    if (auth !== 'Bearer cle-ops' || url.searchParams.get('ref') !== REF) return Response.json({ error: 'not_found' }, { status: 404 });
    return new Response(NOTE, { status: 200, headers: { 'Content-Type': 'audio/webm', 'Cache-Control': 'private, no-store' } });
  };
  return { appels };
}

/** The browser's `<audio>`: records its source, fires the events a real one fires. */
class FauxAudio {
  static crees: FauxAudio[] = [];
  static jouer: 'ok' | 'refuse' = 'ok';
  currentTime = 0;
  private ecoutes = new Map<string, (() => void)[]>();
  constructor(readonly src: string) {
    FauxAudio.crees.push(this);
  }
  addEventListener(type: string, f: () => void): void {
    this.ecoutes.set(type, [...(this.ecoutes.get(type) ?? []), f]);
  }
  play(): Promise<void> {
    return FauxAudio.jouer === 'ok' ? Promise.resolve() : Promise.reject(new Error('NotAllowedError'));
  }
  pause(): void {
    this.emettre('pause');
  }
  emettre(type: string): void {
    for (const f of this.ecoutes.get(type) ?? []) f();
  }
}

const liberees: string[] = [];
const revokeReel = URL.revokeObjectURL;

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  storage({ [OPS_KEY_SLOT]: 'cle-ops', [CLE_C_SLOT]: 'cle-c' });
  FauxAudio.crees = [];
  FauxAudio.jouer = 'ok';
  (globalThis as { Audio?: unknown }).Audio = FauxAudio;
  liberees.length = 0;
  URL.revokeObjectURL = (u: string) => {
    liberees.push(u);
    revokeReel(u);
  };
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete (globalThis as { Audio?: unknown }).Audio;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
  URL.revokeObjectURL = revokeReel;
});

const ECOUTER = 'Écouter le repère (sa voix)';
async function ouvrirCommande(contact: unknown, suite: Reponse[]) {
  const fil = wire(routes(contact));
  const note = porteNote(fil, suite);
  const screen = await mountEcran(<SCommandesReel />);
  await screen.settle();
  await screen.press('Prêt à livrer');
  await screen.press('Pagne tissé');
  await screen.settle();
  return { fil, note, screen };
}

describe('the order card plays her note through his own door', () => {
  it('« Écouter » asks HIS door with his key in the header, plays from a blob:, and every stop gives the control back', async () => {
    const { note, screen } = await ouvrirCommande(AVEC_NOTE, ['note']);
    expect(screen.canPress(ECOUTER), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    await screen.press(ECOUTER);
    await screen.settle();
    expect(note.appels.length, 'his door was never called').toBe(1);
    expect(note.appels[0]!.auth).toBe('Bearer cle-ops');
    expect(note.appels[0]!.url, 'the key never rides a URL').not.toContain('cle-ops');
    expect(new URL(note.appels[0]!.url).origin).toBe('http://offer.test');
    expect(FauxAudio.crees.length).toBe(1);
    const lecteur = FauxAudio.crees[0]!;
    expect(lecteur.src.startsWith('blob:'), `played from ${lecteur.src}`).toBe(true);
    expect(screen.canPress('Pause'), 'playing: the control says Pause').toBe(true);

    lecteur.emettre('ended');
    await screen.settle();
    expect(screen.canPress(ECOUTER), 'the end gives the control back').toBe(true);

    await screen.press(ECOUTER);
    await screen.settle();
    expect(note.appels.length, 'the bytes already on his device are played again, not fetched again').toBe(1);
    await screen.press('Pause');
    expect(screen.canPress(ECOUTER), 'his pause gives the control back').toBe(true);

    await screen.press(ECOUTER);
    lecteur.emettre('error');
    await screen.settle();
    expect(screen.canPress(ECOUTER), 'an error gives the control back').toBe(true);

    const blob = lecteur.src;
    screen.unmount();
    expect(liberees, 'the blob: address is released when the card goes away').toContain(blob);
  });

  it('nothing in the console reaches the open media link for her voice', async () => {
    const { fil, screen } = await ouvrirCommande(AVEC_NOTE, ['note']);
    await screen.press(ECOUTER);
    await screen.settle();
    expect(FauxAudio.crees.every((a) => !a.src.includes('media.test')), 'an Audio built on the open media link').toBe(true);
    expect(fil.calls.some((c) => c.path.startsWith('/media/')), 'a fetch of the open media link').toBe(false);
    screen.unmount();
  });

  it('a note that is not there says so; the button goes, the order stays usable', async () => {
    const { screen } = await ouvrirCommande(AVEC_NOTE, ['absente']);
    await screen.press(ECOUTER);
    await screen.settle();
    expect(screen.shows('Sa note vocale n’est pas disponible. Appelez la cliente pour le repère.'), JSON.stringify(screen.texts())).toBe(true);
    expect(screen.canPress(ECOUTER)).toBe(false);
    expect(FauxAudio.crees.length).toBe(0);
    expect(screen.canPress('Pagne tissé'), 'the order card stays usable').toBe(true);
    screen.unmount();
  });

  it('a note that cannot come says so, and pressing again tries again', async () => {
    const { note, screen } = await ouvrirCommande(AVEC_NOTE, ['coupee', 'note']);
    await screen.press(ECOUTER);
    await screen.settle();
    expect(screen.shows('La note n’est pas arrivée. Réessayez.'), JSON.stringify(screen.texts())).toBe(true);
    expect(screen.canPress(ECOUTER), 'the way out: try again').toBe(true);
    await screen.press(ECOUTER);
    await screen.settle();
    expect(note.appels.length).toBe(2);
    expect(screen.shows('La note n’est pas arrivée. Réessayez.')).toBe(false);
    expect(screen.canPress('Pause')).toBe(true);
    screen.unmount();
  });

  it('a refused key goes back to his key door, as every other refused read does', async () => {
    const { screen } = await ouvrirCommande(AVEC_NOTE, ['refusee']);
    await screen.press(ECOUTER);
    await screen.settle();
    expect(screen.shows('Votre clé d’opérateur'), JSON.stringify(screen.texts())).toBe(true);
    expect(screen.canPress('Ouvrir')).toBe(true);
    screen.unmount();
  });

  it('a refused play() leaves no lying « Pause »', async () => {
    FauxAudio.jouer = 'refuse';
    const { screen } = await ouvrirCommande(AVEC_NOTE, ['note']);
    await screen.press(ECOUTER);
    await screen.settle();
    expect(screen.canPress('Pause')).toBe(false);
    expect(screen.canPress(ECOUTER)).toBe(true);
    screen.unmount();
  });

  it('an order with no voice note shows no button; a contact that was never left says so', async () => {
    const sansNote = await ouvrirCommande({ phone: '70112233', quartier: 'Gounghin', repere: 'Face à la pharmacie' }, ['note']);
    expect(sansNote.screen.canPress(ECOUTER)).toBe(false);
    expect(sansNote.screen.shows('70 11 22 33')).toBe(true);
    sansNote.screen.unmount();

    const sansContact = await ouvrirCommande(null, ['note']);
    expect(sansContact.screen.shows('La cliente n’a pas laissé de contact.'), JSON.stringify(sansContact.screen.texts())).toBe(true);
    expect(sansContact.screen.canPress(ECOUTER)).toBe(false);
    sansContact.screen.unmount();
  });
});
