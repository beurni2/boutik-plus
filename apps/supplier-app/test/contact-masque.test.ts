import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveDispatchService } from '../src/operations/dispatch-service';

/**
 * ═══ A FINISHED ORDER'S CONTACT IS HELD BACK BY SHOP+, AND THE CONSOLE SAYS SO ═══
 *
 * Shop+ stops handing her phone, map pin and voice note to the dispatch view
 * once her order is over, and marks that row `contactMasque: true` (the key
 * is absent on every other row). The console's reader must tell « held back »
 * from « she never left one », and must never drop a row over this field:
 * only the boolean `true` means held back; absent, `false`, or anything else
 * reads as not held back.
 *
 * Driven through the real port (`resolveDispatchService().listLivraisons`)
 * over a fake `fetch`, the one boundary doubled.
 */

const ligne = (extra: Record<string, unknown>) => ({
  ok: true,
  exists: true,
  orderId: `ord-${String(Math.random()).slice(2, 8)}`,
  state: 'confirmed',
  createdAt: '2026-11-27T07:00:00.000Z',
  contact: null,
  productVersionId: 'pv',
  zoneTo: 'Gounghin',
  remboursement: null,
  aVerifier: null,
  ...extra,
});

beforeEach(() => {
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('the dispatch reader and contactMasque', () => {
  it('true means held back; absent, false or any other value means not; no row is ever dropped for it', async () => {
    const lignes = [
      ligne({ contactMasque: true }),
      ligne({}),
      ligne({ contactMasque: false }),
      ligne({ contactMasque: 'true' }),
      ligne({ contactMasque: 1 }),
      ligne({ contactMasque: null }),
      ligne({ contact: { phone: '70112233', quartier: 'Gounghin', repere: 'Face à la pharmacie' } }),
    ];
    (globalThis as { fetch: unknown }).fetch = async () => Response.json({ ok: true, orders: lignes });
    const port = resolveDispatchService();
    expect(port).not.toBeNull();
    const r = await port!.listLivraisons('cle-c');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.orderId), 'every row kept').toEqual(lignes.map((l) => l.orderId));
    expect(r.rows.map((x) => x.contactMasque === true)).toEqual([true, false, false, false, false, false, false]);
    expect(r.rows[6]!.contact?.phone).toBe('70112233');
  });
});
