import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ RAMASSAGE-VERIFY — the supplier door, through the REAL Worker ═══
 *
 * Founder (2026-08-09): « that screen should be on the supplier's console not
 * mine. » So the pickup check rides the supplier's OWN personal code into
 * THIS Worker, which proves the order is his and only then asks Séra —
 * server-side, over the intake secret no browser holds. This file drives the
 * deployed bundle (dist/worker/worker.mjs) with a live local Séra double.
 *
 * ⚠ THE DOUBLE IS CONTRACT-CERTIFIED to Séra's actual door
 * (sera: services/logistics-service, `POST /intake/ramassage/verify`, whose
 * bounds are pinned by that repo's own seam e2e): Bearer must be the intake
 * secret or 401; body must carry string command_id/orderId/code or 400; the
 * answer is ALWAYS `{ok:true, verdict:'confirme'|'non_confirme'}` — case and
 * separators forgiven on the code, characters not, and never an oracle.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const WRITE_SECRET = 'test-offer-write-secret-0011';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0011';
const OPS_SECRET = 'test-fulfillment-ops-secret-0011';
const PROGRESS_SECRET = 'test-progress-write-secret-0011';
const SERA_SECRET = 'test-sera-intake-secret-0011';
const T0 = '2026-08-09T08:00:00.000Z';
const PV = 'pv-ramv-001';
const SUPPLIER_A = 'supplier-ramv-001';
const SUPPLIER_B = 'supplier-ramv-002';
const ORDER = 'ord-ramv-0001';

/** What each course's code IS, as Séra's book would hold it. */
const codesRamassage: Record<string, string> = { [ORDER]: 'KVN-38M' };
/** Every verify request the double received, verbatim. */
const verifyPosts: { auth: string | null; body: string }[] = [];
let seraMode: 'ok' | 'down' | 'garbage' = 'ok';
let seraServer: Server;
let seraBase = '';

const norm = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

beforeAll(async () => {
  seraServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      // The readiness outbox shares this base; answer it 200 so its retries
      // stay quiet, and judge ONLY the verify door here.
      if (req.url !== '/intake/ramassage/verify') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, applied: true }));
        return;
      }
      verifyPosts.push({ auth: req.headers['authorization'] ?? null, body });
      if (seraMode === 'down') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
        return;
      }
      if (seraMode === 'garbage') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('<html>not json</html>');
        return;
      }
      // — the certified bounds of the real door —
      if (req.headers['authorization'] !== `Bearer ${SERA_SECRET}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* malformed */ }
      const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
      if (parsed === null || !isStr(parsed['command_id']) || !isStr(parsed['orderId']) || !isStr(parsed['code'])) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'malformed' }));
        return;
      }
      const attendu = codesRamassage[parsed['orderId']];
      const verdict = attendu !== undefined && norm(parsed['code']) === norm(attendu) ? 'confirme' : 'non_confirme';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, verdict }));
    });
  });
  await new Promise<void>((resolve) => seraServer.listen(0, '127.0.0.1', resolve));
  seraBase = `http://127.0.0.1:${(seraServer.address() as AddressInfo).port}`;
});

const persist = mkdtempSync(join(tmpdir(), 'ramv-'));
const persistUnwired = mkdtempSync(join(tmpdir(), 'ramv-unwired-'));
let mf: Miniflare;
let unwired: Miniflare;
let codeA = '';
let codeB = '';

function makeMf(persistDir: string, wired: boolean): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persistDir,
    bindings: {
      OFFER_WRITE_SECRET: WRITE_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      FULFILLMENT_OPS_SECRET: OPS_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      ...(wired ? { SERA_INTAKE_BASE: seraBase, SERA_INTAKE_SECRET: SERA_SECRET } : {}),
    },
    serviceBindings: {
      STOREFRONT: async () => Response.json({ ok: true, status: 'recorded' }),
    },
  });
}

afterAll(async () => {
  await mf?.dispose();
  await unwired?.dispose();
  await new Promise<void>((resolve) => seraServer.close(() => resolve()));
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistUnwired, { recursive: true, force: true });
});

async function post(m: Miniflare, path: string, body: unknown, headers: Record<string, string>) {
  const res = await m.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

const verifier = (m: Miniflare, bearer: string, orderId: string, dit: string) =>
  post(m, '/fulfillment/ramassage/verify', { orderId, codeRamassage: dit }, {
    ...(bearer === '' ? {} : { Authorization: `Bearer ${bearer}` }),
  });

/** Seed one product + one PAID order for supplier A, and mint both codes. */
async function seedWorld(m: Miniflare): Promise<void> {
  codeA = (await post(m, '/fulfillment/supplier-code', { supplierId: SUPPLIER_A }, {
    Authorization: `Bearer ${OPS_SECRET}`,
  })).json['code'] as string;
  codeB = (await post(m, '/fulfillment/supplier-code', { supplierId: SUPPLIER_B }, {
    Authorization: `Bearer ${OPS_SECRET}`,
  })).json['code'] as string;
  expect((await post(m, '/offers', {
    commandId: 'seed-ramv-1',
    offerId: 'offer-ramv-1',
    product: {
      id: PV, supplierId: SUPPLIER_A, version: 1, name: 'Bogolan teint (ramassage)',
      productCode: 'FASO-0042', facts: {}, category: 'fashion_bags_fabrics',
      zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: PV, basePrice: 8_000, resellerCommission: 800,
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 3,
    asOf: T0,
  }, { 'X-Write-Key': WRITE_SECRET })).status).toBe(200);
  const confirmed = await post(m, '/fulfillment/order-confirmed', {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: `ord-confirm-${ORDER}`, correlation_id: `corr-${ORDER}`,
      aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
    },
    payload: {
      orderId: ORDER, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
      paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
    },
  }, { Authorization: `Bearer ${FULFILL_SECRET}` });
  expect(confirmed.status, confirmed.text).toBe(200);
}

describe('the supplier door proves the order is HIS, asks Séra, and relays only the verdict', () => {
  it('his own order + the said code → Séra is asked with the intake bearer and exactly {code, command_id, orderId}; both verdicts come back verbatim', async () => {
    mf = makeMf(persist, true);
    unwired = makeMf(persistUnwired, false);
    await seedWorld(mf);
    seraMode = 'ok';
    verifyPosts.length = 0;

    // said correctly — lowercase, spaced: Séra's own normalisation forgives it
    const bon = await verifier(mf, codeA, ORDER, 'kvn 38m');
    expect(bon.status, bon.text).toBe(200);
    expect(bon.json).toEqual({ ok: true, verdict: 'confirme' });
    // said wrong — the verdict names the refusal, and the door relays it as-is
    const faux = await verifier(mf, codeA, ORDER, 'AAA-AAA');
    expect(faux.json).toEqual({ ok: true, verdict: 'non_confirme' });

    expect(verifyPosts).toHaveLength(2);
    const sent = verifyPosts[0]!;
    expect(sent.auth).toBe(`Bearer ${SERA_SECRET}`);
    const fact = JSON.parse(sent.body) as Record<string, unknown>;
    expect(Object.keys(fact).sort()).toEqual(['code', 'command_id', 'orderId']);
    expect(fact['orderId']).toBe(ORDER);
    expect(fact['code']).toBe('kvn 38m');
  });

  it('⚠ the supplier’s PERSONAL code never crosses to Séra — not in any byte of any relay', () => {
    for (const p of verifyPosts) {
      expect(p.body.includes(codeA), 'personal code A leaked to Séra').toBe(false);
      expect(p.body.includes(codeB), 'personal code B leaked to Séra').toBe(false);
      expect(p.auth?.includes(codeA), 'personal code as bearer to Séra').toBe(false);
    }
  });

  it('a FOREIGN order answers not_yours_or_unknown — and Séra is never even asked', async () => {
    const avant = verifyPosts.length;
    const vol = await verifier(mf, codeB, ORDER, 'KVN-38M');
    expect(vol.status).toBe(404);
    expect(vol.json).toEqual({ ok: false, reason: 'not_yours_or_unknown' });
    // an unknown order reads identically — no oracle for who supplies what
    const inconnu = await verifier(mf, codeA, 'ord-ramv-jamais', 'KVN-38M');
    expect(inconnu.status).toBe(404);
    expect(inconnu.json).toEqual({ ok: false, reason: 'not_yours_or_unknown' });
    expect(verifyPosts.length, 'ownership is proven BEFORE Séra is asked').toBe(avant);
  });

  it('every wrong credential is the one uniform 401, and none of them reach Séra: no bearer, a wrong one, and every OTHER secret this worker knows', async () => {
    const avant = verifyPosts.length;
    for (const bearer of ['', 'BF-WRNG-WRNG-WRNG-WRNG', WRITE_SECRET, OPS_SECRET, FULFILL_SECRET, SERA_SECRET]) {
      const res = await verifier(mf, bearer, ORDER, 'KVN-38M');
      expect(res.status, bearer === '' ? '(none)' : bearer).toBe(401);
    }
    expect(verifyPosts.length).toBe(avant);
  });

  it('a malformed ask is refused at THIS door: no code, a blank one, an overlong one, a smuggled extra field', async () => {
    const avant = verifyPosts.length;
    const arms: unknown[] = [
      { orderId: ORDER },
      { orderId: ORDER, codeRamassage: '   ' },
      { orderId: ORDER, codeRamassage: 'A'.repeat(33) },
      { orderId: ORDER, codeRamassage: 'KVN-38M', extra: 'non' },
    ];
    for (const body of arms) {
      const res = await post(mf, '/fulfillment/ramassage/verify', body, { Authorization: `Bearer ${codeA}` });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json).toEqual({ ok: false, reason: 'malformed' });
    }
    expect(verifyPosts.length).toBe(avant);
  });

  it('an unreachable Séra is NEVER dressed as a verdict — down, garbage, and unwired all answer sera_unreachable', async () => {
    seraMode = 'down';
    const down = await verifier(mf, codeA, ORDER, 'KVN-38M');
    expect(down.status).toBe(503);
    expect(down.json).toEqual({ ok: false, reason: 'sera_unreachable' });

    seraMode = 'garbage';
    const garbage = await verifier(mf, codeA, ORDER, 'KVN-38M');
    expect(garbage.status).toBe(503);
    expect(garbage.json).toEqual({ ok: false, reason: 'sera_unreachable' });
    seraMode = 'ok';

    // the deploy-order case: Boutik+ shipped before Séra's door is configured
    await seedWorld(unwired);
    const jamais = await verifier(unwired, codeA, ORDER, 'KVN-38M');
    expect(jamais.status).toBe(503);
    expect(jamais.json).toEqual({ ok: false, reason: 'sera_unreachable' });
  });
});
