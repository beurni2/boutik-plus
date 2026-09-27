import { beforeEach, describe, expect, it } from 'vitest';
import { FulfillmentDO } from '../worker/fulfillment-do.js';
import { StockageCompteur } from './doubles/stockage-compteur.js';

/**
 * CROISSANCE-1 (AUDIT-B+2 F-04, F-89) — WHAT THE ORDER BOOK COSTS AS IT GROWS.
 *
 * The audit measured it on the HEAD bundle: a supplier's minute refresh read
 * 4.79 rows per LIFETIME order of the whole platform, the outbox wake 2.86, the
 * founder's board 3.03 — so the account's daily read allowance (Free plan,
 * account-wide) ran out at a few hundred orders, and when it does every storage
 * read on the account fails until midnight UTC.
 *
 * These drive the REAL `FulfillmentDO` over a counting storage (its bounds are
 * written at the top of the double) and assert what each read GROWS WITH:
 *   · his refresh — the book's order rows once, then only HIS orders' marks;
 *   · an outbox wake — the facts still waiting, never the delivered history;
 *   · one page of the founder's board — the page, never the book.
 * The per-supplier filing that would make his refresh independent of everyone
 * else's orders needs the founder's word on rewriting stored orders; it is not
 * here, and the first assertion says exactly how far this gets.
 */

const N = 300;
const OWN = 5;
const T0 = Date.parse('2026-09-01T08:00:00.000Z');
const iso = (i: number) => new Date(T0 + i * 60_000).toISOString();

function record(i: number, supplierId: string) {
  return {
    orderId: `ord-${String(i).padStart(5, '0')}`,
    productVersionId: `pv-${i % 7}`,
    offerVersion: '1',
    paymentMode: 'A',
    paidAt: iso(i),
    zoneTo: 'Gounghin',
    sellerBasePrice: 5_000,
    productName: `Produit ${i}`,
    supplierId,
    supplierResolved: true,
    correlationId: `corr-${i}`,
    registeredAt: iso(i),
  };
}

let storage: StockageCompteur;
let book: FulfillmentDO;
let code: string;

async function post(path: string, body: unknown): Promise<Response> {
  return book.fetch(new Request(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(async () => {
  storage = new StockageCompteur();
  book = new FulfillmentDO({ storage } as unknown as DurableObjectState);
  const minted = (await (await post('/code/mint', { supplierId: 'supplier-sien' })).json()) as { code: string };
  code = minted.code;
  for (let i = 0; i < N; i += 1) {
    const r = record(i, i < OWN ? 'supplier-sien' : 'supplier-autre');
    await storage.put(`order:${r.orderId}`, r);
    // every order carries the marks a busy book carries
    await storage.put(`accept:${r.orderId}`, { acceptedAt: iso(i + 1) });
    await storage.put(`ready:${r.orderId}`, { confirmedAt: iso(i + 2) });
    await storage.put(`handover:${r.orderId}`, { handedOverAt: iso(i + 3) });
  }
  storage.reset();
});

describe('F-04 · his refresh reads the order rows once, then only HIS marks', () => {
  it(`at ${N} orders with ${OWN} of his: at most N + 7 × his + the code`, async () => {
    const res = await post('/mine', { code });
    const body = (await res.json()) as { ok: boolean; orders: { orderId: string; fulfillment?: Record<string, string> }[] };
    expect(body.ok).toBe(true);
    expect(body.orders).toHaveLength(OWN);
    // the answer is unchanged: newest first, every mark folded in
    expect(body.orders.map((o) => o.orderId)).toEqual(['ord-00004', 'ord-00003', 'ord-00002', 'ord-00001', 'ord-00000']);
    expect(body.orders[0]!.fulfillment).toEqual({ acceptedAt: iso(5), readyAt: iso(6), handedOverAt: iso(7) });
    expect(storage.rowsRead).toBeLessThanOrEqual(N + 7 * OWN + 1);
  });
});

describe('F-89 (c) · one page of the founder board reads the page, not the book', () => {
  it('a 100-order page reads at most 101 order rows + the marks of those 100', async () => {
    const res = await book.fetch(new Request('https://do/orders?limit=100'));
    const body = (await res.json()) as { ok: boolean; orders: unknown[]; next?: string };
    expect(body.orders).toHaveLength(100);
    expect(typeof body.next).toBe('string');
    // 101 order rows (one to know a next page exists) + 3 marks × 100
    expect(storage.rowsRead).toBeLessThanOrEqual(101 + 3 * 100);
  });

  it('the pages, followed to the end, are the unpaged board exactly — no order lost, none twice', async () => {
    const whole = (await (await book.fetch(new Request('https://do/orders'))).json()) as { orders: { orderId: string }[] };
    const seen: { orderId: string }[] = [];
    let cursor: string | undefined;
    for (let tour = 0; tour < 10; tour += 1) {
      const url = `https://do/orders?limit=100${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const page = (await (await book.fetch(new Request(url))).json()) as { orders: { orderId: string }[]; next?: string };
      seen.push(...page.orders);
      if (page.next === undefined) break;
      cursor = page.next;
    }
    expect(seen).toHaveLength(N);
    const byId = (rows: { orderId: string }[]) => [...rows].sort((a, b) => (a.orderId < b.orderId ? -1 : 1));
    expect(byId(seen)).toEqual(byId(whole.orders));
  });

  it('with no limit the board is the old answer, byte for byte (a cached console keeps working)', async () => {
    const res = await book.fetch(new Request('https://do/orders'));
    const body = (await res.json()) as { orders: { paidAt: string }[]; next?: unknown };
    expect(body.next).toBeUndefined();
    expect(body.orders).toHaveLength(N);
    expect(body.orders[0]!.paidAt).toBe(iso(N - 1)); // newest first, as before
  });
});

describe('F-89 (a) · an outbox wake reads the facts still waiting, never the delivered history', () => {
  function seedOutbox(delivered: number, pending: number): void {
    for (let i = 0; i < delivered; i += 1) {
      void storage.put(`progressoutbox:ord-${String(i).padStart(5, '0')}:accepted`, {
        status: 'delivered', event: { name: 'fulfillment.accepted.v1' }, attempts: 1, nextAttemptAt: 0,
      });
    }
    for (let i = 0; i < pending; i += 1) {
      void storage.put(`progressoutbox:ord-${String(N - 1 - i).padStart(5, '0')}:ready`, {
        status: 'pending', event: { name: 'fulfillment.ready.v1' }, attempts: 0, nextAttemptAt: 0,
      });
    }
  }

  it('rows written BEFORE this slice are found once, then every later wake reads only what waits', async () => {
    seedOutbox(N, 2);
    await book.alarm(); // the one-time sweep: finds the two waiting facts
    const waiting = [...storage.data.keys()].filter((k) => k.startsWith('progresspending:'));
    expect(waiting).toHaveLength(2);
    // they were attempted (no consumer is wired here, so they wait again)
    const row = storage.data.get(`progressoutbox:ord-${String(N - 1).padStart(5, '0')}:ready`) as { status: string; attempts: number };
    expect(row).toMatchObject({ status: 'pending', attempts: 1 });

    storage.reset();
    await book.alarm();
    // the pointer list (2) + the two rows (2) + the sweep's own marker (1)
    expect(storage.rowsRead).toBeLessThanOrEqual(5);
  });

  it('a NEW release sweeps again: a waiting row written by a rolled-back build (no pointer) is found', async () => {
    seedOutbox(0, 0);
    await storage.put('progresspending-bati', 'une-ancienne-release');
    await storage.put('progressoutbox:ord-00007:ready', { status: 'pending', event: { name: 'fulfillment.ready.v1' }, attempts: 0, nextAttemptAt: 0 });
    await book.alarm();
    expect(storage.data.has('progresspending:ord-00007:ready'), 'the orphan got its pointer').toBe(true);
    expect((storage.data.get('progressoutbox:ord-00007:ready') as { attempts: number }).attempts, 'and was attempted').toBe(1);
    expect(storage.data.get('progresspending-bati'), 'the marker now names this release').toBe('dev');
  });

  it('a DELIVERED fact leaves the waiting list; a fact created now enters it in the same write', async () => {
    const delivering = new FulfillmentDO({ storage } as unknown as DurableObjectState, {
      STOREFRONT: { fetch: async () => new Response('{}', { status: 200 }) },
      PROGRESS_WRITE_SECRET: 'test-progress-secret',
    });
    seedOutbox(0, 1);
    await delivering.alarm();
    expect([...storage.data.keys()].filter((k) => k.startsWith('progresspending:'))).toEqual([]);
    expect((storage.data.get(`progressoutbox:ord-${String(N - 1).padStart(5, '0')}:ready`) as { status: string }).status).toBe('delivered');

    // a new act: the row and its pointer land together
    const r = await post('/accept', { code, orderId: 'ord-00000' });
    expect(r.status).toBe(200);
    expect(storage.data.has('progressoutbox:ord-00000:accepted')).toBe(true);
    expect(storage.data.has('progresspending:ord-00000:accepted')).toBe(true);
  });

  it('a waiting fact with no pointer under THIS release gets it back when its act is asserted again (verifier MINOR 6)', async () => {
    // a same-version rollback: the sweep for this release already ran, then a
    // build without pointers wrote a waiting row
    await storage.put('progresspending-bati', 'dev');
    await storage.put('progressoutbox:ord-00000:accepted', { status: 'pending', event: { name: 'fulfillment.accepted.v1' }, attempts: 0, nextAttemptAt: 0 });
    await book.alarm();
    expect(storage.data.has('progresspending:ord-00000:accepted'), 'the wake cannot see it — the premise').toBe(false);
    const r = await post('/accept', { code, orderId: 'ord-00000' });
    expect(r.status).toBe(200);
    expect(storage.data.has('progresspending:ord-00000:accepted'), 'the re-assertion re-files its pointer').toBe(true);
    await book.alarm();
    expect((storage.data.get('progressoutbox:ord-00000:accepted') as { attempts: number }).attempts, 'and the next wake attempts it').toBe(1);
  });

  it('retiring an order takes its waiting pointers with it', async () => {
    await post('/accept', { code, orderId: 'ord-00001' });
    expect(storage.data.has('progresspending:ord-00001:accepted')).toBe(true);
    const r = await post('/order/retirer', { orderId: 'ord-00001' });
    expect(r.status).toBe(200);
    expect([...storage.data.keys()].filter((k) => k.includes('ord-00001'))).toEqual([]);
  });
});
