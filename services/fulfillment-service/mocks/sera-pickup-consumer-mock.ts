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
 * SÉRA PICKUP-CONSUMER MOCK (WO-1.4 §8) — the counterparty that consumes
 * Boutik+ readiness signals and turns them into pickup activity. Implements
 * the pinned MockAdapter for the 'readiness' domain so the shared §3
 * certification suite scores it 8/8 (Contract §3: a mock is not trustworthy
 * until it misbehaves like the real service). NODE TOOLING ONLY: lives
 * outside src/, imported by tests and the certify script — never by the app
 * runtime graph (ban-test enforced).
 */

const AT = '2026-07-10T09:00:00.000Z';

function readinessSequence(seed: string) {
  const payload = (readinessConfirmed: boolean) => ({
    orderId: `order_${seed}`,
    packageId: `pkg_${seed}`,
    readinessConfirmed,
    at: AT,
  });
  return [
    { name: 'fulfillment.accepted.v1' as const, payload: payload(false) },
    { name: 'seller.readiness_challenge_issued.v1' as const, payload: payload(false) },
    { name: 'fulfillment.ready.v1' as const, payload: payload(true) },
  ];
}

export class SeraPickupConsumerMock implements MockAdapter {
  readonly domain = 'readiness' as const;
  readonly producerSchema = DOMAIN_PAYLOAD_SCHEMAS.readiness;

  private readonly consumedCommandIds = new Set<string>();
  private readonly readyOrders = new Set<string>();

  async emit(seed: string, controls: EmissionControls): Promise<EmissionResult> {
    if (controls.timeout) {
      await sleep(1);
      throw new MockTimeoutError(`sera-pickup-consumer: simulated timeout for seed ${seed}`);
    }
    let events: PlatformEvent[] = readinessSequence(seed).map((entry, index) =>
      PlatformEventSchema.parse({
        name: entry.name,
        envelope: {
          command_id: `cmd_readiness_${seed}_${index + 1}`,
          correlation_id: `corr_${seed}`,
          aggregateVersion: index + 1,
          actor: 'mock:sera-pickup-consumer',
          serverTime: new Date().toISOString(),
          version: 'v1',
        },
        payload: entry.payload,
      }),
    );
    if (controls.duplicate) {
      // at-least-once redelivery: same command_id delivered twice.
      events = [...events.slice(0, 2), events[1]!, ...events.slice(2)];
    }
    if (controls.outOfOrder) {
      events = [...events.slice(0, -2), events.at(-1)!, events.at(-2)!];
    }
    if (controls.delayMs !== undefined && controls.delayMs > 0) {
      await sleep(controls.delayMs);
    }
    if (controls.partialFailure) {
      const delivered: DeliveredEvent[] = [{ event: events[0]!, deliveredAt: Date.now() }];
      return { delivered, failure: { afterCount: 1, reason: 'sera-pickup-consumer: mid-sequence failure' } };
    }
    return { delivered: events.map((event) => ({ event, deliveredAt: Date.now() })) };
  }

  async readProjection(seed: string, options: { stale: boolean }): Promise<ProjectionRead> {
    if (options.stale) {
      // A genuinely stale read: older version, older asOf, denies readiness.
      return { version: 1, asOf: '2026-07-09T00:00:00.000Z', value: { orderId: `order_${seed}`, ready: false, stale: true } };
    }
    return { version: 2, asOf: new Date().toISOString(), value: { orderId: `order_${seed}`, ready: true } };
  }

  attemptInvalidTransition(): TransitionAttempt {
    return {
      from: 'picked_up',
      to: 'ready',
      accepted: false,
      reason: 'a picked-up package never returns to ready — custody governs from pickup (SE-I05)',
    };
  }

  /**
   * Consumer side: Séra accepts a pickup signal ONLY from a canonical
   * fulfillment.ready event with readinessConfirmed=true — "no pickup task
   * before readiness" seen from the consuming end. Duplicates absorb.
   */
  consumePickupSignal(raw: unknown): { accepted: boolean; duplicate?: boolean; reason?: string } {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, reason: 'not_a_platform_event' };
    const event = parsed.data;
    if (event.name !== 'fulfillment.ready.v1') return { accepted: false, reason: 'not_a_readiness_signal' };
    const payload = this.producerSchema.safeParse(event.payload);
    if (!payload.success) return { accepted: false, reason: 'payload_not_contract_shaped' };
    const p = event.payload as { orderId: string; readinessConfirmed: boolean };
    if (p.readinessConfirmed !== true) return { accepted: false, reason: 'no_pickup_before_readiness' };
    if (this.consumedCommandIds.has(event.envelope.command_id)) {
      return { accepted: true, duplicate: true };
    }
    this.consumedCommandIds.add(event.envelope.command_id);
    this.readyOrders.add(p.orderId);
    return { accepted: true, duplicate: false };
  }

  hasPickupFor(orderId: string): boolean {
    return this.readyOrders.has(orderId);
  }
}
