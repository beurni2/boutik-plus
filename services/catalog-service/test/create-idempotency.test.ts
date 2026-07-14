import { describe, expect, it } from 'vitest';
import { ProductCatalog, type ProductDraft } from '../src/product.js';

/**
 * B0.2-DUP — the create-door idempotency, its invariants proven ADVERSARIALLY
 * and FIRST. Anchor (Boutik-Plus-Building-Plan B0.2): "unverified cannot
 * publish; DUPLICATE IDEMPOTENT." The minted `command_id` (the queue's
 * per-intent key — offline/queue.ts persists one per intent) is the idempotency
 * key at the service door, mirroring offline/queue.ts:108-118's duplicate |
 * collision vocabulary:
 *  ① a re-submitted create with the SAME key + SAME payload is a safe no-op —
 *     ONE version, the SAME identity returned, NO re-emit (never a 2nd listing);
 *  ② the SAME key with a DIFFERENT payload is a COLLISION — refused + surfaced,
 *     the first version untouched (never silently overwritten);
 *  ③ DISTINCT keys make DISTINCT versions (idempotency never collapses two
 *     genuine intents).
 */

const AT = '2026-07-13T10:00:00.000Z';
const draftA: ProductDraft = {
  supplierId: 'supplier-7',
  name: 'Savon local',
  productCode: 'SAV-01',
  category: 'hygiene',
  zone: 'Bobo',
  variantAttributes: { taille: '250g' },
};
// SAME command_id will carry this DIFFERENT payload in the collision test.
const draftB: ProductDraft = { ...draftA, name: 'Savon premium', productCode: 'SAV-02' };
const ctx = (command_id: string) => ({ command_id, correlation_id: 'corr-1', actor: 'supplier-7' });

describe('B0.2-DUP — the create-door is idempotent by command_id', () => {
  it('① double-submit (same key + same payload) → ONE version, the SAME identity, no re-emit', () => {
    const catalog = new ProductCatalog();
    const first = catalog.create(draftA, true, ctx('cmd-1'), AT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.outcome).toBe('created');
    const firstId = first.version.id;
    expect(first.events.map((e) => e.name)).toEqual(['catalog.product_submitted.v1']); // the ONE submit

    const replay = catalog.create(draftA, true, ctx('cmd-1'), AT);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.outcome).toBe('duplicate');
    expect(replay.version.id).toBe(firstId); // SAME identity
    expect(replay.variant.id).toBe(first.variant.id); // SAME variant
    expect(replay.events).toEqual([]); // NO re-emit — the submit already fired once
    // exactly ONE version exists — no second listing was minted (a new key would be pv-2)
    expect(catalog.get('pv-2')).toBeUndefined();
  });

  it('② same key + DIFFERENT payload → COLLISION, refused + surfaced, the first version untouched', () => {
    const catalog = new ProductCatalog();
    const first = catalog.create(draftA, true, ctx('cmd-1'), AT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstId = first.version.id;

    const collision = catalog.create(draftB, true, ctx('cmd-1'), AT);
    expect(collision).toEqual({ ok: false, reason: 'idempotency_collision' }); // surfaced, not silent
    // the first version is UNTOUCHED — never overwritten by the colliding payload
    expect(catalog.get(firstId)!.name).toBe('Savon local');
    expect(catalog.get('pv-2')).toBeUndefined(); // no second version minted
  });

  it('③ DISTINCT keys → DISTINCT versions (idempotency never collapses two genuine intents)', () => {
    const catalog = new ProductCatalog();
    const a = catalog.create(draftA, true, ctx('cmd-1'), AT);
    const b = catalog.create(draftB, true, ctx('cmd-2'), AT);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.outcome).toBe('created');
    expect(b.outcome).toBe('created');
    expect(a.version.id).not.toBe(b.version.id);
  });
});
