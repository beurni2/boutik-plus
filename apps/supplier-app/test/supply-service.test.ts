import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpSupplyService,
  WRITE_KEY_HEADER,
  readOutcome,
  resolveSupplyService,
  type CreateOfferInput,
} from '../src/supply/service';
import { DEMO_SUPPLY_SENTINEL, DemoSupplyService } from '../src/supply/demo';

/**
 * SUPPLIER-AUTHORING-1 — the app's first outbound calls.
 *
 * The property that matters most: **unset env resolves to NOTHING, never to demo.**
 * A resolver that fell back to a populated adapter would be one missing secret away
 * from publishing invented products under the founder's name — shop-plus's
 * `VITRINE_SEED` / `AICHA_TRUST` failure class.
 */

const CMD: CreateOfferInput = {
  commandId: 'cmd-1',
  offerId: 'offer-1',
  product: {
    id: 'pv-1', supplierId: 'supplier-founder-001', version: 1, name: 'Pagne tissé',
    productCode: 'PAG-01', facts: {}, category: 'textile', zone: 'Gounghin',
    moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: 'pv-1', basePrice: 10_000, resellerCommission: 1_000,
    eligibleVariants: [], zones: [],
    effective: '2026-07-24T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 5,
  asOf: '2026-07-24T21:00:00.000Z',
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('the resolver — unset means NOTHING, never fabricated data', () => {
  it('returns null when BOTH values are unset — the honest « non configuré »', () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', '');
    vi.stubEnv('EXPO_PUBLIC_OFFER_WRITE_KEY', '');
    expect(resolveSupplyService()).toBeNull();
  });

  it('returns null when EITHER is missing — a half-configured app writes nowhere', () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    vi.stubEnv('EXPO_PUBLIC_OFFER_WRITE_KEY', '');
    expect(resolveSupplyService()).toBeNull();
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', '');
    vi.stubEnv('EXPO_PUBLIC_OFFER_WRITE_KEY', 'k');
    expect(resolveSupplyService()).toBeNull();
  });

  it('returns the REAL client only when both are present', () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    vi.stubEnv('EXPO_PUBLIC_OFFER_WRITE_KEY', 'k');
    expect(resolveSupplyService()).toBeInstanceOf(HttpSupplyService);
  });

  it('NEVER returns the demo adapter, under any env combination', () => {
    for (const [b, k] of [['', ''], ['https://x', ''], ['', 'k'], ['https://x', 'k']]) {
      vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', b);
      vi.stubEnv('EXPO_PUBLIC_OFFER_WRITE_KEY', k);
      expect(resolveSupplyService()).not.toBeInstanceOf(DemoSupplyService);
    }
  });
});

describe('the real client sends what the service expects', () => {
  it('POSTs the command to /offers with the write key header', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ status: 'created' }), { status: 200 });
    });
    const svc = new HttpSupplyService('https://offer.example/', 'the-key'); // trailing slash on purpose
    const out = await svc.createOffer(CMD);
    expect(out).toEqual({ ok: true, value: { status: 'created' } });
    expect(calls[0]!.url).toBe('https://offer.example/offers'); // no double slash
    expect((calls[0]!.init.headers as Record<string, string>)[WRITE_KEY_HEADER]).toBe('the-key');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(CMD); // the command, verbatim
  });

  it('carries NO assets — this slice authors products with no photographs, so the wire gets []', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status: 'created' }), { status: 200 }));
    const svc = new HttpSupplyService('https://offer.example', 'k');
    await svc.createOffer(CMD);
    expect('assets' in CMD).toBe(false);
  });
});

describe('failures are LEGIBLE on the device — this string is the only diagnostic he will get', () => {
  it('a non-2xx surfaces the status AND the service’s own words', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    const out = await new HttpSupplyService('https://offer.example', 'k').createOffer(CMD);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain('401'); // the status
    expect(out.reason).toContain('unauthorized'); // the service's reason, not a generic failure
  });

  it('a network failure names the cause rather than « échec »', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('Network request failed'); });
    const out = await new HttpSupplyService('https://offer.example', 'k').createOffer(CMD);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain('Network request failed');
  });

  it('an unreadable body is refused honestly — never a fabricated success', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>gateway</html>', { status: 200 }));
    const out = await new HttpSupplyService('https://offer.example', 'k').createOffer(CMD);
    expect(out.ok).toBe(false);
  });

  it('NOTHING throws up into the UI — every path resolves to a result', async () => {
    for (const f of [
      async () => { throw new Error('boom'); },
      async () => new Response('', { status: 500 }),
      async () => new Response('{}', { status: 200 }),
    ]) {
      vi.stubGlobal('fetch', f);
      await expect(new HttpSupplyService('https://o.example', 'k').createOffer(CMD)).resolves.toBeDefined();
    }
  });
});

describe('the demo adapter exists for TESTS only', () => {
  it('records commands and fabricates nothing back', async () => {
    const demo = new DemoSupplyService();
    const out = await demo.createOffer(CMD);
    expect(out).toEqual({ ok: true, value: { status: 'created' } });
    expect(demo.written).toEqual([CMD]); // the assertion surface
  });

  it('carries the sentinel the bundle-absence gate searches for', () => {
    expect(DEMO_SUPPLY_SENTINEL).toBe('BOUTIK_DEMO_SUPPLY_ADAPTER_MUST_NOT_SHIP');
  });
});


describe('the RESPONSE boundary is validated — money crosses here', () => {
  /**
   * The old code did `JSON.parse(text) as CreateOfferOutcome`, which is a
   * compile-time lie (fresh-context verifier finding). Two real consequences:
   * a 2xx body of `null` made `res.value.status` a TypeError thrown mid-render
   * with no error boundary anywhere, and a non-numeric `sellerNetFcfa` reached
   * `formatF` — a WRONG FIGURE rendered after the offer was already created.
   */
  it('refuses a body that is not a decision — null, an array, a string, an unknown status', () => {
    for (const body of [null, undefined, [], 'ok', 42, {}, { status: 'ok' }, { status: 'CREATED' }]) {
      expect(readOutcome(body), JSON.stringify(body) ?? 'undefined').toBeNull();
    }
  });

  it('accepts each of the four real decision statuses', () => {
    for (const status of ['created', 'idempotent', 'collision', 'refused']) {
      expect(readOutcome({ status })).toEqual({ status });
    }
  });

  it('carries a string reason and DROPS a non-string one rather than rendering it', () => {
    expect(readOutcome({ status: 'refused', reason: 'below_category_floor' }))
      .toEqual({ status: 'refused', reason: 'below_category_floor' });
    expect(readOutcome({ status: 'refused', reason: { code: 9 } })).toEqual({ status: 'refused' });
  });

  it('a MALFORMED MONEY FIGURE is dropped, and the decision survives — no figure beats a wrong one', () => {
    for (const bad of [null, 'huit mille', NaN, Infinity, undefined, {}]) {
      const out = readOutcome({ status: 'created', preview: { sellerNetFcfa: bad, sellerPlatformFeeFcfa: 500 } });
      expect(out, String(bad)).toEqual({ status: 'created' }); // decision kept, preview gone
      expect(out?.preview, String(bad)).toBeUndefined();
    }
    // …and a well-formed one is carried through EXACTLY
    expect(readOutcome({ status: 'created', preview: { sellerNetFcfa: 8_500, sellerPlatformFeeFcfa: 500 } }))
      .toEqual({ status: 'created', preview: { sellerNetFcfa: 8_500, sellerPlatformFeeFcfa: 500 } });
  });

  it('a 200 with an unreadable body is a typed FAILURE, never a success', async () => {
    vi.stubGlobal('fetch', async () => new Response('null', { status: 200 }));
    const out = await new HttpSupplyService('https://o.example', 'k').createOffer(CMD);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.cause).toBe('unreadable');
  });

  it('a network throw and a non-2xx carry DIFFERENT causes — the screen must tell them apart', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('Network request failed'); });
    const net = await new HttpSupplyService('https://o.example', 'k').createOffer(CMD);
    expect(net.ok === false && net.cause).toBe('network');

    vi.stubGlobal('fetch', async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    const http = await new HttpSupplyService('https://o.example', 'k').createOffer(CMD);
    expect(http.ok === false && http.cause).toBe('http');
    expect(http.ok === false && http.reason).toContain('401');
  });
});
