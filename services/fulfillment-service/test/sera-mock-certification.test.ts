import { describe, expect, it } from 'vitest';
import { certifyAdapter, CERTIFICATION_BEHAVIORS, formatScorecard } from '@platform/certification';
import { SeraPickupConsumerMock } from '../mocks/sera-pickup-consumer-mock.js';

describe('Séra pickup-consumer mock — certified by the pinned §3 suite', () => {
  it('scores 8/8 — CERTIFIED (first real consumer of the shared suite)', async () => {
    const card = await certifyAdapter(new SeraPickupConsumerMock());
    console.log(formatScorecard(card)); // the scorecard IS the evidence
    expect(card.certified).toBe(true);
    expect(card.score).toBe(`${CERTIFICATION_BEHAVIORS.length}/${CERTIFICATION_BEHAVIORS.length}`);
    for (const result of card.results) {
      expect(result.passed, `${result.behavior}: ${result.detail}`).toBe(true);
    }
  });

  it('consumer law: NO PICKUP BEFORE READINESS — an unready signal is refused, a ready one accepted, duplicates absorbed', async () => {
    const mock = new SeraPickupConsumerMock();
    const { delivered } = await mock.emit('t1', {});
    const [accepted, challengeIssued, ready] = delivered.map((d) => d.event);
    // The first two events carry readinessConfirmed=false — no pickup from them.
    expect(mock.consumePickupSignal(accepted!)).toEqual({ accepted: false, reason: 'not_a_readiness_signal' });
    expect(mock.consumePickupSignal(challengeIssued!)).toEqual({ accepted: false, reason: 'not_a_readiness_signal' });
    expect(mock.hasPickupFor('order_t1')).toBe(false);
    // fulfillment.ready.v1 with readinessConfirmed=true → pickup exists, once.
    expect(mock.consumePickupSignal(ready!)).toEqual({ accepted: true, duplicate: false });
    expect(mock.consumePickupSignal(ready!)).toEqual({ accepted: true, duplicate: true });
    expect(mock.hasPickupFor('order_t1')).toBe(true);
    // A ready-named event whose payload says NOT confirmed is refused closed.
    const lying = { ...ready!, payload: { ...ready!.payload, readinessConfirmed: false } };
    expect(mock.consumePickupSignal(lying)).toEqual({ accepted: false, reason: 'no_pickup_before_readiness' });
    // A non-contract payload is refused closed.
    const drifted = { ...ready!, payload: { ...ready!.payload, buyerDropCode: '4242' } };
    expect(mock.consumePickupSignal(drifted)).toEqual({ accepted: false, reason: 'payload_not_contract_shaped' });
  });
});
