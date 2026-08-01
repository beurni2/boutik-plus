import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredOpsKey,
  operateurHashPresent,
  readStoredOpsKey,
  resolveOperationsService,
  storeOpsKey,
  type PaidOrderRow,
} from '../src/operations/service';
import { CHASE_AFTER_MIN, ageMinutes, operationsView } from '../src/operations/view';
import { catalog } from '../src/i18n';

/**
 * CONSOLE-1 — the founder's operator board (founder directive 2026-08-01).
 *
 * The decision (`operations/view.ts`) is tested BY VALUE — real rows in, real
 * sections out — because the one number that matters here is HIS: « after
 * 10 mn … I will notify them offline myself. » A board that files a
 * 10-minute-old order under « à l'instant » would silently cancel that ruling.
 *
 * The port (`operations/service.ts`) is tested against a stubbed fetch: the
 * key travels as the Bearer (and only when ASKED — it is never read from any
 * env), 401 is its own honest sentence, and a malformed row is dropped, never
 * rendered half-formed. Screen-level properties are `[source-text check]`s —
 * this repo has no RN renderer (standing rule, JOURNAL 2026-07-25).
 */

const NOW = Date.parse('2026-08-01T12:00:00.000Z');

function rowAt(orderId: string, paidAt: string, over: Partial<PaidOrderRow> = {}): PaidOrderRow {
  return {
    orderId,
    productVersionId: 'pv-1',
    productName: 'Pagne tissé',
    offerVersion: 'ov-1',
    paymentMode: 'FULL_PREPAY',
    paidAt,
    zoneTo: 'Gounghin',
    sellerBasePrice: 10_000,
    supplierId: 'supplier-2',
    supplierResolved: true,
    registeredAt: paidAt,
    ...over,
  };
}

/** paidAt exactly `min` whole minutes (plus `extraMs`) before NOW. */
function paidAgo(min: number, extraMs = 0): string {
  return new Date(NOW - min * 60_000 - extraMs).toISOString();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/* ────────────────────────── the decision, by value ────────────────────────── */

describe('THE 10-MINUTE LINE — the founder’s ruling, at its exact boundary', () => {
  it('the constant IS his number', () => {
    expect(CHASE_AFTER_MIN).toBe(10);
  });

  it('paid EXACTLY 10 minutes ago → À RELANCER; one millisecond younger → recentes', () => {
    const view = operationsView(
      { kind: 'ok', rows: [rowAt('ord-on-line', paidAgo(10)), rowAt('ord-just-under', paidAgo(10, -1))] },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(`expected board, got ${view.kind}`);
    expect(view.relancer.map((r) => r.orderId)).toEqual(['ord-on-line']);
    expect(view.recentes.map((r) => r.orderId)).toEqual(['ord-just-under']);
  });

  it('relancer is OLDEST FIRST (the longest-waiting supplier is called first); recentes newest first', () => {
    const view = operationsView(
      {
        kind: 'ok',
        rows: [
          rowAt('r-15', paidAgo(15)), rowAt('r-60', paidAgo(60)), rowAt('r-10', paidAgo(10)),
          rowAt('f-3', paidAgo(3)), rowAt('f-0', paidAgo(0)), rowAt('f-9', paidAgo(9)),
        ],
      },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.relancer.map((r) => r.orderId)).toEqual(['r-60', 'r-15', 'r-10']);
    expect(view.recentes.map((r) => r.orderId)).toEqual(['f-0', 'f-3', 'f-9']);
  });

  it('an UNRESOLVED supplier is an anomaly AND still sits in its age section — never dropped from the board', () => {
    const view = operationsView(
      { kind: 'ok', rows: [rowAt('ord-ghost', paidAgo(20), { supplierId: '', supplierResolved: false })] },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.anomalies.map((r) => r.orderId)).toEqual(['ord-ghost']);
    expect(view.relancer.map((r) => r.orderId)).toEqual(['ord-ghost']);
  });
});

describe('ageMinutes — whole minutes, never a countdown', () => {
  it('floors to whole minutes', () => {
    expect(ageMinutes(paidAgo(9, 59_999), NOW)).toBe(9); // 9:59.999 is still 9 min
    expect(ageMinutes(paidAgo(10), NOW)).toBe(10);
  });

  it('a paidAt in the FUTURE (clock skew) reads 0 — and an unparseable one reads 0, not NaN', () => {
    expect(ageMinutes(new Date(NOW + 120_000).toISOString(), NOW)).toBe(0);
    expect(ageMinutes('not-a-clock', NOW)).toBe(0);
  });
});

describe('the honest states — each read failure keeps its own sentence', () => {
  it('loading / not_configured / bad_key / failed / empty each map to their own kind and catalog key', () => {
    const keys = new Set(catalog.map((e) => e.key));
    for (const [read, kind, message] of [
      [{ kind: 'loading' }, 'loading', 'operations.chargement'],
      [{ kind: 'not_configured' }, 'not_configured', 'operations.non_configure'],
      [{ kind: 'bad_key' }, 'bad_key', 'operations.cle_refusee'],
      [{ kind: 'failed' }, 'failed', 'operations.echec'],
      [{ kind: 'ok', rows: [] }, 'empty', 'operations.vide'],
    ] as const) {
      const view = operationsView(read, NOW);
      expect(view.kind, message).toBe(kind);
      expect('message' in view && view.message, kind).toBe(message);
      expect(keys.has(message), `${message} missing from catalog`).toBe(true);
    }
  });

  it('[source-text check] every operations.* key the screen renders exists in the catalog', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');
    const used = [...source.matchAll(/t\('(operations\.[a-z_.]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(5); // the extraction itself must see the screen
    const keys = new Set(catalog.map((e) => e.key));
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });
});

/* ─────────────────────────── the port, stubbed fetch ─────────────────────────── */

function stubFetch(reply: () => Promise<Response>) {
  const spy = vi.fn((_url: string, _init?: RequestInit) => reply());
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('the resolver — unset means NOTHING, never demo (standing law of this app’s ports)', () => {
  it('no EXPO_PUBLIC_OFFER_BASE → null; the screen shows « non configuré », not a fake board', () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', '');
    expect(resolveOperationsService()).toBeNull();
  });

  it('the key travels as the Bearer on the fulfillment route — from the ARGUMENT, no env fallback for it', () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example/');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, orders: [] })));
    return resolveOperationsService()!.listPaidOrders('cle-du-fondateur').then((res) => {
      expect(res).toEqual({ ok: true, orders: [] });
      expect(spy).toHaveBeenCalledOnce();
      const [url, init] = spy.mock.calls[0]!;
      expect(url).toBe('https://offer.example/fulfillment/orders'); // trailing slash trimmed
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-du-fondateur');
    });
  });

  it('401 is BAD_KEY — its own sentence, distinct from network trouble', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    stubFetch(async () => new Response('unauthorized', { status: 401 }));
    expect(await resolveOperationsService()!.listPaidOrders('k')).toEqual({ ok: false, reason: 'bad_key' });
  });

  it('a thrown fetch, a 500, and a 2xx of the wrong shape are all UNREACHABLE — never a silent empty board', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const port = resolveOperationsService()!;
    for (const reply of [
      () => Promise.reject(new Error('down')),
      async () => new Response('boom', { status: 500 }),
      async () => new Response('not json'),
      async () => new Response(JSON.stringify({ ok: true, orders: 'not-a-list' })),
    ]) {
      stubFetch(reply as () => Promise<Response>);
      expect(await port.listPaidOrders('k')).toEqual({ ok: false, reason: 'unreachable' });
    }
  });

  it('a MALFORMED row is dropped, the true rows survive — no half-formed line ever renders', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const good = rowAt('ord-true', '2026-08-01T11:00:00.000Z');
    stubFetch(async () =>
      new Response(JSON.stringify({
        ok: true,
        orders: [
          good,
          { orderId: '' },                                  // empty id
          { ...good, orderId: 'ord-franc', sellerBasePrice: 10_000.5 }, // fractional francs
          { ...good, orderId: 'ord-bool', supplierResolved: 'yes' },    // wrong type
          null,
        ],
      })),
    );
    const res = await resolveOperationsService()!.listPaidOrders('k');
    if (!res.ok) throw new Error(res.reason);
    expect(res.orders.map((r) => r.orderId)).toEqual(['ord-true']);
  });
});

describe('the founder’s key — his device only, and honest when storage is absent', () => {
  it('no localStorage in this runtime → read is null, store/clear do not throw', () => {
    expect(readStoredOpsKey()).toBeNull();
    expect(() => storeOpsKey('k')).not.toThrow();
    expect(() => clearStoredOpsKey()).not.toThrow();
  });

  it('with a browser store: round-trips, empty-string reads as null, clear removes', () => {
    const bag = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => bag.get(k) ?? null,
      setItem: (k: string, v: string) => void bag.set(k, v),
      removeItem: (k: string) => void bag.delete(k),
    });
    storeOpsKey('cle-b');
    expect(readStoredOpsKey()).toBe('cle-b');
    expect([...bag.keys()]).toEqual(['boutik.operateur.cle']); // one key, named in French, no secret leaks into another slot
    bag.set('boutik.operateur.cle', '');
    expect(readStoredOpsKey()).toBeNull();
    clearStoredOpsKey();
    expect(bag.size).toBe(0);
  });

  it('the #operateur door: absent window → false; the exact hash → true; any other → false', () => {
    expect(operateurHashPresent()).toBe(false);
    vi.stubGlobal('window', { location: { hash: '#operateur' } });
    expect(operateurHashPresent()).toBe(true);
    vi.stubGlobal('window', { location: { hash: '#produits' } });
    expect(operateurHashPresent()).toBe(false);
  });
});
