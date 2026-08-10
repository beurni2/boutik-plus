import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ PURGE-ESSAI — THE FOUNDER RETIRES A TEST ORDER, ON REAL WORKERD ═══
 *
 * Founder ruling (2026-08-10): « products on my ops console and suppliers
 * console that i used for the testing, remove all of them ». Asked precisely
 * what, he ruled TEST ORDERS ONLY — the product catalogue stays.
 *
 * This suite drives the WHOLE order through the real combined bundle (the
 * paid-order intake, the supplier's accept, his readiness with a live
 * challenge, the delivery mark) so the purge is measured against a book
 * carrying every row a real test leaves behind — never a fixture that happens
 * to hold only the one key the delete names.
 *
 * THE THREE PROPERTIES, and every one of them is asked of a READ, never of
 * the delete's own answer:
 *   1. GONE FROM BOTH CONSOLES — the founder's `/fulfillment/orders` and the
 *      supplier's own `/fulfillment/mine`.
 *   2. NOTHING ELSE MOVED — the other order is untouched, and the supplier's
 *      personal code still opens his book. A purge that costs a supplier his
 *      door is a purge that cost more than it removed.
 *   3. NO RESIDUE THAT CAN RESURRECT — the readiness challenge is spent with
 *      the order, so a replayed readiness for the purged id cannot re-register
 *      it, and a re-registration starts from a clean sheet.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'purge-essai-'));
const WRITE_SECRET = 'test-offer-write-secret-purge';
const FULFILL_SECRET = 'test-fulfillment-write-secret-purge';
const OPS_SECRET = 'test-fulfillment-ops-secret-purge';
const T0 = '2026-08-10T08:00:00.000Z';
const PV = 'pv-purge-001';
const SUPPLIER = 'supplier-purge-001';

const SEED = {
  commandId: 'seed-purge-001',
  offerId: 'offer-purge-001',
  product: {
    id: PV, supplierId: SUPPLIER, version: 1, name: 'Bazin riche (essai)',
    productCode: 'FASO-0201', facts: {}, category: 'fashion_bags_fabrics',
    zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: PV, basePrice: 10_000, resellerCommission: 1_000,
    eligibleVariants: [], zones: [],
    effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 5,
  asOf: T0,
};

function makeMf(persistDir: string = persist): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persistDir,
    bindings: {
      OFFER_WRITE_SECRET: WRITE_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
    },
  });
}

let mf = makeMf();
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

type Json = Record<string, unknown>;

async function call(path: string, body: unknown, headers: Record<string, string>, method = 'POST') {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: Json = {};
  try { json = JSON.parse(text) as Json; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

const ops = (path: string, body?: unknown, method = 'POST') =>
  call(path, body, { Authorization: `Bearer ${OPS_SECRET}` }, method);

/** Everything a real test order leaves in the book: the paid record, his
 *  relance, the acceptance, the spent challenge, the readiness, the delivery. */
async function orderComplet(orderId: string, code: string): Promise<void> {
  const intake = await call(
    '/fulfillment/order-confirmed',
    {
      name: 'order.confirmed.v1',
      envelope: {
        command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`,
        aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
      },
      payload: {
        orderId, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
        paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 10_000,
      },
    },
    { Authorization: `Bearer ${FULFILL_SECRET}` },
  );
  expect(intake.status, intake.text).toBe(200);
  expect((await ops('/fulfillment/relance', { orderId })).status).toBe(200);
  expect((await call('/fulfillment/accept', { orderId }, { Authorization: `Bearer ${code}` })).status).toBe(200);
  const chall = await call('/fulfillment/ready/challenge', { orderId }, { Authorization: `Bearer ${code}` });
  expect(chall.status, chall.text).toBe(200);
  const ready = await call(
    '/fulfillment/ready',
    {
      orderId,
      photoRef: { ref: `media/readiness/${orderId}`, sha256: 'b'.repeat(64), mimeType: 'image/jpeg' },
      readinessChallenge: chall.json['challenge'],
      qty: 1, variant: PV, availableConfirmed: true, at: new Date().toISOString(),
    },
    { Authorization: `Bearer ${code}` },
  );
  expect(ready.status, ready.text).toBe(200);
  // The delivery arrives as the CANON eligibility event Shop+ relays (this
  // door parses `delivery.validated.v1` and takes the producer's own instant
  // — the book witnessed no delivery and has no clock to offer for one).
  const livre = await call(
    '/fulfillment/delivered',
    {
      name: 'delivery.validated.v1',
      envelope: {
        command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`,
        aggregateVersion: 9, actor: 'custody-service:e1',
        serverTime: '2026-08-10T14:00:00.000Z', version: '1',
      },
      payload: {
        order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`,
        result: 'validated', settlement_eligibility: true, supplier_ref: SUPPLIER,
      },
    },
    { Authorization: `Bearer ${FULFILL_SECRET}` },
  );
  expect(livre.status, livre.text).toBe(200);
}

const idsOps = async (): Promise<string[]> => {
  const r = await ops('/fulfillment/orders', undefined, 'GET');
  return ((r.json['orders'] as Json[] | undefined) ?? []).map((o) => o['orderId'] as string);
};
const idsSupplier = async (code: string): Promise<string[]> => {
  // His own board is a GET behind his personal code — the same read his
  // console makes; asking it any other way would prove nothing about it.
  const r = await call('/fulfillment/mine', undefined, { Authorization: `Bearer ${code}` }, 'GET');
  return ((r.json['orders'] as Json[] | undefined) ?? []).map((o) => o['orderId'] as string);
};

describe('PURGE-ESSAI — one named order leaves both consoles, and nothing else moves', () => {
  const A = 'ord-purge-a';
  const B = 'ord-purge-b';
  let code = '';

  it('retires the test order from the founder AND the supplier board, leaves its neighbour, and keeps the supplier his door', async () => {
    expect((await ops('/fulfillment/supplier-code', { supplierId: SUPPLIER })).status).toBe(200);
    const minted = await ops('/fulfillment/supplier-code', { supplierId: SUPPLIER });
    code = minted.json['code'] as string;
    expect((await call('/offers', SEED, { 'X-Write-Key': WRITE_SECRET })).status).toBe(200);

    await orderComplet(A, code);
    await orderComplet(B, code);
    expect(await idsOps()).toEqual(expect.arrayContaining([A, B]));
    expect(await idsSupplier(code)).toEqual(expect.arrayContaining([A, B]));

    const retire = await ops('/fulfillment/order/retirer', { orderId: A });
    expect(retire.status, retire.text).toBe(200);
    expect(retire.json).toMatchObject({ ok: true, status: 'retire', orderId: A });

    // ASKED OF THE BOOK, not of the answer above.
    const apresOps = await idsOps();
    expect(apresOps).not.toContain(A);
    expect(apresOps).toContain(B);
    const apresSupplier = await idsSupplier(code);
    expect(apresSupplier).not.toContain(A);
    expect(apresSupplier, 'the neighbour must be untouched').toContain(B);

    // HIS DOOR SURVIVES — the purge removes an order, never an identity.
    const inventaire = await ops('/fulfillment/supplier-codes', undefined, 'GET');
    expect((inventaire.json['codes'] as Json[]).map((c) => c['supplierId'])).toContain(SUPPLIER);
  }, 60_000);

  it('leaves NO residue: the evidence read is empty and a replayed readiness cannot resurrect it', async () => {
    // The founder's per-order evidence read no longer has anything to show.
    // Asserted as TWO facts, not one disjunction (a verifier NOTE: the old
    // `ok && evidence !== undefined` form passed on either half, so it could
    // never fail for the reason it claimed).
    const preuve = await ops(`/fulfillment/order-evidence?orderId=${A}`, undefined, 'GET');
    expect(preuve.json['evidence'], 'the readiness photo left with the order').toBeUndefined();
    expect(preuve.json['ok'], 'and the read says so honestly').not.toBe(true);

    // The challenge died with the order: replaying the supplier's readiness
    // against the purged id cannot re-register it (and must not 500).
    const rejeu = await call(
      '/fulfillment/ready',
      {
        orderId: A,
        photoRef: { ref: `media/readiness/${A}`, sha256: 'b'.repeat(64), mimeType: 'image/jpeg' },
        readinessChallenge: 'srch-quelque-chose',
        qty: 1, variant: PV, availableConfirmed: true, at: new Date().toISOString(),
      },
      { Authorization: `Bearer ${code}` },
    );
    expect(rejeu.status).toBeGreaterThanOrEqual(400);
    expect(await idsOps()).not.toContain(A);
  }, 60_000);

  it('is IDEMPOTENT and never an error: a second retire, and one for an order nobody knows, both answer inconnu', async () => {
    const encore = await ops('/fulfillment/order/retirer', { orderId: A });
    expect(encore.status).toBe(200);
    expect(encore.json).toMatchObject({ ok: true, status: 'inconnu' });
    const jamais = await ops('/fulfillment/order/retirer', { orderId: 'ord-jamais-vu' });
    expect(jamais.status).toBe(200);
    expect(jamais.json).toMatchObject({ ok: true, status: 'inconnu' });
  }, 60_000);

  it('a purged id can be REGISTERED AGAIN, and comes back a FRESH order — not the ghost of the old one', async () => {
    // Only the intake this time (no accept, no readiness, no delivery): what
    // is being proven is that NOTHING from the purged life re-attaches to the
    // id. He is clearing the board precisely so he can test again.
    const again = await call(
      '/fulfillment/order-confirmed',
      {
        name: 'order.confirmed.v1',
        envelope: {
          command_id: `ord-confirm-${A}-2`, correlation_id: `corr-${A}-2`,
          aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
        },
        payload: {
          orderId: A, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
          paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 10_000,
        },
      },
      { Authorization: `Bearer ${FULFILL_SECRET}` },
    );
    expect(again.status, again.text).toBe(200);
    expect(again.json).toMatchObject({ ok: true, status: 'registered' });

    const rows = (await ops('/fulfillment/orders', undefined, 'GET')).json['orders'] as Json[];
    const reborn = rows.find((o) => o['orderId'] === A);
    expect(reborn, 'the id must be re-registrable after a purge').toBeDefined();
    // A GHOST WOULD SHOW HERE: the relance he made, the acceptance, the
    // readiness and the delivery all belonged to the purged life. The row
    // must carry none of them.
    expect((reborn as Json)['relance']).toBeUndefined();
    expect((reborn as Json)['fulfillment']).toBeUndefined();
    const chezLui = (await call('/fulfillment/mine', undefined, { Authorization: `Bearer ${code}` }, 'GET'))
      .json['orders'] as Json[];
    const sien = chezLui.find((o) => o['orderId'] === A);
    expect(sien, 'and it is back on HIS board too').toBeDefined();
    expect((sien as Json)['fulfillment']).toBeUndefined();
  }, 60_000);

  it('THE DOOR: only the founder key opens the purge — the supplier code and the intake secret are refused', async () => {
    const parSupplier = await call('/fulfillment/order/retirer', { orderId: B }, { Authorization: `Bearer ${code}` });
    const parIntake = await call('/fulfillment/order/retirer', { orderId: B }, { Authorization: `Bearer ${FULFILL_SECRET}` });
    const sansCle = await call('/fulfillment/order/retirer', { orderId: B }, {});
    expect([parSupplier.status, parIntake.status, sansCle.status]).toEqual([401, 401, 401]);
    // …and B is still there after all three attempts.
    expect(await idsOps()).toContain(B);
    // A malformed body is refused by name, and removes nothing.
    const malforme = await ops('/fulfillment/order/retirer', { orderId: '' });
    expect(malforme.status).toBe(400);
    expect(await idsOps()).toContain(B);
  }, 60_000);
});
