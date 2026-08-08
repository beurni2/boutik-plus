import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nomCoursierPour, ordonnerGains } from '../src/gains/view';
import type { BoardSera } from '../src/commandes/sera-service';
import type { GainRow } from '../src/operations/dispatch-service';

/**
 * RB-3 — the Gains tab (founder direction 2026-08-08: « the money share well
 * explained between supplier, reseller, and fees and which rider delivered »).
 *
 * The wire fixtures below are CONTRACT-CERTIFIED against the real Shop+
 * Worker: `services/storefront-service/test/sandbox-payment-confirm.e2e.test.ts`
 * (shop-plus, describe « RB-3 — the gains read ») drives buy → sandbox
 * confirm → `GET /checkout/gains` end to end on miniflare and pins these
 * exact field names and franc values (B 10 000 · C 1 000 · M 1 500 ·
 * fee 500 · sellerNet 8 500 = B − C − fee · resellerNet 2 000). Any drift
 * there must be mirrored here BY HAND, eyes open.
 */

const SPLIT = {
  sellerBasePrice: 10_000,
  sellerFundedCommission: 1_000,
  resellerMarkup: 1_500,
  deliveryFee: 1_000,
  productSubtotal: 11_500,
  buyerTotal: 12_500,
  sellerPlatformFee: 500,
  sellerNet: 8_500,
  resellerPlatformFee: 500,
  resellerNet: 2_000,
};

const ROW = {
  ok: true,
  exists: true,
  orderId: 'ord-gains-1',
  state: 'confirmed',
  createdAt: '2026-08-08T10:00:00.000Z',
  productVersionId: 'pv-1',
  zoneTo: 'Gounghin, Ouagadougou',
  split: SPLIT,
  livree: false,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('RB-3 — the gains port copies the frozen split, franc for franc', () => {
  it('certified bytes become a row: every figure lands UNCHANGED, through the key-C door', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    const calls: { url: string; auth: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        auth: String((init?.headers as Record<string, string>)['Authorization']),
      });
      return new Response(JSON.stringify({ ok: true, gains: [ROW] }), { status: 200 });
    });
    const { resolveGainsService } = await import('../src/operations/dispatch-service');
    const service = resolveGainsService();
    expect(service).not.toBeNull();
    const answer = await service!.listGains('cle-c-test');
    // the call site, not just the answer: the read went to THE route with THE key
    expect(calls).toEqual([{ url: 'http://shop/checkout/gains', auth: 'Bearer cle-c-test' }]);
    if (!answer.ok) throw new Error('expected rows');
    expect(answer.rows).toHaveLength(1);
    const row = answer.rows[0]!;
    expect(row.orderId).toBe('ord-gains-1');
    expect(row.zoneTo).toBe('Gounghin, Ouagadougou');
    // franc for franc — a port that "normalizes" money is a port that lies
    expect(row.split).toEqual(SPLIT);
    // SE-LIVE-5c — absent-on-the-wire reads FALSE: delivered is never a default
    expect(row.livree).toBe(false);
  });

  it('a split missing ONE figure — or carrying a fraction or a negative — drops the WHOLE row', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    const sansNet = { ...ROW, orderId: 'ord-2', split: { ...SPLIT } as Record<string, unknown> };
    delete sansNet.split['sellerNet'];
    const fraction = { ...ROW, orderId: 'ord-3', split: { ...SPLIT, sellerPlatformFee: 500.5 } };
    const negatif = { ...ROW, orderId: 'ord-4', split: { ...SPLIT, resellerNet: -1 } };
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ ok: true, gains: [ROW, sansNet, fraction, negatif] }), { status: 200 }),
    );
    const { resolveGainsService } = await import('../src/operations/dispatch-service');
    const answer = await resolveGainsService()!.listGains('cle');
    if (!answer.ok) throw new Error('expected rows');
    expect(answer.rows.map((r) => r.orderId)).toEqual(['ord-gains-1']);
  });

  it('401 is bad_key, a refused connection and a 5xx are unreachable, unset base is NOTHING', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'http://shop');
    const { resolveGainsService } = await import('../src/operations/dispatch-service');

    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    expect(await resolveGainsService()!.listGains('mauvaise')).toEqual({ ok: false, reason: 'bad_key' });

    vi.stubGlobal('fetch', async () => {
      throw new Error('refused');
    });
    expect(await resolveGainsService()!.listGains('cle')).toEqual({ ok: false, reason: 'unreachable' });

    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    expect(await resolveGainsService()!.listGains('cle')).toEqual({ ok: false, reason: 'unreachable' });

    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', '');
    expect(resolveGainsService()).toBeNull();
  });
});

describe('RB-3 — the Séra board carries its live assignments to the rider join', () => {
  it('assignments parse strictly off the real board shape; the join names the carrier', async () => {
    // Board bytes mirror sera's own e2e (`logistics-door.e2e.test.ts`,
    // RB-2 describe): { ok, board: { queued, riders, assignments } }.
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          ok: true,
          board: {
            queued: [],
            riders: [
              { riderId: 'rider-1', displayName: 'Salif', assignable: false },
              { riderId: 'rider-2', displayName: 'Awa', assignable: true },
            ],
            assignments: [
              { taskId: 'task-1', orderId: 'ord-gains-1', riderId: 'rider-1', status: 'acknowledged' },
              { taskId: '', orderId: 'ord-x', riderId: 'rider-2', status: 'acknowledged' },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const { httpSeraDispatch } = await import('../src/commandes/sera-service');
    const answer = await httpSeraDispatch('http://sera').board('cle-sera');
    if (answer.kind !== 'ok') throw new Error('expected board');
    // the malformed assignment (empty taskId) is dropped, the whole one kept
    expect(answer.value.affectations).toEqual([
      { taskId: 'task-1', orderId: 'ord-gains-1', riderId: 'rider-1', status: 'acknowledged' },
    ]);
    expect(nomCoursierPour('ord-gains-1', answer.value)).toBe('Salif');
  });

  it('no live assignment — or no board at all — is an honest null, never a guess', () => {
    const board: BoardSera = {
      queued: [],
      riders: [{ riderId: 'rider-9', displayName: 'Issa', assignable: true }],
      affectations: [{ taskId: 't', orderId: 'autre', riderId: 'rider-9', status: 'acknowledged' }],
    };
    expect(nomCoursierPour('ord-gains-1', board)).toBeNull();
    expect(nomCoursierPour('ord-gains-1', null)).toBeNull();
    // a rider missing from the roster still shows by his id — true, if colder
    const orphelin: BoardSera = { queued: [], riders: [], affectations: board.affectations };
    expect(nomCoursierPour('autre', orphelin)).toBe('rider-9');
  });
});

describe('RB-3 — newest sale first, deterministically', () => {
  it('sorts by date desc, ties by orderId, and never mutates its input', () => {
    const base: Omit<GainRow, 'orderId' | 'createdAt'> = {
      productVersionId: 'pv',
      zoneTo: '',
      split: SPLIT,
      livree: false,
    };
    const rows: GainRow[] = [
      { ...base, orderId: 'ord-b', createdAt: '2026-08-07T10:00:00.000Z' },
      { ...base, orderId: 'ord-c', createdAt: '2026-08-08T10:00:00.000Z' },
      { ...base, orderId: 'ord-a', createdAt: '2026-08-08T10:00:00.000Z' },
    ];
    const copie = [...rows];
    expect(ordonnerGains(rows).map((r) => r.orderId)).toEqual(['ord-a', 'ord-c', 'ord-b']);
    expect(rows).toEqual(copie);
  });
});

describe('RB-3 — [source-text checks] the tab’s discipline', () => {
  const screen = readFileSync(join(import.meta.dirname, '..', 'src/gains/screen.tsx'), 'utf8');
  const app = readFileSync(join(import.meta.dirname, '..', 'src/v2/AppV2.tsx'), 'utf8');

  it('the argent tab mounts the REAL gains — the demo ledger is unrouted', () => {
    expect(app).toContain('<SGainsReel />');
    expect(app).not.toContain('S32Argent');
  });

  it('every key the screen renders exists in the catalog', () => {
    const catalog = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'i18n/catalog.json'), 'utf8'),
    ) as { key: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...screen.matchAll(/t\('((?:gains|commandes)\.[a-z_.]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(12);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });

  it('SE-LIVE-5c — « Livrée par Séra » renders ONLY from the served livree fact', () => {
    expect(screen).toContain("{t('gains.livree')}");
    expect(screen).toContain('row.livree ?');
    // the badge is gated by the row's own field, never unconditioned
    expect(screen.match(/gains\.livree/g)?.length).toBe(1);
  });

  it('no demo import; the service resolves or the screen says « pas relié »', () => {
    expect(screen).not.toMatch(/from '\.\.\/demo|from '\.\/demo/);
    expect(screen).toContain('resolveGainsService()');
    expect(screen).toContain('clearStoredCleC();');
  });

  it('every franc rendered is a STORED field through the ONE formatter — nothing derived', () => {
    // the six figures the founder reads, each the quote's own byte: the total
    // renders through formatF directly, the five parts ride LigneGain's
    // montant prop — whose ONLY render is formatF(montant)
    expect(screen).toContain('formatF(s.buyerTotal)');
    for (const champ of [
      's.sellerNet',
      's.resellerNet',
      's.sellerPlatformFee',
      's.resellerPlatformFee',
      's.deliveryFee',
    ]) {
      expect(screen, `${champ} must be rendered`).toContain(`montant={${champ}}`);
    }
    expect(screen).toContain('formatF(montant)');
    // no arithmetic on the split anywhere in the screen
    expect(screen).not.toMatch(/split\.\w+\s*[+\-*/]/);
    expect(screen).not.toMatch(/s\.\w+\s*[+\-*/]/);
    expect(screen).not.toContain('computeWaterfall');
  });
});
