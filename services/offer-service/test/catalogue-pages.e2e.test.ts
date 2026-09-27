import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * CATALOGUE-PAGES-1 · CROISSANCE-1 (AUDIT-B+2 slice 5: F-05, F-89 c) — THE SEAM,
 * on real workerd: the supplier app's OWN ports, against the REAL Worker, with
 * the outcome asked of the stored truth — the collection resellers browse and
 * the book's own board — never of the response that claimed it.
 *
 * 50 offers (26 for the supplier who is cut, 24 for a neighbour) is past every
 * page the Worker serves (40 for a list, 20 for a cut, 8 for an erase), so each
 * port must follow its cursor to be right at all. Miniflare does not enforce the
 * platform's per-request call ceiling; `croissance-offres.test.ts` counts those
 * calls page by page. This proves the pages JOIN UP.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'catalogue-pages-'));
const OPS = 'test-fulfillment-ops-secret-0005';
const READ = 'test-supply-read-secret-0005';
const FULFIL = 'test-fulfillment-write-secret-0005';
const T0 = '2026-09-27T08:00:00.000Z';
const COUPE = 'supplier-pages-coupe';
const VOISIN = 'supplier-pages-voisin';
const N_COUPE = 26;
const N_VOISIN = 24;

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: { FULFILLMENT_OPS_SECRET: OPS, SUPPLY_READ_SECRET: READ, FULFILLMENT_WRITE_SECRET: FULFIL },
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const media = (i: number, k: number) => `media/${String(k).repeat(8)}-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ref = (r: string) => ({ ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });

async function post(path: string, body: unknown, auth: string): Promise<Response> {
  return mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
  }) as unknown as Promise<Response>;
}

/** What resellers can buy right now — the ledger this slice must move. */
async function enVente(): Promise<string[]> {
  const res = await mf.dispatchFetch('http://o/supply-projections', { headers: { Authorization: `Bearer ${READ}` } });
  const body = (await res.json()) as { items: { value: { productVersionId: string } }[] };
  return body.items.map((i) => i.value.productVersionId).sort();
}
const pvs = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `pv-${prefix}-${String(i).padStart(3, '0')}`);

let codeCoupe = '';

beforeAll(async () => {
  for (const s of [COUPE, VOISIN]) {
    const r = await post('/fulfillment/supplier-code', { supplierId: s }, OPS);
    expect(r.status).toBe(200);
    if (s === COUPE) codeCoupe = ((await r.json()) as { code: string }).code;
  }
  // interleaved, so every page mixes the two suppliers: evens and the last are his
  const compte = { c: 0, v: 0 };
  for (let i = 0; i < N_COUPE + N_VOISIN; i += 1) {
    const sien = i % 2 === 0 || i === N_COUPE + N_VOISIN - 1;
    const supplierId = sien ? COUPE : VOISIN;
    const prefix = sien ? 'c' : 'v';
    const k = compte[prefix]++;
    const pv = `pv-${prefix}-${String(k).padStart(3, '0')}`;
    const offerId = `offer-${String(i).padStart(3, '0')}`;
    const res = await post('/offers', {
      commandId: `seed-${offerId}`, offerId,
      product: {
        id: pv, supplierId, version: 1, name: `Produit ${offerId}`, productCode: `PG-${i}`, facts: {},
        category: 'fashion_bags_fabrics', zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
      },
      draft: {
        productVersionId: pv, basePrice: 8_000, resellerCommission: 800, eligibleVariants: [], zones: [],
        effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
      },
      available: 3, asOf: T0,
    }, OPS);
    expect(res.status, await res.clone().text()).toBe(200);
    if (sien) {
      const a = await post('/offers/assets', {
        commandId: `assets-${offerId}`, offerId,
        assets: {
          masterRef: ref('private/master/x'), heroSquare: ref(media(i, 1)), heroVertical: ref(media(i, 2)), proof: ref(media(i, 3)),
          detail: [], hashes: ['a'.repeat(64)], processingVersion: 'premium-frame.v1',
        },
      }, OPS);
      expect(a.status, await a.clone().text()).toBe(200);
    }
  }
  vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'http://o');
  vi.stubGlobal('fetch', ((url: string, init?: RequestInit) => mf.dispatchFetch(url, init as never)) as never);
}, 120_000);

async function ports() {
  const { resolveOperationsService } = await import('../../../apps/supplier-app/src/operations/service');
  const { resolveFournisseurService } = await import('../../../apps/supplier-app/src/fournisseur/service');
  const { HttpSupplyService } = await import('../../../apps/supplier-app/src/supply/service');
  return { ops: resolveOperationsService()!, four: resolveFournisseurService()!, supply: new HttpSupplyService('http://o', OPS) };
}

describe('F-05 · the lists reach every product, page after page', () => {
  it('his « Mes produits », the founder\'s list for him, and the whole inventory — each whole, none twice', async () => {
    expect(await enVente()).toHaveLength(N_COUPE + N_VOISIN);
    const { ops, four, supply } = await ports();

    const siens = await four.listProduits(codeCoupe);
    expect(siens.ok && siens.incomplet !== true).toBe(true);
    if (siens.ok) expect(siens.produits.map((p) => p.productVersionId).sort()).toEqual(pvs('c', N_COUPE));

    const pourLui = await supply.listOffers(COUPE);
    expect(pourLui.ok).toBe(true);
    if (pourLui.ok) expect(pourLui.value.items.map((p) => p.productVersionId).sort()).toEqual(pvs('c', N_COUPE));

    const inv = await ops.listInventaire(OPS);
    expect(inv.ok && inv.incomplet !== true).toBe(true);
    if (inv.ok) {
      expect(inv.rows).toHaveLength(N_COUPE + N_VOISIN);
      expect(new Set(inv.rows.map((r) => r.offerId)).size).toBe(N_COUPE + N_VOISIN);
    }
  });

  it('a product deleted between two pages: the port reads again from the start and still misses nothing', async () => {
    const { ops } = await ports();
    // one extra offer to delete, placed so it is the first page's LAST row
    let premiere = true;
    vi.stubGlobal('fetch', (async (url: string, init?: RequestInit) => {
      const res = await mf.dispatchFetch(url, init as never);
      if (premiere && String(url).includes('/offers/inventaire')) {
        premiere = false;
        const body = (await res.clone().json()) as { items: { offerId: string; productVersionId: string }[]; next?: string };
        const dernier = body.items.at(-1)!;
        // the founder deletes that very product while his list is loading
        const del = await post('/offers/delete', { commandId: 'del-pendant', offerId: dernier.offerId, productVersionId: dernier.productVersionId }, OPS);
        expect(del.status).toBe(200);
      }
      return res;
    }) as never);
    try {
      const inv = await ops.listInventaire(OPS);
      expect(inv.ok, JSON.stringify(inv).slice(0, 200)).toBe(true);
      if (inv.ok) expect(inv.rows).toHaveLength(N_COUPE + N_VOISIN - 1);
    } finally {
      vi.stubGlobal('fetch', ((url: string, init?: RequestInit) => mf.dispatchFetch(url, init as never)) as never);
    }
  });
});

describe('F-05 · the cut takes EVERY one of his products off sale; the re-mint puts every one back', () => {
  it('couper → the collection resellers browse holds none of his; redonner → all of them again; a stale « Terminer » is refused', async () => {
    const { ops } = await ports();
    const avant = await enVente();
    const siensEnVente = avant.filter((p) => p.startsWith('pv-c-'));
    const voisinEnVente = avant.filter((p) => p.startsWith('pv-v-'));
    expect(siensEnVente.length).toBeGreaterThan(20);

    const cut = await ops.revokeCode(OPS, COUPE);
    expect(cut).toEqual({ ok: true, status: 'revoked' }); // no « produitsIncomplets »: the walk reached the end
    expect((await enVente()).filter((p) => p.startsWith('pv-c-')), 'THE LEDGER: nothing of his is on sale').toEqual([]);
    expect((await enVente()).filter((p) => p.startsWith('pv-v-')), 'and not one of the neighbour\'s left').toEqual(voisinEnVente);

    // « Terminer » for a RE-MINT while he is cut would put a cut supplier back on sale: refused by name
    expect(await ops.finirProduits(OPS, COUPE, 'mint')).toEqual({ ok: false, reason: 'acces_change' });
    expect((await enVente()).filter((p) => p.startsWith('pv-c-'))).toEqual([]);
    // « Terminer » for the cut itself walks the whole catalogue again and changes nothing
    expect(await ops.finirProduits(OPS, COUPE, 'revoke')).toEqual({ ok: true, complet: true });

    const mint = await ops.mintCode(OPS, COUPE);
    expect(mint.ok && mint.produitsIncomplets !== true).toBe(true);
    if (mint.ok) codeCoupe = mint.code;
    expect((await enVente()).filter((p) => p.startsWith('pv-c-')), 'THE LEDGER: every one of his is back').toEqual(siensEnVente);
  });
});

describe('F-05 · the erase, page by page, hands back every photograph and removes him last', () => {
  it('he is erased: his products gone from the inventory and the collection, all 3 × his refs returned, the neighbour intact, his registry row gone', async () => {
    const { ops } = await ports();
    expect((await ops.revokeCode(OPS, COUPE)).ok).toBe(true);

    const res = await ops.effacerFournisseur(OPS, COUPE);
    expect(res.ok, JSON.stringify(res).slice(0, 300)).toBe(true);
    if (!res.ok) return;
    expect(res.supprimes).toBe(N_COUPE);
    expect(new Set(res.refs).size).toBe(3 * N_COUPE);
    expect(res.refs.every((r) => r.startsWith('media/'))).toBe(true);

    const inv = await ops.listInventaire(OPS);
    expect(inv.ok).toBe(true);
    if (inv.ok) expect(inv.rows.every((r) => r.supplierId === VOISIN)).toBe(true);
    expect((await enVente()).every((p) => p.startsWith('pv-v-'))).toBe(true);
    const codes = await ops.listCodes(OPS);
    expect(codes.ok && codes.codes.some((c) => c.supplierId === COUPE)).toBe(false);
  });
});

describe('F-89 c · the founder board, a page at a time, through the real Worker', () => {
  it('pages of two on the wire join into his whole board, newest first, photographs joined per page', async () => {
    const fil = [
      ['ord-pages-a', 'pv-v-001', '2026-09-27T07:00:00.000Z'],
      ['ord-pages-b', 'pv-v-002', '2026-09-27T09:00:00.000Z'],
      ['ord-pages-c', 'pv-v-003', '2026-09-27T08:00:00.000Z'],
    ] as const;
    for (const [orderId, pv, paidAt] of fil) {
      const r = await post('/fulfillment/order-confirmed', {
        name: 'order.confirmed.v1',
        envelope: { command_id: `oc-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: paidAt, version: 'v1' },
        payload: { orderId, productVersionId: pv, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY', paidAt, zoneTo: 'Gounghin', sellerBasePrice: 8_000 },
      }, FULFIL);
      expect(r.status, await r.clone().text()).toBe(200);
    }
    // the wire itself, asked for pages of two
    const vus: string[] = [];
    let cursor: string | undefined;
    for (let t = 0; t < 5; t += 1) {
      const res = await mf.dispatchFetch(`http://o/fulfillment/orders?limit=2${cursor ? `&cursor=${cursor}` : ''}`, { headers: { Authorization: `Bearer ${OPS}` } });
      const body = (await res.json()) as { orders: { orderId: string; productPhotoRef?: unknown }[]; next?: string };
      expect(body.orders.length).toBeLessThanOrEqual(2);
      for (const o of body.orders) {
        vus.push(o.orderId);
        expect(typeof o.productPhotoRef).toBe('string');
      }
      if (body.next === undefined) break;
      cursor = body.next;
    }
    expect(vus.sort()).toEqual(['ord-pages-a', 'ord-pages-b', 'ord-pages-c']);

    // the port: the whole board, in the order the whole-book read gives
    const { ops } = await ports();
    const board = await ops.listPaidOrders(OPS);
    expect(board.ok && board.incomplet !== true).toBe(true);
    if (board.ok) expect(board.orders.map((o) => o.orderId)).toEqual(['ord-pages-b', 'ord-pages-c', 'ord-pages-a']);
    const whole = (await (await mf.dispatchFetch('http://o/fulfillment/orders', { headers: { Authorization: `Bearer ${OPS}` } })).json()) as { orders: { orderId: string }[] };
    if (board.ok) expect(board.orders.map((o) => o.orderId)).toEqual(whole.orders.map((o) => o.orderId));
  });
});
