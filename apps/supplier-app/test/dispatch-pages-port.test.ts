import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGES_MAX, resolveDispatchService, resolveGainsService } from '../src/operations/dispatch-service';

/**
 * ═══ DISPATCH-PAGES-1 (AUDIT-SHOP-1 slice b) — the console FOLLOWS the
 * Worker's cursor, and tells the truth about a sweep it could not finish ═══
 *
 * The Shop+ Worker now answers these two reads in pages with a `next`
 * cursor (the whole-list fan-out 500'd its subrequest budget at ≈49
 * lifetime orders). What this file pins on the ports:
 *   · the loop follows `next` VERBATIM until it is absent, and the rows
 *     aggregate in page order — the board is whole again past 40 orders;
 *   · a page that fails MID-SWEEP fails the read whole — rows already
 *     fetched are never served as the board (whole-or-nothing);
 *   · a sweep the page cap ends with a `next` still standing is DECLARED
 *     `incomplet` (B3's law: a short list is never served as complete);
 *   · an OLDER Worker (no `next` field) is one round trip, complete.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const lrow = (orderId: string) => ({
  orderId, state: 'confirmed', createdAt: '2026-09-03T08:00:00.000Z',
  contact: { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'Face à la pharmacie' },
  productVersionId: 'pv-1', zoneTo: 'Ouagadougou',
});

const SPLIT = {
  sellerBasePrice: 10_000, sellerFundedCommission: 1_000, resellerMarkup: 1_500, deliveryFee: 1_000,
  productSubtotal: 11_500, buyerTotal: 12_500, sellerPlatformFee: 0, sellerNet: 9_000,
  resellerPlatformFee: 0, resellerNet: 2_500,
};
const grow = (orderId: string) => ({
  orderId, createdAt: '2026-09-03T08:00:00.000Z', productVersionId: 'pv-1', zoneTo: 'Gounghin', split: SPLIT,
});

function pages(reponses: { body: unknown; status?: number }[]) {
  const urls: string[] = [];
  let n = -1;
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    n += 1;
    const r = reponses[Math.min(n, reponses.length - 1)]!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return urls;
}

describe('listLivraisons — the follow-the-next loop', () => {
  it('three pages aggregate in order; each request carries the previous next VERBATIM; incomplet is false', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    const urls = pages([
      { body: { ok: true, orders: [lrow('ord-1'), lrow('ord-2')], next: 'c%7C1|a' } },
      { body: { ok: true, orders: [lrow('ord-3')], next: 'c2' } },
      { body: { ok: true, orders: [lrow('ord-4')] } },
    ]);
    const res = await resolveDispatchService()!.listLivraisons('cle-c');
    if (!res.ok) throw new Error(res.reason);
    expect(res.rows.map((r) => r.orderId)).toEqual(['ord-1', 'ord-2', 'ord-3', 'ord-4']);
    expect(res.incomplet).toBe(false);
    expect(urls).toEqual([
      'http://shop/checkout/dispatch?limit=40',
      // the cursor rides back exactly as answered, URI-encoded once for the query
      `http://shop/checkout/dispatch?limit=40&cursor=${encodeURIComponent('c%7C1|a')}`,
      'http://shop/checkout/dispatch?limit=40&cursor=c2',
    ]);
  });

  it('a page that fails MID-SWEEP fails the read whole — no half board', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    pages([
      { body: { ok: true, orders: [lrow('ord-1')], next: 'c1' } },
      { body: {}, status: 503 },
    ]);
    expect(await resolveDispatchService()!.listLivraisons('cle-c')).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('a 401 on a LATER page is still bad_key — the founder is told about his key, not about the network', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    pages([
      { body: { ok: true, orders: [lrow('ord-1')], next: 'c1' } },
      { body: {}, status: 401 },
    ]);
    expect(await resolveDispatchService()!.listLivraisons('cle-c')).toEqual({ ok: false, reason: 'bad_key' });
  });

  it('a Worker that never stops answering next ends at the cap, DECLARED incomplet with the rows it has', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    pages([{ body: { ok: true, orders: [lrow('ord-x')], next: 'encore' } }]);
    const res = await resolveDispatchService()!.listLivraisons('cle-c');
    if (!res.ok) throw new Error(res.reason);
    expect(res.incomplet).toBe(true);
    expect(res.rows).toHaveLength(PAGES_MAX);
  });
});

describe('listGains — the same loop, the same declarations', () => {
  it('an empty page whose next stands is followed — « no gains on this page » is not « no more pages »', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    const urls = pages([
      { body: { ok: true, gains: [], next: 'c1' } },
      { body: { ok: true, gains: [grow('ord-g1')] } },
    ]);
    const res = await resolveGainsService()!.listGains('cle-c');
    if (!res.ok) throw new Error(res.reason);
    expect(res.rows.map((r) => r.orderId)).toEqual(['ord-g1']);
    expect(res.incomplet).toBe(false);
    expect(urls).toHaveLength(2);
  });

  it('mid-sweep failure is whole-or-nothing here too, and the cap declares itself', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    pages([
      { body: { ok: true, gains: [grow('ord-g1')], next: 'c1' } },
      { body: 'pas du json' },
    ]);
    expect(await resolveGainsService()!.listGains('cle-c')).toEqual({ ok: false, reason: 'unreachable' });

    pages([{ body: { ok: true, gains: [grow('ord-g1')], next: 'encore' } }]);
    const res = await resolveGainsService()!.listGains('cle-c');
    if (!res.ok) throw new Error(res.reason);
    expect(res.incomplet).toBe(true);
  });
});
