import { describe, expect, it } from 'vitest';
import { certifyAdapter, CERTIFICATION_BEHAVIORS, formatScorecard } from '@platform/certification';
import { SeraRefusalEmitterMock } from '../mocks/sera-refusal-emitter-mock.js';

describe('Séra pickup-refusal emitter mock — certified by the pinned §3 suite', () => {
  it('scores 8/8 — CERTIFIED (the seller-fault signal counterparty for WO-2.6)', async () => {
    const card = await certifyAdapter(new SeraRefusalEmitterMock());
    console.log(formatScorecard(card)); // the scorecard IS the evidence
    expect(card.certified).toBe(true);
    expect(card.score).toBe(`${CERTIFICATION_BEHAVIORS.length}/${CERTIFICATION_BEHAVIORS.length}`);
    for (const result of card.results) {
      expect(result.passed, `${result.behavior}: ${result.detail}`).toBe(true);
    }
  });

  it('exposes the FULL canonical refusal event in sera\'s emission shape — fault attributed, deterministic redelivery', () => {
    const mock = new SeraRefusalEmitterMock();
    const signal = mock.emitRefusalSignal('t1', ['colour', 'qty']);
    expect(signal.name).toBe('protection.claim_opened.v1');
    expect(signal.payload).toEqual({ order_id: 'order_t1', faultClass: 'seller', failed_checks: ['colour', 'qty'] });
    // Re-emission of the same seed carries the SAME command_id — a true
    // at-least-once redelivery for consumer duplicate-absorption tests.
    expect(mock.emitRefusalSignal('t1', ['colour', 'qty']).envelope.command_id).toBe(signal.envelope.command_id);
  });
});
