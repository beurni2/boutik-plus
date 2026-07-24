import { describe, expect, it } from 'vitest';
import { ProductVersionSchema } from '@platform/contracts';
import {
  DurableOfferStore,
  InMemoryOfferStore,
  resolveOfferStore,
  type OfferFetcher,
} from '../src/offer-store.js';
import type { CreateOfferCommand } from '../src/offer-core.js';

/**
 * OFFER STORE — the persistence port. Both substrates implement it and the read
 * path never knows which. Proven: the in-memory registry create→read round-trip,
 * the productVersion→offer pointer, idempotency surfaced, and the env-gated
 * resolver (binding present ⇒ durable, absent ⇒ in-memory — the mock-gate by
 * construction). The durable substrate is a thin fetch client, proven against a
 * fake fetcher here and on real workerd in the DO e2e.
 */

const ASOF = '2026-07-15T08:00:00.000Z';

function cmd(pv: string, offerId: string, commandId: string): CreateOfferCommand {
  const product = ProductVersionSchema.parse({
    id: pv,
    supplierId: 'supplier-1',
    version: 1,
    name: 'Article',
    productCode: 'ART-1',
    facts: {},
    category: 'textile',
    zone: 'Gounghin',
    moderationState: 'approved',
    status: 'active',
    supplyMode: 'SELLER_HELD',
  });
  return {
    commandId,
    offerId,
    product,
    draft: { productVersionId: pv, basePrice: 10_000, resellerCommission: 1_000, eligibleVariants: [], zones: [], effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z' },
    available: 5,
    asOf: ASOF,
  };
}

describe('InMemoryOfferStore', () => {
  it('create then read the durable entry by productVersionId (the read path)', async () => {
    const store = new InMemoryOfferStore();
    const decision = await store.create(cmd('pv-1', 'offer-1', 'c-1'));
    expect(decision.status).toBe('created');
    const entry = await store.getEntryByProductVersion('pv-1');
    expect(entry?.offerId).toBe('offer-1');
    expect(entry?.available).toBe(5);
  });

  it('an unknown productVersionId reads as undefined (honest not-found)', async () => {
    const store = new InMemoryOfferStore();
    expect(await store.getEntryByProductVersion('pv-nope')).toBeUndefined();
  });

  it('idempotent create (same commandId) does not duplicate; the pointer stays write-once', async () => {
    const store = new InMemoryOfferStore();
    await store.create(cmd('pv-1', 'offer-1', 'c-1'));
    const replay = await store.create(cmd('pv-1', 'offer-1', 'c-1'));
    expect(replay.status).toBe('idempotent');
    expect((await store.getEntryByProductVersion('pv-1'))?.offerId).toBe('offer-1');
  });
});

describe('resolveOfferStore — env-gated substrate selection', () => {
  it('no binding ⇒ in-memory (CI can never reach real storage)', () => {
    expect(resolveOfferStore(undefined)).toBeInstanceOf(InMemoryOfferStore);
    expect(resolveOfferStore({})).toBeInstanceOf(InMemoryOfferStore);
  });

  it('a DO binding present ⇒ durable', () => {
    const fake: OfferFetcher = { fetch: async () => new Response('{}') };
    expect(resolveOfferStore({ OFFER_DO: fake })).toBeInstanceOf(DurableOfferStore);
  });
});

describe('DurableOfferStore — the fetch client shape (proven against a fake fetcher)', () => {
  it('create POSTs the command to /offers and returns the decision', async () => {
    const seen: { url: string; method: string; body: string }[] = [];
    const fake: OfferFetcher = {
      fetch: async (req) => {
        seen.push({ url: new URL(req.url).pathname, method: req.method, body: await req.clone().text() });
        return Response.json({ status: 'created', entry: { offerId: 'offer-1' }, preview: {} });
      },
    };
    const store = new DurableOfferStore(fake);
    const decision = await store.create(cmd('pv-1', 'offer-1', 'c-1'));
    expect(decision.status).toBe('created');
    expect(seen[0]?.url).toBe('/offers');
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.body).toContain('"offerId":"offer-1"');
  });

  it('getEntryByProductVersion GETs /supply-entry/:pv; a 404 becomes undefined', async () => {
    const fake404: OfferFetcher = { fetch: async () => new Response('{"error":"not_found"}', { status: 404 }) };
    expect(await new DurableOfferStore(fake404).getEntryByProductVersion('pv-x')).toBeUndefined();
    const fakeOk: OfferFetcher = { fetch: async () => Response.json({ offerId: 'offer-9', available: 3 }) };
    expect((await new DurableOfferStore(fakeOk).getEntryByProductVersion('pv-9'))?.offerId).toBe('offer-9');
  });
});
