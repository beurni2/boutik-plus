import { describe, expect, it } from 'vitest';
import {
  activeHolds,
  decideHold,
  decideHoldRelease,
  heldUnits,
  holdForOrder,
  STOCK_HOLD_TTL_MS,
  stockHoldTtlMs,
  type StockHolds,
} from '../src/stock-hold.js';

/**
 * B5.1 (RESERVATION-FOURNISSEUR-1) — the UNITS of the hold law. « Reserve/
 * release atomic; no negative » is proven on workerd in the seam; here the
 * pure decision: a hold never takes what is not there, replays move nothing,
 * a release of nothing is nothing, and an expired hold is not a hold.
 */

const T0 = '2026-09-18T08:00:00.000Z';
const plus = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const TTL = 60_000;

describe('decideHold — one unit, granted only while it exists', () => {
  it('grants on stock 1 (net 0 after), refuses the second ask by name', () => {
    const a = decideHold(1, {}, { reservationId: 'res-a', orderId: 'ord-a' }, T0, TTL);
    expect(a.status).toBe('held');
    if (a.status !== 'held') return;
    expect(a.available).toBe(0);
    expect(a.hold).toEqual({ reservationId: 'res-a', orderId: 'ord-a', qty: 1, at: T0, expiresAt: plus(TTL) });
    const b = decideHold(1, a.holds, { reservationId: 'res-b', orderId: 'ord-b' }, T0, TTL);
    expect(b).toEqual({ status: 'insufficient_stock', holds: a.holds, available: 0 });
  });

  it('a replay of the SAME reservation is idempotent — same hold, nothing moved', () => {
    const a = decideHold(1, {}, { reservationId: 'res-a', orderId: 'ord-a' }, T0, TTL);
    if (a.status !== 'held') throw new Error('unreachable');
    const again = decideHold(1, a.holds, { reservationId: 'res-a', orderId: 'ord-a' }, plus(10_000), TTL);
    expect(again.status).toBe('idempotent');
    if (again.status !== 'idempotent') return;
    expect(again.hold).toEqual(a.hold);
    expect(again.holds).toEqual(a.holds);
    expect(again.available).toBe(0);
  });

  it('stock 0 refuses at once, with the honest net (never negative)', () => {
    expect(decideHold(0, {}, { reservationId: 'r', orderId: 'o' }, T0, TTL)).toEqual({ status: 'insufficient_stock', holds: {}, available: 0 });
  });

  it('an EXPIRED hold no longer counts — the unit is free again, and the sweep drops it', () => {
    const a = decideHold(1, {}, { reservationId: 'res-a', orderId: 'ord-a' }, T0, TTL);
    if (a.status !== 'held') throw new Error('unreachable');
    const late = plus(TTL + 1);
    expect(heldUnits(a.holds, late)).toBe(0);
    const b = decideHold(1, a.holds, { reservationId: 'res-b', orderId: 'ord-b' }, late, TTL);
    expect(b.status).toBe('held');
    if (b.status !== 'held') return;
    expect(Object.keys(b.holds)).toEqual(['res-b']);
    // exactly the window is still alive
    expect(heldUnits(a.holds, plus(TTL))).toBe(1);
  });

  it('never mutates its inputs', () => {
    const holds: StockHolds = {};
    decideHold(3, holds, { reservationId: 'r', orderId: 'o' }, T0, TTL);
    expect(holds).toEqual({});
  });
});

describe('decideHoldRelease — the unit comes back; releasing nothing is nothing', () => {
  it('releases a live hold; a second release is idempotent', () => {
    const a = decideHold(1, {}, { reservationId: 'res-a', orderId: 'ord-a' }, T0, TTL);
    if (a.status !== 'held') throw new Error('unreachable');
    const r = decideHoldRelease(a.holds, 'res-a', T0);
    expect(r).toEqual({ status: 'released', holds: {} });
    expect(decideHoldRelease(r.holds, 'res-a', T0)).toEqual({ status: 'idempotent', holds: {} });
    expect(decideHoldRelease({}, 'res-never', T0)).toEqual({ status: 'idempotent', holds: {} });
  });

  it('releasing an already-expired hold is idempotent and sweeps it', () => {
    const a = decideHold(1, {}, { reservationId: 'res-a', orderId: 'ord-a' }, T0, TTL);
    if (a.status !== 'held') throw new Error('unreachable');
    expect(decideHoldRelease(a.holds, 'res-a', plus(TTL + 1))).toEqual({ status: 'idempotent', holds: {} });
  });
});

describe('holdForOrder · activeHolds — the consume finds its own hold', () => {
  it('finds the live hold by order id, not an expired one, not another order’s', () => {
    const a = decideHold(2, {}, { reservationId: 'res-a', orderId: 'ord-a' }, T0, TTL);
    if (a.status !== 'held') throw new Error('unreachable');
    const b = decideHold(2, a.holds, { reservationId: 'res-b', orderId: 'ord-b' }, T0, TTL);
    if (b.status !== 'held') throw new Error('unreachable');
    expect(holdForOrder(b.holds, 'ord-b', T0)?.reservationId).toBe('res-b');
    expect(holdForOrder(b.holds, 'ord-c', T0)).toBeUndefined();
    expect(holdForOrder(b.holds, 'ord-b', plus(TTL + 1))).toBeUndefined();
  });

  it('a hold with an unparseable expiry reads as EXPIRED, never as forever', () => {
    const holds: StockHolds = { r: { reservationId: 'r', orderId: 'o', qty: 1, at: T0, expiresAt: 'pourri' } };
    expect(activeHolds(holds, T0)).toEqual({});
    expect(heldUnits(holds, T0)).toBe(0);
  });
});

describe('stockHoldTtlMs — the LOWER-ONLY knob', () => {
  it('fifteen minutes by default; unset / malformed / non-positive / larger read as the constant', () => {
    expect(STOCK_HOLD_TTL_MS).toBe(15 * 60 * 1000);
    for (const v of [undefined, '', 'abc', '0', '-5', '1.5', String(STOCK_HOLD_TTL_MS + 1)]) {
      expect(stockHoldTtlMs({ STOCK_HOLD_TTL_MS: v })).toBe(STOCK_HOLD_TTL_MS);
    }
    expect(stockHoldTtlMs({ STOCK_HOLD_TTL_MS: '1000' })).toBe(1_000);
  });
});
