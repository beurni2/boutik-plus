import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * CLE-FONDATEUR-1 (AUDIT-B+2 F-01, F-34, F-35, F-38) — THE PRODUCT DOORS OPEN
 * ONLY TO THE FOUNDER'S TYPED KEY, on real workerd.
 *
 * Before: publishing, attaching photos, deleting and listing products all
 * opened to `X-Write-Key` — a shared key built into the founder's console page
 * (the supplier-#2 credential precondition of LISTER-POUR). Now those four doors
 * open to exactly one credential: the founder's operations key, typed on his
 * own device (`Authorization: Bearer`, FULFILLMENT_OPS_SECRET) — the key that
 * already guards his orders, stock and supplier codes. The old write key opens
 * nothing, even with the old secret still configured on the Worker.
 *
 * And three guards on the create itself: a new product can no longer take over
 * another product's identity (F-34), the server refuses a commission that
 * leaves the supplier nothing (F-35), and a malformed create is a named 400
 * the browser can read, never an unnamed 500 without CORS (F-38).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'cle-fondateur-'));
const OPS = 'test-fulfillment-ops-secret-0201';
const ANCIENNE_CLE = 'test-offer-write-secret-0201';
const READ = 'test-supply-read-secret-0201';
const INTAKE = 'test-fulfillment-write-secret-0201';
const SUPPLIER = 'supplier-cle-alpha';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  // The OLD write secret stays configured on purpose: a door that still read it
  // would open to the old key, and this suite would see it.
  bindings: {
    FULFILLMENT_OPS_SECRET: OPS,
    OFFER_WRITE_SECRET: ANCIENNE_CLE,
    SUPPLY_READ_SECRET: READ,
    FULFILLMENT_WRITE_SECRET: INTAKE,
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

async function call(path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(init.headers ?? {}) },
    ...(init.body === undefined ? {} : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json, cors: res.headers.get('Access-Control-Allow-Origin') };
}

const cle = { Authorization: `Bearer ${OPS}` };

function seed(offerId: string, pv: string, over: { basePrice?: number; resellerCommission?: number; name?: string } = {}) {
  return {
    commandId: `cmd-${offerId}`,
    offerId,
    product: {
      id: pv, supplierId: SUPPLIER, version: 1, name: over.name ?? 'Bogolan du fondateur',
      productCode: `FASO-${pv.slice(-4)}`, facts: {}, category: 'fashion_bags_fabrics',
      zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: pv, basePrice: over.basePrice ?? 8_000, resellerCommission: over.resellerCommission ?? 800,
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2027-12-31T00:00:00.000Z',
    },
    available: 3,
    asOf: '2026-09-26T08:00:00.000Z',
  };
}

describe('CLE-FONDATEUR — the product doors open to the founder\'s typed key, and to nothing else', () => {
  let codeFournisseur = '';

  it('sets the stage: the supplier holds a code (minted with the founder\'s key)', async () => {
    const res = await call('/fulfillment/supplier-code', { method: 'POST', headers: cle, body: { supplierId: SUPPLIER } });
    expect(res.status, res.text).toBe(200);
    codeFournisseur = res.json['code'] as string;
  });

  it('the founder\'s key PUBLISHES, LISTS, ATTACHES and DELETES', async () => {
    const cree = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-cle-1', 'pv-cle-0001') });
    expect(cree.status, cree.text).toBe(200);
    expect(cree.json['status'], cree.text).toBe('created');

    const liste = await call(`/offers?supplierId=${SUPPLIER}`, { headers: cle });
    expect(liste.status, liste.text).toBe(200);
    expect((liste.json['items'] as { offerId: string }[]).map((i) => i.offerId)).toContain('offer-cle-1');

    const photos = await call('/offers/assets', {
      method: 'POST',
      headers: cle,
      body: {
        commandId: 'att-cle-1',
        offerId: 'offer-cle-1',
        assets: {
          heroSquare: { ref: 'media/11111111-1111-4111-8111-111111111111', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
          heroVertical: { ref: 'media/11111111-1111-4111-8111-111111111111', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
          proof: { ref: 'media/22222222-2222-4222-8222-222222222222', sha256: 'b'.repeat(64), mimeType: 'image/jpeg' },
          detailRefs: [],
          masterRef: { ref: 'private/33333333-3333-4333-8333-333333333333', sha256: 'c'.repeat(64), mimeType: 'image/jpeg' },
        },
      },
    });
    expect(photos.status, photos.text).toBeLessThan(500);
    expect(photos.status, photos.text).not.toBe(401);

    const cree2 = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-cle-2', 'pv-cle-0002') });
    expect(cree2.json['status'], cree2.text).toBe('created');
    const efface = await call('/offers/delete', { method: 'POST', headers: cle, body: { commandId: 'del-cle-2', offerId: 'offer-cle-2', productVersionId: 'pv-cle-0002' } });
    expect(efface.status, efface.text).toBe(200);
    const apres = await call(`/offers?supplierId=${SUPPLIER}`, { headers: cle });
    expect((apres.json['items'] as { offerId: string }[]).map((i) => i.offerId)).not.toContain('offer-cle-2');
  });

  it('the OLD bundled write key opens NOTHING — publish, list, attach, delete all refuse with the one uniform 401, and nothing moves', async () => {
    const ancienne = { 'X-Write-Key': ANCIENNE_CLE };
    const vide = await call('/offers', { method: 'POST', body: seed('offer-cle-x', 'pv-cle-000x') });
    expect(vide.status).toBe(401);
    const essais = [
      await call('/offers', { method: 'POST', headers: ancienne, body: seed('offer-cle-x', 'pv-cle-000x') }),
      await call(`/offers?supplierId=${SUPPLIER}`, { headers: ancienne }),
      await call('/offers/assets', { method: 'POST', headers: ancienne, body: { commandId: 'x', offerId: 'offer-cle-1', assets: {} } }),
      await call('/offers/delete', { method: 'POST', headers: ancienne, body: { commandId: 'del-x', offerId: 'offer-cle-1', productVersionId: 'pv-cle-0001' } }),
    ];
    for (const r of essais) {
      expect(r.status, r.text).toBe(401);
      expect(r.text).toBe(vide.text);
    }
    // nothing moved: offer-cle-1 is still listed, offer-cle-x was never created
    const liste = await call(`/offers?supplierId=${SUPPLIER}`, { headers: cle });
    const ids = (liste.json['items'] as { offerId: string }[]).map((i) => i.offerId);
    expect(ids).toContain('offer-cle-1');
    expect(ids).not.toContain('offer-cle-x');
  });

  it('no OTHER credential opens them either: a supplier\'s code, Shop+\'s read and intake secrets, the old key as a Bearer', async () => {
    for (const bearer of [codeFournisseur, READ, INTAKE, ANCIENNE_CLE, `${OPS}x`]) {
      const h = { Authorization: `Bearer ${bearer}` };
      expect((await call('/offers', { method: 'POST', headers: h, body: seed('offer-cle-y', 'pv-cle-000y') })).status).toBe(401);
      expect((await call(`/offers?supplierId=${SUPPLIER}`, { headers: h })).status).toBe(401);
      expect((await call('/offers/delete', { method: 'POST', headers: h, body: { commandId: 'del-y', offerId: 'offer-cle-1', productVersionId: 'pv-cle-0001' } })).status).toBe(401);
    }
  });

  it('the browser may send the key: the preflight names Authorization and no longer names X-Write-Key', async () => {
    const pre = await mf.dispatchFetch('http://o/offers', { method: 'OPTIONS' });
    const allow = pre.headers.get('Access-Control-Allow-Headers') ?? '';
    expect(allow).toContain('Authorization');
    expect(allow).not.toContain('X-Write-Key');
  });
});

describe('F-34 — a new product cannot take over another product\'s identity', () => {
  it('a second offer naming a LIVE product version is refused by name; the first keeps its identity, its price and its one row', async () => {
    const pv = 'pv-cle-0034';
    const un = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-34-a', pv, { name: 'Pagne original', basePrice: 9_000 }) });
    expect(un.json['status'], un.text).toBe('created');
    const deux = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-34-b', pv, { name: 'Autre produit', basePrice: 20_000 }) });
    // refused BY NAME, in the command path's own shape (a 200 carrying the
    // decision, like every other create refusal the app already reads)
    expect(deux.status, deux.text).toBe(200);
    expect(deux.json['status']).toBe('refused');
    expect(deux.json['reason']).toBe('product_version_taken');

    // Shop+'s read still serves the ORIGINAL, and the list shows ONE row for it
    const lu = await call(`/supply-projection/${pv}`, { headers: { Authorization: `Bearer ${READ}` } });
    expect(lu.status, lu.text).toBe(200);
    expect(lu.text).toContain('9000');
    expect(lu.text).not.toContain('20000');
    const liste = await call(`/offers?supplierId=${SUPPLIER}`, { headers: cle });
    const rangs = (liste.json['items'] as { offerId: string; productVersionId: string }[]).filter((i) => i.productVersionId === pv);
    expect(rangs.map((r) => r.offerId)).toEqual(['offer-34-a']);
  });

  it('the SAME offer asked again is still an idempotent replay (the orphan repair keeps working)', async () => {
    const encore = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-34-a', 'pv-cle-0034', { name: 'Pagne original', basePrice: 9_000 }) });
    expect(encore.status, encore.text).toBe(200);
    expect(encore.json['status']).toBe('idempotent');
  });

  it('once the first product is DELETED, its version id may be listed again under a new offer', async () => {
    const efface = await call('/offers/delete', { method: 'POST', headers: cle, body: { commandId: 'del-34-a', offerId: 'offer-34-a', productVersionId: 'pv-cle-0034' } });
    expect(efface.status, efface.text).toBe(200);
    const nouveau = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-34-c', 'pv-cle-0034', { name: 'Pagne relisté' }) });
    expect(nouveau.json['status'], nouveau.text).toBe('created');
  });

  it('THE POINTER OBJECT ITSELF decides the race: put-if-absent, taken over only by naming a holder the router saw gone', async () => {
    // Driven directly on real workerd, because from outside the look-first
    // check always wins the race in this runtime (the test below) — and a
    // guard no request ever reaches would stay untested forever.
    const ns = await mf.getDurableObjectNamespace('OFFER');
    const ptr = ns.get(ns.idFromName('pv:pv-cle-ptr-0001'));
    const poser = async (body: Record<string, unknown>) => {
      const res = await ptr.fetch('https://do/pointer', { method: 'PUT', body: JSON.stringify(body) });
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    expect((await poser({ offerId: 'offer-ptr-a' })).status, 'first holder lands').toBe(200);
    expect((await poser({ offerId: 'offer-ptr-a' })).status, 'the same holder again is a replay').toBe(200);
    const vole = await poser({ offerId: 'offer-ptr-b' });
    expect(vole.status, 'another offer cannot take a held version').toBe(409);
    expect(vole.json['error']).toBe('product_version_taken');
    expect((await poser({ offerId: 'offer-ptr-b', remplace: 'offer-ptr-x' })).status, 'naming the WRONG holder takes nothing').toBe(409);
    expect((await poser({ offerId: 'offer-ptr-b', remplace: 'offer-ptr-a' })).status, 'naming the holder seen gone takes it').toBe(200);
    const lu = await ptr.fetch('https://do/pointer');
    expect(((await lu.json()) as { offerId: string }).offerId).toBe('offer-ptr-b');
  });

  it('a STALE pointer (its offer gone, the pointer left behind) may be taken by a new offer — through the public door', async () => {
    // A delete that names the wrong version drops the entry but not the
    // pointer: exactly the stale holder `remplace` exists for (verifier MINOR —
    // this path had no end-to-end proof).
    const pv = 'pv-cle-stale-01';
    const un = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-stale-a', pv, { name: 'Ancien' }) });
    expect(un.json['status'], un.text).toBe('created');
    const efface = await call('/offers/delete', {
      method: 'POST',
      headers: cle,
      body: { commandId: 'del-stale-a', offerId: 'offer-stale-a', productVersionId: 'pv-cle-pas-le-bon' },
    });
    expect(efface.status, efface.text).toBe(200);
    const deux = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-stale-b', pv, { name: 'Nouveau' }) });
    expect(deux.json['status'], deux.text).toBe('created');
    const liste = await call(`/offers?supplierId=${SUPPLIER}`, { headers: cle });
    const rangs = (liste.json['items'] as { offerId: string; productVersionId: string }[]).filter((i) => i.productVersionId === pv);
    expect(rangs.map((r) => r.offerId)).toEqual(['offer-stale-b']);
  });

  it('two creates for ONE version at the SAME instant: exactly one wins, the other is refused by name — never two faces', async () => {
    // The router's look-first check cannot see a create still in flight; the
    // pointer's own object decides (put-if-absent), so both racing creates
    // cannot land. Several rounds, because one lucky ordering proves nothing.
    for (let round = 0; round < 6; round += 1) {
      const pv = `pv-cle-race-${round}`;
      const [a, b] = await Promise.all([
        call('/offers', { method: 'POST', headers: cle, body: seed(`offer-race-${round}-a`, pv, { name: 'Course A' }) }),
        call('/offers', { method: 'POST', headers: cle, body: seed(`offer-race-${round}-b`, pv, { name: 'Course B' }) }),
      ]);
      const statuts = [a.json['status'], b.json['status']].sort();
      expect(statuts, `${a.text} | ${b.text}`).toEqual(['created', 'refused']);
      const refus = a.json['status'] === 'refused' ? a : b;
      expect(refus.json['reason']).toBe('product_version_taken');
      const liste = await call(`/offers?supplierId=${SUPPLIER}`, { headers: cle });
      const rangs = (liste.json['items'] as { productVersionId: string }[]).filter((i) => i.productVersionId === pv);
      expect(rangs, 'one version, one row').toHaveLength(1);
    }
  });
});

describe('F-35 — the server refuses a commission that leaves the supplier nothing', () => {
  it('commission above the price, and equal to it, are refused by name; nothing is created', async () => {
    for (const [offerId, pv, c] of [['offer-35-a', 'pv-cle-035a', 20_000], ['offer-35-b', 'pv-cle-035b', 5_000]] as const) {
      const r = await call('/offers', { method: 'POST', headers: cle, body: seed(offerId, pv, { basePrice: 5_000, resellerCommission: c }) });
      expect(r.status, r.text).toBe(200);
      expect(r.json['status'], r.text).toBe('refused');
      expect(r.json['reason']).toBe('commission_leaves_no_net');
      const lu = await call(`/supply-projection/${pv}`, { headers: { Authorization: `Bearer ${READ}` } });
      expect(lu.status).toBe(404);
    }
    // the boundary stays open just below it
    const ok = await call('/offers', { method: 'POST', headers: cle, body: seed('offer-35-c', 'pv-cle-035c', { basePrice: 5_000, resellerCommission: 4_999 }) });
    expect(ok.json['status'], ok.text).toBe('created');
  });
});

describe('F-38 — a malformed create is a named 400 the browser can read', () => {
  it('a product the schema refuses, and a create with no draft, answer 400 « malformed » WITH the CORS header — never an unnamed 500', async () => {
    const mauvaisProduit = seed('offer-38-a', 'pv-cle-038a') as unknown as { product: Record<string, unknown> };
    mauvaisProduit.product['version'] = 0; // canon: an integer ≥ 1
    const a = await call('/offers', { method: 'POST', headers: cle, body: mauvaisProduit });
    expect(a.status, a.text).toBe(400);
    expect(a.json['error']).toBe('malformed');
    expect(a.cors).toBe('*');

    const sansDraft = seed('offer-38-b', 'pv-cle-038b') as unknown as Record<string, unknown>;
    delete sansDraft['draft'];
    const b = await call('/offers', { method: 'POST', headers: cle, body: sansDraft });
    expect(b.status, b.text).toBe(400);
    expect(b.json['error']).toBe('malformed');
    expect(b.cors).toBe('*');
  });

  it('an EMPTY draft, and a price sent as text, are 400 « malformed » with CORS too — never the kernel\'s 500', async () => {
    const vide = seed('offer-38-c', 'pv-cle-038c') as unknown as Record<string, unknown>;
    vide['draft'] = {};
    const texte = seed('offer-38-d', 'pv-cle-038d') as unknown as { draft: Record<string, unknown> };
    texte.draft['basePrice'] = '9000';
    for (const corps of [vide, texte]) {
      const r = await call('/offers', { method: 'POST', headers: cle, body: corps });
      expect(r.status, r.text).toBe(400);
      expect(r.json['error']).toBe('malformed');
      expect(r.cors).toBe('*');
    }
    const liste = await call(`/offers?supplierId=${SUPPLIER}`, { headers: cle });
    const ids = (liste.json['items'] as { offerId: string }[]).map((i) => i.offerId);
    expect(ids).not.toContain('offer-38-c');
    expect(ids).not.toContain('offer-38-d');
  });
});
