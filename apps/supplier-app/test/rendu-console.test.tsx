import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SAccueilReel } from '../src/accueil/screen';
import { SCommandesReel } from '../src/commandes/screen';

/**
 * ═══ RENDU-RÉEL — THE FOUNDER'S CONSOLE, DRIVEN ═══
 *
 * The first walk in this repo. It exists because of the standing order of
 * 2026-08-10 and it answers, for the two screens this slice touched, the four
 * questions a walk must be able to answer:
 *
 *   · did the tree survive the tap
 *   · is the primary action present AND pressable AND wired to something
 *   · does an act that fires by itself leave a way out when it fails
 *   · can he actually get to the next screen
 *
 * PLUS the thing PHOTO-À-TRAITER added: a paid order's product photograph is
 * REQUESTED, at the url the media base and the ref make together — and a row
 * without a photograph still renders its name instead of a hole.
 *
 * ⚠ CONTRACT-CERTIFIED to the Worker's real answers. Every body below is the
 * shape `services/offer-service/worker/fulfillment-do.ts` actually returns:
 * `{ ok: true, orders: [...] }` with snake-free camelCase row keys, and
 * `productPhotoRef` as the join this slice added at READ time. A fake richer
 * than the service is the §9.8 failure, and it has bitten this project twice.
 */

/** The REAL slot the console reads (`operations/service.ts`). Named here,
 *  not guessed: a wrong key would mount the door and the walk would prove
 *  nothing while looking green. */
const OPS_KEY_SLOT = 'boutik.operateur.cle';

/** Two orders: one WITH a photograph, one without — the two rows he will see. */
const AVEC_PHOTO = {
  orderId: 'ord-avec',
  productVersionId: 'pv-bazin',
  productName: 'Bazin riche',
  productPhotoRef: 'media/hero-bazin.jpg',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-08-10T09:00:00.000Z',
  zoneTo: 'Gounghin',
  sellerBasePrice: 25_000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-08-10T09:00:01.000Z',
};

const SANS_PHOTO = {
  ...AVEC_PHOTO,
  orderId: 'ord-sans',
  productVersionId: 'pv-sac',
  productName: 'Sac en cuir',
  // '' is what the Worker sends for an unknown pv or a product with no assets.
  productPhotoRef: '',
  paidAt: '2026-08-10T08:00:00.000Z',
};

const livre = (orders: readonly unknown[]): Route => (path) =>
  path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: orders as never } } : null;

const contactsVides: Route = (path) =>
  path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null;

/** His products list — the accueil reads it too; an empty book is a real state. */
const offresVides: Route = (path) =>
  path === '/offers' ? { status: 200, json: { items: [], asOf: '2026-08-10T09:00:00.000Z' } } : null;

beforeEach(() => {
  wiredEnv();
  storage({ [OPS_KEY_SLOT]: 'cle-ops' });
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('ACCUEIL — « À faire maintenant », the head of his queue', () => {
  it('mounts on REAL data, shows the waiting order, and asks the board for it', async () => {
    const w = wire([livre([AVEC_PHOTO, SANS_PHOTO]), offresVides]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey="cle-ops" />);

    // The port was CALLED — not merely present in the file.
    expect(w.calls.map((c) => c.path)).toContain('/fulfillment/orders');
    // The tree survived its own effects: the section and both products are there.
    expect(screen.shows('À faire maintenant')).toBe(true);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    screen.unmount();
  });

  it('PHOTO-À-TRAITER — the row with a photograph REQUESTS it, at the media url', async () => {
    wire([livre([AVEC_PHOTO, SANS_PHOTO]), offresVides]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey="cle-ops" />);

    // The ONE thing a source scan could never say: the app COMPUTED this url
    // and handed it to an <Image>. Base + ref, joined by `photoUri`.
    expect(screen.images()).toContain('http://media.test/media/hero-bazin.jpg');
    // …and exactly one, because only one of the two rows has a ref. A vignette
    // that rendered for the photo-less row would be a stand-in image, which
    // this project does not do.
    expect(screen.images()).toHaveLength(1);
    // The photo-less row is NOT a hole — its name is still readable.
    expect(screen.shows('Sac en cuir')).toBe(true);
    screen.unmount();
  });

  it('a row is PRESSABLE and lands him on Commandes — the next screen, reached', async () => {
    wire([livre([AVEC_PHOTO]), offresVides]);
    const vus: string[] = [];
    const screen = await mountEcran(
      <SAccueilReel d={(a) => vus.push(a.t === 'TAB' ? `TAB:${a.tab}` : a.t)} opsKey="cle-ops" />,
    );

    await screen.press('Bazin riche');
    // Wired to SOMETHING, and to the right something.
    expect(vus).toEqual(['TAB:commandes']);
    // And the tap did not blank the tree — the « écran blanc » question.
    expect(screen.shows('Bazin riche')).toBe(true);
    screen.unmount();
  });

  it('a FAILED board read leaves a way out that actually re-reads', async () => {
    const w = wire([
      (path) => (path === '/fulfillment/orders' ? { status: 500, json: { ok: false } } : null),
      offresVides,
    ]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey="cle-ops" />);

    expect(screen.shows('La liste n’est pas arrivée.')).toBe(true);
    // PRESENT, PRESSABLE, AND WIRED — the three separate facts. « Réessayer »
    // over nothing to tap is precisely the bug that reached him twice.
    expect(screen.canPress('Réessayer')).toBe(true);
    const avant = w.calls.filter((c) => c.path === '/fulfillment/orders').length;
    await screen.press('Réessayer');
    expect(w.calls.filter((c) => c.path === '/fulfillment/orders').length).toBeGreaterThan(avant);
    screen.unmount();
  });

  it('with NO key it says so and asks the board for nothing at all', async () => {
    const w = wire([offresVides]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey={null} />);

    expect(screen.shows('Vos ventes arrivent ici avec votre clé')).toBe(true);
    // UNSET RESOLVES TO NOTHING, NEVER TO DEMO — no order call, no invented row.
    expect(w.calls.map((c) => c.path)).not.toContain('/fulfillment/orders');
    screen.unmount();
  });
});

describe('COMMANDES — the board itself', () => {
  it('opens on « À traiter » with the photograph on the card, and the card opens', async () => {
    wire([livre([AVEC_PHOTO, SANS_PHOTO]), contactsVides]);
    const screen = await mountEcran(<SCommandesReel />);

    // The stored key opened the door — no re-typing, which is the whole point
    // of the shared slot (`readStoredOpsKey`).
    expect(screen.shows('Commandes')).toBe(true);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.images()).toContain('http://media.test/media/hero-bazin.jpg');

    // The row's primary act: open it. The tree must survive, and the detail
    // must actually appear — a card that toggles nothing is a dead control.
    const avant = screen.texts().length;
    await screen.press('Bazin riche');
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.texts().length).toBeGreaterThan(avant);
    screen.unmount();
  });

  it('a REFUSED key returns him to the door instead of a dead board', async () => {
    wire([
      (path) => (path === '/fulfillment/orders' ? { status: 401, json: { ok: false } } : null),
      contactsVides,
    ]);
    const screen = await mountEcran(<SCommandesReel />);

    // 401 ⇒ the stored key is cleared and the door is shown again. He can type
    // a new one; he is not stranded looking at an empty list.
    expect(screen.shows('Commandes')).toBe(true);
    expect(screen.texts().join(' ')).not.toContain('Bazin riche');
    screen.unmount();
  });
});
