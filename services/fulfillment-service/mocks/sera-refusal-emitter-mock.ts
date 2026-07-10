import { setTimeout as sleep } from 'node:timers/promises';
import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';
import {
  DOMAIN_PAYLOAD_SCHEMAS,
  MockTimeoutError,
  type DeliveredEvent,
  type EmissionControls,
  type EmissionResult,
  type MockAdapter,
  type ProjectionRead,
  type TransitionAttempt,
} from '@platform/certification';

/**
 * SÉRA PICKUP-REFUSAL EMITTER MOCK (WO-2.6 §3) — the counterparty whose
 * mismatch/damage refusal at pickup verification is the seller-fault signal
 * Boutik+ consumes (sera's WO-1.3 emission, consumed here until assembly).
 * Readiness domain: the certified sequence models readiness CONFIRMED then
 * INVALIDATED by the refused verification (readinessConfirmed:false — the
 * package is no longer pickup-eligible). §3-misbehaving: duplicates,
 * out-of-order, delay, stale reads, timeout, partial failure. The full
 * canonical refusal event (protection.claim_opened.v1, sera's exact payload
 * keys) is exposed separately for consumer tests — it is NOT a readiness-
 * domain payload, so it lives outside the certified emit stream.
 * NODE TOOLING ONLY: never imported by the app runtime graph.
 */

const AT = '2026-07-10T09:00:00.000Z';

export class SeraRefusalEmitterMock implements MockAdapter {
  readonly domain = 'readiness' as const;
  readonly producerSchema = DOMAIN_PAYLOAD_SCHEMAS.readiness;

  async emit(seed: string, controls: EmissionControls): Promise<EmissionResult> {
    if (controls.timeout) {
      await sleep(1);
      throw new MockTimeoutError(`sera-refusal-emitter: simulated timeout for seed ${seed}`);
    }
    const payload = (readinessConfirmed: boolean) => ({
      orderId: `order_${seed}`,
      packageId: `pkg_${seed}`,
      readinessConfirmed,
      at: AT,
    });
    let events: PlatformEvent[] = [
      { name: 'fulfillment.ready.v1' as const, payload: payload(true) },
      // The refused verification invalidates readiness — the package must be
      // corrected and re-readied before any new pickup (WO-2.6 corrective flow).
      { name: 'pickup.verification_recorded.v1' as const, payload: payload(false) },
    ].map((entry, index) =>
      PlatformEventSchema.parse({
        name: entry.name,
        envelope: {
          command_id: `cmd_refusal_${seed}_${index + 1}`,
          correlation_id: `corr_${seed}`,
          aggregateVersion: index + 1,
          actor: 'mock:sera-refusal-emitter',
          serverTime: new Date().toISOString(),
          version: 'v1',
        },
        payload: entry.payload,
      }),
    );
    if (controls.duplicate) {
      // at-least-once redelivery: same command_id delivered twice.
      events = [events[0]!, events[1]!, events[1]!];
    }
    if (controls.outOfOrder) {
      events = [events[1]!, events[0]!, ...events.slice(2)];
    }
    if (controls.delayMs !== undefined && controls.delayMs > 0) {
      await sleep(controls.delayMs);
    }
    if (controls.partialFailure) {
      const delivered: DeliveredEvent[] = [{ event: events[0]!, deliveredAt: Date.now() }];
      return { delivered, failure: { afterCount: 1, reason: 'sera-refusal-emitter: mid-sequence failure' } };
    }
    return { delivered: events.map((event) => ({ event, deliveredAt: Date.now() })) };
  }

  async readProjection(seed: string, options: { stale: boolean }): Promise<ProjectionRead> {
    if (options.stale) {
      // A genuinely stale read: still claims the package is pickup-ready.
      return { version: 1, asOf: '2026-07-09T00:00:00.000Z', value: { orderId: `order_${seed}`, ready: true, stale: true } };
    }
    return { version: 2, asOf: new Date().toISOString(), value: { orderId: `order_${seed}`, ready: false, refusedAtPickup: true } };
  }

  attemptInvalidTransition(): TransitionAttempt {
    return {
      from: 'verification_refused',
      to: 'in_custody',
      accepted: false,
      reason: 'a refused verification never begins custody — seal-after-verification only (SE-I05)',
    };
  }

  /**
   * The FULL canonical seller-fault refusal signal. Payload keys and event
   * name match sera's emission exactly (custody-spine.ts, per-attempt as of
   * sera WO-2.7 item 3: payload {order_id, faultClass, failed_checks,
   * attempt}; command key `fault-<orderId>-a<attempt>`); the envelope
   * actor is mock-local. Deterministic per (seed, attempt): re-emitting the
   * SAME attempt IS a redelivery (duplicate absorption provable), while a
   * genuine post-correction second refusal (attempt 2) is a NEW countable
   * event — the WO-2.6 verifier's finding-3 gap, closed upstream.
   */
  emitRefusalSignal(seed: string, failedChecks: readonly string[], attempt = 1): PlatformEvent {
    return PlatformEventSchema.parse({
      name: 'protection.claim_opened.v1',
      envelope: {
        command_id: `fault-order_${seed}-a${attempt}`,
        correlation_id: `corr_${seed}`,
        aggregateVersion: 2 + attempt,
        actor: 'mock:sera-refusal-emitter',
        serverTime: AT,
        version: 'v1',
      },
      payload: {
        order_id: `order_${seed}`,
        faultClass: 'seller',
        failed_checks: [...failedChecks],
        attempt,
      },
    });
  }
}
