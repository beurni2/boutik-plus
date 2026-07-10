import { describe, expect, it } from 'vitest';
import { certifyAdapter, CERTIFICATION_BEHAVIORS, formatScorecard } from '@platform/certification';
import { buildSupplyProjection } from '../src/projection.js';
import { ShopProjectionConsumerMock } from '../mocks/shop-projection-consumer-mock.js';
import { ProductVersionSchema, SupplierOfferSchema } from '@platform/contracts';

describe('Shop+ projection-consumer mock — certified by the pinned §3 suite', () => {
  it('scores 8/8 — CERTIFIED', async () => {
    const card = await certifyAdapter(new ShopProjectionConsumerMock());
    console.log(formatScorecard(card)); // the scorecard IS the evidence
    expect(card.certified).toBe(true);
    expect(card.score).toBe(`${CERTIFICATION_BEHAVIORS.length}/${CERTIFICATION_BEHAVIORS.length}`);
    for (const result of card.results) {
      expect(result.passed, `${result.behavior}: ${result.detail}`).toBe(true);
    }
  });

  it('consumer law: OUR projection is accepted; identity-bearing or drifted payloads are refused; duplicates absorb', async () => {
    const mock = new ShopProjectionConsumerMock();
    const { delivered } = await mock.emit('t1', {});
    const published = delivered[0]!.event;
    expect(mock.consumeProjection(published)).toEqual({ accepted: true, duplicate: false });
    expect(mock.consumeProjection(published)).toEqual({ accepted: true, duplicate: true });
    // The REAL producer path feeds the consumer cleanly (schema identity end-to-end).
    const product = ProductVersionSchema.parse({
      id: 'pv-9', supplierId: 'supplier-9', version: 1, name: 'Pagne', productCode: 'PAG-09', facts: {},
      category: 'textile', zone: 'Gounghin', moderationState: 'approved_e1_sandbox', status: 'active', supplyMode: 'SELLER_HELD',
    });
    const offer = SupplierOfferSchema.parse({
      id: 'offer-9', productVersionId: 'pv-9', version: 1, basePrice: 10_000, resellerCommission: 1_000,
      platformFeeVersion: 'fee-v1', eligibleVariants: [], zones: [], effective: '2026-07-10T00:00:00.000Z',
      expiry: '2026-08-10T00:00:00.000Z', status: 'active',
    });
    const built = buildSupplyProjection(product, offer, 3, '2026-07-15T00:00:00.000Z');
    if (!built.ok) throw new Error('setup');
    const event = { ...published, envelope: { ...published.envelope, command_id: 'cmd-real-1' }, payload: built.projection };
    expect(mock.consumeProjection(event)).toEqual({ accepted: true, duplicate: false });
    // Identity/drift refusals: strict schema first, key sweep second.
    const leaking = { ...event, envelope: { ...event.envelope, command_id: 'cmd-leak' }, payload: { ...built.projection, supplierPhone: '+226 70' } };
    expect(mock.consumeProjection(leaking)).toEqual({ accepted: false, reason: 'payload_not_contract_shaped' });
  });
});
