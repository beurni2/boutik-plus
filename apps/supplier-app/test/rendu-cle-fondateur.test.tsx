import React, { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { SListerReal, type ListingSession } from '../src/v2/lister-real';
import type { CaptureSet } from '../src/v2/studio-real';
import { SProduitsReal } from '../src/v2/produits-real';
import { SOperations } from '../src/operations/screen';
import { SAccueilReel } from '../src/accueil/screen';
import { SZoneCoursiers } from '../src/coursiers/zone';
import { SZoneFonds } from '../src/fonds/zone';
import { initialState, reduce, type A, type S } from '../src/v2/machine';
import { garderPhotosRestantes, reessayerPhotosRestantes } from '../src/supply/media';
import { porteOperateurOuverte } from '../src/operations/view';

/**
 * ═══ RENDU-RÉEL — CLE-FONDATEUR-1: HIS CONSOLE WORKS ON THE KEYS HE TYPES ═══
 *
 * AUDIT-B+2 F-01: the console page used to carry the product write key and
 * the photo-delete key inside its own code. This slice takes both out. Publishing, listing and deleting products now
 * ride the founder's operator key (the one he types once in « Opérations »),
 * and destroying photographs rides a « clé des photos » he types the same way.
 *
 * WHAT THESE WALKS PROVE, screen by screen, with the four questions of the
 * 2026-08-10 order: the tree survives the tap · the primary action is present,
 * pressable and wired · an act that fails leaves a way out · he reaches the
 * next step. And the one thing only a wire can say: WHICH credential left the
 * app on each call.
 *
 * ⚠ CONTRACT-CERTIFIED TO THE REAL DOORS. The offer fake answers exactly as
 * `services/offer-service/worker/index.ts` now does: every `/offers*` call
 * needs `Authorization: Bearer <ops key>`, and the old `X-Write-Key` gets the
 * same 401 as nothing at all. The photo fake answers as the media Worker's
 * revoke door does (`X-Write-Key` = MEDIA_REVOKE_SECRET, 200
 * `{status:'revoked', ref}`). A fake that let the wrong header through would
 * prove nothing (§9.8).
 */

const OPS = 'cle-ops-fondateur';
const PHOTOS = 'cle-photos-fondateur';
const OPS_SLOT = 'boutik.operateur.cle';
const PHOTOS_SLOT = 'boutik.photos.cle';
const MOI = 'supplier-founder-001';
const REF = 'media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REF2 = 'media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** The offer Worker's door, as the slice's server half keeps it. */
function porteOffres(handler: Route): Route {
  return (path, body, search, headers) => {
    if (!path.startsWith('/offers')) return null;
    if (headers['authorization'] !== `Bearer ${OPS}`) return { status: 401, json: { error: 'unauthorized' } };
    return handler(path, body, search, headers);
  };
}

/** The media Worker's revoke door. `cle` is the value its secret holds. */
function porteRevoke(cle: { valeur: string }): Route {
  return (path, body, _s, headers) => {
    if (path !== '/media/revoke') return null;
    if (headers['x-write-key'] !== cle.valeur) return { status: 401, json: { error: 'unauthorized' } };
    return { status: 200, json: { status: 'revoked', ref: String(body?.['ref'] ?? '') } };
  };
}

/** The supplier roster the wizard and Produits read on his key. */
const roster: Route = (path, _b, _s, headers) =>
  path === '/fulfillment/supplier-codes'
    ? headers['authorization'] === `Bearer ${OPS}`
      ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } }
      : { status: 401, json: { error: 'unauthorized' } }
    : null;

const ligne = (offerId: string, name: string, assetRefs: string[]) => ({
  offerId,
  productVersionId: `pv-${offerId}`,
  name,
  category: 'fashion_bags_fabrics',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 4,
  assetRefs,
  supplierId: MOI,
});

/** His inventory and the delete, behind the real door. */
function catalogue(rows: ReturnType<typeof ligne>[]): Route {
  return porteOffres((path, body) => {
    if (path === '/offers/inventaire') {
      return { status: 200, json: { asOf: '2026-09-26T08:00:00.000Z', items: rows as never } };
    }
    if (path === '/offers/delete') {
      const id = String(body?.['offerId'] ?? '');
      const i = rows.findIndex((r) => r.offerId === id);
      if (i >= 0) rows.splice(i, 1);
      return { status: 200, json: { status: 'deleted', offerId: id } };
    }
    if (path === '/offers') {
      return { status: 200, json: { asOf: '2026-09-26T08:00:00.000Z', items: rows.map(({ supplierId: _s, ...r }) => r) as never } };
    }
    return null;
  });
}

const sansFetch = (w: { calls: { path: string }[] }, prefix: string): boolean =>
  !w.calls.some((c) => c.path.startsWith(prefix));

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = 'cle-media-upload';
  delete process.env['EXPO_PUBLIC_OFFER_WRITE_KEY'];
  delete process.env['EXPO_PUBLIC_MEDIA_REVOKE_KEY'];
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

/* ───────────────────────── the listing wizard ───────────────────────── */

/** The shell in miniature: the REAL reduce behind SListerReal, parked on the
 *  recap step with a product he filled in (no studio photos — the photo path
 *  has its own suites; this walk is about the KEY the publish carries). */
function Lister({ actions }: { actions: A[] }) {
  const [st, setSt] = useState<S>(() => {
    const s = reduce(initialState(), { t: 'OPEN_WIZ' }).s;
    return { ...s, wiz: { ...s.wiz, step: 4, name: 'Sac en raphia', code: 'SAC-RAPH-01', B: 10_000, C: 1_000, stock: 3, photos: true } };
  });
  const d = useCallback(
    (a: A) => {
      actions.push(a);
      setSt((prev) => reduce(prev, a).s);
    },
    [actions],
  );
  const [captures] = useState<{ current: CaptureSet | null }>(() => ({ current: null }));
  const [session] = useState<{ current: ListingSession }>(() => ({
    current: { codeTouched: true, suffixBytes: null, pourFournisseur: '', video: null },
  }));
  return <SListerReal st={st} d={d} captures={captures} session={session} />;
}

const publie = (answer: Record<string, unknown>): Route =>
  porteOffres((path) => (path === '/offers' ? { status: 200, json: answer } : null));

describe('LISTER UN PRODUIT — the publish rides the key he typed', () => {
  it('no key on this device: he is told before he types, one tap takes him to Opérations, nothing leaves the app', async () => {
    storage({});
    const w = wire([publie({ status: 'created' }), roster]);
    const actions: A[] = [];
    const screen = await mountEcran(<Lister actions={actions} />);

    expect(screen.shows("Pour publier, entrez d'abord votre clé d'opérateur dans l'onglet Opérations.")).toBe(true);
    // Never the « not wired » sentence: the service IS wired, the key is missing.
    expect(screen.shows('Pas encore relié au service')).toBe(false);
    expect(screen.canPress('Ouvrir Opérations'), 'the way to the key must be one tap').toBe(true);
    await screen.press('Ouvrir Opérations');
    expect(actions.some((a) => a.t === 'TAB' && a.tab === 'operations'), 'the tap must reach Opérations').toBe(true);
    expect(sansFetch(w, '/offers'), 'no product call without a key').toBe(true);
    screen.unmount();
  });

  it('with his key: « Publier » sends HIS key as Bearer, never the old header, and lands on « C’est publié »', async () => {
    storage({ [OPS_SLOT]: OPS });
    const w = wire([publie({ status: 'created', preview: { sellerNetFcfa: 9_500, sellerPlatformFeeFcfa: 500 } }), roster]);
    const screen = await mountEcran(<Lister actions={[]} />);

    expect(screen.canPress("Publier — c'est gratuit")).toBe(true);
    await screen.press("Publier — c'est gratuit");
    await screen.settle();

    const post = w.calls.find((c) => c.path === '/offers' && c.method === 'POST');
    expect(post, 'the publish must actually go out').toBeDefined();
    expect(post?.headers['authorization']).toBe(`Bearer ${OPS}`);
    expect(post?.headers['x-write-key'], 'the retired header must never ride again').toBeUndefined();
    expect(screen.shows("C'est publié. Votre produit est en ligne.")).toBe(true);
    screen.unmount();
  });

  it('a refused key: he types the right one ON THE PANE and the SAME product goes out — his form is never lost', async () => {
    const store = storage({ [OPS_SLOT]: 'une-ancienne-cle' });
    const w = wire([publie({ status: 'created' }), roster]);
    const actions: A[] = [];
    const screen = await mountEcran(<Lister actions={actions} />);
    await screen.press("Publier — c'est gratuit");
    await screen.settle();

    expect(screen.shows("Votre clé d'opérateur n'a pas été acceptée. Rien n'a été publié.")).toBe(true);
    // Never the raw wire answer as the thing he reads.
    expect(screen.texts().join(' ')).not.toContain('HTTP 401');
    // A retry on the refused key could only fail again (verifier MINOR): not offered.
    expect(screen.shows('Réessayer')).toBe(false);

    await screen.type(OPS, "Votre clé d'opérateur");
    await screen.press('Enregistrer la clé et publier');
    await screen.settle();
    const posts = w.calls.filter((c) => c.path === '/offers' && c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1]?.headers['authorization']).toBe(`Bearer ${OPS}`);
    // THE SAME PRODUCT: same identity, same name — nothing he typed was lost.
    expect(posts[1]?.body?.['offerId']).toBe(posts[0]?.body?.['offerId']);
    expect((posts[1]?.body?.['product'] as { name?: string } | undefined)?.name).toBe('Sac en raphia');
    expect(screen.shows("C'est publié. Votre produit est en ligne.")).toBe(true);
    expect(store.get(OPS_SLOT), 'and the key is kept for the other screens').toBe(OPS);
    expect(actions.some((a) => a.t === 'TAB' || a.t === 'OPEN_WIZ'), 'he never had to leave the wizard').toBe(false);
    screen.unmount();
  });

  it('a product version another live offer holds: refused in plain words, never a raw code', async () => {
    storage({ [OPS_SLOT]: OPS });
    wire([publie({ status: 'refused', reason: 'product_version_taken' }), roster]);
    const screen = await mountEcran(<Lister actions={[]} />);
    await screen.press("Publier — c'est gratuit");
    await screen.settle();

    expect(screen.shows("Ce produit est déjà en ligne sous une autre référence. Rien n'a été publié.")).toBe(true);
    expect(screen.texts().join(' ')).not.toContain('product_version_taken');
    expect(screen.canPress('Corriger'), 'the way back to the form').toBe(true);
    screen.unmount();
  });
});

/* ───────────────────────────── Produits ───────────────────────────── */

const monterProduits = (d: (a: A) => void = () => {}): Promise<Screen> =>
  mountEcran(<SProduitsReal st={initialState()} d={d} supplierId={MOI} cache={{ current: { rows: null, asOf: null } }} />);

describe('PRODUITS — his list and his delete on his key', () => {
  it('no key: the list says where to type it, one tap goes there, and the service is asked nothing', async () => {
    storage({});
    const w = wire([catalogue([ligne('o1', 'Pagne wax', [])]), roster]);
    const actions: A[] = [];
    const screen = await monterProduits((a) => actions.push(a));

    expect(screen.shows("Vos produits s'affichent ici avec votre clé d'opérateur.")).toBe(true);
    expect(screen.shows('Pas encore relié')).toBe(false);
    await screen.press('Ouvrir Opérations');
    expect(actions.some((a) => a.t === 'TAB' && a.tab === 'operations')).toBe(true);
    expect(sansFetch(w, '/offers')).toBe(true);
    screen.unmount();
  });

  it('a refused key says the key was refused — not « réseau », not an empty shop, and is not tried again', async () => {
    storage({ [OPS_SLOT]: 'une-ancienne-cle' });
    const w = wire([catalogue([ligne('o1', 'Pagne wax', [])]), roster]);
    const screen = await monterProduits();
    expect(screen.shows("Votre clé d'opérateur n'a pas été acceptée.")).toBe(true);
    // The fallback list rides the SAME key: asking it again could only fail
    // again, so a refused key stops at the first answer.
    expect(w.calls.filter((c) => c.path === '/offers'), 'no second read on a key already refused').toEqual([]);
    expect(screen.shows("Aucun produit pour l'instant")).toBe(false);
    expect(screen.canPress('Ouvrir Opérations')).toBe(true);
    screen.unmount();
  });

  it('a product without photos deletes on HIS Bearer — no photo key needed, nothing on the old header', async () => {
    storage({ [OPS_SLOT]: OPS });
    const w = wire([catalogue([ligne('o1', 'Pagne wax', [])]), roster]);
    const screen = await monterProduits();
    await screen.press('Pagne wax');
    await screen.press('Supprimer ce produit');
    await screen.press('Oui, supprimer');

    const del = w.calls.find((c) => c.path === '/offers/delete');
    expect(del?.headers['authorization']).toBe(`Bearer ${OPS}`);
    expect(del?.headers['x-write-key']).toBeUndefined();
    expect(screen.texts().join(' '), 'it left the list').not.toContain('Pagne wax');
    screen.unmount();
  });

  it('a product WITH photos and no photo key here: the delete is not offered, and the fiche says what to do', async () => {
    storage({ [OPS_SLOT]: OPS });
    const w = wire([catalogue([ligne('o1', 'Pagne wax', [REF])]), roster]);
    const screen = await monterProduits();
    await screen.press('Pagne wax');

    expect(screen.shows('Supprimer ce produit')).toBe(false);
    expect(screen.shows("Pour supprimer ce produit et ses photos, enregistrez d'abord la clé des photos dans Opérations.")).toBe(true);
    // The fiche is alive: the way back works.
    expect(sansFetch(w, '/offers/delete')).toBe(true);
    screen.unmount();
  });

  it('with the photo key: the photos go on THAT key; a refused one is counted, and the retry on the right key clears it', async () => {
    const store = storage({ [OPS_SLOT]: OPS, [PHOTOS_SLOT]: 'mauvaise-cle-photos' });
    const secret = { valeur: PHOTOS };
    const w = wire([catalogue([ligne('o1', 'Pagne wax', [REF, REF2]), ligne('o2', 'Bazin', [])]), porteRevoke(secret), roster]);
    const screen = await monterProduits();
    await screen.press('Pagne wax');
    await screen.press('Supprimer ce produit');
    await screen.press('Oui, supprimer');
    await screen.settle();

    const revokes = w.calls.filter((c) => c.path === '/media/revoke');
    expect(revokes.map((c) => c.body?.['ref'])).toEqual([REF, REF2]);
    expect(revokes.every((c) => c.headers['x-write-key'] === 'mauvaise-cle-photos'), 'the TYPED key, not a bundled one').toBe(true);
    // The product is gone — and the two photos that were not are SAID, with a way out.
    expect(screen.texts().join(' ')).not.toContain('Pagne wax');
    expect(screen.shows("2 photos n'ont pas pu être effacées. Vérifiez le réseau et la clé des photos dans Opérations, puis réessayez.")).toBe(true);
    expect(screen.canPress("Réessayer d'effacer les photos")).toBe(true);

    // He does what the sentence says (verifier BLOCKER): he LEAVES for
    // Opérations — Produits unmounts — fixes the key there, and comes back.
    screen.unmount();
    store.set(PHOTOS_SLOT, PHOTOS);
    const retour = await monterProduits();
    expect(retour.shows("2 photos n'ont pas pu être effacées"), 'the photos are still remembered').toBe(true);
    await retour.press("Réessayer d'effacer les photos");
    await retour.settle();
    const apres = w.calls.filter((c) => c.path === '/media/revoke').slice(2);
    expect(apres.map((c) => c.body?.['ref'])).toEqual([REF, REF2]);
    expect(apres.every((c) => c.headers['x-write-key'] === PHOTOS), 'the retry reads the key NOW').toBe(true);
    expect(retour.shows("n'ont pas pu être effacées")).toBe(false);
    expect(store.has('boutik.photos.restantes'), 'nothing left to remember').toBe(false);
    expect(retour.shows('Bazin'), 'the rest of his list is untouched').toBe(true);
    retour.unmount();
  });
});

/* ───────────────────────────── Accueil ───────────────────────────── */

describe('ACCUEIL — his product count reads on his key', () => {
  it('the count is asked with HIS Bearer, never the old header', async () => {
    storage({ [OPS_SLOT]: OPS });
    const w = wire([
      catalogue([ligne('o1', 'Pagne wax', [])]),
      (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
    ]);
    const screen = await mountEcran(<SAccueilReel d={() => {}} opsKey={OPS} />);
    const lecture = w.calls.find((c) => c.path === '/offers');
    expect(lecture?.headers['authorization']).toBe(`Bearer ${OPS}`);
    expect(lecture?.headers['x-write-key']).toBeUndefined();
    expect(screen.texts().length, 'the tree is alive').toBeGreaterThan(0);
    screen.unmount();
  });
});

/* ─────────────────────────── Opérations ─────────────────────────── */

const COUPE = 'supplier-coupe-002';
const autourBoard = (codes: Record<string, unknown>[]): Route[] => [
  (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes } } : null),
  (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
  (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
];
const coupe = { supplierId: COUPE, mintedAt: '2026-07-02T08:00:00.000Z', revelable: true, revokedAt: '2026-08-11T15:00:00.000Z' };

describe('OPÉRATIONS — the photo key door, and every key can be forgotten here', () => {
  it('the photo key: typed, kept on this device, and « Oublier la clé sur cet appareil » really removes it', async () => {
    const store = storage({ [OPS_SLOT]: OPS });
    wire(autourBoard([]));
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);

    expect(screen.shows('Clé des photos')).toBe(true);
    await screen.type(PHOTOS, 'Clé des photos');
    await screen.press('Enregistrer la clé');
    expect(store.get(PHOTOS_SLOT)).toBe(PHOTOS);
    expect(screen.shows('Enregistrée sur cet appareil.')).toBe(true);

    // Two forget buttons now: the photo key's own (first, in its section) and
    // the operator key's at the foot of the board. The first is this door's.
    await screen.press('Oublier la clé sur cet appareil', 0);
    expect(store.has(PHOTOS_SLOT), 'forgotten means gone from the device').toBe(false);
    expect(store.get(OPS_SLOT), 'and ONLY that key').toBe(OPS);
    expect(screen.canPress('Enregistrer la clé'), 'and the door is back').toBe(true);
    screen.unmount();
  });

  it('without the photo key the erase cannot be armed — and the row says why, instead of a dead button', async () => {
    storage({ [OPS_SLOT]: OPS });
    const w = wire(autourBoard([coupe]));
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    expect(screen.shows('Supprimer définitivement')).toBe(false);
    expect(screen.shows("Pour supprimer, enregistrez d'abord la clé des photos, plus bas.")).toBe(true);
    expect(screen.canPress('Redonner un code'), 'the rest of the row still works').toBe(true);
    expect(sansFetch(w, '/fulfillment/supplier/effacer')).toBe(true);
    screen.unmount();
  });

  it('an erase whose photos are refused: the count is said, and the retry on the right key finishes the job', async () => {
    const store = storage({ [OPS_SLOT]: OPS, [PHOTOS_SLOT]: 'mauvaise-cle-photos' });
    const w = wire([
      (path) =>
        path === '/fulfillment/supplier/effacer'
          ? { status: 200, json: { ok: true, supplierId: COUPE, supprimes: 2, refs: [REF, REF2] } }
          : null,
      porteRevoke({ valeur: PHOTOS }),
      ...autourBoard([coupe]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press('Supprimer définitivement');
    await screen.press('Oui, tout effacer');
    await screen.settle();

    expect(w.calls.filter((c) => c.path === '/media/revoke')).toHaveLength(2);
    expect(screen.shows("2 photos n'ont pas pu être effacées. Vérifiez le réseau et la clé des photos dans Opérations, puis réessayez.")).toBe(true);

    // Leaving the board and coming back loses nothing (the device remembers).
    screen.unmount();
    store.set(PHOTOS_SLOT, PHOTOS);
    const retour = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    expect(retour.shows("2 photos n'ont pas pu être effacées")).toBe(true);
    await retour.press("Réessayer d'effacer les photos");
    await retour.settle();
    const apres = w.calls.filter((c) => c.path === '/media/revoke').slice(2);
    expect(apres.map((c) => c.body?.['ref'])).toEqual([REF, REF2]);
    expect(retour.shows("n'ont pas pu être effacées")).toBe(false);
    retour.unmount();
  });

  it('a HALF-DONE erase no longer claims the photos are gone before they are', async () => {
    storage({ [OPS_SLOT]: OPS, [PHOTOS_SLOT]: 'mauvaise-cle-photos' });
    wire([
      (path) =>
        path === '/fulfillment/supplier/effacer'
          ? { status: 502, json: { ok: false, reason: 'registre_echoue', supprimes: 1, refs: [REF] } }
          : null,
      porteRevoke({ valeur: PHOTOS }),
      ...autourBoard([coupe]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press('Supprimer définitivement');
    await screen.press('Oui, tout effacer');
    await screen.settle();
    expect(screen.shows("Les produits sont effacés, mais le fournisseur est resté. Appuyez encore pour l'enlever.")).toBe(true);
    expect(screen.shows("1 photo n'a pas pu être effacée. Vérifiez le réseau et la clé des photos dans Opérations, puis réessayez.")).toBe(true);
    screen.unmount();
  });

  it('his operator key: « Oublier la clé sur cet appareil » removes it and brings the door back', async () => {
    const store = storage({ [OPS_SLOT]: OPS });
    wire(autourBoard([]));
    let oubliee = false;
    const screen = await mountEcran(
      <SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => { oubliee = true; }} />,
    );
    await screen.press('Oublier la clé sur cet appareil', 0);
    expect(store.has(OPS_SLOT)).toBe(false);
    expect(oubliee, 'the shell must learn it, or the tabs keep a dead key').toBe(true);
    screen.unmount();
  });

  it('the key door tells the truth: the key is sent to Boutik+, and it can be forgotten', async () => {
    storage({});
    wire([]);
    const screen = await mountEcran(<SOperations opsKey={null} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    expect(screen.shows('ne part nulle part')).toBe(false);
    expect(screen.shows('Elle est envoyée seulement à Boutik+, à chaque échange.')).toBe(true);
    screen.unmount();
  });

  it('a new supplier code says he can see it again — never « il ne s’affichera plus »', async () => {
    storage({ [OPS_SLOT]: OPS });
    wire([
      (path) =>
        path === '/fulfillment/supplier-code'
          ? { status: 200, json: { ok: true, supplierId: 'supplier-neuf-003', code: 'BTK-1234-5678', mintedAt: '2026-09-26T08:00:00.000Z' } }
          : null,
      ...autourBoard([]),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.type('supplier-neuf-003', 'Nom du fournisseur');
    await screen.press('Créer le code');
    await screen.settle();
    expect(screen.shows('BTK-1234-5678')).toBe(true);
    expect(screen.shows('Donnez-le-lui maintenant. Vous pourrez le revoir ici.')).toBe(true);
    expect(screen.shows("Il ne s'affichera plus")).toBe(false);
    screen.unmount();
  });

  it('key C (Revendeuses): « Oublier la clé sur cet appareil » removes it and the door comes back', async () => {
    process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
    const store = storage({ [OPS_SLOT]: OPS, 'boutik.livraisons.cle': 'cle-c' });
    wire([
      ...autourBoard([]),
      (path) => (path === '/reseller/accounts' ? { status: 200, json: { ok: true, accounts: [] } } : null),
      (path) => (path === '/reseller/suivi' ? { status: 200, json: { ok: true, lignes: [] } } : null),
      (path) => (path === '/reseller/codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
    ]);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.press('Revendeuses');
    // Key C's own section comes first; the operator key's is at the foot.
    await screen.press('Oublier la clé sur cet appareil', 0);
    expect(store.has('boutik.livraisons.cle')).toBe(false);
    expect(screen.canPress('Ouvrir avec la clé Shop+'), 'the key-C door is back').toBe(true);
    expect(store.get(OPS_SLOT), 'the other keys are untouched').toBe(OPS);
    screen.unmount();
  });
});

describe('THE OTHER DOORS — Séra and the fund can be forgotten too', () => {
  it('the Séra key: « Oublier la clé sur cet appareil » removes it and the door comes back', async () => {
    process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://logistics.test';
    const store = storage({ 'boutik.coursiers.cle': 'cle-sera' });
    wire([
      (path) => (path === '/ops/riders' ? { status: 200, json: { ok: true, riders: [] } } : null),
      (path) => (path === '/ops/rider-codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
      (path) => (path === '/ops/board' ? { status: 200, json: { ok: true, board: { queued: [], riders: [], assignments: [] } } } : null),
    ]);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.press('Oublier la clé sur cet appareil');
    expect(store.has('boutik.coursiers.cle')).toBe(false);
    expect(screen.shows('Votre clé Séra')).toBe(true);
    screen.unmount();
  });

  it('the fund key: the same words, the same effect', async () => {
    process.env['EXPO_PUBLIC_PROTECTION_BASE'] = 'http://fonds.test';
    const store = storage({ 'boutik.fonds.cle': 'cle-fonds' });
    wire([
      (path) => (path === '/claims' ? { status: 200, json: { claims: [] } } : null),
      (path) => (path === '/fund' ? { status: 200, json: { declaration: null, committedClaimsAmountFcfa: 0, solvency: { state: 'HEALTHY' } } } : null),
    ]);
    const screen = await mountEcran(<SZoneFonds />);
    await screen.press('Oublier la clé sur cet appareil');
    expect(store.has('boutik.fonds.cle')).toBe(false);
    expect(screen.canPress('Ouvrir le registre')).toBe(true);
    screen.unmount();
  });
});

describe('THE PHOTOS STILL TO DESTROY — remembered by the device, updated in place', () => {
  it('a retry still running never drops photos a delete adds meanwhile (verifier MAJOR)', async () => {
    const store = storage({ [PHOTOS_SLOT]: PHOTOS, 'boutik.photos.restantes': JSON.stringify([REF]) });
    wire([porteRevoke({ valeur: PHOTOS })]);
    const enCours = reessayerPhotosRestantes(); // REF is being destroyed…
    garderPhotosRestantes([REF2]); // …while another delete leaves REF2 behind
    expect(await enCours, 'the retry removes only what IT destroyed').toEqual([REF2]);
    expect(JSON.parse(store.get('boutik.photos.restantes') ?? '[]')).toEqual([REF2]);
  });

  it('only this system’s photos are kept, and never twice', () => {
    storage({});
    expect(garderPhotosRestantes([REF, 'https://ailleurs.example/x', REF, 'private/device/abc'])).toEqual([REF]);
    expect(garderPhotosRestantes([REF, REF2])).toEqual([REF, REF2]);
  });
});

describe('THE « OPÉRATIONS » TAB — reachable once he is sent there or saves a key', () => {
  it('opens with a key saved this session or while he stands on it, and stays open once open', () => {
    expect(porteOperateurOuverte(false, null, false), 'a keyless device, elsewhere: no tab').toBe(false);
    expect(porteOperateurOuverte(false, null, true), 'sent there by « Ouvrir Opérations »').toBe(true);
    expect(porteOperateurOuverte(false, OPS, false), 'a key saved this session').toBe(true);
    expect(porteOperateurOuverte(true, null, false), 'once open, a forgotten key never hides it').toBe(true);
  });
});
