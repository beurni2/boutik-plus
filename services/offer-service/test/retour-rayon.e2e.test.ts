import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ RETOUR-RAYON-1 — back on sale when the SUPPLIER confirms the return ═══
 *
 * AUDIT-B+2 F-36, founder ruling 2026-09-28: « back on sale when supplier
 * confirms it ». THE SEAM, on REAL workerd through the combined bundle, asking
 * the ledgers (the stock journal, the counter both roads read, his own list,
 * the waiting-parcel count) rather than believing any response.
 *
 * The audit's story: one sold, refused at the buyer's door. Before, the unit
 * went back on sale the moment the refusal was reported — while it was still
 * in the rider's bag, and for good if the parcel never came back. Now it stays
 * off sale until HE types the rider's return code, and then goes back once.
 *
 * ⚠ THE SÉRA DOUBLE is the one `retour-verify.e2e.test.ts` certifies against
 * Séra's actual `POST /intake/retour/verify` (Bearer = intake secret, body
 * {command_id, orderId, code}, answer ALWAYS {ok:true, verdict}). One course
 * per package: any article of a colis answers the course's code.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const WRITE_SECRET = 'test-offer-write-secret-rayon';
const FULFILL_SECRET = 'test-fulfillment-write-secret-rayon';
const OPS_SECRET = 'test-fulfillment-ops-secret-rayon';
const READ_SECRET = 'test-supply-read-secret-rayon';
const SERA_SECRET = 'test-sera-intake-secret-rayon';
const T0 = '2026-09-28T08:00:00.000Z';
const SUPPLIER = 'supplier-rayon-001';
const PV = 'pv-rayon-pagne';
const OFFER = 'offer-rayon-pagne';

/** Each course's return code, as Séra's book holds it (a colis is one course). */
const codesRetour: Record<string, string> = {
  'ord-ry-a': 'RTR-A1',
  'ord-ry-b': 'RTR-B2',
  'ord-ry-c': 'RTR-C3',
  'ord-ry-d1': 'RTR-D4',
  'ord-ry-d2': 'RTR-D4',
  'ord-ry-e': 'RTR-E5',
};
const norm = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
let seraServer: Server;
let seraBase = '';

beforeAll(async () => {
  seraServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url !== '/intake/retour/verify') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, applied: true }));
        return;
      }
      if (req.headers['authorization'] !== `Bearer ${SERA_SECRET}`) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, string>;
      const attendu = codesRetour[b['orderId'] ?? ''];
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, verdict: attendu !== undefined && norm(b['code'] ?? '') === norm(attendu) ? 'confirme' : 'non_confirme' }));
    });
  });
  await new Promise<void>((resolve) => seraServer.listen(0, '127.0.0.1', resolve));
  seraBase = `http://127.0.0.1:${(seraServer.address() as AddressInfo).port}`;
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persist,
    bindings: {
      OFFER_WRITE_SECRET: WRITE_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
      SUPPLY_READ_SECRET: READ_SECRET,
      SERA_INTAKE_BASE: seraBase,
      SERA_INTAKE_SECRET: SERA_SECRET,
    },
  });
  const minted = await post('/fulfillment/supplier-code', { supplierId: SUPPLIER }, `Bearer ${OPS_SECRET}`);
  expect(minted.status).toBe(200);
  code = minted.json['code'] as string;
  const seeded = await post('/offers', {
    commandId: 'seed-rayon',
    offerId: OFFER,
    product: {
      id: PV, supplierId: SUPPLIER, version: 1, name: 'Pagne tissé (rayon)', productCode: 'RAYON-1', facts: {},
      category: 'fashion_bags_fabrics', zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    draft: { productVersionId: PV, basePrice: 10_000, resellerCommission: 1_000, eligibleVariants: [], zones: [], effective: '2026-07-01T00:00:00.000Z', expiry: '2027-12-31T00:00:00.000Z' },
    available: 10,
    asOf: T0,
  }, `Bearer ${OPS_SECRET}`);
  expect(seeded.status).toBe(200);
});

const persist = mkdtempSync(join(tmpdir(), 'retour-rayon-'));
let mf: Miniflare;
let code = '';

afterAll(async () => {
  await mf?.dispose();
  await new Promise<void>((resolve) => seraServer.close(() => resolve()));
  rmSync(persist, { recursive: true, force: true });
});

async function post(path: string, body: unknown, auth: string) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}
async function get(path: string, auth: string) {
  const res = await mf.dispatchFetch(`http://o${path}`, { headers: { Authorization: auth } });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const payer = async (orderId: string, pkg?: { packageId: string; orderIds: string[] }) => {
  const r = await post('/fulfillment/order-confirmed', {
    name: 'order.confirmed.v1',
    envelope: { command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1' },
    payload: {
      orderId, productVersionId: PV, offerVersion: '1', paymentMode: 'FULL_PREPAY', paidAt: T0, zoneTo: 'Gounghin', sellerBasePrice: 10_000,
      ...(pkg !== undefined ? { package: pkg } : {}),
    },
  }, `Bearer ${FULFILL_SECRET}`);
  expect(r.status, r.text).toBe(200);
};
/** Séra's door fact, as Shop+ relays it verbatim. */
const refuserALaPorte = (orderId: string, faultClass: string) =>
  post('/fulfillment/delivery-refused', {
    name: 'delivery.refused.v1',
    envelope: { command_id: `door-refusal-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'sera:custody', serverTime: T0, version: 'v1' },
    payload: { order_id: orderId, task_id: `task-${orderId}`, family: 'return', reason_code: 'change_of_mind', fault_class: faultClass, fee_retained: true },
  }, `Bearer ${FULFILL_SECRET}`);
const livrer = (orderId: string) =>
  post('/fulfillment/delivered', {
    name: 'delivery.validated.v1',
    envelope: { command_id: `delivered-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 12, actor: 'sera:custody', serverTime: T0, version: 'v1' },
    payload: { order_id: orderId, task_id: `task-${orderId}`, result: 'validated', settlement_eligibility: true },
  }, `Bearer ${FULFILL_SECRET}`);
/** HIS act: the rider's return code, typed on his page. */
const confirmerRetour = (orderId: string, dit: string) =>
  post('/fulfillment/retour/verify', { orderId, codeRetour: dit }, `Bearer ${code}`);

type Row = { seq: number; kind: string; from: number; to: number; orderId?: string };
const journal = async () => (await get(`/offers/journal?offerId=${OFFER}`, `Bearer ${OPS_SECRET}`)).json as { available: number; rows: Row[] };
const rendus = async (orderId: string) => (await journal()).rows.filter((r) => r.kind === 'rendu' && r.orderId === orderId);
const projection = async () => ((await get(`/supply-projection/${PV}`, `Bearer ${READ_SECRET}`)).json as { value?: { available?: number } }).value?.available;
const attente = async () => (await get(`/offers/stock/attente?offerId=${OFFER}`, `Bearer ${OPS_SECRET}`)).json['enAttente'];
async function saLigne(orderId: string): Promise<Record<string, unknown> | undefined> {
  const r = await get('/fulfillment/mine', `Bearer ${code}`);
  const o = (r.json['orders'] as Record<string, unknown>[]).find((x) => x['orderId'] === orderId);
  return o?.['fulfillment'] as Record<string, unknown> | undefined;
}
/** The unit goes back through the book's own ladder (its alarm): the ledger is asked until it says so. */
async function attendreRendu(orderId: string): Promise<Row[]> {
  for (let i = 0; i < 60; i += 1) {
    const r = await rendus(orderId);
    if (r.length > 0) return r;
    await new Promise((res) => setTimeout(res, 50));
  }
  return rendus(orderId);
}

describe('RETOUR-RAYON-1 — refused at the door, back on sale only when HE confirms the return (the audit\'s story, on the real worker)', () => {
  it('sold and refused at the door: nothing goes back on sale — the counter both roads read holds, and it waits for his return code', async () => {
    await payer('ord-ry-a');
    expect((await journal()).available).toBe(9);
    const r = await refuserALaPorte('ord-ry-a', 'buyer');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, status: 'restock_on_return' });
    expect((await journal()).available).toBe(9);
    expect(await projection()).toBe(9);
    expect(await rendus('ord-ry-a')).toEqual([]);
    // his list says what happened and what puts it back
    expect(await saLigne('ord-ry-a')).toMatchObject({ refuseePorteAt: T0, remiseEnVente: 'au_retour' });
  });

  it('it left his hands even though he never confirmed the pickup: the stock count does not take it off his shelf', async () => {
    expect(await attente()).toBe(0);
  });

  it('HE types the rider\'s return code: the unit goes back on sale ONCE — the counter, the projection, a `rendu` row naming the order', async () => {
    const r = await confirmerRetour('ord-ry-a', 'rtr-a1');
    expect(r.json).toEqual({ ok: true, verdict: 'confirme' });
    const lignes = await attendreRendu('ord-ry-a');
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ kind: 'rendu', from: 9, to: 10, orderId: 'ord-ry-a' });
    expect((await journal()).available).toBe(10);
    expect(await projection()).toBe(10);
    expect(await saLigne('ord-ry-a')).toMatchObject({ refuseePorteAt: T0, remiseEnVente: 'faite' });
  });

  it('a re-typed code and a re-delivered refusal move nothing a second time', async () => {
    expect((await confirmerRetour('ord-ry-a', 'RTR-A1')).json).toEqual({ ok: true, verdict: 'confirme' });
    const r = await refuserALaPorte('ord-ry-a', 'buyer');
    expect(r.json).toEqual({ ok: true, status: 'restocked' });
    await new Promise((res) => setTimeout(res, 300));
    expect(await rendus('ord-ry-a')).toHaveLength(1);
    expect((await journal()).available).toBe(10);
  });

  it('a WRONG return code puts nothing back', async () => {
    await payer('ord-ry-e');
    await refuserALaPorte('ord-ry-e', 'buyer');
    expect((await confirmerRetour('ord-ry-e', 'RTR-ZZ')).json).toEqual({ ok: true, verdict: 'non_confirme' });
    await new Promise((res) => setTimeout(res, 300));
    expect(await rendus('ord-ry-e')).toEqual([]);
    expect((await journal()).available).toBe(9);
    expect(await saLigne('ord-ry-e')).toMatchObject({ remiseEnVente: 'au_retour' });
    // the right one does
    expect((await confirmerRetour('ord-ry-e', 'RTR-E5')).json['verdict']).toBe('confirme');
    expect(await attendreRendu('ord-ry-e')).toHaveLength(1);
    expect((await journal()).available).toBe(10);
  });
});

describe('RETOUR-RAYON-1 — the edges', () => {
  it('HIS confirmation lands BEFORE the refusal fact (Shop+ relays on its own clock): the unit goes back when the fact arrives', async () => {
    await payer('ord-ry-b');
    expect((await journal()).available).toBe(9);
    expect((await confirmerRetour('ord-ry-b', 'RTR-B2')).json['verdict']).toBe('confirme');
    await new Promise((res) => setTimeout(res, 300));
    expect(await rendus('ord-ry-b')).toEqual([]);
    const r = await refuserALaPorte('ord-ry-b', 'buyer');
    expect(r.json).toEqual({ ok: true, status: 'restock_queued' });
    expect(await attendreRendu('ord-ry-b')).toHaveLength(1);
    expect((await journal()).available).toBe(10);
  });

  it('a SELLER-fault refusal (the item itself was wrong) never goes back on sale, even returned — the policy is unchanged, only its moment moved', async () => {
    await payer('ord-ry-c');
    const r = await refuserALaPorte('ord-ry-c', 'seller');
    expect(r.json).toEqual({ ok: true, status: 'no_restock', faultClass: 'seller' });
    expect((await confirmerRetour('ord-ry-c', 'RTR-C3')).json['verdict']).toBe('confirme');
    await new Promise((res) => setTimeout(res, 300));
    expect(await rendus('ord-ry-c')).toEqual([]);
    expect((await journal()).available).toBe(9);
    const f = await saLigne('ord-ry-c');
    expect(f?.['refuseePorteAt']).toBe(T0);
    expect(f?.['returnedAt']).toBeDefined();
    expect(f?.['remiseEnVente']).toBeUndefined();
  });

  it('a colis: one article delivered, one refused at the door — the return code (typed on the DELIVERED one\'s card) puts back only the refused one', async () => {
    const pkg = { packageId: 'col-rayon-d', orderIds: ['ord-ry-d1', 'ord-ry-d2'] };
    await payer('ord-ry-d1', pkg);
    await payer('ord-ry-d2', pkg);
    expect((await journal()).available).toBe(7);
    expect((await livrer('ord-ry-d1')).status).toBe(200);
    expect((await refuserALaPorte('ord-ry-d2', 'buyer')).json['status']).toBe('restock_on_return');
    expect((await confirmerRetour('ord-ry-d1', 'RTR-D4')).json['verdict']).toBe('confirme');
    expect(await attendreRendu('ord-ry-d2')).toHaveLength(1);
    expect(await rendus('ord-ry-d1')).toEqual([]);
    expect((await journal()).available).toBe(8);
    // the refused article came back even though his pickup was never confirmed
    expect(await saLigne('ord-ry-d2')).toMatchObject({ returnedAt: expect.any(String), remiseEnVente: 'faite' });
    expect((await saLigne('ord-ry-d1'))?.['remiseEnVente']).toBeUndefined();
  });

  it('the door stays Shop+\'s: no intake key, no fact', async () => {
    const res = await mf.dispatchFetch('http://o/fulfillment/delivery-refused', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });
});
