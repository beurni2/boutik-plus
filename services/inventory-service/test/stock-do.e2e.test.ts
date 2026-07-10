import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ADVERSARIAL stock-reservation tests on the REAL Workers runtime (workerd
 * via Miniflare) — B5.1 DoD: "20 concurrent reserves on stock 1 → exactly 1
 * winner". The DO is addressed by variantId; workerd's per-object input
 * gate is the atomicity mechanism under test, not a shim.
 */

let mf: Miniflare;

beforeAll(() => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'dist-worker/stock-worker.mjs',
    durableObjects: { STOCK_RESERVATION: 'StockReservationDO' },
  });
});
afterAll(() => mf.dispose());

type Decision = { ok: boolean; reason?: string; holdId?: string; state?: { available: number }; idempotentReplay?: boolean };

async function send(variantId: string, body: Record<string, unknown>): Promise<Decision> {
  const res = await mf.dispatchFetch(`http://inventory/stock/${variantId}`, {
    method: 'POST',
    body: JSON.stringify({ variantId, ...body }),
  });
  return (await res.json()) as Decision;
}

describe('StockReservationDO on workerd', () => {
  it('TWENTY CONCURRENT RESERVES on stock 1 → EXACTLY ONE winner, nineteen insufficient_stock, stock 0, never negative', async () => {
    const v = 'var-race';
    expect((await send(v, { kind: 'set_stock', command_id: 'c-set', available: 1 })).ok).toBe(true);
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send(v, { kind: 'reserve', command_id: `race-${i}`, qty: 1, newHoldId: `hold-${i}` }),
      ),
    );
    const winners = attempts.filter((d) => d.ok);
    expect(winners).toHaveLength(1);
    expect(attempts.filter((d) => !d.ok && d.reason === 'insufficient_stock')).toHaveLength(19);
    const probe = await send(v, { kind: 'reserve', command_id: 'c-after', qty: 1, newHoldId: 'h-after' });
    expect(probe).toMatchObject({ ok: false, reason: 'insufficient_stock' });
    expect(probe.state?.available).toBe(0); // exactly zero — never negative
  });

  it('release restores atomically and the stock is reservable again; replay of the winning command is idempotent', async () => {
    const v = 'var-cycle';
    await send(v, { kind: 'set_stock', command_id: 'c-set', available: 1 });
    const win = await send(v, { kind: 'reserve', command_id: 'c-win', qty: 1, newHoldId: 'h-1' });
    expect(win.ok).toBe(true);
    const replay = await send(v, { kind: 'reserve', command_id: 'c-win', qty: 1, newHoldId: 'h-ignored' });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, holdId: 'h-1' });
    const rel = await send(v, { kind: 'release', command_id: 'c-rel', holdId: 'h-1' });
    expect(rel.ok).toBe(true);
    expect(rel.state?.available).toBe(1);
    const again = await send(v, { kind: 'reserve', command_id: 'c-again', qty: 1, newHoldId: 'h-2' });
    expect(again.ok).toBe(true);
  });

  it('router refuses a body/URL variant mismatch; variants are isolated per-DO', async () => {
    const res = await mf.dispatchFetch('http://inventory/stock/var-A', {
      method: 'POST',
      body: JSON.stringify({ kind: 'set_stock', variantId: 'var-B', command_id: 'x', available: 5 }),
    });
    expect(res.status).toBe(400);
    await send('var-A', { kind: 'set_stock', command_id: 'c1', available: 1 });
    await send('var-B2', { kind: 'set_stock', command_id: 'c2', available: 1 });
    const [a, b] = await Promise.all([
      send('var-A', { kind: 'reserve', command_id: 'ca', qty: 1, newHoldId: 'ha' }),
      send('var-B2', { kind: 'reserve', command_id: 'cb', qty: 1, newHoldId: 'hb' }),
    ]);
    expect(a.ok && b.ok).toBe(true);
  });
});
