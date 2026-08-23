import { describe, expect, it } from 'vitest';
import { decideConsumeAvailable, type CreateOfferCommand, type OfferEntry } from '../src/offer-core.js';
import { InMemoryOfferStore } from '../src/offer-store.js';

/**
 * STOCK-VENDU-1 (founder order 2026-08-23: « make sure the stock on products
 * is updated everywhere if someone buys a product ») — the UNITS of the
 * decrement law.
 *
 * The law, in three sentences. A provider-confirmed order consumes ONE unit
 * of its product's declared `available` (the confirmed wire is a unit of one
 * version — the acceptance lock the fulfillment book already states). The
 * same order can never consume twice: the wire is at-least-once, so the
 * consumption is idempotent on `orderId`. The counter FLOORS AT ZERO and the
 * sale still stands — the order is real and belongs on the supplier's board;
 * an empty counter is recorded as `alreadyEmpty`, the oversell signal, never
 * a refusal of the fact that money moved.
 *
 * Shop+ never alters stock (SP invariant: « Shop+ MUST NOT … alter stock »):
 * it reports the sale on the existing confirmed-order wire, and THIS domain
 * moves its own counter.
 */

const entry = (available: number): OfferEntry =>
  ({
    offerId: 'offer-sv-1',
    product: { id: 'pv-sv-1', supplierId: 'supplier-founder-001' },
    offer: {},
    available,
    asOf: '2026-08-01T08:00:00.000Z',
    createCommandId: 'cmd-sv-1',
  }) as unknown as OfferEntry;

describe('decideConsumeAvailable — one sale, one unit, floor at zero', () => {
  it('a sale decrements by exactly one and touches nothing else', () => {
    const before = entry(5);
    const d = decideConsumeAvailable(before);
    expect(d.status).toBe('consumed');
    expect(d.entry.available).toBe(4);
    expect(d.alreadyEmpty).toBe(false);
    expect(d.entry.offerId).toBe(before.offerId);
    expect(before.available, 'the input entry was mutated').toBe(5);
  });

  it('the LAST unit reaches an honest zero', () => {
    const d = decideConsumeAvailable(entry(1));
    expect(d.entry.available).toBe(0);
    expect(d.alreadyEmpty).toBe(false);
  });

  it('an EMPTY counter floors at zero and flags the oversell — the sale is never refused here', () => {
    const d = decideConsumeAvailable(entry(0));
    expect(d.status).toBe('consumed');
    expect(d.entry.available).toBe(0);
    expect(d.alreadyEmpty).toBe(true);
  });
});

describe('InMemoryOfferStore.consumeAvailable — idempotent per order, honest about unknowns', () => {
  const seed: CreateOfferCommand = {
    commandId: 'seed-sv-1',
    offerId: 'offer-sv-1',
    product: {
      id: 'pv-sv-1',
      supplierId: 'supplier-founder-001',
      version: 1,
      name: 'Siège auto (test)',
      productCode: 'SV-001',
      facts: {},
      category: 'fashion_bags_fabrics',
      zone: 'Gounghin',
      moderationState: 'approved',
      status: 'active',
      supplyMode: 'SELLER_HELD',
    } as CreateOfferCommand['product'],
    draft: {
      productVersionId: 'pv-sv-1',
      basePrice: 10_000,
      resellerCommission: 1_000,
      eligibleVariants: [],
      zones: [],
      effective: '2026-07-10T00:00:00.000Z',
      expiry: '2026-12-31T00:00:00.000Z',
    } as unknown as CreateOfferCommand['draft'],
    available: 2,
    asOf: '2026-08-01T08:00:00.000Z',
  };

  it('consumes once per order, answers idempotent on the redelivery, and the read model moves', async () => {
    const store = new InMemoryOfferStore();
    await store.create(seed);

    const first = await store.consumeAvailable('pv-sv-1', 'ord-1');
    expect(first).toMatchObject({ status: 'consumed', available: 1, alreadyEmpty: false });
    // The AT-LEAST-ONCE wire redelivers: the same order never consumes twice.
    const again = await store.consumeAvailable('pv-sv-1', 'ord-1');
    expect(again).toMatchObject({ status: 'idempotent', available: 1 });

    const second = await store.consumeAvailable('pv-sv-1', 'ord-2');
    expect(second).toMatchObject({ status: 'consumed', available: 0 });
    // THE READ MODEL is the same entry every surface reads — the counter moved there.
    const entryRead = await store.getEntryByProductVersion('pv-sv-1');
    expect(entryRead?.available).toBe(0);

    // Oversell: a third paid order on an empty counter — flagged, floored, never negative.
    const third = await store.consumeAvailable('pv-sv-1', 'ord-3');
    expect(third).toMatchObject({ status: 'consumed', available: 0, alreadyEmpty: true });
  });

  it('an unknown product answers no_offer — nothing to move, and the wire must not wedge on it', async () => {
    const store = new InMemoryOfferStore();
    expect(await store.consumeAvailable('pv-inconnu', 'ord-9')).toMatchObject({ status: 'no_offer' });
  });
});
