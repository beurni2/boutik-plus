import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SProduitsReal } from '../src/v2/produits-real';
import { initialState } from '../src/v2/machine';

/**
 * ═══ RENDU-RÉEL — SUPPRIMER UN PRODUIT, INCLUDING ONE LISTED FOR ANOTHER
 * SUPPLIER (founder report, 2026-08-11) ═══
 *
 * « the boutik+ deleted products bug I am talking about is the products listed
 * for another supplier's listing. »
 *
 * WHAT WAS ALREADY RULED OUT BEFORE THIS WAS WRITTEN, by driving the REAL
 * combined Worker in miniflare: the server path is sound for another supplier
 * exactly as for his own — mint the other supplier's code, create the offer,
 * read it back through the scoped admin list, `POST /offers/delete` with the
 * offerId that list returned, and the product leaves `/supply-projections`
 * (the collection Shop+'s Opportunités reads) in the same request.
 *
 * SO THE ONLY PLACE LEFT TO LOOK IS THE SCREEN, and no test in this repo had
 * ever pressed « Supprimer ce produit ». This walk does: it scopes the list to
 * the OTHER supplier, opens the product, confirms the delete, and asserts the
 * bytes that left the app — because « the call site is in the file » cannot
 * tell you which offerId a row actually carried.
 */

const OPS_KEY = 'cle-ops';
const MOI = 'supplier-founder-001';
const AUTRE = 'supplier-aicha-002';

const row = (offerId: string, pv: string, name: string) => ({
  offerId,
  productVersionId: pv,
  name,
  category: 'fashion_bags_fabrics',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  assetRefs: [],
});

/** The scoped admin list, exactly as `GET /offers?supplierId=` answers it. */
function livre(bySupplier: Record<string, ReturnType<typeof row>[]>): {
  routes: Route[];
  state: { deleted: { offerId: string; productVersionId: string }[] };
} {
  const state = { deleted: [] as { offerId: string; productVersionId: string }[] };
  const routes: Route[] = [
    (path, body) => {
      if (path !== '/offers/delete') return null;
      const offerId = String(body?.['offerId'] ?? '');
      const productVersionId = String(body?.['productVersionId'] ?? '');
      state.deleted.push({ offerId, productVersionId });
      for (const id of Object.keys(bySupplier)) {
        bySupplier[id] = (bySupplier[id] ?? []).filter((r) => r.offerId !== offerId);
      }
      return { status: 200, json: { status: 'deleted', offerId } };
    },
    (path, _body, search) => {
      if (path !== '/offers') return null;
      // THE SCOPE IS HONOURED. The real route is `?supplierId=…` and refuses
      // without one; a fake that answered the union for every scope would let a
      // screen reading the WRONG scope pass — and it did, until this was fixed
      // (an INVENTAIRE-COMPLET mutation stayed green over it).
      const scope = search.get('supplierId');
      // `.trim()`, as the real route does (`offer-do.ts`): a whitespace scope
      // passed this fake and 400s in production.
      if (scope === null || scope.trim() === '') return { status: 400, json: { error: 'missing_supplier_id' } };
      return {
        status: 200,
        json: {
          asOf: '2026-08-11T08:00:00.000Z',
          items: (bySupplier[scope] ?? []) as never,
        },
      };
    },
    // THE INVENTORY — the read his device really makes, because his ops key is
    // on it. Every offer, tagged with whose it is; this is what makes « Tous »
    // true and what makes an orphan reachable.
    (path, _b, _s, headers) => {
      if (path !== '/offers/inventaire') return null;
      // THE CREDENTIAL IS CHECKED, as the real route checks it (verifier
      // BLOCKER). A fake that answered 200 to anything would go green over a
      // port sending the wrong header — and the screen would fall back to the
      // poorer read in production with every suite still passing.
      if (headers['authorization'] !== `Bearer ${OPS_KEY}`) {
        return { status: 401, json: { error: 'unauthorized' } };
      }
      return {
        status: 200,
        json: {
          asOf: '2026-08-11T08:00:00.000Z',
          items: Object.entries(bySupplier).flatMap(([sup, rows]) =>
            rows.map((r) => ({ ...r, supplierId: sup })),
          ) as never,
        },
      };
    },
    // The roster read (his ops key) — the DOOR-HOLDERS half of the chip row.
    //
    // ⚠ `mintedAt` IS A REAL DATE, and that is a fix, not a detail (§9.8): this
    // fake used to answer `mintedAt: 'x'`, which `readCodeRow` DROPS as
    // malformed (`Date.parse` → NaN). So every row was silently discarded and
    // this half of the roster had never once reached the screen — the fake made
    // a wired read look wired while producing nothing.
    (path) =>
      path === '/fulfillment/supplier-codes'
        ? {
            status: 200,
            json: {
              ok: true,
              codes: [
                { supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true },
                { supplierId: AUTRE, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true },
              ],
            },
          }
        : null,
  ];
  return { routes, state };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer.test';
  process.env['EXPO_PUBLIC_OFFER_WRITE_KEY'] = 'cle-de-test';
  storage({ 'boutik.operateur.cle': OPS_KEY });
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('PRODUITS — supprimer, his own and another supplier’s alike', () => {
  it('a product listed FOR ANOTHER SUPPLIER can be opened and DELETED, with ITS OWN ids on the wire', async () => {
    const book = {
      [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')],
      [AUTRE]: [row('offer-autre', 'pv-autre', 'Sac de Aïcha')],
    };
    const svc = livre(book);
    const w = wire(svc.routes);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    // Both products are on his screen — the read happened.
    expect(screen.shows('Sac de Aïcha')).toBe(true);

    // Open the OTHER supplier's product…
    await screen.press('Sac de Aïcha');
    // …and its delete is offered, not hidden for a product that is not his.
    expect(screen.canPress('Supprimer ce produit'), 'the delete must be reachable').toBe(true);

    // Two taps: the control, then the confirmation.
    await screen.press('Supprimer ce produit');
    expect(screen.shows('Il sera retiré de votre boutique et de Shop+.')).toBe(true);
    await screen.press('Oui, supprimer');

    // THE BYTES THAT LEFT THE APP — the whole point. A row that carried the
    // wrong offerId would 200 as `idempotent` server-side and the product
    // would stay on Shop+ forever, which is exactly the reported symptom.
    expect(svc.state.deleted).toEqual([{ offerId: 'offer-autre', productVersionId: 'pv-autre' }]);
    const posts = w.calls.filter((c) => c.path === '/offers/delete');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.method).toBe('POST');

    // …and the screen re-read: the product is gone, HIS is untouched.
    expect(screen.texts().join(' '), 'the deleted product must leave the list').not.toContain('Sac de Aïcha');
    expect(screen.shows('Bazin du fondateur')).toBe(true);
    screen.unmount();
  });

  it('his OWN product deletes with its own ids too — the two paths are one path', async () => {
    const book = {
      [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')],
      [AUTRE]: [row('offer-autre', 'pv-autre', 'Sac de Aïcha')],
    };
    const svc = livre(book);
    wire(svc.routes);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    await screen.press('Bazin du fondateur');
    await screen.press('Supprimer ce produit');
    await screen.press('Oui, supprimer');

    expect(svc.state.deleted).toEqual([{ offerId: 'offer-moi', productVersionId: 'pv-moi' }]);
    screen.unmount();
  });

  it('a REFUSED delete keeps the product and says so — never a silent disappearance', async () => {
    const book = { [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')] };
    const svc = livre(book);
    wire([(path) => (path === '/offers/delete' ? { status: 500, json: { error: 'boom' } } : null), ...svc.routes]);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    await screen.press('Bazin du fondateur');
    await screen.press('Supprimer ce produit');
    await screen.press('Oui, supprimer');

    // The fiche STAYS, with its designed sentence — a product that vanished
    // from the screen while the server still holds it is the worst outcome
    // here, because he would stop looking for it.
    // The REAL sentence, not the key, and not a disjunction with something that
    // is always true — `texts().length > 0` was the first spelling here and it
    // asserted nothing at all (§9.7, caught before it could lie).
    expect(screen.shows('La suppression n’a pas abouti. Vérifiez le réseau et réessayez.')).toBe(true);
    expect(screen.shows('Bazin du fondateur'), 'the product must still be on screen').toBe(true);
    expect(screen.canPress('Supprimer ce produit'), 'he must be able to try again').toBe(true);
    screen.unmount();
  });
});

describe('INVENTAIRE-COMPLET — an ORPHANED product is reachable and deletable', () => {
  /**
   * FOUNDER REPORT 2026-08-11, with a screenshot of three products still on
   * Opportunités: « these 3 products was deleted from boutik+ and does not
   * exist anymore there, but they are still present in opportunites on shop+. »
   *
   * THEY WERE NEVER DELETED. His Produits tab can only ask `?supplierId=…`, and
   * it took those ids from the ACTIVE-CODE roster — so the moment a supplier's
   * code is revoked, that supplier's products fall out of every read the screen
   * can make: invisible here, undeletable here, and still served to Shop+'s
   * Opportunités forever, because that collection walks the INDEX and the index
   * does not care who holds a code.
   *
   * THIS WALK IS THE BUG, REPRODUCED: the roster names ONLY him, and a product
   * belongs to a supplier who holds no code. Before the fix the screen rendered
   * nothing for it and there was no way to reach the delete.
   */
  const ORPHELIN = 'supplier-code-revoque-003';

  function livreAvecOrphelin(): ReturnType<typeof livre> & { book: Record<string, ReturnType<typeof row>[]> } {
    const book = {
      [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')],
      [ORPHELIN]: [row('offer-orphelin', 'pv-orphelin', 'CHOIN')],
    };
    const base = livre(book);
    const routes: Route[] = [
      // The INVENTORY — every offer, tagged with whose it is. This is the read
      // that makes an orphan reachable.
      // The ROSTER names only HIM — the orphan's code was revoked. This is
      // exactly the state that made the product unreachable. (The inventory
      // route itself comes from `livre` below, credential check included.)
      (path) =>
        path === '/fulfillment/supplier-codes'
          ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } }
          : null,
      ...base.routes,
    ];
    return { ...base, routes, book };
  }

  it('a product whose supplier holds NO CODE is still on his screen', async () => {
    const svc = livreAvecOrphelin();
    wire(svc.routes);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    expect(
      screen.shows('CHOIN'),
      'a product nobody can see is a product nobody can delete — and Shop+ keeps selling it',
    ).toBe(true);
    expect(screen.shows('Bazin du fondateur')).toBe(true);
    screen.unmount();
  });

  it('and he can DELETE it — the ids on the wire are the orphan’s own', async () => {
    const svc = livreAvecOrphelin();
    wire(svc.routes);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    await screen.press('CHOIN');
    expect(screen.canPress('Supprimer ce produit')).toBe(true);
    await screen.press('Supprimer ce produit');
    await screen.press('Oui, supprimer');

    expect(svc.state.deleted).toEqual([{ offerId: 'offer-orphelin', productVersionId: 'pv-orphelin' }]);
    screen.unmount();
  });

  it('with NO ops key on the device the screen is exactly what it was — his own products', async () => {
    // Anyone but him: no inventory read, no orphan, no change in behaviour.
    storage({});
    const svc = livreAvecOrphelin();
    const w = wire(svc.routes);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    expect(w.calls.map((c) => c.path)).not.toContain('/offers/inventaire');
    expect(screen.shows('Bazin du fondateur')).toBe(true);
    // …AND THE ORPHAN IS ABSENT, which is what « exactly what it was » means.
    // Asserting only that his own product renders would pass even if the
    // inventory had leaked into a keyless device.
    expect(screen.texts().join(' ')).not.toContain('CHOIN');
    screen.unmount();
  });
});

describe('L’INVENTAIRE EST SA LECTURE — the credential on the wire', () => {
  /**
   * VERIFIER BLOCKER: nothing in this app could assert a credential, because
   * the harness did not record headers. A port sending the wrong header name,
   * the wrong scheme, or the bundled write key would have left every suite
   * green while his Produits tab silently fell back to the poorer read.
   */
  it('sends HIS ops key as a Bearer — not the bundled write key', async () => {
    const svc = livre({ [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')] });
    const w = wire(svc.routes);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    const inv = w.calls.find((c) => c.path === '/offers/inventaire');
    expect(inv, 'the inventory must actually be asked for').toBeDefined();
    expect(inv?.headers['authorization']).toBe(`Bearer ${OPS_KEY}`);
    // The bundled write key must NEVER be what opens supplier identity.
    expect(inv?.headers['x-write-key']).toBeUndefined();
    screen.unmount();
  });

  it('a REFUSED inventory says the list is partial instead of quietly showing less', async () => {
    const svc = livre({
      [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')],
      [AUTRE]: [row('offer-autre', 'pv-autre', 'Sac de Aïcha')],
    });
    // A stale ops key, or an app deployed ahead of the Worker.
    wire([(path) => (path === '/offers/inventaire' ? { status: 401, json: { error: 'unauthorized' } } : null), ...svc.routes]);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    expect(
      screen.shows('Liste partielle : seuls vos produits sont affichés. Vérifiez votre clé, onglet Opérations.'),
      'a list that is not « Tous » must say so',
    ).toBe(true);
    screen.unmount();
  });

  /**
   * ═══ RETRAIT-ACCÈS (founder, 2026-08-11) ═══
   *
   * « these 3 suppliers was cut access from fournisseurs but they are still
   * showing with their products on produits », then « their products and their
   * chip on boutik+ gets removed as well when they have been cut access ».
   *
   * The SERVICE side is proven on real workerd (revoke → the product leaves
   * `/supply-projections` and the inventory; re-mint → it comes back). What only
   * a walk can answer is his actual sentence: is the CHIP gone from the screen.
   */
  it('a cut-off supplier loses his chip AND his products — his own are untouched', async () => {
    // The service has already retired Aïcha's products: they are in neither the
    // inventory nor the code roster, which is exactly what the real Worker
    // answers after a revoke.
    const svc = livre({ [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')] });
    wire([
      (path) =>
        path === '/fulfillment/supplier-codes'
          ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } }
          : null,
      ...svc.routes,
    ]);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );

    // Settled FULLY first — otherwise « the chip is gone » would be proven by a
    // read that had simply not landed yet, which is no proof at all.
    await screen.settle();
    // HIS SENTENCE, asserted: the supplier is nowhere on the screen.
    expect(screen.shows(AUTRE), 'the cut-off supplier’s chip must be gone').toBe(false);
    expect(screen.shows('Sac de Aïcha'), 'and his products with it').toBe(false);
    // …and the founder's own product is still there — the act is scoped to one
    // supplier, and a screen that lost everything would « pass » this test.
    expect(screen.shows('Bazin du fondateur'), 'his own products survive').toBe(true);
    screen.unmount();
  });

  it('a supplier who holds a code but has listed NOTHING keeps his chip', async () => {
    // The narrowness that stops the fix over-reaching: the chip row is the
    // union of door-holders and product-owners, so a real supplier with an
    // empty shelf is still selectable — his honest « rien encore », not an
    // absence that looks like a cut-off.
    const svc = livre({ [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')] });
    wire(svc.routes); // the default roster names MOI *and* AUTRE
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );
    // The roster read is a SECOND round trip behind the inventory's — settle
    // once more so the chip row is asserted against the screen he ends up with,
    // not the one that exists for a few milliseconds.
    await screen.settle();
    expect(screen.shows(AUTRE), 'a door-holder with no products keeps his chip').toBe(true);
    screen.unmount();
  });

  /**
   * ⚠ THE SHRINK, ON A SCREEN THAT IS ALREADY OPEN (verifier MAJOR).
   *
   * The two walks above both mount FRESH with the revoke already applied, so
   * neither could see the real defect: the door-holders half of the chip row was
   * read once at mount and frozen for the component's lifetime. This is a web
   * app and he keeps tabs open — cut a supplier off in Fournisseurs, come back
   * to Produits, and the chip was still there, served by the frozen half, while
   * his products had correctly gone. That is his original complaint, recreated
   * by the fix meant to end it.
   *
   * So this walk keeps ONE mounted screen and changes what the service answers
   * underneath it, exactly as a revoke in another tab does.
   */
  it('a supplier cut off WHILE THIS SCREEN IS OPEN loses his chip on the next read', async () => {
    // ⚠ AÏCHA HOLDS A DOOR AND OWNS NOTHING — and that is the whole design of
    // this test. If she owned products, the INVENTORY half alone would drop her
    // chip when they were retired, and this walk would pass while the frozen
    // door-holder half stayed broken (it did, in its first version — proven by
    // mutation: freezing that half left this green). Her chip can ONLY come from
    // the code roster, so only a REFRESHED roster can take it away.
    const book: Record<string, ReturnType<typeof row>[]> = {
      [MOI]: [row('offer-moi', 'pv-moi', 'Bazin du fondateur')],
    };
    // The roster the service answers, MUTABLE — this is the revoke.
    //
    // ⚠ A REVOKE LEAVES A TOMBSTONE, IT DOES NOT ERASE THE ROW (founder
    // 2026-08-11: erasing it left « no way to remint code under the same
    // supplier again »). So the fake must answer what the real service
    // answers — the row STILL THERE, carrying `revokedAt` — or this walk
    // would prove nothing about the filter that has to drop it. Proven by
    // mutation: with the row simply removed, deleting the filter stayed green.
    let coupe: string | null = null;
    const svc = livre(book);
    wire([
      (path) =>
        path === '/fulfillment/supplier-codes'
          ? {
              status: 200,
              json: {
                ok: true,
                codes: [MOI, AUTRE].map((supplierId) => ({
                  supplierId,
                  mintedAt: '2026-08-01T08:00:00.000Z',
                  revelable: true,
                  ...(supplierId === coupe ? { revokedAt: '2026-08-11T15:00:00.000Z' } : {}),
                })),
              },
            }
          : null,
      ...svc.routes,
    ]);
    const cache = { current: { rows: null, asOf: null } };
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />,
    );
    await screen.settle();
    expect(screen.shows(AUTRE), 'he is on screen to begin with').toBe(true);

    // ── THE REVOKE, in another tab: her row is MARKED, not removed ──
    coupe = AUTRE;

    // A read the founder himself triggers — tapping « Tous ». No remount.
    await screen.press('Tous');
    await screen.settle();

    expect(screen.shows(AUTRE), 'the chip must go without an app restart').toBe(false);
    expect(screen.shows('Bazin du fondateur'), 'his own products survive').toBe(true);
    screen.unmount();
  });
});
