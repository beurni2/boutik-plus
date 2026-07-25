import { describe, expect, it } from 'vitest';
import { InMemoryOfferStore } from '../src/offer-store.js';
import {
  makeSupplyFetch,
  serveProjection,
  serveProjections,
  SupplyReadModelSchema,
  SERVICE_NAME,
  founderOneCreateCommand,
  FOUNDER_001_PRODUCT_VERSION_ID,
} from '../src/supply-endpoint.js';
import type { CreateOfferCommand, OfferEntry } from '../src/offer-core.js';

/**
 * SLICE B · OFFER DISCOVERY — the collection a reseller browses.
 *
 * THE PROPERTY THAT MATTERS MOST, and the reason this file exists: the collection
 * must apply the SAME refusal ladder as the single read. If it bypassed any of it,
 * an unapproved product would become BROWSABLE — worse than being unfindable.
 * These drive the real `serveProjections`, which is a filter over the real
 * `serveProjection`; nothing here re-implements a check.
 */

const T0 = '2026-07-15T08:00:00.000Z';
const NOW = '2026-07-15T09:00:00.000Z';

/** A create command derived from the founder seed, varied per test. */
function cmd(over: {
  offerId: string;
  pv: string;
  status?: string;
  moderationState?: string;
  offerStatus?: string;
  effective?: string;
  expiry?: string;
  name?: string;
}): CreateOfferCommand {
  const base = founderOneCreateCommand(T0);
  return {
    ...base,
    commandId: `cmd-${over.offerId}`,
    offerId: over.offerId,
    product: {
      ...base.product,
      id: over.pv,
      name: over.name ?? base.product.name,
      ...(over.status !== undefined ? { status: over.status } : {}),
      ...(over.moderationState !== undefined ? { moderationState: over.moderationState } : {}),
    },
    draft: {
      ...base.draft,
      productVersionId: over.pv,
      ...(over.effective !== undefined ? { effective: over.effective } : {}),
      ...(over.expiry !== undefined ? { expiry: over.expiry } : {}),
    },
  };
}

async function storeWith(...cmds: CreateOfferCommand[]): Promise<InMemoryOfferStore> {
  const store = new InMemoryOfferStore();
  for (const c of cmds) await store.create(c);
  return store;
}

const GOOD = cmd({ offerId: 'offer-ok', pv: 'pv-ok', name: 'Pagne servable' });

describe('THE REFUSAL LADDER IS INHERITED, NOT REIMPLEMENTED', () => {
  it('every ladder refusal that hides a product from the SINGLE read also hides it from the LIST', async () => {
    const refusable: [string, CreateOfferCommand][] = [
      ['product_not_active', cmd({ offerId: 'o-1', pv: 'pv-1', status: 'retired' })],
      ['product_not_approved', cmd({ offerId: 'o-2', pv: 'pv-2', moderationState: 'pending' })],
      ['offer_not_effective (future)', cmd({ offerId: 'o-3', pv: 'pv-3', effective: '2027-01-01T00:00:00.000Z' })],
      ['offer_not_effective (expired)', cmd({ offerId: 'o-4', pv: 'pv-4', expiry: '2026-07-01T00:00:00.000Z' })],
    ];

    for (const [label, c] of refusable) {
      const store = await storeWith(GOOD, c);
      const entries = await store.listEntries();
      const collection = serveProjections(SERVICE_NAME, entries, NOW);

      // the single read refuses it…
      const entry = entries.find((e) => e.product.id === c.product.id) as OfferEntry;
      expect(serveProjection(SERVICE_NAME, entry, NOW).ok, label).toBe(false);
      // …and the list does not carry it either
      const ids = collection.items.map((i) => i.value.productVersionId);
      expect(ids, label).not.toContain(c.product.id);
      // …while the servable one IS there (so the test is not vacuously empty)
      expect(ids, label).toContain('pv-ok');
    }
  });

  it('an UNAPPROVED product is not browsable — the failure this slice exists to prevent', async () => {
    const store = await storeWith(cmd({ offerId: 'o-x', pv: 'pv-secret', moderationState: 'pending' }));
    const collection = serveProjections(SERVICE_NAME, await store.listEntries(), NOW);
    expect(collection.items).toHaveLength(0);
    // and nothing about it leaks — not the name, not the price
    expect(JSON.stringify(collection)).not.toMatch(/pv-secret|10000|Pagne/);
  });

  it('a refused entry is OMITTED, never reported with its reason (that would be an existence signal)', async () => {
    const store = await storeWith(GOOD, cmd({ offerId: 'o-2', pv: 'pv-hidden', moderationState: 'pending' }));
    const collection = serveProjections(SERVICE_NAME, await store.listEntries(), NOW);
    expect(collection.items).toHaveLength(1);
    const wire = JSON.stringify(collection);
    for (const reason of ['product_not_approved', 'product_not_active', 'offer_not_effective', 'unavailable', 'pv-hidden']) {
      expect(wire, reason).not.toContain(reason);
    }
  });

  it('the collection is byte-identical to the single read for the same entry — one function, not two', async () => {
    const store = await storeWith(GOOD);
    const entries = await store.listEntries();
    const single = serveProjection(SERVICE_NAME, entries[0] as OfferEntry, NOW);
    const collection = serveProjections(SERVICE_NAME, entries, NOW);
    expect(single.ok).toBe(true);
    if (!single.ok) return;
    expect(collection.items[0]).toEqual(single.body); // the SAME envelope, not a parallel build
  });
});

describe('THE WIRE SHAPE — each item is a COMPLETE canon envelope', () => {
  it('every item parses under the SAME schema the single read is validated by', async () => {
    const store = await storeWith(GOOD, cmd({ offerId: 'o-b', pv: 'pv-b', name: 'Deuxième' }));
    const collection = serveProjections(SERVICE_NAME, await store.listEntries(), NOW);
    expect(collection.items).toHaveLength(2);
    for (const item of collection.items) {
      // shop's certified consumer parses exactly this — unchanged, per item
      expect(() => SupplyReadModelSchema.parse(item)).not.toThrow();
      expect(Object.keys(item).sort()).toEqual(['asOf', 'value', 'version']);
    }
  });

  it('the outer asOf lets a consumer judge the whole response without iterating', async () => {
    const store = await storeWith(GOOD, cmd({ offerId: 'o-b', pv: 'pv-b' }));
    const collection = serveProjections(SERVICE_NAME, await store.listEntries(), NOW);
    expect(collection.asOf).toBe(NOW);
    // …and it is TRUE of every item, because they share one serve clock by construction
    for (const item of collection.items) expect(item.asOf).toBe(collection.asOf);
  });

  it('version is PER-OFFER — which is why a single flat envelope is not expressible', async () => {
    const store = await storeWith(GOOD, cmd({ offerId: 'o-b', pv: 'pv-b' }));
    const collection = serveProjections(SERVICE_NAME, await store.listEntries(), NOW);
    for (const item of collection.items) expect(typeof item.version).toBe('number');
    expect(Object.keys(collection).sort()).toEqual(['asOf', 'items']); // no top-level version
  });

  it('an empty store is an honest empty collection — 200 with items: [], never a 404', async () => {
    const collection = serveProjections(SERVICE_NAME, [], NOW);
    expect(collection).toEqual({ asOf: NOW, items: [] });
  });
});

describe('FRESHNESS IS INHERITED — one clock for the envelope AND for effectivity', () => {
  it('an offer expiring between two reads simply drops out of the next one', async () => {
    const expiring = cmd({ offerId: 'o-exp', pv: 'pv-exp', expiry: '2026-07-15T12:00:00.000Z' });
    const store = await storeWith(GOOD, expiring);
    const entries = await store.listEntries();

    const before = serveProjections(SERVICE_NAME, entries, '2026-07-15T11:59:00.000Z');
    expect(before.items.map((i) => i.value.productVersionId)).toContain('pv-exp');

    const after = serveProjections(SERVICE_NAME, entries, '2026-07-15T12:01:00.000Z');
    expect(after.items.map((i) => i.value.productVersionId)).not.toContain('pv-exp');
    expect(after.items.map((i) => i.value.productVersionId)).toContain('pv-ok'); // not a blanket empty
  });

  it('the envelope asOf and the effectivity judgement use the SAME instant', async () => {
    const store = await storeWith(cmd({ offerId: 'o-e', pv: 'pv-e', expiry: '2026-07-15T12:00:00.000Z' }));
    const entries = await store.listEntries();
    const at = '2026-07-15T12:01:00.000Z';
    const collection = serveProjections(SERVICE_NAME, entries, at);
    expect(collection.asOf).toBe(at); // the response is fresh…
    expect(collection.items).toHaveLength(0); // …and the expired offer is gone, by the same clock
  });
});

describe('THE ROUTE — GET /supply-projections over the real fetch handler', () => {
  const req = (path: string, method = 'GET') => new Request(`https://offer-service.boutik.internal${path}`, { method });

  it('serves the collection at /supply-projections', async () => {
    const store = await storeWith(GOOD);
    const res = await makeSupplyFetch(store, () => NOW)(req('/supply-projections'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { asOf: string; items: { value: { productVersionId: string } }[] };
    expect(body.asOf).toBe(NOW);
    expect(body.items.map((i) => i.value.productVersionId)).toEqual(['pv-ok']);
  });

  it('a non-GET on the collection is an honest 405, never a silent serve', async () => {
    const store = await storeWith(GOOD);
    const res = await makeSupplyFetch(store, () => NOW)(req('/supply-projections', 'POST'));
    expect(res.status).toBe(405);
  });

  it('the SINGLE read still works unchanged beside it (no route regression)', async () => {
    const store = await storeWith(founderOneCreateCommand(T0));
    const res = await makeSupplyFetch(store, () => NOW)(req(`/supply-projection/${FOUNDER_001_PRODUCT_VERSION_ID}`));
    expect(res.status).toBe(200);
  });

  it('an unknown route still falls through to the health door 404', async () => {
    const store = await storeWith(GOOD);
    expect((await makeSupplyFetch(store, () => NOW)(req('/nope'))).status).toBe(404);
  });
});
