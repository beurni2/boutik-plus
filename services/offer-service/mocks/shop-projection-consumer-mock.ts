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
 * SHOP+ PROJECTION-CONSUMER MOCK (WO-1.4 §8) — the counterparty that reads
 * Boutik+ supply projections. Implements the pinned MockAdapter for the
 * 'supply-projection' domain, certified 8/8 by the shared §3 suite. Its
 * consumer side REFUSES any projection carrying supplier identity, contact,
 * or pickup material — the same law B4.2 enforces on the producer. NODE
 * TOOLING ONLY: outside src/, never in the app runtime graph.
 */

const IDENTITY_LEAK = /supplier[_-]?(id|name|phone|contact)|phone|whatsapp|pickup|adresse|address/i;

function projectionSequence(seed: string) {
  const payload = (available: number) => ({
    productVersionId: `pv_${seed}`,
    offerVersion: `1`,
    basePrice: 10_000,
    resellerCommission: 1_000,
    available,
    // canon v2.0.0 (SUPPLY-DISPLAY-FIELDS-1): productName + assetRefs both
    // required on the wire. Refs are productVersionId-keyed (never supplier-keyed),
    // matching the canon reference adapter.
    productName: 'Savon de karité',
    assetRefs: [`media/pv_${seed}/hero.jpg`],
    // canon v3.0.0 (CATEGORY-WIRE-1): `category` is required too. This mock
    // stands in for the SHOP+ CONSUMER, so its payload must be exactly what a
    // real producer now sends — a mock still emitting seven fields would certify
    // a consumer against a wire that no longer exists, which is the mock failure
    // mode the certification suite exists to prevent. Value matches the canon
    // reference adapter's, for the same shea soap.
    category: 'sealed_beauty_cosmetics',
  });
  return [
    { name: 'offer.published.v1' as const, payload: payload(5) },
    { name: 'inventory.availability.changed.v1' as const, payload: payload(4) },
    { name: 'inventory.adjusted.v1' as const, payload: payload(4) },
  ];
}

export class ShopProjectionConsumerMock implements MockAdapter {
  readonly domain = 'supply-projection' as const;
  readonly producerSchema = DOMAIN_PAYLOAD_SCHEMAS['supply-projection'];

  private readonly consumedCommandIds = new Set<string>();

  async emit(seed: string, controls: EmissionControls): Promise<EmissionResult> {
    if (controls.timeout) {
      await sleep(1);
      throw new MockTimeoutError(`shop-projection-consumer: simulated timeout for seed ${seed}`);
    }
    let events: PlatformEvent[] = projectionSequence(seed).map((entry, index) =>
      PlatformEventSchema.parse({
        name: entry.name,
        envelope: {
          command_id: `cmd_supply_${seed}_${index + 1}`,
          correlation_id: `corr_${seed}`,
          aggregateVersion: index + 1,
          actor: 'mock:shop-projection-consumer',
          serverTime: new Date().toISOString(),
          version: 'v1',
        },
        payload: entry.payload,
      }),
    );
    if (controls.duplicate) {
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
      return { delivered, failure: { afterCount: 1, reason: 'shop-projection-consumer: mid-sequence failure' } };
    }
    return { delivered: events.map((event) => ({ event, deliveredAt: Date.now() })) };
  }

  async readProjection(seed: string, options: { stale: boolean }): Promise<ProjectionRead> {
    if (options.stale) {
      return { version: 1, asOf: '2026-07-09T00:00:00.000Z', value: { productVersionId: `pv_${seed}`, available: 5, stale: true } };
    }
    return { version: 2, asOf: new Date().toISOString(), value: { productVersionId: `pv_${seed}`, available: 4 } };
  }

  attemptInvalidTransition(): TransitionAttempt {
    return {
      from: 'expired',
      to: 'active',
      accepted: false,
      reason: 'an expired offer version never reactivates — a change is a new version (B+I-04)',
    };
  }

  /**
   * Consumer side: Shop+ accepts ONLY the strict contract shape — a
   * projection bearing supplier identity/contact/pickup keys is refused
   * closed, and duplicates absorb on command_id.
   */
  consumeProjection(raw: unknown): { accepted: boolean; duplicate?: boolean; reason?: string } {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, reason: 'not_a_platform_event' };
    const event = parsed.data;
    const payload = this.producerSchema.safeParse(event.payload);
    if (!payload.success) return { accepted: false, reason: 'payload_not_contract_shaped' };
    for (const key of Object.keys(event.payload)) {
      if (IDENTITY_LEAK.test(key)) return { accepted: false, reason: 'identity_material_refused' };
    }
    if (this.consumedCommandIds.has(event.envelope.command_id)) {
      return { accepted: true, duplicate: true };
    }
    this.consumedCommandIds.add(event.envelope.command_id);
    return { accepted: true, duplicate: false };
  }
}
