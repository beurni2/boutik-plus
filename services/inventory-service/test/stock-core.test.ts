import { describe, expect, it } from 'vitest';
import { decideStock, emptyStock, type StockState } from '../src/stock-reservation.js';

function stocked(available: number): StockState {
  const set = decideStock(emptyStock('var-1'), { kind: 'set_stock', command_id: 'c-set', variantId: 'var-1', available });
  if (!set.ok) throw new Error('setup');
  return set.state;
}

describe('stock reservation core — B5.1, atomic, never negative', () => {
  it('reserve decrements; release restores; both idempotent on command_id', () => {
    let state = stocked(3);
    const r1 = decideStock(state, { kind: 'reserve', command_id: 'c-r1', variantId: 'var-1', qty: 2, newHoldId: 'h1' });
    expect(r1.ok && r1.state.available).toBe(1);
    if (!r1.ok) return;
    const replay = decideStock(r1.state, { kind: 'reserve', command_id: 'c-r1', variantId: 'var-1', qty: 2, newHoldId: 'h-other' });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, holdId: 'h1' }); // no double-take
    const rel = decideStock(r1.state, { kind: 'release', command_id: 'c-rel', variantId: 'var-1', holdId: 'h1' });
    expect(rel.ok && rel.state.available).toBe(3);
    if (!rel.ok) return;
    expect(decideStock(rel.state, { kind: 'release', command_id: 'c-rel', variantId: 'var-1', holdId: 'h1' })).toMatchObject({
      ok: true, idempotentReplay: true,
    });
  });

  it('NEVER NEGATIVE: over-reserve refuses closed with zero mutation; unknown release refuses', () => {
    const state = stocked(1);
    const over = decideStock(state, { kind: 'reserve', command_id: 'c-r', variantId: 'var-1', qty: 2, newHoldId: 'h1' });
    expect(over).toMatchObject({ ok: false, reason: 'insufficient_stock' });
    expect(over.state.available).toBe(1); // untouched
    expect(decideStock(state, { kind: 'release', command_id: 'c-x', variantId: 'var-1', holdId: 'h-ghost' })).toMatchObject({
      ok: false, reason: 'unknown_hold',
    });
  });

  it('invalid quantities and negative stock refuse closed; variant mismatch refuses closed', () => {
    const state = stocked(5);
    for (const qty of [0, -1, 1.5]) {
      expect(decideStock(state, { kind: 'reserve', command_id: `c-${qty}`, variantId: 'var-1', qty, newHoldId: 'h' })).toMatchObject({ ok: false, reason: 'invalid_qty' });
    }
    expect(decideStock(emptyStock('var-1'), { kind: 'set_stock', command_id: 'c', variantId: 'var-1', available: -1 })).toMatchObject({ ok: false, reason: 'invalid_qty' });
    expect(decideStock(state, { kind: 'reserve', command_id: 'c-m', variantId: 'var-OTHER', qty: 1, newHoldId: 'h' })).toMatchObject({ ok: false, reason: 'variant_mismatch' });
  });
});
