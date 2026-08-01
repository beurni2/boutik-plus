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
import {
  CHASE_AFTER_MIN,
  RELANCE_IDLE,
  ageMinutes,
  operationsView,
  relanceSettled,
  relanceStart,
} from '../src/operations/view';
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

describe('CONSOLE-2 — the relance clears the queue, and claims nothing about preparation', () => {
  it('a CALLED order leaves « À relancer » whatever its age — he is not told twice about one supplier', () => {
    const view = operationsView(
      {
        kind: 'ok',
        rows: [
          rowAt('ord-called', paidAgo(45), { relance: { at: paidAgo(2), count: 1 } }),
          rowAt('ord-uncalled', paidAgo(45)),
        ],
      },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.relancer.map((r) => r.orderId)).toEqual(['ord-uncalled']);
    expect(view.relances.map((r) => r.orderId)).toEqual(['ord-called']);
    expect(view.recentes).toHaveLength(0); // called ≠ « à l'instant »
  });

  it('a call on a FRESH order also moves it out of « à l’instant » — one place per order, never two', () => {
    const view = operationsView(
      { kind: 'ok', rows: [rowAt('ord-fresh-called', paidAgo(2), { relance: { at: paidAgo(1), count: 1 } })] },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.recentes).toHaveLength(0);
    expect(view.relancer).toHaveLength(0);
    expect(view.relances.map((r) => r.orderId)).toEqual(['ord-fresh-called']);
  });

  it('« Déjà appelés » is ordered by WHEN HE CALLED — and the fixture can tell that apart from BOTH age orderings', () => {
    // The first cut of this fixture had « most recently called » and « newest
    // order » coincide, so sorting by age DESCENDING passed it — the likelier
    // bug, since that line sits two lines above in the source. Now the call
    // order is the REVERSE of the age order in both directions: only a sort on
    // `relance.at` can produce the expected sequence.
    const view = operationsView(
      {
        kind: 'ok',
        rows: [
          // Call order is NON-MONOTONIC in age on purpose: with any monotonic
          // fixture one of the two age sorts still coincides with call order
          // (my first two attempts each did). Here neither can.
          rowAt('ord-age300-call45', paidAgo(300), { relance: { at: paidAgo(45), count: 1 } }),
          rowAt('ord-age120-call1', paidAgo(120), { relance: { at: paidAgo(1), count: 2 } }),
          rowAt('ord-age20-call90', paidAgo(20), { relance: { at: paidAgo(90), count: 3 } }),
        ],
      },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    const byCall = ['ord-age120-call1', 'ord-age300-call45', 'ord-age20-call90'];
    expect(view.relances.map((r) => r.orderId)).toEqual(byCall);
    // …and prove the fixture is discriminating: neither age ordering matches.
    const byAgeDesc = [...view.relances].sort((a, b) => b.ageMin - a.ageMin).map((r) => r.orderId);
    const byAgeAsc = [...view.relances].sort((a, b) => a.ageMin - b.ageMin).map((r) => r.orderId);
    expect(byAgeDesc).not.toEqual(byCall);
    expect(byAgeAsc).not.toEqual(byCall);
  });

  it('an ANOMALY that has been called is still an anomaly — a phone call resolves no supplier', () => {
    const view = operationsView(
      {
        kind: 'ok',
        rows: [rowAt('ord-ghost', paidAgo(30), { supplierId: '', supplierResolved: false, relance: { at: paidAgo(1), count: 1 } })],
      },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.anomalies.map((r) => r.orderId)).toEqual(['ord-ghost']);
  });

  it('NOTHING THE FOUNDER READS CLAIMS THE PRODUCT IS READY — every relance label is ABOUT THE CALL, and readiness is named as the SUPPLIER’s own future act', () => {
    // Asserted on the RENDERED strings, not on source characters: a code
    // comment that says « never prêt » is the right comment, and scanning raw
    // source for the word punishes it (the B+I-15 false-positive class).
    //
    // And asserted as a POSITIVE boundary, not a blacklist: a verifier showed
    // that « Colis annoncés par le fournisseur » — a readiness claim in plain
    // French, attributing the act to the supplier, exactly the confusion
    // B+I-06 exists to prevent — sailed past a « prêt »/« prépar » word ban.
    // Requiring « appel » in every relance label cannot be walked past: a
    // string that claims the supplier's act cannot also be about the call.
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    for (const k of ['operations.relance_action', 'operations.relances_titre', 'operations.relance_faite', 'operations.relance_faite_long', 'operations.relance_faite_maintenant', 'operations.relance_fois', 'operations.relance_rappeler']) {
      const s = (fr.get(k) ?? '').toLowerCase();
      expect(s, k).not.toBe('');
      expect(s, `${k} must speak of the CALL`).toMatch(/appel/);
      expect(s.includes('prêt') || s.includes('prépar'), `${k} must not claim readiness`).toBe(false);
    }
    // …and the one string that DOES mention « prêt » says the supplier will
    // confirm it himself — the honest boundary, in the founder's own screen.
    const sens = fr.get('operations.relance_sens') ?? '';
    expect(sens.toLowerCase()).toContain('prêt');
    expect(sens.toLowerCase()).toContain('fournisseur');
  });
});

describe('the relance INTERACTION — the decision the screen used to own, now asserted by value', () => {
  it('one write at a time: a tap while another card is writing is IGNORED (null = do not even call the port)', () => {
    expect(relanceStart(RELANCE_IDLE, 'ord-1')).toEqual({ busy: 'ord-1', echec: null });
    expect(relanceStart({ busy: 'ord-1', echec: null }, 'ord-2')).toBeNull();
  });

  it('starting a new call CLEARS a previous failure — the old red line must not haunt the new attempt', () => {
    expect(relanceStart({ busy: null, echec: 'ord-9' }, 'ord-9')).toEqual({ busy: 'ord-9', echec: null });
  });

  it('SUCCESS releases the lock and demands a RE-READ — what he sees must be the stored mark, never a hope', () => {
    expect(relanceSettled('ord-1', { ok: true })).toEqual({ ui: RELANCE_IDLE, then: 'refresh' });
  });

  it('a refused KEY escalates the whole board, and does not blame the phone call', () => {
    expect(relanceSettled('ord-1', { ok: false, reason: 'bad_key' })).toEqual({ ui: RELANCE_IDLE, then: 'bad_key' });
  });

  it('unreachable / unknown_order keep the failure ON THAT CARD, release the lock, and claim NOTHING', () => {
    for (const reason of ['unreachable', 'unknown_order'] as const) {
      expect(relanceSettled('ord-7', { ok: false, reason }), reason).toEqual({
        ui: { busy: null, echec: 'ord-7' },
        then: 'none',
      });
    }
  });

  it('a failure is keyed to ITS order — one card’s red line can never appear on another', () => {
    const s = relanceSettled('ord-a', { ok: false, reason: 'unreachable' });
    expect(s.ui.echec).toBe('ord-a');
    expect(s.ui.echec === 'ord-b').toBe(false);
  });

  it('[source-text check] the screen delegates: it calls the port and feeds BOTH decisions back, and its own re-read is FORCED', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');
    expect(source).toContain('service.recordRelance(opsKey, orderId)');
    expect(source).toContain('relanceStart(');
    expect(source).toContain('relanceSettled(');
    // the post-write re-read must bypass the in-flight guard, or a successful
    // call renders as if nothing happened (the verifier's M1)
    expect(source).toMatch(/then === 'refresh'\) await load\(true\)/);
  });
});

describe('the relance port — only the id crosses, and every refusal keeps its own name', () => {
  it('POSTs to /fulfillment/relance with the Bearer and a body of EXACTLY {orderId} — no client clock', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, relance: { at: 'x', count: 1 } })));
    const res = await resolveOperationsService()!.recordRelance('cle-b', 'ord-7');
    expect(res).toEqual({ ok: true });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://offer.example/fulfillment/relance');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-b');
    expect(JSON.parse(String(init?.body))).toEqual({ orderId: 'ord-7' });
  });

  it('401 → bad_key · 404 → unknown_order · 500 and a thrown fetch → unreachable', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const port = resolveOperationsService()!;
    for (const [reply, expected] of [
      [async () => new Response('no', { status: 401 }), 'bad_key'],
      [async () => new Response('no', { status: 404 }), 'unknown_order'],
      [async () => new Response('no', { status: 500 }), 'unreachable'],
      [() => Promise.reject(new Error('down')), 'unreachable'],
    ] as const) {
      stubFetch(reply as () => Promise<Response>);
      expect(await port.recordRelance('k', 'ord-1'), expected).toEqual({ ok: false, reason: expected });
    }
  });

  it('a MALFORMED relance mark on a row is dropped — « vous avez appelé » is never shown on a guess', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const base = rowAt('ord-1', '2026-08-01T11:00:00.000Z');
    for (const bad of [{ count: 1 }, { at: '', count: 1 }, { at: 'x' }, { at: 'x', count: 0 }, { at: 'x', count: 1.5 }, 'nope', null,
      // an UNPARSEABLE instant: `ageMinutes` reads it as 0, which would render
      // « Appelé à l'instant » about a call whose time is unknown.
      { at: 'pas-une-date', count: 1 }]) {
      stubFetch(async () => new Response(JSON.stringify({ ok: true, orders: [{ ...base, relance: bad }] })));
      const res = await resolveOperationsService()!.listPaidOrders('k');
      if (!res.ok) throw new Error(res.reason);
      expect(res.orders[0]!.relance, JSON.stringify(bad)).toBeUndefined();
      expect(res.orders[0]!.orderId).toBe('ord-1'); // the ORDER survives; only the mark is dropped
    }
    // …and a true mark is carried through verbatim
    stubFetch(async () => new Response(JSON.stringify({ ok: true, orders: [{ ...base, relance: { at: '2026-08-01T11:30:00.000Z', count: 2 } }] })));
    const good = await resolveOperationsService()!.listPaidOrders('k');
    if (!good.ok) throw new Error(good.reason);
    expect(good.orders[0]!.relance).toEqual({ at: '2026-08-01T11:30:00.000Z', count: 2 });
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
    // A row registered BEFORE the productName enrichment: no productName, no
    // offerVersion. It must SURVIVE with '' — the screen then falls back to
    // the pv id instead of rendering a blank title.
    const { productName: _pn, offerVersion: _ov, ...legacy } = rowAt('ord-legacy', '2026-08-01T10:00:00.000Z');
    stubFetch(async () =>
      new Response(JSON.stringify({
        ok: true,
        orders: [
          good,
          legacy,
          { orderId: '' },                                  // empty id
          { ...good, orderId: 'ord-franc', sellerBasePrice: 10_000.5 }, // fractional francs
          { ...good, orderId: 'ord-bool', supplierResolved: 'yes' },    // wrong type
          null,
        ],
      })),
    );
    const res = await resolveOperationsService()!.listPaidOrders('k');
    if (!res.ok) throw new Error(res.reason);
    expect(res.orders.map((r) => r.orderId)).toEqual(['ord-true', 'ord-legacy']);
    expect(res.orders[1]!.productName).toBe(''); // normalized, never undefined
    expect(res.orders[1]!.offerVersion).toBe('');
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
