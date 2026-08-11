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
    (path) => {
      if (path !== '/offers') return null;
      // The scope rides the QUERY, which `wire` drops from `path` — so the
      // handler answers the union and the walk asserts on the DELETE bytes,
      // which is where the defect would be.
      return {
        status: 200,
        json: {
          asOf: '2026-08-11T08:00:00.000Z',
          items: Object.values(bySupplier).flat() as never,
        },
      };
    },
    // The roster read (his ops key) — the chips come from it.
    (path) =>
      path === '/fulfillment/supplier-codes'
        ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: 'x', revelable: true }, { supplierId: AUTRE, mintedAt: 'x', revelable: true }] } }
        : null,
  ];
  return { routes, state };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer.test';
  process.env['EXPO_PUBLIC_OFFER_WRITE_KEY'] = 'cle-de-test';
  storage({ 'boutik.operateur.cle': 'cle-ops' });
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
