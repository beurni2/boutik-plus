import { describe, expect, it } from 'vitest';
import { SupplierRegistry } from '../src/onboarding.js';

describe('supplier onboarding — B0.2, zero-cost, provisional, idempotent', () => {
  it('onboards at ZERO COST: the record has no money field of any kind, tier is provisional, faultCount 0', () => {
    const registry = new SupplierRegistry();
    const outcome = registry.onboard({ command_id: 'c1', phoneAlias: 'alias-01', displayName: 'Awa' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.trust).toEqual({ sellerId: outcome.user.id, tier: 'provisional', faultCount: 0, restrictions: [], probationLimits: {} });
    // Zero-cost is structural: no key on either record smells of entry money.
    const keys = [...Object.keys(outcome.user), ...Object.keys(outcome.trust)].join(',');
    expect(keys).not.toMatch(/deposit|bond|caution|fee|subscription|reserve/i);
    expect(outcome.user.roles).toEqual({ supplier: true, reseller: false, buyer: false });
    expect(outcome.user.phoneAlias.verified).toBe(false); // verification is a SERVER act
  });

  it('DUPLICATE onboarding is idempotent: same phone alias → the SAME record, flagged duplicate', () => {
    const registry = new SupplierRegistry();
    const first = registry.onboard({ command_id: 'c1', phoneAlias: 'alias-01', displayName: 'Awa' });
    const second = registry.onboard({ command_id: 'c2', phoneAlias: 'alias-01', displayName: 'Awa encore' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.duplicate).toBe(true);
    expect(second.user.id).toBe(first.user.id); // no second supplier exists
  });

  it('UNVERIFIED cannot publish; server phone confirmation unlocks it; provisional tier is no obstacle', () => {
    const registry = new SupplierRegistry();
    const outcome = registry.onboard({ command_id: 'c1', phoneAlias: 'alias-01', displayName: 'Awa' });
    if (!outcome.ok) throw new Error('setup');
    expect(registry.canPublish(outcome.user.id)).toBe(false); // unverified → refused
    expect(registry.confirmPhoneVerified(outcome.user.id)).toBe(true);
    expect(registry.canPublish(outcome.user.id)).toBe(true); // provisional + verified → publishes
    expect(registry.supplier(outcome.user.id)!.trust.tier).toBe('provisional'); // tier untouched (D10 open)
  });

  it('unknown suppliers cannot publish; malformed input refuses closed', () => {
    const registry = new SupplierRegistry();
    expect(registry.canPublish('supplier-ghost')).toBe(false);
    expect(registry.onboard({ command_id: 'c1', phoneAlias: '', displayName: 'X' })).toEqual({ ok: false, reason: 'malformed_input' });
  });
});
