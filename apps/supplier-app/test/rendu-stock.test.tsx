import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SProduitsReal } from '../src/v2/produits-real';
import { initialState } from '../src/v2/machine';
import { resolveOperationsService } from '../src/operations/service';
import { dateCourte, lireQuantite, stockEtat } from '../src/supply/produits-view';

/**
 * ═══ RENDU-RÉEL — CONFIRMER LE STOCK (STOCK-JOURNAL-1, B5.2) ═══
 *
 * The founder opens a FROZEN product on his console — Shop+ stopped selling it
 * because nobody vouched for the count in seven days — presses « Confirmer le
 * stock », TYPES the count he has, sends it, and the product comes back with
 * its new count and date, on the same fiche, without closing it.
 *
 * What the walk asserts is the BYTES THAT LEFT THE APP: the route, the method,
 * the founder's ops credential (never the bundled write key), the offerId of
 * the row he opened, the count he typed. And the four questions every walk
 * must answer: the tree survived the tap · the primary action is present,
 * pressable and wired · a failed send leaves a way out · he reaches the next
 * state. Only `globalThis.fetch` and storage are doubled; no app code is.
 *
 * Appearance is NOT claimed here — no layout, colour or size. That stays with
 * the token and contrast checks and his eyes on a real phone.
 */

const OPS_KEY = 'cle-ops';
const MOI = 'supplier-founder-001';
const OFFER = 'offer-gele';
const PV = 'pv-gele';
const CONFIRME_LE = '2026-09-01T09:30:00.000Z';

interface Rangee {
  offerId: string;
  productVersionId: string;
  name: string;
  category: string;
  basePrice: number;
  resellerCommission: number;
  available: number;
  assetRefs: string[];
  supplierId: string;
  hiddenReason?: string;
  stockConfirmedAt?: string;
}

/** The book the real Worker keeps, as the routes the console reads and writes. */
function livre(rangees: Rangee[], stockDoor: (body: Record<string, unknown> | null) => { status: number; json: Record<string, unknown> } | 'ok') {
  const state = { rangees, confirms: [] as Record<string, unknown>[] };
  const routes: Route[] = [
    (path, body, _s, headers) => {
      if (path !== '/offers/stock') return null;
      // THE CREDENTIAL IS CHECKED, as the real root checks it: his ops key,
      // never the bundled write key. A fake answering 200 to anything would
      // go green over a port sending the wrong header.
      if (headers['authorization'] !== `Bearer ${OPS_KEY}`) return { status: 401, json: { error: 'unauthorized' } };
      state.confirms.push(body ?? {});
      const verdict = stockDoor(body);
      if (verdict !== 'ok') return verdict;
      const offerId = String(body?.['offerId'] ?? '');
      const available = body?.['available'];
      if (typeof available !== 'number' || !Number.isInteger(available) || available < 0) {
        return { status: 400, json: { error: 'invalid_qty', param: 'available' } };
      }
      const r = state.rangees.find((x) => x.offerId === offerId);
      if (r === undefined) return { status: 404, json: { error: 'not_found' } };
      const status = r.available === available ? 'confirmed' : 'adjusted';
      const at = '2026-09-17T10:00:00.000Z';
      r.available = available;
      r.stockConfirmedAt = at;
      delete r.hiddenReason; // the freeze lifts — the ladder's last rung passes again
      return { status: 200, json: { status, available, stockConfirmedAt: at } };
    },
    (path, _b, _s, headers) => {
      if (path !== '/offers/inventaire') return null;
      if (headers['authorization'] !== `Bearer ${OPS_KEY}`) return { status: 401, json: { error: 'unauthorized' } };
      return { status: 200, json: { asOf: '2026-09-17T09:00:00.000Z', items: state.rangees.map((r) => ({ ...r })) as never } };
    },
    (path) =>
      path === '/fulfillment/supplier-codes'
        ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } }
        : null,
  ];
  return { routes, state };
}

const gele = (): Rangee => ({
  offerId: OFFER,
  productVersionId: PV,
  name: 'Pagne tissé',
  category: 'fashion_bags_fabrics',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  assetRefs: [],
  supplierId: MOI,
  hiddenReason: 'stock_unconfirmed',
  stockConfirmedAt: CONFIRME_LE,
});

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer.test';
  process.env['EXPO_PUBLIC_OFFER_WRITE_KEY'] = 'cle-de-test';
  storage({ 'boutik.operateur.cle': OPS_KEY });
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

const monter = async () => {
  const cache = { current: { rows: null, asOf: null } };
  return mountEcran(<SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={cache} />);
};

describe('CONFIRMER LE STOCK — the frozen product comes back, on the fiche he is looking at', () => {
  it('frozen row → fiche says why and when → press → type → send → HIS key, HIS offer, HIS count on the wire → the fiche refreshes', async () => {
    const svc = livre([gele()], () => 'ok');
    const w = wire(svc.routes);
    const screen = await monter();

    // The list shows the product (it is shown, marked — never dropped).
    expect(screen.shows('Pagne tissé')).toBe(true);
    await screen.press('Pagne tissé');

    // The fiche names the cause, the way back (HE can act — the sentence is
    // shown only beside the act), and the last confirmation date.
    expect(screen.shows('Les revendeuses ne voient plus cette offre')).toBe(true);
    expect(screen.shows('Confirmez le stock pour la remettre en ligne')).toBe(true);
    expect(screen.shows(`Stock confirmé le ${dateCourte(CONFIRME_LE)}`)).toBe(true);
    expect(screen.canPress('Confirmer le stock'), 'the primary action must be reachable').toBe(true);

    await screen.press('Confirmer le stock');
    // He TYPES the count — no one-tap confirmation exists.
    await screen.type('4', 'Combien en avez-vous');
    await screen.press('Envoyer');

    // THE BYTES THAT LEFT THE APP.
    const posts = w.calls.filter((c) => c.path === '/offers/stock');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.method).toBe('POST');
    expect(posts[0]?.headers['authorization']).toBe(`Bearer ${OPS_KEY}`);
    expect(posts[0]?.headers['x-write-key']).toBeUndefined();
    expect(posts[0]?.body).toMatchObject({ offerId: OFFER, available: 4 });
    expect(typeof posts[0]?.body?.['commandId']).toBe('string');
    expect(String(posts[0]?.body?.['commandId'])).not.toBe('');

    // THE NEXT STATE, on the same fiche: the freeze is gone, the count and the
    // date are the new ones — the re-read painted them without closing.
    expect(screen.shows('Les revendeuses ne voient plus cette offre')).toBe(false);
    expect(screen.shows('Confirmez le stock pour la remettre en ligne')).toBe(false);
    expect(screen.shows('Stock confirmé le 17/09/2026')).toBe(true);
    // …and the act is offered again, idle, for next week.
    expect(screen.canPress('Confirmer le stock')).toBe(true);
    screen.unmount();
  });

  it('a product NEVER confirmed (pre-slice) says so honestly and still offers the act', async () => {
    const { stockConfirmedAt: _drop, hiddenReason: _h, ...jamais } = gele();
    const svc = livre([jamais], () => 'ok');
    wire(svc.routes);
    const screen = await monter();
    await screen.press('Pagne tissé');
    expect(screen.shows('Stock jamais confirmé')).toBe(true);
    expect(screen.shows('Les revendeuses ne voient plus cette offre')).toBe(false);
    expect(screen.canPress('Confirmer le stock')).toBe(true);
    screen.unmount();
  });

  it('a FAILED send says so and leaves the way out: the act is pressable again, and the retry goes out', async () => {
    let refuse = true;
    const svc = livre([gele()], () => (refuse ? { status: 500, json: { error: 'boom' } } : 'ok'));
    const w = wire(svc.routes);
    const screen = await monter();
    await screen.press('Pagne tissé');
    await screen.press('Confirmer le stock');
    await screen.type('5', 'Combien en avez-vous');
    await screen.press('Envoyer');

    expect(screen.shows('La confirmation n’a pas abouti')).toBe(true);
    expect(screen.canPress('Confirmer le stock'), 'a failed act must leave a way out').toBe(true);
    // Still frozen — nothing was pretended.
    expect(screen.shows('Les revendeuses ne voient plus cette offre')).toBe(true);

    refuse = false;
    await screen.press('Confirmer le stock');
    await screen.type('5', 'Combien en avez-vous');
    await screen.press('Envoyer');
    expect(w.calls.filter((c) => c.path === '/offers/stock')).toHaveLength(2);
    expect(screen.shows('Les revendeuses ne voient plus cette offre')).toBe(false);
    expect(screen.shows('La confirmation n’a pas abouti')).toBe(false);
    screen.unmount();
  });

  it('a count that is not a whole number is refused ON THE SCREEN — nothing leaves the app', async () => {
    const svc = livre([gele()], () => 'ok');
    const w = wire(svc.routes);
    const screen = await monter();
    await screen.press('Pagne tissé');
    await screen.press('Confirmer le stock');
    await screen.type('deux', 'Combien en avez-vous');
    await screen.press('Envoyer');
    expect(screen.shows('Écrivez un nombre entier')).toBe(true);
    expect(w.calls.filter((c) => c.path === '/offers/stock')).toHaveLength(0);
    // « Annuler » is a way back, too.
    await screen.press('Annuler');
    expect(screen.canPress('Confirmer le stock')).toBe(true);
    screen.unmount();
  });

  it('WITHOUT his ops key on the device there is NO act — the state line only (the act is the founder’s, not a supplier’s)', async () => {
    storage({});
    const svc = livre([gele()], () => 'ok');
    // No key ⇒ the inventory read is refused and the screen falls back to the
    // scoped list, which this fake answers from the same book.
    wire([
      (path, _b, search) =>
        path === '/offers' && search.get('supplierId') === MOI
          ? { status: 200, json: { asOf: '2026-09-17T09:00:00.000Z', items: svc.state.rangees.map(({ supplierId: _s, ...r }) => r) as never } }
          : null,
      ...svc.routes,
    ]);
    const screen = await monter();
    await screen.press('Pagne tissé');
    expect(screen.shows(`Stock confirmé le ${dateCourte(CONFIRME_LE)}`)).toBe(true);
    // The cause is stated; the INSTRUCTION is not — he has nothing to press,
    // so no sentence tells him to (verifier MAJOR: no dead instruction).
    expect(screen.shows('Les revendeuses ne voient plus cette offre')).toBe(true);
    expect(screen.shows('Confirmez le stock pour la remettre en ligne')).toBe(false);
    expect(screen.canPress('Confirmer le stock')).toBe(false);
    screen.unmount();
  });
});

describe('the port — status codes read as named reasons, never as a silent success', () => {
  it('401 → bad_key · 404 → unknown_offer · 400 → invalid_qty · 500 → unreachable · 200 → the fields', async () => {
    const ops = resolveOperationsService()!;
    const cases: [number, Record<string, unknown>, string][] = [
      [401, { error: 'unauthorized' }, 'bad_key'],
      [404, { error: 'not_found' }, 'unknown_offer'],
      [400, { error: 'invalid_qty' }, 'invalid_qty'],
      [500, { error: 'boom' }, 'unreachable'],
      [200, { nonsense: true }, 'unreachable'],
    ];
    for (const [status, json, reason] of cases) {
      wire([(path) => (path === '/offers/stock' ? { status, json } : null)]);
      const res = await ops.confirmStock(OPS_KEY, { commandId: 'c', offerId: OFFER, available: 1 });
      expect(res, `status ${status}`).toEqual({ ok: false, reason });
    }
    wire([(path) => (path === '/offers/stock' ? { status: 200, json: { status: 'adjusted', available: 3, stockConfirmedAt: '2026-09-17T10:00:00.000Z' } } : null)]);
    const ok = await ops.confirmStock(OPS_KEY, { commandId: 'c', offerId: OFFER, available: 3 });
    expect(ok).toEqual({ ok: true, status: 'adjusted', available: 3, stockConfirmedAt: '2026-09-17T10:00:00.000Z' });
  });
});

describe('the pure pieces', () => {
  it('stockEtat: absent → jamais · present → confirmé with the day · present + frozen → gelé with the day', () => {
    expect(stockEtat({})).toEqual({ kind: 'jamais', message: 'produits.stock_jamais_confirme' });
    expect(stockEtat({ stockConfirmedAt: CONFIRME_LE })).toEqual({ kind: 'confirme', message: 'produits.stock_confirme_le', date: dateCourte(CONFIRME_LE) });
    expect(stockEtat({ stockConfirmedAt: CONFIRME_LE, hiddenReason: 'stock_unconfirmed' })).toEqual({ kind: 'gele', message: 'produits.stock_confirme_le', date: dateCourte(CONFIRME_LE) });
    // another hidden reason is NOT the freeze
    expect(stockEtat({ stockConfirmedAt: CONFIRME_LE, hiddenReason: 'offer_not_effective' }).kind).toBe('confirme');
  });

  it('lireQuantite: whole numbers, spaces tolerated; everything else refused', () => {
    expect(lireQuantite('0')).toBe(0);
    expect(lireQuantite(' 12 ')).toBe(12);
    expect(lireQuantite('1 200')).toBe(1200);
    for (const bad of ['', 'deux', '-1', '2.5', '2,5', '1e3', '1234567']) expect(lireQuantite(bad), bad).toBeNull();
  });

  it('dateCourte: day/month/year, zero-padded; garbage → empty', () => {
    expect(dateCourte('2026-09-01T12:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(dateCourte('pourri')).toBe('');
  });
});
