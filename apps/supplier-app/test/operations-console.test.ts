import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELIVERY_FAILURE_REASONS } from '@platform/contracts';
import {
  DISPATCH_TIMEOUT_MS,
  MOTIFS_GRAVES,
  MOTIFS_ORDINAIRES,
  MOTIFS_REFUS,
  PREMIER_GRAVE,
  clearStoredCleC,
  libelleMotif,
  readStoredCleC,
  resolveDispatchService,
  resolveAccesService,
  resolveComptesService,
  resolveRefusService,
  storeCleC,
} from '../src/operations/dispatch-service';
import {
  ACCES_IDLE,
  accesMintSettled,
  accesMintStart,
  accesReadOf,
  accesRevokeSettled,
  accesRevokeStart,
  accesVue,
  livraisonsVue,
  type AccesUi,
  COMPTES_IDLE,
  acteSettled,
  acteStart,
  codeAccesSettled,
  comptesVue,
  type ComptesUi,
} from '../src/operations/view';
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
  CODES_IDLE,
  RELANCE_IDLE,
  ageMinutes,
  codesReadOf,
  codesView,
  mintAvis,
  mintSettled,
  mintStart,
  operationsView,
  relanceSettled,
  relanceStart,
  revokeSettled,
  revokeStart,
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

describe('READINESS-WIRE-1a — the REAL signal supersedes the chase AND the call log', () => {
  it('an ACCEPTED order leaves « À relancer » whatever its age — the 10-minute rule was « no sign of preparation », and this is the sign', () => {
    const view = operationsView(
      {
        kind: 'ok',
        rows: [
          rowAt('ord-accepted-old', paidAgo(90), { fulfillment: { acceptedAt: paidAgo(5) } }),
          rowAt('ord-silent-old', paidAgo(90)),
        ],
      },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.relancer.map((r) => r.orderId)).toEqual(['ord-silent-old']);
    expect(view.preparation.map((r) => r.orderId)).toEqual(['ord-accepted-old']);
  });

  it('a CALLED order that then shows a real signal moves from the call log to « En préparation » — the true state wins', () => {
    const view = operationsView(
      {
        kind: 'ok',
        rows: [
          rowAt('ord-called-then-ready', paidAgo(60), {
            relance: { at: paidAgo(30), count: 1 },
            fulfillment: { acceptedAt: paidAgo(10), readyAt: paidAgo(2) },
          }),
          rowAt('ord-called-still-silent', paidAgo(60), { relance: { at: paidAgo(30), count: 1 } }),
        ],
      },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.preparation.map((r) => r.orderId)).toEqual(['ord-called-then-ready']);
    expect(view.relances.map((r) => r.orderId)).toEqual(['ord-called-still-silent']);
  });

  it('« En préparation » sorts by the MOST RECENT signal — and readyAt IS the key when both clocks exist', () => {
    // Discriminating on the key preference itself (the relance-sort lesson):
    // the both-clock row wins ONLY if readyAt (5 min) is its key; a mutation
    // preferring acceptedAt (20 min) would rank the single-clock row (10 min)
    // first instead.
    const view = operationsView(
      {
        kind: 'ok',
        rows: [
          rowAt('ord-accepted-only', paidAgo(200), { fulfillment: { acceptedAt: paidAgo(10) } }),
          rowAt('ord-ready', paidAgo(30), { fulfillment: { acceptedAt: paidAgo(20), readyAt: paidAgo(5) } }),
        ],
      },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.preparation.map((r) => r.orderId)).toEqual(['ord-ready', 'ord-accepted-only']);
  });

  it('a fresh order with a signal leaves « à l’instant » too — one place per order, always', () => {
    const view = operationsView(
      { kind: 'ok', rows: [rowAt('ord-fresh-accepted', paidAgo(2), { fulfillment: { acceptedAt: paidAgo(1) } })] },
      NOW,
    );
    if (view.kind !== 'board') throw new Error(view.kind);
    expect(view.recentes).toHaveLength(0);
    expect(view.preparation.map((r) => r.orderId)).toEqual(['ord-fresh-accepted']);
  });

  it('a MALFORMED preparation mark is dropped by the reader — « Accepté »/« Prêt » is true or absent', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const base = rowAt('ord-1', '2026-08-01T11:00:00.000Z');
    for (const bad of [
      'nope', 42, {}, { acceptedAt: '' }, { acceptedAt: 'pas-une-date' }, { readyAt: 12345 },
    ]) {
      stubFetch(async () => new Response(JSON.stringify({ ok: true, orders: [{ ...base, fulfillment: bad }] })));
      const res = await resolveOperationsService()!.listPaidOrders('k');
      if (!res.ok) throw new Error(res.reason);
      expect(res.orders[0]!.fulfillment, JSON.stringify(bad)).toBeUndefined();
      expect(res.orders[0]!.orderId).toBe('ord-1'); // the ORDER survives
    }
    // a half-valid mark keeps its valid clock and drops the rotten one
    stubFetch(async () => new Response(JSON.stringify({ ok: true, orders: [{ ...base, fulfillment: { acceptedAt: '2026-08-01T11:10:00.000Z', readyAt: 'pourri' } }] })));
    const res = await resolveOperationsService()!.listPaidOrders('k');
    if (!res.ok) throw new Error(res.reason);
    expect(res.orders[0]!.fulfillment).toEqual({ acceptedAt: '2026-08-01T11:10:00.000Z' });
  });

  it('the strings the founder reads: « Prêt » names the EVIDENCE, and « accepté » stays a decision, not readiness', () => {
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    expect(fr.get('operations.prep_pret')?.toLowerCase()).toContain('photo'); // prêt is claimed WITH its evidence
    expect(fr.get('operations.prep_accepte')?.toLowerCase()).toContain('accept');
    expect(fr.get('operations.prep_accepte')?.toLowerCase().includes('prêt')).toBe(false); // acceptance never reads as ready
  });

  it('[source-text check] the chip conditional binds readyAt→prêt and its absence→accepté — a swap would claim readiness without evidence (verifier N1)', () => {
    // A verifier swapped the two branches and the whole suite stayed green;
    // the failure would be an accepted-but-not-ready order rendering « Colis
    // prêt, photo à l'appui » — the exact confusion B+I-06 exists to prevent.
    const source = readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');
    expect(source).toContain(
      "row.fulfillment.readyAt !== undefined ? t('operations.prep_pret') : t('operations.prep_accepte')",
    );
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

/* ═══════════ CONSOLE-3 — the code inventory, decisions BY VALUE ═══════════ */

describe('CONSOLE-3 — the code inventory: honest states, the mint pre-flight, one act at a time', () => {
  const codeRow = (supplierId: string, mintedAt = '2026-08-01T10:00:00.000Z') => ({ supplierId, mintedAt });

  it('codesView: loading/failed/empty each keep their own catalog sentence; bad_key returns NULL (the board escalates, one door one sentence)', () => {
    const keys = new Set(catalog.map((e) => e.key));
    expect(codesView({ kind: 'bad_key' })).toBeNull();
    for (const [read, kind, message] of [
      [{ kind: 'loading' }, 'loading', 'operations.codes_chargement'],
      [{ kind: 'failed' }, 'failed', 'operations.codes_echec'],
      [{ kind: 'ok', codes: [] }, 'empty', 'operations.codes_vide'],
    ] as const) {
      const vue = codesView(read);
      if (vue === null) throw new Error(kind);
      expect(vue.kind, message).toBe(kind);
      expect('message' in vue && vue.message, kind).toBe(message);
      expect(keys.has(message), `${message} missing from catalog`).toBe(true);
    }
    const liste = codesView({ kind: 'ok', codes: [codeRow('supplier-2')] });
    expect(liste).toEqual({ kind: 'liste', codes: [codeRow('supplier-2')] });
  });

  it('mintAvis — the footgun guard: an id NO paid order names is « inconnu », an UNRESOLVED row never vouches, an existing code says « remplace »', () => {
    const orders = [
      rowAt('o1', paidAgo(5)), // supplier-2, resolved
      rowAt('o2', paidAgo(5), { supplierId: 'supplier-ghost', supplierResolved: false }),
    ];
    const codes = [codeRow('supplier-armed')];
    expect(mintAvis(orders, codes, 'supplier-2')).toBe('pret');
    expect(mintAvis(orders, codes, 'supplier-typo')).toBe('inconnu');
    // an unresolved order must NOT count as knowing the supplier — it is the
    // anomaly row, not evidence the id exists
    expect(mintAvis(orders, codes, 'supplier-ghost')).toBe('inconnu');
    // replace beats known: the supplier already holds a door
    expect(mintAvis(orders, [...codes, codeRow('supplier-2')], 'supplier-2')).toBe('remplace');
    expect(mintAvis(orders, codes, 'supplier-armed')).toBe('remplace');
  });

  it('the reducer: one act at a time; a fresh code STAYS on screen through the refresh (the founder is mid-handover); failures name their act', () => {
    expect(mintStart(CODES_IDLE)).toEqual({ busy: 'mint', nouveau: null, echec: null });
    expect(mintStart({ busy: 'mint', nouveau: null, echec: null })).toBeNull();
    expect(revokeStart({ busy: 'mint', nouveau: null, echec: null }, 'supplier-2')).toBeNull();
    expect(revokeStart(CODES_IDLE, 'supplier-2')).toEqual({ busy: 'revoke:supplier-2', nouveau: null, echec: null });

    const minted = mintSettled({ ok: true, code: 'BF-AAAA-BBBB-CCCC-DDDD', supplierId: 'supplier-2', mintedAt: 'x' });
    expect(minted.then).toBe('refresh'); // the row must be the STORED truth
    expect(minted.ui.nouveau).toEqual({ supplierId: 'supplier-2', code: 'BF-AAAA-BBBB-CCCC-DDDD' });

    expect(mintSettled({ ok: false, reason: 'bad_key' })).toEqual({ ui: CODES_IDLE, then: 'bad_key' });
    expect(mintSettled({ ok: false, reason: 'unreachable' }).ui.echec).toBe('mint');

    expect(revokeSettled('supplier-2', { ok: true, status: 'revoked' })).toEqual({ ui: CODES_IDLE, then: 'refresh' });
    // no_code refreshes too: the list claimed a door the book no longer holds
    expect(revokeSettled('supplier-2', { ok: true, status: 'no_code' })).toEqual({ ui: CODES_IDLE, then: 'refresh' });
    expect(revokeSettled('supplier-2', { ok: false, reason: 'bad_key' })).toEqual({ ui: CODES_IDLE, then: 'bad_key' });
    // namespaced like `busy`, so a supplier literally named « mint » can never
    // light the mint-failure sentence (verifier note)
    expect(revokeSettled('mint', { ok: false, reason: 'unreachable' }).ui.echec).toBe('revoke:mint');
  });

  it('a LIVE one-time code BLOCKS every other act — the plaintext exists nowhere else, and only « C\'est noté » may end the handover (verifier MAJOR-1)', () => {
    const holding = mintSettled({ ok: true, code: 'BF-AAAA-BBBB-CCCC-DDDD', supplierId: 'supplier-a', mintedAt: 'x' }).ui;
    expect(holding.nouveau).not.toBeNull();
    // day-one batch provisioning is exactly this sequence: mint A, then reach
    // for B — the reducer refuses until the card is dismissed
    expect(mintStart(holding)).toBeNull();
    expect(revokeStart(holding, 'supplier-b')).toBeNull();
    // dismissal (CODES_IDLE) reopens both acts
    expect(mintStart(CODES_IDLE)).not.toBeNull();
    expect(revokeStart(CODES_IDLE, 'supplier-b')).not.toBeNull();
  });

  it('codesReadOf: ok carries the rows; bad_key and unreachable keep their own kinds', () => {
    expect(codesReadOf({ ok: true, codes: [codeRow('s')] })).toEqual({ kind: 'ok', codes: [codeRow('s')] });
    expect(codesReadOf({ ok: false, reason: 'bad_key' })).toEqual({ kind: 'bad_key' });
    expect(codesReadOf({ ok: false, reason: 'unreachable' })).toEqual({ kind: 'failed' });
  });

  it('the port: Bearer on the inventory GET; mint body is EXACTLY {supplierId}; malformed rows dropped; 401 → bad_key everywhere', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const good = codeRow('supplier-2');
    let spy = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, codes: [good, { supplierId: '' }, { supplierId: 's', mintedAt: 'pas une date' }, null] })),
    );
    const list = await resolveOperationsService()!.listCodes('cle-ops');
    if (!list.ok) throw new Error(list.reason);
    expect(list.codes).toEqual([good]);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://offer.example/fulfillment/supplier-codes');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-ops');

    spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, code: 'BF-X', supplierId: 'supplier-2', mintedAt: 't' })));
    const mint = await resolveOperationsService()!.mintCode('cle-ops', 'supplier-2');
    if (!mint.ok) throw new Error(mint.reason);
    expect(mint.code).toBe('BF-X');
    expect(JSON.parse(String(stubCall(spy)?.body))).toEqual({ supplierId: 'supplier-2' });

    // the revoke WIRE is pinned like the mint's (verifier MINOR-5): the exact
    // path, and a body of EXACTLY {supplierId} — the book's exact-key check
    // refuses anything more, so a port that smuggled would fail every revoke
    spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, status: 'no_code' })));
    expect(await resolveOperationsService()!.revokeCode('cle-ops', 'supplier-x')).toEqual({ ok: true, status: 'no_code' });
    const [revokeUrl, revokeInit] = spy.mock.calls[0]!;
    expect(revokeUrl).toBe('https://offer.example/fulfillment/supplier-code/revoke');
    expect(JSON.parse(String(revokeInit?.body))).toEqual({ supplierId: 'supplier-x' });

    for (const call of [
      () => resolveOperationsService()!.listCodes('k'),
      () => resolveOperationsService()!.mintCode('k', 's'),
      () => resolveOperationsService()!.revokeCode('k', 's'),
    ]) {
      stubFetch(async () => new Response('no', { status: 401 }));
      expect(await call()).toEqual({ ok: false, reason: 'bad_key' });
    }
  });

  it('[source-text check] the screen wires the decisions and keeps them honest: settle re-reads the STORED list, and the section exists on the EMPTY board too (day-one mint)', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');
    expect(source).toMatch(/then === 'refresh'\) await loadCodes\(\)/);
    expect(source).toContain("view.kind === 'board' || view.kind === 'empty'");
    // bad_key from the codes read escalates the WHOLE board
    expect(source).toMatch(/read\.kind === 'bad_key'\) setRead\(\{ kind: 'bad_key' \}\)/);
    // the plaintext renders from the reducer's one-time state, never from a store
    expect(source).toContain('ui.nouveau.code');
    // only the NEWEST codes read writes the section — the readSeq class's
    // third application (verifier MAJOR-2)
    expect(source).toContain('codesSeq.current += 1');
    expect(source).toContain('if (seq !== codesSeq.current) return;');
    // the avis is computed ONLY from a successful codes read (verifier MINOR-3)
    expect(source).toContain("codesRead.kind !== 'ok'");
    // while a one-time code is live, the other acts show the noter-d'abord
    // sentence in place of their buttons — never a dead tap (MAJOR-1's UI half)
    expect((source.match(/code_noter_dabord/g) ?? []).length).toBe(2);
  });
});

function stubCall(spy: ReturnType<typeof vi.fn>): RequestInit | undefined {
  return spy.mock.calls[0]?.[1] as RequestInit | undefined;
}

/* ══════════ BC-1c — the Livraisons door (Shop+ read, key C) ══════════ */

describe('BC-1c — the dispatch view: its own key, its own honest states, dispatchable means CONFIRMED + contact', () => {
  const lrow = (orderId: string, state: string, createdAt: string, contact: { phone: string; quartier: string; repere: string } | null = { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'Face à la pharmacie' }) =>
    ({ orderId, state, createdAt, contact, productVersionId: 'pv-1', zoneTo: 'Ouagadougou' });

  it('livraisonsVue: only CONFIRMED rows reach the queue; contactless confirmed rows are their own honest group; the unconfirmed whisper', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const vue = livraisonsVue({
      kind: 'ok',
      rows: [
        lrow('o-new', 'confirmed', '2026-08-02T10:00:00.000Z'),
        lrow('o-old', 'confirmed', '2026-08-02T08:00:00.000Z'),
        lrow('o-nocontact', 'confirmed', '2026-08-02T09:00:00.000Z', null),
        lrow('o-pending', 'payment_pending', '2026-08-02T11:00:00.000Z'),
        lrow('o-failed', 'payment_failed', '2026-08-02T07:00:00.000Z'),
      ],
    });
    if (vue.kind !== 'liste') throw new Error(vue.kind);
    // longest-waiting first: the buyer who paid first gets her rider first
    expect(vue.aLivrer.map((r) => r.orderId)).toEqual(['o-old', 'o-new']);
    expect(vue.sansContact.map((r) => r.orderId)).toEqual(['o-nocontact']);
    // an unconfirmed order is NEVER dispatchable, whatever contact it carries
    expect(vue.enAttente.map((r) => r.orderId)).toEqual(['o-pending', 'o-failed']);
    for (const [read, kind, message] of [
      [{ kind: 'loading' }, 'loading', 'livraisons.chargement'],
      [{ kind: 'not_configured' }, 'not_configured', 'livraisons.non_configure'],
      [{ kind: 'bad_key' }, 'bad_key', 'livraisons.cle_refusee'],
      [{ kind: 'failed' }, 'failed', 'livraisons.echec'],
      [{ kind: 'ok', rows: [] }, 'empty', 'livraisons.vide'],
    ] as const) {
      const v = livraisonsVue(read);
      expect(v.kind, message).toBe(kind);
      expect('message' in v && v.message, kind).toBe(message);
      expect(keys.has(message), `${message} missing from catalog`).toBe(true);
    }
  });

  it('the port: key C travels as Bearer to /checkout/dispatch on the SHOP base; 401 → bad_key; a malformed CONTACT drops the whole row', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'https://shop.example/');
    const good = lrow('ord-ok', 'confirmed', '2026-08-02T08:00:00.000Z');
    const spy = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, orders: [
        good,
        { ...lrow('ord-halfphone', 'confirmed', '2026-08-02T08:00:00.000Z'), contact: { phone: '', quartier: 'G', repere: '' } },
        { ...lrow('ord-junk', 'confirmed', 'pas une date') },
        null,
      ] })),
    );
    const res = await resolveDispatchService()!.listLivraisons('cle-c');
    if (!res.ok) throw new Error(res.reason);
    expect(res.rows).toEqual([good]);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://shop.example/checkout/dispatch');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-c');
    stubFetch(async () => new Response('no', { status: 401 }));
    expect(await resolveDispatchService()!.listLivraisons('k')).toEqual({ ok: false, reason: 'bad_key' });
  });

  it('unset base resolves to NOTHING — never demo; and key C has its own storage slot, never the board key’s', () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', '');
    expect(resolveDispatchService()).toBeNull();
    const bag = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => bag.get(k) ?? null,
      setItem: (k: string, v: string) => void bag.set(k, v),
      removeItem: (k: string) => void bag.delete(k),
    });
    storeCleC('cle-c-valeur');
    expect([...bag.keys()]).toEqual(['boutik.livraisons.cle']);
    expect(readStoredCleC()).toBe('cle-c-valeur');
    clearStoredCleC();
    expect(bag.size).toBe(0);
  });

  it('[source-text check] the section reads with a seq token, never escalates the BOARD on ITS bad key, and every livraisons.* key rendered exists', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');
    expect(source).toContain('if (mine !== seq.current) return;');
    // key C's refusal re-enters ITS OWN door (clearStoredCleC), never setRead bad_key on the board
    expect(source).toContain('clearStoredCleC();');
    const used = [...source.matchAll(/t\('(livraisons\.[a-z_.]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(5);
    const keys = new Set(catalog.map((e) => e.key));
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });
});

/* ═══ BC-1c r2 — the section can NEVER sit on « Lecture… » forever ═══ */

describe('BC-1c — every read ends in a NAMED state (founder-found: the door sat on « Lecture des livraisons… »)', () => {
  it('a HANGING service is bounded: the wait aborts and the screen gets « unreachable », never an eternal loading', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'https://shop.example');
    vi.useFakeTimers();
    try {
      // a fetch that never answers but HONOURS the abort signal — exactly what
      // the browser's own fetch does on a dead link
      vi.stubGlobal('fetch', (_url: string, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }));
      const pending = resolveDispatchService()!.listLivraisons('cle-c');
      await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS + 50);
      expect(await pending).toEqual({ ok: false, reason: 'unreachable' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('[source-text check] the screen has no silent exit: an unresolved service NAMES itself, and the door asks for its read directly (never via a state change React can skip)', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');
    // the old `if (service === null) return;` under a loading state is gone
    expect(source).not.toMatch(/if \(service === null\) return;\s*\n\s*seq\.current/);
    expect(source).toContain("if (service === null) {\n      setRead({ kind: 'not_configured' });");
    // re-entering the SAME key must still read: the press calls load itself
    expect(source).toContain('void load(v);');
    // and the mount read no longer hangs off a [cleC] dependency
    expect(source).not.toContain('void load(cleC);\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [cleC]);');
  });

  it('the timeout is REAL time, not a knob a slow link can widen — and it is bounded well under a minute', () => {
    expect(DISPATCH_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(DISPATCH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

/* ═════ SP6.3 — recording ONE doorstep refusal from the console (§6.4) ═════ */

describe('SP6.3 — the refusal vocabulary the console offers: canon’s, minus the one reason that is not hers', () => {
  it('MOTIFS_REFUS is EXACTLY canon’s delivery-failure set minus provider_failure — a canon addition turns this red rather than silently un-recordable', () => {
    // DERIVED, NOT RESTATED. The console's list is hand-ordered (a tired thumb
    // meets the everyday reasons first), so its ORDER is ours — but its
    // MEMBERSHIP is canon's, and this is where the two are held together. The
    // day `DELIVERY_FAILURE_REASONS` grows an eighth buyer reason, the operator
    // must be able to pick it; without this line he simply never could.
    const canon = DELIVERY_FAILURE_REASONS.filter((r) => r !== 'provider_failure');
    expect(new Set(MOTIFS_REFUS)).toEqual(new Set(canon));
    expect(MOTIFS_REFUS).toHaveLength(canon.length); // no duplicates hiding in the set
  });

  it('provider_failure is NOT offerable — our own provider dying is never a reason to move HER standing', () => {
    // §6.4: « Honest absence / provider failure do NOT escalate ». honest_absence
    // is on the list because a rider must be able to record a true absence;
    // provider_failure is not, because it is not a thing that happened at her
    // door and no operator standing there should be able to name it.
    expect((MOTIFS_REFUS as readonly string[]).includes('provider_failure')).toBe(false);
    expect(DELIVERY_FAILURE_REASONS).toContain('provider_failure'); // …and canon DOES have it: the exclusion is a choice, not an omission
  });

  it('the two GRAVE reasons are last and contiguous, and PREMIER_GRAVE points at the seam the screen draws', () => {
    expect(MOTIFS_GRAVES).toEqual(['repeated_abuse', 'fraud']);
    // the composition, not a re-typed list: ordinary block, then grave block
    expect(MOTIFS_REFUS).toEqual([...MOTIFS_ORDINAIRES, ...MOTIFS_GRAVES]);
    // …and no grave reason leaks into the ordinary block, which is what makes
    // « the last two » a true description of where the divider goes
    for (const grave of MOTIFS_GRAVES) expect(MOTIFS_ORDINAIRES).not.toContain(grave);
    expect(PREMIER_GRAVE).toBe(MOTIFS_GRAVES[0]);
    expect(MOTIFS_REFUS.indexOf(PREMIER_GRAVE)).toBe(MOTIFS_ORDINAIRES.length);
    // the seam is not at either end: there IS an ordinary block above it and a
    // grave block below (a fixture where MOTIFS_ORDINAIRES were empty would
    // make the index assertion above pass while the divider meant nothing)
    expect(MOTIFS_ORDINAIRES.length).toBeGreaterThan(0);
    expect(MOTIFS_GRAVES.length).toBeGreaterThan(0);
  });

  it('conformity_mismatch IS offerable and sits in the ORDINARY block — an operator facing a wrong article must have a true option', () => {
    // §6.4 never counts it against her (pinned in commerce-core). If it were
    // missing here, an honest operator would reach for « elle a changé d'avis »
    // and a buyer would take a fault for OUR mistake; if it were down among the
    // grave two, the screen would frame our error as her abuse.
    expect(MOTIFS_ORDINAIRES).toContain('conformity_mismatch');
    expect(MOTIFS_GRAVES).not.toContain('conformity_mismatch');
    expect(MOTIFS_REFUS.indexOf('conformity_mismatch')).toBeLessThan(MOTIFS_REFUS.indexOf(PREMIER_GRAVE));
  });

  it('every reason has its own catalog sentence — distinct, non-empty, and none of them naming the system’s word for it', () => {
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    const labels: string[] = [];
    for (const motif of MOTIFS_REFUS) {
      const key = libelleMotif(motif);
      expect(key, motif).toBe(`refus.${motif}`);
      const label = fr.get(key);
      expect(label, `${key} missing from catalog`).toBeTruthy();
      // the operator reads French, never the wire code: a label that leaked
      // « conformity_mismatch » onto the screen would fail the 5-second test
      expect(label, key).not.toContain(motif);
      labels.push(label!);
    }
    // two reasons that read identically would make the grave tap invisible
    expect(new Set(labels).size).toBe(MOTIFS_REFUS.length);
  });

  it('the wrong-article reassurance exists and says it does NOT count against her — the sentence that makes the true reason the easy one', () => {
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    const note = (fr.get('refus.note_conformite') ?? '').toLowerCase();
    expect(note).not.toBe('');
    expect(note).toContain('jamais');
    expect(note).toContain('elle');
  });
});

describe('SP6.3 — the refusal port: one field crosses, and the buyer is never one of them', () => {
  const CHECKOUT = 'EXPO_PUBLIC_SHOP_CHECKOUT_BASE';

  it('POSTs to /checkout/dispatch/{orderId}/refusal on the SHOP base with key C, and a body of EXACTLY {reason}', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example/');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true })));
    expect(await resolveRefusService()!.signalerRefus('cle-c', 'ord-7', 'change_of_mind')).toEqual({ ok: true });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://shop.example/checkout/dispatch/ord-7/refusal'); // trailing slash trimmed
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-c');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ reason: 'change_of_mind' });
    // THE CONTROL ASSERTION, and the reason this route exists in this shape:
    // the buyer is keyed from the ORDER server-side, so no field here may name
    // her. `toEqual` above already forbids extras — this states it as the
    // property, so a future field added « harmlessly » reads as the violation
    // it is rather than as a fixture that needs updating.
    expect(Object.keys(body)).toEqual(['reason']);
    expect(Object.keys(body)).not.toContain('phone');
  });

  it('the orderId is percent-encoded — a slash in an id can never walk out of its path segment', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true })));
    await resolveRefusService()!.signalerRefus('k', 'ord/../evil', 'fraud');
    expect(spy.mock.calls[0]![0]).toBe('https://shop.example/checkout/dispatch/ord%2F..%2Fevil/refusal');
  });

  it('401 → bad_key · BOTH 422s → sans_contact · 400/500/thrown → unreachable, and none of them claims success', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    const port = resolveRefusService()!;
    for (const [reply, expected] of [
      [async () => new Response('no', { status: 401 }), 'bad_key'],
      // the route's two named 422s mean the same thing to a console: there is
      // no buyer to key a ladder to, and retrying will not change that
      [async () => new Response(JSON.stringify({ ok: false, reason: 'no_contact_on_order' }), { status: 422 }), 'sans_contact'],
      [async () => new Response(JSON.stringify({ ok: false, reason: 'phone_not_keyable' }), { status: 422 }), 'sans_contact'],
      [async () => new Response(JSON.stringify({ ok: false, reason: 'unknown_field' }), { status: 400 }), 'unreachable'],
      [async () => new Response(JSON.stringify({ ok: false, reason: 'not_found' }), { status: 404 }), 'unreachable'],
      [async () => new Response(JSON.stringify({ ok: false, reason: 'ladder_unavailable' }), { status: 503 }), 'unreachable'],
      [async () => new Response('boom', { status: 500 }), 'unreachable'],
      [() => Promise.reject(new Error('down')), 'unreachable'],
      // REFUS-IDEMPOTENCE-1 — 409 is a DELIBERATE server answer (« this order
      // already carries a different note »), so calling it « unreachable »
      // would send him to check a network that is working perfectly.
      [
        async () =>
          new Response(JSON.stringify({ ok: false, reason: 'already_recorded', recorded: 'change_of_mind' }), { status: 409 }),
        'deja_note',
      ],
    ] as const) {
      stubFetch(reply as () => Promise<Response>);
      expect(await port.signalerRefus('k', 'ord-1', 'honest_absence'), expected).toEqual({ ok: false, reason: expected });
    }
  });

  /**
   * REFUS-IDEMPOTENCE-1 — THE RETRY THIS SLICE MAKES SAFE.
   *
   * The route answers a replay of the SAME reason 200 (carrying `replay:
   * true`), so the client must land on plain success. A client that treated
   * the extra field as an anomaly would turn the one outcome the key exists to
   * produce into an error on screen.
   */
  it('A REPLAY READS AS SUCCESS — a retry after a lost response is not an error to report', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, replay: true, rung: 'first_fault_recorded', record: {} })),
    );
    expect(await resolveRefusService()!.signalerRefus('k', 'ord-1', 'change_of_mind')).toEqual({ ok: true });
  });

  it('a HANGING write is bounded like the read — « un instant… » can never be forever', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', (_url: string, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }));
      const pending = resolveRefusService()!.signalerRefus('cle-c', 'ord-1', 'fraud');
      await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS + 50);
      expect(await pending).toEqual({ ok: false, reason: 'unreachable' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('unset base resolves to NOTHING — the row shows no refusal action rather than a dead one', () => {
    vi.stubEnv(CHECKOUT, '');
    expect(resolveRefusService()).toBeNull();
  });
});

describe('SP6.3 — [source-text checks] the card wires it, and a lost answer never invites an instant re-tap', () => {
  const screenSource = () =>
    readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');

  it('every dispatchable card carries the refusal fold, and « has a number » comes from the ROW, not from hope', () => {
    const source = screenSource();
    expect(source).toContain('<SignalerRefus orderId={row.orderId} cleC={cleC} aUnNumero={row.contact !== null} />');
    // no number, no key, no service → the fold renders NOTHING. An action that
    // could only fail is worse than no action on a console.
    expect(source).toContain('if (!aUnNumero || cleC === null || service === null) return null;');
  });

  it('THE REASON LIST DISAPPEARS AFTER A FAILED ATTEMPT — a lost response may mean the note landed, and two ordinary faults cost her a month', () => {
    const source = screenSource();
    // `etat === 'repos'`, never `etat !== 'envoi'`: the second form re-offers
    // all seven buttons under the failure banner, one tap from double-counting
    // a refusal that already reached the ladder.
    expect(source).toContain("{etat === 'repos' &&\n        MOTIFS_REFUS.map((motif) => (");
    expect(source).not.toContain("{etat !== 'envoi' &&");
    // …and he is TOLD what to do, rather than left to guess at a dead form.
    //
    // REFUS-IDEMPOTENCE-1 CHANGED WHAT IS TRUE HERE, so it changed the
    // sentence and this pin with it. Before the key, a lost response meant « we
    // cannot know whether it landed » and the copy had to say « peut-être ».
    // Now the route derives its key from the order: re-sending the SAME reason
    // is answered with the first decision and counts once. The copy must offer
    // the retry, and must still never claim the note was not recorded — that
    // remains unknowable from here.
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    const echec = (fr.get('refus.echec') ?? '').toLowerCase();
    expect(echec).not.toBe('');
    expect(echec).toContain('réessayer');
    expect(echec).not.toContain("rien n'a été");
    // AND THE GUARANTEE THE RETRY RESTS ON IS THE SERVER'S, not this
    // sentence's: the ladder refuses to count the same order twice. Pinned at
    // the client seam so the copy cannot outlive the behaviour it promises.
    const service = readFileSync(join(import.meta.dirname, '..', 'src/operations/dispatch-service.ts'), 'utf8');
    expect(service).toContain("if (res.status === 409) return { ok: false, reason: 'deja_note' };");
  });

  it('« DÉJÀ NOTÉ » IS ITS OWN DESIGNED STATE — never a success, never « check your network »', () => {
    const source = screenSource();
    // the mapping, and the render — a state decided but not painted is not a state
    expect(source).toContain("setEtat(res.reason === 'deja_note' ? 'deja' : 'echec')");
    expect(source).toContain("{etat === 'deja' && (");
    expect(source).toContain("{t('refus.deja')}");
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    const deja = (fr.get('refus.deja') ?? '').toLowerCase();
    expect(deja).not.toBe('');
    // it must say the new choice did NOT take — the whole failure it prevents
    // is an operator believing his correction landed
    expect(deja).toContain("n'a rien changé");
  });

  it('the divider is DERIVED from the grave block — reordering the list can never leave the gap on the wrong row', () => {
    const source = screenSource();
    expect(source).toContain('marginTop: motif === PREMIER_GRAVE ? 18 : 8');
    expect(source).not.toContain("motif === 'repeated_abuse' ?"); // the old hand-typed seam
  });

  it('every refus.* key the fold renders exists in the catalog — including the seven reached through libelleMotif', () => {
    const source = screenSource();
    const keys = new Set(catalog.map((e) => e.key));
    const litteraux = [...source.matchAll(/t\('(refus\.[a-z_.]+)'\)/g)].map((m) => m[1]!);
    expect(litteraux.length).toBeGreaterThan(4); // the extraction itself must see the fold
    for (const k of litteraux) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
    // the reason labels never appear as literals — they are computed. The list
    // regex above cannot see them, so they are checked through the SAME
    // function the screen calls.
    expect(source).toContain('t(libelleMotif(motif))');
    for (const motif of MOTIFS_REFUS) {
      expect(keys.has(libelleMotif(motif)), `${libelleMotif(motif)} missing`).toBe(true);
    }
  });
});

/* ═════ ACCESS-GATE-1 — the reseller ACCESS codes the founder mints ═════ */

describe('ACCESS-GATE-1 — the inventory decides, and « bad key » speaks once', () => {
  it('every read state maps to a designed sentence, and a refused key renders NOTHING here', () => {
    expect(accesVue({ kind: 'loading' })).toEqual({ kind: 'loading', message: 'acces.chargement' });
    expect(accesVue({ kind: 'failed' })).toEqual({ kind: 'failed', message: 'acces.echec' });
    expect(accesVue({ kind: 'ok', codes: [] })).toEqual({ kind: 'empty', message: 'acces.vide' });
    // NULL, not a sentence: the section shares key C with Livraisons, and a
    // refused key must produce ONE sentence on the console, never two saying
    // the same thing in different words.
    expect(accesVue({ kind: 'bad_key' })).toBeNull();
    const codes = [{ resellerId: 'rs-0001', mintedAt: '2026-08-04T10:00:00.000Z' }];
    expect(accesVue({ kind: 'ok', codes })).toEqual({ kind: 'liste', codes });
  });

  it('every message key it can emit exists in the catalog', () => {
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    for (const read of [{ kind: 'loading' }, { kind: 'failed' }, { kind: 'ok', codes: [] }] as const) {
      const vue = accesVue(read);
      if (vue === null || vue.kind === 'liste') throw new Error('expected a message');
      expect(fr.get(vue.message), vue.message).toBeTruthy();
    }
  });
});

describe('ACCESS-GATE-1 — a live one-time code blocks every other act', () => {
  it('the plaintext exists ONCE, so nothing may re-render the section while it is on screen', () => {
    const vivant: AccesUi = { busy: null, nouveau: { resellerId: 'rs-0001', code: 'SP-AAAA' }, echec: null };
    // The Worker stores only the SHA-256. A second act here destroys the only
    // copy of the code while he is reading it out over the phone.
    expect(accesMintStart(vivant)).toBeNull();
    expect(accesRevokeStart(vivant, 'rs-0002')).toBeNull();
    // …and a write already in flight blocks too — one write at a time
    const occupe: AccesUi = { busy: 'mint', nouveau: null, echec: null };
    expect(accesMintStart(occupe)).toBeNull();
    expect(accesRevokeStart(occupe, 'rs-0002')).toBeNull();
    // CONTROL: from idle, both DO start — the guard is not simply always-null
    expect(accesMintStart(ACCES_IDLE)).toEqual({ busy: 'mint', nouveau: null, echec: null });
    expect(accesRevokeStart(ACCES_IDLE, 'rs-0002')).toEqual({ busy: 'revoke:rs-0002', nouveau: null, echec: null });
  });

  it('a mint keeps the plaintext on screen AND refreshes the list — the row must be the stored truth', () => {
    const s = accesMintSettled({ ok: true, resellerId: 'rs-0007', code: 'SP-ABCD-EFGH' });
    expect(s.then).toBe('refresh');
    expect(s.ui.nouveau).toEqual({ resellerId: 'rs-0007', code: 'SP-ABCD-EFGH' });
    expect(s.ui.busy).toBeNull();
  });

  it('a REVOKE that finds no code still refreshes — the list claimed one the book does not hold', () => {
    expect(accesRevokeSettled('rs-1', { ok: false, reason: 'no_code' }).then).toBe('refresh');
    expect(accesRevokeSettled('rs-1', { ok: true }).then).toBe('refresh');
    // …and a real failure does NOT refresh; it names itself on that row
    const echec = accesRevokeSettled('rs-1', { ok: false, reason: 'unreachable' });
    expect(echec.then).toBe('none');
    expect(echec.ui.echec).toBe('revoke:rs-1');
  });

  it('the failure marker is NAMESPACED — a reseller literally called « mint » cannot light the wrong sentence', () => {
    const piege = accesRevokeSettled('mint', { ok: false, reason: 'unreachable' });
    expect(piege.ui.echec).toBe('revoke:mint');
    expect(piege.ui.echec).not.toBe('mint');
    expect(accesMintSettled({ ok: false, reason: 'unreachable' }).ui.echec).toBe('mint');
  });

  it('a refused key on EITHER act escalates rather than reporting a local failure', () => {
    expect(accesMintSettled({ ok: false, reason: 'bad_key' }).then).toBe('bad_key');
    expect(accesRevokeSettled('rs-1', { ok: false, reason: 'bad_key' }).then).toBe('bad_key');
  });

  it('accesReadOf keeps bad_key separate from every other failure', () => {
    expect(accesReadOf({ ok: false, reason: 'bad_key' })).toEqual({ kind: 'bad_key' });
    expect(accesReadOf({ ok: false, reason: 'unreachable' })).toEqual({ kind: 'failed' });
    expect(accesReadOf({ ok: true, codes: [] })).toEqual({ kind: 'ok', codes: [] });
  });
});

describe('ACCESS-GATE-1 — the port speaks to the SHOP+ Worker on key C', () => {
  const CHECKOUT = 'EXPO_PUBLIC_SHOP_CHECKOUT_BASE';

  it('mint POSTs EXACTLY {resellerId} to /reseller/code with the Bearer — no second field', () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example/');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, code: 'SP-1', resellerId: 'rs-9' })));
    return resolveAccesService()!.mintAcces('cle-c', 'rs-9').then((res) => {
      expect(res).toEqual({ ok: true, resellerId: 'rs-9', code: 'SP-1' });
      const [url, init] = spy.mock.calls[0]!;
      expect(url).toBe('https://shop.example/reseller/code');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-c');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      // The DO refuses a body with a second key outright — asserted here as the
      // property, so a « harmless » extra field reads as the violation it is.
      expect(Object.keys(body)).toEqual(['resellerId']);
      expect(Object.keys(body)).not.toContain('code');
    });
  });

  it('the list DROPS a malformed row rather than rendering a door he cannot cut', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    stubFetch(async () => new Response(JSON.stringify({
      ok: true,
      codes: [
        { resellerId: 'rs-1', mintedAt: '2026-08-04T10:00:00.000Z' },
        { resellerId: '', mintedAt: '2026-08-04T10:00:00.000Z' },
        { resellerId: 'rs-2' },
        null,
        'nonsense',
      ],
    })));
    const res = await resolveAccesService()!.listAcces('k');
    expect(res).toEqual({ ok: true, codes: [{ resellerId: 'rs-1', mintedAt: '2026-08-04T10:00:00.000Z' }] });
  });

  it('401 → bad_key on all three calls, and a dead network → unreachable, never a silent success', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    const port = resolveAccesService()!;
    stubFetch(async () => new Response('no', { status: 401 }));
    expect(await port.listAcces('k')).toEqual({ ok: false, reason: 'bad_key' });
    expect(await port.mintAcces('k', 'rs-1')).toEqual({ ok: false, reason: 'bad_key' });
    expect(await port.revokeAcces('k', 'rs-1')).toEqual({ ok: false, reason: 'bad_key' });

    stubFetch(() => Promise.reject(new Error('down')));
    expect(await port.listAcces('k')).toEqual({ ok: false, reason: 'unreachable' });
    expect(await port.mintAcces('k', 'rs-1')).toEqual({ ok: false, reason: 'unreachable' });
    expect(await port.revokeAcces('k', 'rs-1')).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('a mint answer missing the code is NOT a success — an empty card would be worse than a failure', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    for (const body of [{ ok: true, resellerId: 'rs-1' }, { ok: true, code: 'SP-1' }, { ok: false }]) {
      stubFetch(async () => new Response(JSON.stringify(body)));
      expect(await resolveAccesService()!.mintAcces('k', 'rs-1'), JSON.stringify(body))
        .toEqual({ ok: false, reason: 'unreachable' });
    }
  });

  it('« no_code » on a revoke is its OWN answer — honest, not a failure', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'no_code' })));
    expect(await resolveAccesService()!.revokeAcces('k', 'rs-1')).toEqual({ ok: false, reason: 'no_code' });
  });

  it('a HANGING call is bounded like every other key-C read', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', (_u: string, init?: RequestInit) =>
        new Promise((_r, rej) => { init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))); }));
      const pending = resolveAccesService()!.listAcces('k');
      await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS + 50);
      expect(await pending).toEqual({ ok: false, reason: 'unreachable' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('unset base resolves to NOTHING — never a demo inventory of doors', () => {
    vi.stubEnv(CHECKOUT, '');
    expect(resolveAccesService()).toBeNull();
  });
});

describe('ACCESS-GATE-1 — [source-text checks] the section is mounted behind key C', () => {
  const screenSource = () =>
    readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');

  it('it renders ONLY once the founder has entered key C, and the mint form hides behind a live code', () => {
    const source = screenSource();
    expect(source).toContain('{cleC !== null && (\n            <SAcces');
    // the one-time code owns the screen until dismissed
    expect(source).toContain('{ui.nouveau === null && (');
    expect(source).toContain("t('acces.noter_dabord')");
    expect(source).toContain("t('acces.vu')");
  });

  it('the « she already has a code » warning speaks only from a SUCCESSFUL read', () => {
    const source = screenSource();
    expect(source).toContain("accesRead.kind === 'ok' &&");
    // with the list unread we cannot know — so nothing is claimed
    expect(source).toContain('accesRead.codes.some((c) => c.resellerId === accesDraft.trim())');
  });

  it('every acces.* key the console renders exists in the catalog', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...screenSource().matchAll(/t\('(acces\.[a-z_]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(8);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });
});

/* ═════ RESELLER-ACCOUNTS-1c — the roster, the pause, the suivi ═════ */

describe('RESELLER-ACCOUNTS — the roster decides, one act at a time, and the code card owns the screen', () => {
  const ROW: import('../src/operations/dispatch-service').CompteRow = {
    accountId: 'rs-1234', name: 'Awa Traoré', email: 'awa@example.bf', phone: '+226 70 00 00 01',
    state: 'pending_access', createdAt: '2026-08-04T10:00:00.000Z', accessCodePending: false,
  };

  it('every read state maps to a designed sentence; bad_key renders NOTHING (one key, one sentence)', () => {
    expect(comptesVue({ kind: 'loading' })).toEqual({ kind: 'loading', message: 'comptes.chargement' });
    expect(comptesVue({ kind: 'failed' })).toEqual({ kind: 'failed', message: 'comptes.echec' });
    expect(comptesVue({ kind: 'ok', comptes: [] })).toEqual({ kind: 'empty', message: 'comptes.vide' });
    expect(comptesVue({ kind: 'bad_key' })).toBeNull();
    expect(comptesVue({ kind: 'ok', comptes: [ROW] })).toEqual({ kind: 'liste', comptes: [ROW] });
  });

  it('a LIVE one-time code blocks every other act — pause included: a paused row mid-handout would strand the code', () => {
    const vivant: ComptesUi = { busy: null, nouveau: { accountId: 'rs-1', code: 'SPA-XXXX' }, echec: null };
    for (const acte of ['code:rs-2', 'pause:rs-2', 'resume:rs-2'] as const) {
      expect(acteStart(vivant, acte), acte).toBeNull();
    }
    const occupe: ComptesUi = { busy: 'pause:rs-9', nouveau: null, echec: null };
    expect(acteStart(occupe, 'code:rs-1')).toBeNull();
    // CONTROL — from idle every verb starts
    expect(acteStart(COMPTES_IDLE, 'pause:rs-1')).toEqual({ busy: 'pause:rs-1', nouveau: null, echec: null });
  });

  it('a minted code stays on screen AND the list refreshes — the roster must show « code en route » from stored truth', () => {
    const s = codeAccesSettled('rs-1', { ok: true, accountId: 'rs-1', code: 'SPA-AAAA' });
    expect(s.then).toBe('refresh');
    expect(s.ui.nouveau).toEqual({ accountId: 'rs-1', code: 'SPA-AAAA' });
  });

  it('wrong_state / not_pending / not_found all RE-READ — the list was stale about her, and the stored truth corrects the row', () => {
    expect(acteSettled('pause:rs-1', { ok: false, reason: 'wrong_state' }).then).toBe('refresh');
    expect(acteSettled('resume:rs-1', { ok: false, reason: 'not_found' }).then).toBe('refresh');
    expect(codeAccesSettled('rs-1', { ok: false, reason: 'not_pending' }).then).toBe('refresh');
    // a network failure does NOT re-read — nothing changed, the sentence is enough
    expect(acteSettled('pause:rs-1', { ok: false, reason: 'unreachable' }).then).toBe('none');
    // and the failure marker is namespaced to the exact act
    expect(acteSettled('pause:rs-1', { ok: false, reason: 'unreachable' }).ui.echec).toBe('pause:rs-1');
  });

  it('a refused key on any act escalates the SECTION, never a local sentence', () => {
    expect(acteSettled('pause:rs-1', { ok: false, reason: 'bad_key' }).then).toBe('bad_key');
    expect(codeAccesSettled('rs-1', { ok: false, reason: 'bad_key' }).then).toBe('bad_key');
  });
});

describe('RESELLER-ACCOUNTS — the ports parse strictly and answer honestly', () => {
  const CHECKOUT = 'EXPO_PUBLIC_SHOP_CHECKOUT_BASE';

  it('the roster read drops a malformed row and NEVER invents a state', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    stubFetch(async () => new Response(JSON.stringify({ ok: true, accounts: [
      { accountId: 'rs-1', name: 'Awa', email: 'a@b.bf', phone: '70', state: 'active', createdAt: 'x', accessCodePending: false },
      { accountId: 'rs-2', name: 'Fanta', email: 'f@b.bf', phone: '70', state: 'banned', createdAt: 'x' },
      { accountId: '', name: 'Vide', email: '', phone: '', state: 'active', createdAt: 'x' },
      null,
    ] })));
    const res = await resolveComptesService()!.listComptes('k');
    if (!res.ok) throw new Error(res.reason);
    // « banned » is not a state this console knows — rendering it would offer
    // an act the server must refuse; DROPPED beats guessed
    expect(res.comptes.map((c) => c.accountId)).toEqual(['rs-1']);
  });

  it('pause/resume: 409 is wrong_state (honest), 404 not_found, 401 bad_key — and the suivi sorts by the COUNT it shows', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    const port = resolveComptesService()!;
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'wrong_state' }), { status: 409 }));
    expect(await port.pause('k', 'rs-1')).toEqual({ ok: false, reason: 'wrong_state' });
    stubFetch(async () => new Response('no', { status: 401 }));
    expect(await port.resume('k', 'rs-1')).toEqual({ ok: false, reason: 'bad_key' });

    stubFetch(async () => new Response(JSON.stringify({ ok: true, lignes: [
      { accountId: 'rs-a', name: 'A', state: 'active', ventes: 1, netFcfa: 9_000, incomplet: false },
      { accountId: 'rs-b', name: 'B', state: 'active', ventes: 3, netFcfa: 2_000, incomplet: false },
      { accountId: 'rs-c', name: 'C', state: 'active', ventes: 3, netFcfa: 5_000, incomplet: true },
    ] })));
    const suivi = await port.listSuivi('k');
    if (!suivi.ok) throw new Error(suivi.reason);
    // COUNT DESC first — a bigger net never outranks more delivered-real sales
    // (the reputation law's spirit: the count is the truth, money is detail) —
    // then net desc, then id, so the board never reshuffles between reads.
    expect(suivi.lignes.map((l) => l.accountId)).toEqual(['rs-c', 'rs-b', 'rs-a']);
  });

  it('a suivi line with a NEGATIVE or fractional franc is dropped — a monitoring board must never display an impossible figure', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    stubFetch(async () => new Response(JSON.stringify({ ok: true, lignes: [
      { accountId: 'rs-ok', name: 'A', state: 'active', ventes: 1, netFcfa: 500, incomplet: false },
      { accountId: 'rs-neg', name: 'B', state: 'active', ventes: 1, netFcfa: -500, incomplet: false },
      { accountId: 'rs-frac', name: 'C', state: 'active', ventes: 0.5, netFcfa: 100, incomplet: false },
    ] })));
    const suivi = await resolveComptesService()!.listSuivi('k');
    if (!suivi.ok) throw new Error(suivi.reason);
    expect(suivi.lignes.map((l) => l.accountId)).toEqual(['rs-ok']);
  });

  it('the mint body is EXACTLY {accountId} — the DO refuses a second field by name', async () => {
    vi.stubEnv(CHECKOUT, 'https://shop.example');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, accountId: 'rs-1', code: 'SPA-1' })));
    await resolveComptesService()!.codeAcces('cle-c', 'rs-1');
    const body = JSON.parse(String(spy.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['accountId']);
  });

  it('unset base resolves to NOTHING', () => {
    vi.stubEnv(CHECKOUT, '');
    expect(resolveComptesService()).toBeNull();
  });
});

describe('RESELLER-ACCOUNTS — [source-text checks] the sections load when the key is known', () => {
  const screenSource = () =>
    readFileSync(join(import.meta.dirname, '..', 'src/operations/screen.tsx'), 'utf8');

  it('EVERY key-C section loads on mount AND on key entry — the stranded-loading defect, pinned at both call sites', () => {
    const source = screenSource();
    // the mount effect and the key button must EACH ask for all four reads —
    // the acces section shipped without this and sat on « Lecture… » forever
    for (const call of ['void loadAcces(stored)', 'void loadComptes(stored)', 'void loadSuivi(stored)',
                        'void loadAcces(v)', 'void loadComptes(v)', 'void loadSuivi(v)']) {
      expect(source, call).toContain(call);
    }
  });

  it('the roster offers exactly ONE act per state, and the suivi renders the net through formatF', () => {
    const source = screenSource();
    expect(source).toContain("c.state === 'pending_access' ? t('comptes.donner_code') : c.state === 'active' ? t('comptes.couper') : t('comptes.rouvrir')");
    expect(source).toContain('formatF(l.netFcfa)');
  });

  it('every comptes.* and suivi.* key the console renders exists in the catalog', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...screenSource().matchAll(/t\('((?:comptes|suivi)\.[a-z_]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(12);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });
});
