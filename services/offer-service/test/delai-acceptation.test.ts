import { beforeEach, describe, expect, it } from 'vitest';
import { FulfillmentDO } from '../worker/fulfillment-do.js';
import { StockageCompteur } from './doubles/stockage-compteur.js';

/**
 * DELAI-ACCEPTATION-1 (AUDIT-B+2 F-02 part 2) — THE 2-HOUR ANSWER CLOCK, on the
 * REAL `FulfillmentDO` over the counting storage (its bounds at the top of the
 * double; the alarm is the double's clock, fired by hand here). Behaviour on
 * real workerd, with the fact reaching a Shop+ stand-in, is in
 * `delai-acceptation.e2e.test.ts`.
 *
 * B6.1 « timeout → refund saga »; ruling ① 2026-07-10 acceptanceDecisionMin
 * 120; founder 2026-09-27: the wall clock, day and night.
 */

const H2 = 120 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function record(orderId: string, supplierId: string, registeredAt: number) {
  return {
    orderId,
    productVersionId: `pv-${orderId}`,
    offerVersion: '1',
    paymentMode: 'FULL_PREPAY',
    paidAt: iso(registeredAt - 1_000),
    zoneTo: 'Gounghin',
    sellerBasePrice: 5_000,
    productName: `Produit ${orderId}`,
    supplierId,
    supplierResolved: supplierId !== '',
    correlationId: `corr-${orderId}`,
    registeredAt: iso(registeredAt),
  };
}

let storage: StockageCompteur;
let book: FulfillmentDO;
let code: string;
/** What Shop+ was told, verbatim. */
let recu: { name: string; orderId: string }[];

function ouvrir(env: Record<string, string> = {}): FulfillmentDO {
  return new FulfillmentDO({ storage } as unknown as DurableObjectState, {
    STOREFRONT: {
      fetch: async (req: Request) => {
        const e = (await req.json()) as { name: string; payload: { orderId: string } };
        recu.push({ name: e.name, orderId: e.payload.orderId });
        return new Response('{}', { status: 200 });
      },
    },
    PROGRESS_WRITE_SECRET: 'test-progress-secret',
    ...env,
  });
}
/**
 * The alarm FIRING, as the platform does it: the alarm is consumed before the
 * handler runs, so the next wake exists only if the handler sets one. (Calling
 * `alarm()` alone would leave the old alarm standing — a stand-in kinder than
 * the platform, which hid a wake that never re-armed.)
 */
async function reveil(): Promise<void> {
  await storage.deleteAlarm();
  await book.alarm();
}
async function post(path: string, body: unknown): Promise<Response> {
  return book.fetch(new Request(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(async () => {
  storage = new StockageCompteur();
  recu = [];
  book = ouvrir();
  code = ((await (await post('/code/mint', { supplierId: 'supplier-sien' })).json()) as { code: string }).code;
});

describe('DELAI-ACCEPTATION-1 · an order no one answers is cancelled at 2 hours, and the buyer refunded', () => {
  it('registering an order files its deadline in the SAME write, and brings the alarm to it', async () => {
    const t = Date.now();
    await post('/register', record('ord-1', 'supplier-sien', t));
    expect(storage.data.get('attentereponse:ord-1')).toBe(t + H2);
    expect(await storage.getAlarm()).toBe(t + H2);
  });

  it('before the deadline nothing happens; at it, the refusal row says `delai` and Shop+ is told `fulfillment.rejected.v1` in the same wake', async () => {
    const t = Date.now();
    await post('/register', record('ord-1', 'supplier-sien', t - H2 + 60_000)); // one minute left
    await reveil();
    expect(storage.data.has('refus:ord-1')).toBe(false);
    expect(recu).toEqual([]);
    expect(await storage.getAlarm(), 'the next wake is its deadline').toBe(t - H2 + 60_000 + H2);

    await storage.put('attentereponse:ord-1', Date.now() - 1); // its time has come
    await reveil();
    expect(storage.data.get('refus:ord-1')).toMatchObject({ orderId: 'ord-1', supplierId: 'supplier-sien', par: 'delai' });
    expect(recu).toEqual([{ name: 'fulfillment.rejected.v1', orderId: 'ord-1' }]);
    expect(storage.data.has('attentereponse:ord-1'), 'the deadline is done with').toBe(false);
  });

  it('an order he accepted in time is never cancelled; its deadline just goes', async () => {
    await post('/register', record('ord-1', 'supplier-sien', Date.now() - H2 - 1));
    expect((await post('/accept', { code, orderId: 'ord-1' })).status).toBe(200);
    await reveil();
    expect(storage.data.has('refus:ord-1')).toBe(false);
    expect(recu.map((e) => e.name)).toEqual(['fulfillment.accepted.v1']);
    expect(storage.data.has('attentereponse:ord-1')).toBe(false);
  });

  it('an order he refused himself keeps HIS refusal — the clock writes nothing over it', async () => {
    await post('/register', record('ord-1', 'supplier-sien', Date.now() - H2 - 1));
    expect((await post('/refuse', { code, orderId: 'ord-1' })).status).toBe(200);
    await reveil();
    expect((storage.data.get('refus:ord-1') as { par?: string }).par).toBeUndefined();
    expect(recu).toEqual([{ name: 'fulfillment.rejected.v1', orderId: 'ord-1' }]);
  });

  it('after the clock, a late « Accepter » is refused `refusee` — the buyer is already being refunded', async () => {
    await post('/register', record('ord-1', 'supplier-sien', Date.now() - H2 - 1));
    await reveil();
    const late = await post('/accept', { code, orderId: 'ord-1' });
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ reason: 'refusee' });
  });

  it('an order whose supplier nobody found is refunded at 2 hours too — no one will ever answer it', async () => {
    await post('/register', record('ord-1', '', Date.now() - H2 - 1));
    await reveil();
    expect(storage.data.get('refus:ord-1')).toMatchObject({ par: 'delai' });
    expect(recu).toEqual([{ name: 'fulfillment.rejected.v1', orderId: 'ord-1' }]);
  });

  it('an order stored BEFORE this slice (no deadline filed) is found when the object starts, and cancelled once its 2 hours are past', async () => {
    await storage.put('order:ord-vieux', record('ord-vieux', 'supplier-sien', Date.now() - 3 * H2));
    book = ouvrir(); // the object starts again (the deploy)
    await reveil();
    expect(storage.data.get('refus:ord-vieux')).toMatchObject({ par: 'delai' });
    expect(recu).toEqual([{ name: 'fulfillment.rejected.v1', orderId: 'ord-vieux' }]);
  });

  it('a wake that died between the refusal and the announcement announces it at the next wake', async () => {
    await post('/register', record('ord-1', 'supplier-sien', Date.now() - H2 - 1));
    // what a wake that died half-way leaves: the refusal, the deadline still filed, no fact
    await storage.put('refus:ord-1', { orderId: 'ord-1', supplierId: 'supplier-sien', refusedAt: iso(Date.now()), par: 'delai' });
    await reveil();
    expect(recu).toEqual([{ name: 'fulfillment.rejected.v1', orderId: 'ord-1' }]);
    expect(storage.data.has('attentereponse:ord-1')).toBe(false);
  });

  it('the test knob can only SHORTEN the 2 hours', async () => {
    book = ouvrir({ ACCEPTANCE_DECISION_MS: String(10 * H2) });
    const t = Date.now();
    await post('/register', record('ord-1', 'supplier-sien', t));
    expect(storage.data.get('attentereponse:ord-1')).toBe(t + H2);
    book = ouvrir({ ACCEPTANCE_DECISION_MS: '5000' });
    await post('/register', record('ord-2', 'supplier-sien', t));
    expect(storage.data.get('attentereponse:ord-2')).toBe(t + 5_000);
  });

  it('his list says until when he may answer — and stops saying it once he has', async () => {
    const t = Date.now();
    await post('/register', record('ord-1', 'supplier-sien', t));
    await post('/register', record('ord-2', 'supplier-sien', t));
    await post('/accept', { code, orderId: 'ord-2' });
    const body = (await (await post('/mine', { code })).json()) as { orders: { orderId: string; repondreAvant?: string }[] };
    expect(body.orders.find((o) => o.orderId === 'ord-1')?.repondreAvant).toBe(iso(t + H2));
    expect(body.orders.find((o) => o.orderId === 'ord-2')?.repondreAvant).toBeUndefined();
  });

  it('the founder\'s board and his list say WHO cancelled: `refusPar: delai`', async () => {
    await post('/register', record('ord-1', 'supplier-sien', Date.now() - H2 - 1));
    await reveil();
    const board = (await (await book.fetch(new Request('https://do/orders'))).json()) as { orders: { orderId: string; fulfillment?: Record<string, string> }[] };
    expect(board.orders[0]!.fulfillment).toMatchObject({ refusPar: 'delai' });
    const sien = (await (await post('/mine', { code })).json()) as { orders: { fulfillment?: Record<string, string> }[] };
    expect(sien.orders[0]!.fulfillment).toMatchObject({ refusPar: 'delai' });
  });

  it('after a wake, the next one is set for the nearest deadline still ahead', async () => {
    const t = Date.now();
    await post('/register', record('ord-loin', 'supplier-sien', t));
    await reveil(); // the first wake of this object also re-checks the book
    await post('/register', record('ord-proche', 'supplier-sien', t - H2 + 30_000));
    await reveil(); // a later wake: only its own last step can set the next one
    expect(await storage.getAlarm()).toBe(t - H2 + 30_000 + H2);
  });

  it('retiring an order takes its deadline with it', async () => {
    await post('/register', record('ord-1', 'supplier-sien', Date.now()));
    expect((await post('/order/retirer', { orderId: 'ord-1' })).status).toBe(200);
    expect(storage.data.has('attentereponse:ord-1')).toBe(false);
  });
});
