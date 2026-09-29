import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import offerRouter, { OfferDO } from '../worker/offer-do.js';
import { FulfillmentDO } from '../worker/fulfillment-do.js';
import { founderOneCreateCommand } from '../src/supply-endpoint.js';
import { EspaceOffres, StockageCompteur } from './doubles/stockage-compteur.js';

/**
 * RETOUR-RAYON-1 — THE LADDER a refused unit rides back to sale, when the
 * counter cannot be reached at that moment.
 *
 * Drives the REAL `FulfillmentDO`, the REAL offer router and REAL `OfferDO`
 * instances over the counting doubles (their bounds are written at the top of
 * `doubles/stockage-compteur.ts`); nothing of the app is stubbed. The only
 * lever is the namespace's call ceiling: past it, a call to the offers throws,
 * as an unreachable object does. The clock is moved, not waited for. Behaviour
 * on real workerd is proven in `retour-rayon.e2e.test.ts`; this proves the
 * retry and the two honest endings a seam test cannot provoke.
 */

const T0 = '2026-09-28T08:00:00.000Z';
const SUPPLIER = 'supplier-rayon-u';

let espace: EspaceOffres;
let storage: StockageCompteur;
let book: FulfillmentDO;
let code = '';

const offres = (path: string, init?: RequestInit) => offerRouter.fetch(new Request(`https://do${path}`, init), { OFFER: espace } as never);
const livre = (path: string, body: unknown) => book.fetch(new Request(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) }));
type RangeeRayon = { status: string; attempts: number; nextAttemptAt?: number; reason?: string };
const rangee = (orderId: string) => storage.data.get(`progressoutbox:${orderId}:rayon`) as RangeeRayon | undefined;

async function disponible(pv: string): Promise<number> {
  const r = await offres(`/supply-entry/${pv}`);
  return ((await r.json()) as { available: number }).available;
}

/** An offer of 3, one unit sold to `orderId` (its `vendu-` marker), the order in the book, returned by him. */
async function vendueEtRetournee(pv: string, orderId: string): Promise<void> {
  const base = founderOneCreateCommand(T0);
  const created = await offres('/offers', {
    method: 'POST',
    body: JSON.stringify({
      ...base, commandId: `cmd-${pv}`, offerId: `offer-${pv}`, available: 3,
      product: { ...base.product, id: pv, supplierId: SUPPLIER }, draft: { ...base.draft, productVersionId: pv },
    }),
  });
  expect(created.status).toBe(200);
  expect((await offres(`/supply-consume/${pv}`, { method: 'POST', body: JSON.stringify({ orderId }) })).status).toBe(200);
  expect(await disponible(pv)).toBe(2);
  await storage.put(`order:${orderId}`, {
    orderId, productVersionId: pv, offerVersion: '1', paymentMode: 'FULL_PREPAY', paidAt: T0, zoneTo: '',
    sellerBasePrice: 10_000, productName: 'Pagne', supplierId: SUPPLIER, supplierResolved: true, correlationId: `corr-${orderId}`, registeredAt: T0,
  });
  await storage.put(`commandefournisseur:${SUPPLIER}:${orderId}`, 1);
  await storage.put(`retour:${orderId}`, { orderId, returnedAt: T0 });
}

async function remise(orderId: string): Promise<unknown> {
  const mine = (await (await livre('/mine', { code })).json()) as { orders: { orderId: string; fulfillment?: Record<string, unknown> }[] };
  return mine.orders.find((o) => o.orderId === orderId)?.fulfillment?.['remiseEnVente'];
}

beforeEach(async () => {
  espace = new EspaceOffres((etat) => new OfferDO(etat as unknown as DurableObjectState, {}));
  storage = new StockageCompteur();
  book = new FulfillmentDO({ storage } as unknown as DurableObjectState, { OFFER: espace as unknown as DurableObjectNamespace });
  code = ((await (await livre('/code/mint', { supplierId: SUPPLIER })).json()) as { code: string }).code;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RETOUR-RAYON-1 — the counter unreachable: the unit waits on the ladder, then goes back once', () => {
  it('the first attempt fails → the row stays pending, the counter holds, his list says « en cours » → the next wake puts it back', async () => {
    await vendueEtRetournee('pv-ry-u1', 'ord-ry-u1');
    espace.plafond = espace.appels; // every call to the offers now throws
    const r = (await (await livre('/porte-refusee', { orderId: 'ord-ry-u1', at: T0, remettre: true })).json()) as { status: string };
    expect(r.status).toBe('restock_queued');
    await book.alarm();
    expect(rangee('ord-ry-u1')).toMatchObject({ status: 'pending', attempts: 1 });
    espace.plafond = Number.POSITIVE_INFINITY;
    expect(await disponible('pv-ry-u1')).toBe(2);
    expect(await remise('ord-ry-u1')).toBe('en_cours');
    // verifier MINOR — back in his hands (so in what he counts) but not yet
    // credited: the stock count takes it off, or the credit adds it twice
    const attente = async () =>
      ((await (await livre('/attente-ramassage', { supplierId: SUPPLIER, productVersionId: 'pv-ry-u1' })).json()) as { orderIds: string[] }).orderIds;
    expect(await attente()).toEqual(['ord-ry-u1']);

    // the ladder's own due time, then the next wake
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2_000);
    await book.alarm();
    expect(rangee('ord-ry-u1')).toMatchObject({ status: 'delivered' });
    expect(await disponible('pv-ry-u1')).toBe(3);
    expect(await attente(), 'credited: no longer taken off').toEqual([]);
    expect(await remise('ord-ry-u1')).toBe('faite');
    // a stray later wake adds nothing: the row is done, and the offer's marker holds
    await book.alarm();
    expect(await disponible('pv-ry-u1')).toBe(3);
  });

  it('no offer binding at all: nothing is attempted, nothing is invented — the row waits', async () => {
    await vendueEtRetournee('pv-ry-u2', 'ord-ry-u2');
    const sansOffres = new FulfillmentDO({ storage } as unknown as DurableObjectState, {});
    await sansOffres.fetch(new Request('https://do/porte-refusee', { method: 'POST', body: JSON.stringify({ orderId: 'ord-ry-u2', at: T0, remettre: true }) }));
    await sansOffres.alarm();
    expect(rangee('ord-ry-u2')?.status).toBe('pending');
    expect(await disponible('pv-ry-u2')).toBe(2);
  });

  it('the product was deleted meanwhile: nothing can go back — the row is parked, and his list claims no « remis en vente »', async () => {
    await vendueEtRetournee('pv-ry-u3', 'ord-ry-u3');
    const del = await offres('/offers/delete', {
      method: 'POST',
      body: JSON.stringify({ commandId: 'del-ry-u3', offerId: 'offer-pv-ry-u3', productVersionId: 'pv-ry-u3' }),
    });
    expect(del.status).toBe(200);
    await livre('/porte-refusee', { orderId: 'ord-ry-u3', at: T0, remettre: true });
    await book.alarm();
    expect(rangee('ord-ry-u3')).toMatchObject({ status: 'unsendable' });
    expect(await remise('ord-ry-u3')).toBeUndefined();
  });

  it('a DELIVERED order never goes back on sale, whichever act comes last — the refusal fact or his return code', async () => {
    await vendueEtRetournee('pv-ry-u5', 'ord-ry-u5');
    await storage.put('livraison:ord-ry-u5', { orderId: 'ord-ry-u5', deliveredAt: T0 });
    const r = (await (await livre('/porte-refusee', { orderId: 'ord-ry-u5', at: T0, remettre: true })).json()) as { status: string };
    expect(r.status).toBe('no_restock');
    expect(rangee('ord-ry-u5'), 'a delivered unit is with the buyer, not on his shelf').toBeUndefined();

    // …and the other order of events: his return code typed on the delivered order's own card
    await vendueEtRetournee('pv-ry-u6', 'ord-ry-u6');
    await storage.delete('retour:ord-ry-u6');
    await storage.put('livraison:ord-ry-u6', { orderId: 'ord-ry-u6', deliveredAt: T0 });
    await livre('/porte-refusee', { orderId: 'ord-ry-u6', at: T0, remettre: true });
    vi.stubGlobal('fetch', async () => Response.json({ ok: true, verdict: 'confirme' }));
    try {
      const seraBook = new FulfillmentDO({ storage } as unknown as DurableObjectState, {
        OFFER: espace as unknown as DurableObjectNamespace, SERA_INTAKE_BASE: 'https://sera.test', SERA_INTAKE_SECRET: 'test-sera-intake-secret-rayon-u',
      });
      const v = await seraBook.fetch(new Request('https://do/retour/verify', { method: 'POST', body: JSON.stringify({ code, orderId: 'ord-ry-u6', codeRetour: 'RTR-1' }) }));
      expect(((await v.json()) as { verdict: string }).verdict).toBe('confirme');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(storage.data.has('retour:ord-ry-u6')).toBe(true);
    expect(rangee('ord-ry-u6')).toBeUndefined();
    expect(await disponible('pv-ry-u6')).toBe(2);

    // …and his list never asks him for a code that would put a delivered unit back
    await vendueEtRetournee('pv-ry-u7', 'ord-ry-u7');
    await storage.delete('retour:ord-ry-u7');
    await storage.put('livraison:ord-ry-u7', { orderId: 'ord-ry-u7', deliveredAt: T0 });
    await livre('/porte-refusee', { orderId: 'ord-ry-u7', at: T0, remettre: true });
    expect(await remise('ord-ry-u7')).toBeUndefined();
  });

  it('a refusal the policy does not send home queues nothing, returned or not', async () => {
    await vendueEtRetournee('pv-ry-u4', 'ord-ry-u4');
    const r = (await (await livre('/porte-refusee', { orderId: 'ord-ry-u4', at: T0, remettre: false })).json()) as { status: string };
    expect(r.status).toBe('no_restock');
    expect(rangee('ord-ry-u4')).toBeUndefined();
    await book.alarm();
    expect(await disponible('pv-ry-u4')).toBe(2);
  });
});
