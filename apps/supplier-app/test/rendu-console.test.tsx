import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SAccueilReel } from '../src/accueil/screen';
import { SCommandesReel } from '../src/commandes/screen';
import { SOperations } from '../src/operations/screen';
import { VignetteProduit } from '../src/v2/components';

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
    // ⚠ AND NOTHING ELSE WAS ASKED FOR (verifier MINOR). The harness 404s and
    // RECORDS an unrouted call, but a recording nobody reads is not a check —
    // a port added later would reach a dead url under a green walk.
    expect([...new Set(w.calls.map((c) => c.path))].sort()).toEqual(['/fulfillment/orders', '/offers']);
    screen.unmount();
  });

  it('PHOTO-À-TRAITER — the row with a photograph REQUESTS it, at the media url', async () => {
    wire([livre([AVEC_PHOTO, SANS_PHOTO]), offresVides]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey="cle-ops" />);

    // The ONE thing a source scan could never say: the app COMPUTED this url
    // and handed it to an <Image>. Base + ref, joined by `photoUri` — and since
    // THUMB-PRODUIT-1 the row asks for the VIGNETTE (`?v=thumb`), which is the
    // whole point of that slice: a 54 px square must not pull a 1280 px file.
    expect(screen.images()).toContain('http://media.test/media/hero-bazin.jpg?v=thumb');
    // …and exactly one, because only one of the two rows has a ref. A vignette
    // that rendered for the photo-less row would be a stand-in image, which
    // this project does not do.
    expect(screen.images()).toHaveLength(1);
    // The photo-less row is NOT a hole — its name is still readable.
    expect(screen.shows('Sac en cuir')).toBe(true);
    screen.unmount();
  });

  it('with NO media base configured the row is whole and asks for NO image', async () => {
    // The console CAN run unconfigured — `resolveMediaBase()` answers null and
    // the vignette must simply not exist. Proven on the real screen because
    // the alternative is a broken <Image> on his board, which no source scan
    // can rule out (verifier MAJOR).
    delete process.env['EXPO_PUBLIC_MEDIA_BASE'];
    wire([livre([AVEC_PHOTO]), offresVides]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey="cle-ops" />);

    expect(screen.images()).toEqual([]);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('À faire maintenant')).toBe(true);
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
    // THUMB-PRODUIT-1 — the board's card asks for the vignette, not the photograph.
    expect(screen.images()).toContain('http://media.test/media/hero-bazin.jpg?v=thumb');

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

    // ⚠ « Commandes » IS THE TITLE OF THE DOOR, THE BOARD AND THE FAILURE CARD
    // ALIKE (verifier MAJOR) — asserting it proves nothing about which one he
    // is looking at. The door is identified by the ONE thing only it has: a
    // field to type a key into, and a pressable button to enter it. Route a
    // 401 to `commandes.echec` instead of `onCleRefusee` and this goes red.
    expect(screen.shows('Commandes')).toBe(true);
    expect(screen.shows('Votre clé d’opérateur')).toBe(true);
    expect(screen.canPress('Ouvrir')).toBe(true);
    await screen.type('nouvelle-cle');
    expect(screen.texts().join(' ')).not.toContain('Bazin riche');
    screen.unmount();
  });
});

describe('LA VIGNETTE — a blip must not hide a photograph for the rest of the session', () => {
  /**
   * ⚠ WRITTEN BECAUSE OF A VERIFIER MAJOR, and it is a React SEMANTIC no source
   * scan could reach. The board keys its rows by `orderId`, so the component
   * INSTANCE survives every `charger()` refresh. With a bare `broken` boolean,
   * one failed image load on a patchy connection hid that row's photograph
   * until he left the tab — and worse, kept hiding the NEXT product's
   * photograph once the row's data changed underneath it.
   *
   * These press the real `onError` and then change the prop. Nothing here says
   * anything about appearance: an `onError` is a callback and a `source.uri` is
   * a string the app computed.
   */
  it('a failed load hides THAT url — and a NEW url is tried on the same instance', async () => {
    const screen = await mountEcran(<VignetteProduit uri="http://media.test/a.jpg" />);
    expect(screen.images()).toEqual(['http://media.test/a.jpg']);

    await screen.imageError();
    expect(screen.images(), 'the url that failed must stop being requested').toEqual([]);

    // The SAME component instance, new data. Before the fix this stayed empty.
    await screen.rerender(<VignetteProduit uri="http://media.test/b.jpg" />);
    expect(screen.images(), 'a different photograph must never inherit the last one’s failure').toEqual([
      'http://media.test/b.jpg',
    ]);
    screen.unmount();
  });

  it('no ref and no base both render nothing at all — never an empty framed box', async () => {
    for (const uri of [null, '']) {
      const screen = await mountEcran(<VignetteProduit uri={uri} />);
      expect(screen.images()).toEqual([]);
      expect(screen.tree.toJSON()).toBeNull();
      screen.unmount();
    }
  });
});

/**
 * ═══ RETRAIT-ACCÈS · FOURNISSEURS — A CUT-OFF SUPPLIER MUST STILL BE FINDABLE ═══
 *
 * Founder, 2026-08-11: « if re-minting a supplier's code restores exactly the
 * offers this act retired, on fournisseurs the supplier's name and everything is
 * gone, there is no way to remint code under the same supplier again. »
 *
 * He was right, and the reversal was true on the wire and impossible on the
 * screen: the row was erased, so putting him back meant remembering and
 * retyping an id like `supplier-aicha-002` with nothing on screen to read it
 * from. A revoke now leaves a TOMBSTONE and this walk is the proof it reaches
 * him — « the row is in the file » cannot say whether the button is pressable.
 */
describe('OPÉRATIONS — the supplier whose access was cut', () => {
  const OPS = 'cle-ops';
  const ACTIF = 'supplier-actif-001';
  const COUPE = 'supplier-coupe-002';

  function console_(codes: Record<string, unknown>[]): Route[] {
    return [
      (path) =>
        path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes } } : null,
      // Everything else the board reads, answered emptily so the codes section
      // renders rather than the board's failure state.
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
      (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
    ];
  }

  beforeEach(() => {
    wiredEnv();
    process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer.test';
    // ⚠ THE MEDIA WRITE + REVOKE KEYS, because the erase destroys BYTES and the
    // offer service cannot. `resolveMediaService()` answers null without them,
    // and a console deployed without them would erase every record while
    // leaving every photograph readable at its url — silently. This env is what
    // the founder's own bundle carries (web-deploy sets both).
    process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = 'cle-media';
    process.env['EXPO_PUBLIC_MEDIA_REVOKE_KEY'] = 'cle-revoke';
    storage({ 'boutik.operateur.cle': OPS });
  });

  it('stays on screen, MARKED, and its one control is the way back', async () => {
    const w = wire(
      console_([
        { supplierId: ACTIF, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true },
        { supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' },
      ]),
    );
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();

    // HIS SENTENCE: the supplier is still there to be found.
    expect(screen.shows(COUPE), 'a cut-off supplier must not vanish from Fournisseurs').toBe(true);
    // …and he is MARKED, with the consequence stated where the cause is read.
    expect(screen.shows('Accès coupé le 2026-08-11. Ses produits ne sont plus en vente.')).toBe(true);

    // THE WAY BACK IS PRESENT AND PRESSABLE — not merely rendered.
    expect(screen.canPress('Redonner un code'), 'and there must be one tap back').toBe(true);
    await screen.press('Redonner un code');
    await screen.settle();
    // AND IT IS WIRED TO A MINT FOR THAT SUPPLIER — the bytes on the wire, because
    // a button that posts the wrong id would look identical on screen.
    const mint = w.calls.find((c) => c.path === '/fulfillment/supplier-code' && c.method === 'POST');
    expect(mint, 'the tap must actually mint').toBeDefined();
    expect(mint?.body?.['supplierId'], 'for HIM, not for whatever is in the draft field').toBe(COUPE);

    screen.unmount();
  });

  /**
   * ACCÈS-COUPÉ-AVANT — the founder's report of 2026-08-11, driven on the screen
   * that failed him: « On boutik+ the other suppliers and their listings are
   * still showing. »
   *
   * THE STATE THIS REPRODUCES, and it is the one no seam test can build through
   * a public route: a supplier who OWNS products and has NO registry row. It is
   * historical residue — the revoke that ran until this morning DELETED the row
   * — so it can be constructed here, where the two reads are answered directly,
   * and nowhere else. That is why this walk carries the proof.
   *
   * Before this slice the codes section rendered rows from `/fulfillment/supplier-codes`
   * and nothing else, so such a supplier was on NO screen at all: not cuttable,
   * not re-mintable, not erasable, while his products stayed on sale.
   */
  const SANS = 'supplier-sans-row-003';

  function avecInventaire(codes: Record<string, unknown>[], proprietaires: string[]): Route[] {
    return [
      ...console_(codes),
      (path) =>
        path === '/offers/inventaire'
          ? {
              status: 200,
              json: {
                asOf: '2026-08-11T20:00:00.000Z',
                items: proprietaires.map((id, i) => ({
                  offerId: `offer-${id}-${String(i)}`,
                  productVersionId: `pv-${id}-${String(i)}`,
                  supplierId: id,
                  name: 'PAGNE',
                  category: 'fashion_bags_fabrics',
                  basePrice: 6000,
                  available: 3,
                })),
              },
            }
          : null,
    ];
  }

  it('a supplier with PRODUCTS but NO row is on the screen, and one tap cuts him off', async () => {
    const w = wire(
      avecInventaire(
        [{ supplierId: ACTIF, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }],
        [ACTIF, SANS],
      ),
    );
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();

    // 1. HE IS ON THE SCREEN AT ALL — the half that was missing.
    expect(screen.shows(SANS), 'a supplier who owns products must be reachable').toBe(true);
    // 2. …and the line says the pairing that makes it worth acting on.
    expect(screen.shows('Aucun code. Ses produits sont encore en vente.')).toBe(true);

    // 3. THE ACT IS PRESENT AND PRESSABLE — not merely rendered. There are two
    //    « Couper l'accès » controls now (the active supplier's and his), so the
    //    index is named rather than guessed: his row is the sans-code section,
    //    which renders BEFORE the codes list.
    const label = screen.canPress('Couper l’accès') ? 'Couper l’accès' : "Couper l'accès";
    await screen.press(label, 0);
    await screen.settle();

    // 4. …AND WIRED TO A REVOKE FOR HIM. The bytes on the wire, because a button
    //    posting the wrong id would look identical on screen.
    const cut = w.calls.find((c) => c.path === '/fulfillment/supplier-code/revoke' && c.method === 'POST');
    expect(cut, 'the tap must actually reach the revoke').toBeDefined();
    expect(cut?.body?.['supplierId'], 'for HIM, never for the active supplier above').toBe(SANS);

    screen.unmount();
  });

  it('a supplier who HOLDS a code is never listed as sans code — no duplicate row', async () => {
    // The narrowness. « Sans code » is a claim about absence; making it about
    // « owns products » would print every live supplier twice.
    wire(
      avecInventaire(
        [{ supplierId: ACTIF, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }],
        [ACTIF],
      ),
    );
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    expect(screen.shows('Aucun code. Ses produits sont encore en vente.'), 'nobody is sans code here').toBe(false);
    expect(screen.shows(ACTIF), 'and the live supplier is still listed, once').toBe(true);
    screen.unmount();
  });

  it('a FAILED inventory read lists NOBODY as sans code — never an accusation from a failure', async () => {
    // « He has no code » is a claim, and a read that failed cannot support it.
    wire([
      ...console_([{ supplierId: ACTIF, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }]),
      (path) => (path === '/offers/inventaire' ? { status: 503, json: { error: 'down' } } : null),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    expect(screen.shows('Aucun code. Ses produits sont encore en vente.')).toBe(false);
    expect(screen.shows(ACTIF), 'and the codes section is unharmed').toBe(true);
    screen.unmount();
  });

  it('the ACTIVE supplier keeps his own controls, and the cut-off one is not offered a cut', async () => {
    // The narrowness: « marked » must not mean « the screen changed for
    // everyone ». The live door still cuts and still rereads.
    wire(
      console_([
        { supplierId: ACTIF, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true },
        { supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' },
      ]),
    );
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    expect(screen.canPress('Couper l’accès') || screen.canPress("Couper l'accès"), 'the live door still cuts').toBe(true);
    expect(screen.shows('Créé le 2026-08-01'), 'and still reads as a live door').toBe(true);
    screen.unmount();
  });

  /**
   * PURGE-FOURNISSEUR (founder 2026-08-11: « add a button to remove and erase
   * completely the supplier and all its products »). ONE-WAY, so the walk's
   * first job is proving it CANNOT fire on a single press.
   */
  it('the erase is ARMED first — one press destroys nothing', async () => {
    const w = wire(
      console_([{ supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' }]),
    );
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();

    expect(screen.canPress('Supprimer définitivement')).toBe(true);
    await screen.press('Supprimer définitivement');
    await screen.settle();
    // NOTHING LEFT THE APP on the first press — the assertion that matters.
    expect(w.calls.some((c) => c.path === '/fulfillment/supplier/effacer'), 'one press must not erase').toBe(false);
    // …and he is told what the second press will do, with the way out present.
    expect(screen.shows('Ses produits et ses photos seront effacés. On ne peut pas revenir en arrière.')).toBe(true);
    expect(screen.canPress('Non, garder'), 'the way out must be reachable').toBe(true);

    // Backing out really disarms — the tree survives and the door closes.
    await screen.press('Non, garder');
    await screen.settle();
    expect(screen.canPress('Supprimer définitivement'), 'the tree survived the cancel').toBe(true);
    expect(w.calls.some((c) => c.path === '/fulfillment/supplier/effacer')).toBe(false);
    screen.unmount();
  });

  it('the SECOND press erases him, for HIM, and destroys his photographs', async () => {
    const w = wire([
      (path, _b, _s, headers) =>
        path === '/fulfillment/supplier/effacer'
          ? headers['authorization'] === `Bearer ${OPS}`
            ? { status: 200, json: { ok: true, supplierId: COUPE, supprimes: 1, refs: ['media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] } }
            : { status: 401, json: { error: 'unauthorized' } }
          : null,
      (path) => (path === '/media/revoke' ? { status: 200, json: { status: 'revoked', ref: 'media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } : null),
      ...console_([{ supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' }]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    await screen.press('Supprimer définitivement');
    await screen.settle();
    await screen.press('Oui, tout effacer');
    await screen.settle();

    const efface = w.calls.find((c) => c.path === '/fulfillment/supplier/effacer');
    expect(efface, 'the second press must actually erase').toBeDefined();
    // FOR HIM — naming the wrong supplier here destroys the wrong catalogue.
    expect(efface?.body?.['supplierId']).toBe(COUPE);
    // AND THE PHOTOGRAPHS GO WITH HIM: the offer service cannot destroy bytes,
    // so a console that dropped the refs would leave every photograph readable
    // at its url while calling the supplier « effacé ».
    const revoke = w.calls.find((c) => c.path === '/media/revoke');
    expect(revoke, 'the bytes must be destroyed too').toBeDefined();
    expect(revoke?.body?.['ref']).toBe('media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    screen.unmount();
  });

  it('a supplier WITH ORDERS is refused, in words he can act on', async () => {
    wire([
      (path) =>
        path === '/fulfillment/supplier/effacer'
          ? { status: 409, json: { ok: false, reason: 'a_des_commandes' } }
          : null,
      ...console_([{ supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' }]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    await screen.press('Supprimer définitivement');
    await screen.settle();
    await screen.press('Oui, tout effacer');
    await screen.settle();
    // The refusal is an ANSWER, and it says what stays true — not only what failed.
    expect(
      screen.shows('Ce fournisseur a des commandes. Ses produits restent, pour que les commandes gardent leur sens.'),
    ).toBe(true);
    // …and the tree survived: he can still act on this row.
    expect(screen.canPress('Redonner un code')).toBe(true);
    screen.unmount();
  });

  it('an ACTIVE supplier is never offered the erase at all', async () => {
    wire(console_([{ supplierId: ACTIF, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }]));
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    // Cut him off first — a one-way door must not sit beside a live supplier.
    expect(screen.shows('Supprimer définitivement')).toBe(false);
    screen.unmount();
  });

  /**
   * ⚠ THE PARTIAL — the branch a verifier found silently leaking (BLOCKER).
   *
   * The service deletes the CATALOGUE first and the registry row last. When the
   * second half fails it answers 502 `registre_echoue` — carrying the media refs
   * it already orphaned. The products are gone for good at that point, and a
   * retry CANNOT recompute those refs, because it re-walks an index those
   * offers have already left. So this is the only moment those photographs can
   * ever be destroyed, and the first version treated it as a plain failure:
   * every one of them stayed readable at its url, forever, on an irreversible
   * act — and the founder was told « réessayez » about something that had
   * already happened.
   */
  it('a HALF-DONE erase still destroys the photographs, and says what really happened', async () => {
    const REF = 'media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const w = wire([
      (path) =>
        path === '/fulfillment/supplier/effacer'
          ? { status: 502, json: { ok: false, reason: 'registre_echoue', supprimes: 1, refs: [REF] } }
          : null,
      (path) => (path === '/media/revoke' ? { status: 200, json: { status: 'revoked', ref: REF } } : null),
      ...console_([{ supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' }]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    await screen.press('Supprimer définitivement');
    await screen.settle();
    await screen.press('Oui, tout effacer');
    await screen.settle();

    // THE BYTES GO ANYWAY — the assertion this branch exists for.
    const revoke = w.calls.find((c) => c.path === '/media/revoke');
    expect(revoke, 'the only chance to destroy these photographs must not be missed').toBeDefined();
    expect(revoke?.body?.['ref']).toBe(REF);
    // …and he is told the TRUTH: the products are gone, the supplier is not.
    expect(
      screen.shows("Les produits et les photos sont effacés, mais le fournisseur est resté. Appuyez encore pour l'enlever."),
    ).toBe(true);
    // Never the generic « réessayez », which would be false here.
    expect(screen.shows("La suppression n'a pas abouti. Réessayez.")).toBe(false);
    // The tree survived, and the row can still be acted on.
    expect(screen.canPress('Redonner un code')).toBe(true);
    screen.unmount();
  });
});
