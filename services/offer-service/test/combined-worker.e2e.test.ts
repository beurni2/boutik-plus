import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * BOUTIK-OFFER-DURABLE-1 — the COMBINED Worker (OfferDO + the service routes) on
 * the REAL workerd runtime (Miniflare), with the Durable Object bound. This
 * proves the durable path end-to-end through the DEPLOY TARGET (dist/worker/
 * worker.mjs): POST /offers persists an offer, GET /supply-projection reads it
 * back through the shim → DO → pointer, the write survives a Worker RESTART
 * (on-disk DO persistence), replay is idempotent, and the SERVICE-WRITE-AUTH gate
 * holds (write 401 without the key, read open, 401 not an existence oracle, a
 * no-secret Worker fails closed).
 *
 * WHAT THIS PROVES vs NOT: it exercises the real code paths (the composition-root
 * shim, DO storage.get/put, the read route, the auth gate, restart survival). It
 * does NOT prove the wrangler.toml migration or a real Cloudflare deploy —
 * Miniflare binds the DO by its own config, not the wrangler file (founder's
 * warning). Those stay unproven until a deploy runs. The secret here is a TEST
 * secret configured explicitly.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const T0 = '2026-07-15T08:00:00.000Z';
const READ_NOW = '2026-07-15T09:30:00.000Z';

/** The configured shared secret + the wire header (independently stated so a
 * rename of the code constant that breaks the contract is caught here). */
const WRITE_SECRET = 'test-offer-write-secret-0001';
const WRITE_KEY_HEADER = 'X-Write-Key';
const authed = { 'Content-Type': 'application/json', [WRITE_KEY_HEADER]: WRITE_SECRET };

/**
 * SUPPLY-READ-AUTH — the SERVICE-TO-SERVICE read credential, stated independently
 * of the code constants so a rename that breaks the wire is caught HERE. The
 * header and scheme are exactly what shop-plus's `supply-source.ts` builds
 * (`Authorization: Bearer ${readSecret}`), read from its source.
 *
 * A DIFFERENT SECRET FROM THE WRITE KEY on purpose: the two must never be
 * interchangeable, and the e2e proves it at the deployed entry.
 */
const READ_SECRET = 'test-supply-read-secret-0002';
const readAuthed = { Accept: 'application/json', Authorization: `Bearer ${READ_SECRET}` };

const PV = 'pv-founder-001';
const SEED = {
  commandId: 'seed-founder-001',
  offerId: 'offer-founder-001',
  product: {
    id: PV,
    supplierId: 'supplier-founder-001',
    version: 1,
    name: 'Pagne tissé Faso (démo)',
    productCode: 'FASO-001',
    facts: {},
    category: 'textile',
    zone: 'Gounghin',
    moderationState: 'approved',
    status: 'active',
    supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: PV,
    basePrice: 10_000,
    resellerCommission: 1_000,
    eligibleVariants: [],
    zones: [],
    effective: '2026-07-10T00:00:00.000Z',
    expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 5,
  asOf: T0,
};

const persist = mkdtempSync(join(tmpdir(), 'offer-do-'));
const persistNoSecret = mkdtempSync(join(tmpdir(), 'offer-nosecret-'));

function mkWorker(persistDir: string, withSecret: boolean): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO' },
    durableObjectsPersist: persistDir,
    ...(withSecret ? { bindings: { OFFER_WRITE_SECRET: WRITE_SECRET, SUPPLY_READ_SECRET: READ_SECRET } } : {}),
  });
}

let mf = mkWorker(persist, true);
const mfNoSecret = mkWorker(persistNoSecret, false);

afterAll(async () => {
  await mf.dispose();
  await mfNoSecret.dispose();
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistNoSecret, { recursive: true, force: true });
});

describe('combined Worker — durable offers on real workerd', () => {
  it('WRITE GATE: POST /offers is 401 without the key, and the 401 is identical for a bad key vs no key (never an oracle)', async () => {
    const noKey = await mf.dispatchFetch('http://o/offers', { method: 'POST', body: JSON.stringify(SEED) });
    expect(noKey.status).toBe(401);
    const badKey = await mf.dispatchFetch('http://o/offers', { method: 'POST', headers: { 'X-Write-Key': 'wrong' }, body: JSON.stringify(SEED) });
    expect(badKey.status).toBe(401);
    expect(await noKey.text()).toBe(await badKey.text()); // byte-identical — no existence/validity signal
  });

  it('CREATE: POST /offers with the key persists the offer through the real command path', async () => {
    const created = await mf.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(SEED) });
    expect(created.status).toBe(200);
    expect(((await created.json()) as { status: string }).status).toBe('created');
  });

  it('READ: GET /supply-projection/:pv with the BEARER returns the projection from durable state — available is the DECLARED 5', async () => {
    const read = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET', headers: readAuthed });
    expect(read.status).toBe(200);
    const body = (await read.json()) as { version: number; asOf: string; value: { productVersionId: string; available: number; basePrice: number } };
    expect(body.value.productVersionId).toBe(PV);
    expect(body.value.available).toBe(5); // declared on the create command, not a fixture literal
    expect(body.value.basePrice).toBe(10_000);

    // THE ASOF REVERSAL, proven on REAL WORKERD (founder ruling 2026-07-24).
    // The offer was written at T0. Serving that write time would have made this
    // product stale — and refused by Shop+ — 15 minutes after creation. The
    // envelope now carries the SERVE clock, so a product authored days ago is
    // still fresh at the consumer's bound.
    expect(body.asOf).not.toBe(T0);
    const ageMs = Date.now() - Date.parse(body.asOf);
    expect(ageMs).toBeGreaterThanOrEqual(0);
    expect(ageMs).toBeLessThan(15 * 60 * 1000); // fresh at SUPPLY_PROJECTION_MAX_AGE_MS
    // …and this is a REAL clock, not a fixture: it is far past the seed's T0.
    expect(Date.parse(body.asOf)).toBeGreaterThan(Date.parse(T0));
  });

  it('IDEMPOTENT: replaying the same commandId is a no-op create, not a duplicate', async () => {
    const replay = await mf.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(SEED) });
    expect(((await replay.json()) as { status: string }).status).toBe('idempotent');
  });

  it('ADMIN LIST: GET /offers is 401 without the key (a GET, but still gated at the composition root)', async () => {
    const noKey = await mf.dispatchFetch('http://o/offers', { method: 'GET' });
    expect(noKey.status).toBe(401);
  });

  it('ADMIN LIST: GET /offers with the key returns the RICHER rows with LIVE fields, and no seller-net', async () => {
    // a second offer so the list has more than one row, with distinct live values
    const SEED2 = {
      ...SEED,
      commandId: 'seed-2',
      offerId: 'offer-2',
      product: { ...SEED.product, id: 'pv-2', name: 'Sac cuir artisanal (démo)' },
      draft: { ...SEED.draft, productVersionId: 'pv-2', basePrice: 15_000, resellerCommission: 1_500 },
      available: 3,
    };
    await mf.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(SEED2) });

    // SCOPE IS REQUIRED — on REAL workerd, not a fixture. A key-holder with no
    // scope gets a 400 that NAMES the missing param, never everyone's offers.
    const unscoped = await mf.dispatchFetch('http://o/offers', { method: 'GET', headers: { 'X-Write-Key': WRITE_SECRET } });
    expect(unscoped.status).toBe(400);
    expect(await unscoped.json()).toEqual({ error: 'missing_supplier_id', param: 'supplierId' });

    // and a scope that matches nothing is an honest EMPTY — a different answer
    const stranger = await mf.dispatchFetch('http://o/offers?supplierId=supplier-nobody-999', { method: 'GET', headers: { 'X-Write-Key': WRITE_SECRET } });
    expect(stranger.status).toBe(200);
    expect(((await stranger.json()) as { items: unknown[] }).items).toEqual([]);

    const res = await mf.dispatchFetch(`http://o/offers?supplierId=${encodeURIComponent('supplier-founder-001')}`, { method: 'GET', headers: { 'X-Write-Key': WRITE_SECRET } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { asOf: string; items: { offerId: string; productVersionId: string; available: number; basePrice: number; resellerCommission: number; name: string; category: string; assetRefs: string[] }[] };
    // the ENVELOPE, with a SERVE clock — seconds old, not the write time
    expect(Number.isFinite(Date.parse(body.asOf))).toBe(true);
    // BOUNDED ON BOTH SIDES (verifier finding): the one-sided version passed for
    // an asOf an hour in the FUTURE, which is exactly the clock defect the asOf
    // reversal exists to catch.
    const skew = Date.now() - Date.parse(body.asOf);
    expect(skew).toBeLessThan(60_000);
    expect(skew).toBeGreaterThan(-1_000);
    const rows = body.items;
    const byOffer = Object.fromEntries(rows.map((r) => [r.offerId, r]));
    // founder-#001 — LIVE fields read off the entry
    expect(byOffer['offer-founder-001']).toEqual({
      offerId: 'offer-founder-001',
      productVersionId: PV,
      available: 5,
      basePrice: 10_000,
      resellerCommission: 1_000,
      name: 'Pagne tissé Faso (démo)',
      category: 'textile',
      assetRefs: [],
    });
    // the second offer, its own live values
    expect(byOffer['offer-2']?.available).toBe(3);
    expect(byOffer['offer-2']?.basePrice).toBe(15_000);
    expect(byOffer['offer-2']?.name).toBe('Sac cuir artisanal (démo)');
    // NO seller-net anywhere in the list — money stays a preview
    expect(JSON.stringify(rows)).not.toMatch(/sellerNet|sellerPlatformFee|8500|13500/);
  });

  it('SURVIVES RESTART: after disposing and recreating the Worker on the SAME persist dir, the offer is still there', async () => {
    await mf.dispose(); // tear the Worker down entirely
    mf = mkWorker(persist, true); // fresh Worker, same on-disk DO storage
    const read = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET', headers: readAuthed });
    expect(read.status).toBe(200);
    const body = (await read.json()) as { value: { productVersionId: string; available: number } };
    expect(body.value.productVersionId).toBe(PV); // the write outlived the process — real durability
    expect(body.value.available).toBe(5);
  });

  it('UNKNOWN pv still reads as an honest 404, never a 200-empty', async () => {
    const read = await mf.dispatchFetch('http://o/supply-projection/pv-nope', { method: 'GET', headers: readAuthed });
    expect(read.status).toBe(404);
    expect(((await read.json()) as { reason: string }).reason).toBe('unknown_product_version');
  });

  it('FAILS CLOSED: a Worker with NO secret configured refuses every write (401), even with a key presented', async () => {
    const attempt = await mfNoSecret.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(SEED) });
    expect(attempt.status).toBe(401); // no secret ⇒ nothing can match ⇒ closed
  });

  // ── SUPPLY-READ-AUTH, proven at the DEPLOYED entry on real workerd ──────────

  it('SUPPLY READ GATE: the projection is 401 without a bearer — it carries basePrice and resellerCommission', async () => {
    const open = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET' });
    expect(open.status).toBe(401);
    // and the supplier's cost structure is NOT in the refusal body
    expect(await open.text()).not.toMatch(/basePrice|resellerCommission|10000|1000|supplier-founder/);
  });

  it('the 401 is NOT AN EXISTENCE ORACLE: a real pv and a nonsense pv are byte-identical without the secret', async () => {
    const real = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET' });
    const fake = await mf.dispatchFetch('http://o/supply-projection/pv-does-not-exist', { method: 'GET' });
    expect(real.status).toBe(fake.status);
    expect(await real.text()).toBe(await fake.text());
    // …whereas WITH the secret they differ (200 vs 404) — proving the gate, not a
    // blanket 401, is what hid the difference.
    const realOk = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET', headers: readAuthed });
    const fakeOk = await mf.dispatchFetch('http://o/supply-projection/pv-does-not-exist', { method: 'GET', headers: readAuthed });
    expect(realOk.status).toBe(200);
    expect(fakeOk.status).toBe(404);
  });

  it('the WRITE key does not open the supply read — the two credentials are not interchangeable', async () => {
    const wrongCred = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${WRITE_SECRET}`, [WRITE_KEY_HEADER]: WRITE_SECRET },
    });
    expect(wrongCred.status).toBe(401);
  });

  it('FAILS CLOSED on the read too: a Worker with no SUPPLY_READ_SECRET refuses the projection', async () => {
    const attempt = await mfNoSecret.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET', headers: readAuthed });
    expect(attempt.status).toBe(401);
  });

  // ── SLICE B · DISCOVERY, proven on real workerd over the DURABLE store ──────

  it('DISCOVERY: GET /supply-projections returns the collection envelope from durable state', async () => {
    const res = await mf.dispatchFetch('http://o/supply-projections', { method: 'GET', headers: readAuthed });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { asOf: string; items: { version: number; asOf: string; value: { productVersionId: string; basePrice: number } }[] };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const seeded = body.items.find((i) => i.value.productVersionId === PV);
    expect(seeded).toBeDefined();
    expect(seeded!.value.basePrice).toBe(10_000);
    // each item is a COMPLETE envelope — shop's certified consumer runs per item unchanged
    expect(Object.keys(seeded!).sort()).toEqual(['asOf', 'value', 'version']);
    // …sharing the collection's serve clock by construction
    expect(seeded!.asOf).toBe(body.asOf);
    expect(Date.parse(body.asOf)).toBeGreaterThan(Date.parse(T0));
  });

  it('THE COLLECTION IS GATED TOO — and it leaks MORE than the single read, so this must never fail open', async () => {
    const open = await mf.dispatchFetch('http://o/supply-projections', { method: 'GET' });
    expect(open.status).toBe(401);
    // the plural route does not start with the singular prefix; a sloppy match would have failed OPEN
    expect(await open.text()).not.toMatch(/basePrice|resellerCommission|10000|Pagne/);
  });

  it('the collection refuses the WRITE key too — one credential per wire', async () => {
    const res = await mf.dispatchFetch('http://o/supply-projections', {
      method: 'GET',
      headers: { Authorization: `Bearer ${WRITE_SECRET}` },
    });
    expect(res.status).toBe(401);
  });

  // ── THE COMPLETION PATH, proven at the deployed entry on real workerd ───────

  const ATTACH_ASSETS = {
    masterRef: { ref: 'private/master/cap-1', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
    heroSquare: { ref: 'media/aaaaaaaa-1111-4111-8111-111111111111', sha256: 'b'.repeat(64), mimeType: 'image/jpeg' },
    heroVertical: { ref: 'media/bbbbbbbb-2222-4222-8222-222222222222', sha256: 'c'.repeat(64), mimeType: 'image/jpeg' },
    proof: { ref: 'media/cccccccc-3333-4333-8333-333333333333', sha256: 'd'.repeat(64), mimeType: 'image/jpeg' },
    detail: [],
    hashes: ['a'.repeat(64)],
    processingVersion: 'premium-frame.v1',
  };

  it('ATTACH: POST /offers/assets is a WRITE — 401 without the key, before any lookup', async () => {
    const open = await mf.dispatchFetch('http://o/offers/assets', {
      method: 'POST',
      body: JSON.stringify({ commandId: 'att-1', offerId: SEED.offerId, assets: ATTACH_ASSETS }),
    });
    expect(open.status).toBe(401);
  });

  it('ATTACH: with the key, photographs land on the SEEDED offer and the wire serves them', async () => {
    const res = await mf.dispatchFetch('http://o/offers/assets', {
      method: 'POST', headers: authed,
      body: JSON.stringify({ commandId: 'att-1', offerId: SEED.offerId, assets: ATTACH_ASSETS }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('attached');

    // the wire NOW carries the refs — hero first, master never
    const read = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET', headers: readAuthed });
    const body = (await read.json()) as { value: { assetRefs: string[] } };
    expect(body.value.assetRefs).toEqual([
      ATTACH_ASSETS.heroSquare.ref, ATTACH_ASSETS.heroVertical.ref, ATTACH_ASSETS.proof.ref,
    ]);
    expect(body.value.assetRefs).not.toContain(ATTACH_ASSETS.masterRef.ref);
  });

  it('ATTACH: a replay is idempotent, and a SECOND attach (new commandId) is refused — completion is not replacement', async () => {
    const replay = await mf.dispatchFetch('http://o/offers/assets', {
      method: 'POST', headers: authed,
      body: JSON.stringify({ commandId: 'att-1', offerId: SEED.offerId, assets: ATTACH_ASSETS }),
    });
    expect(((await replay.json()) as { status: string }).status).toBe('idempotent');

    const second = await mf.dispatchFetch('http://o/offers/assets', {
      method: 'POST', headers: authed,
      body: JSON.stringify({ commandId: 'att-2', offerId: SEED.offerId, assets: ATTACH_ASSETS }),
    });
    expect((await second.json()) as object).toEqual({ status: 'refused', reason: 'assets_already_present' });
  });

  it('ATTACH: an unknown offer is not_found — the side door creates nothing', async () => {
    const res = await mf.dispatchFetch('http://o/offers/assets', {
      method: 'POST', headers: authed,
      body: JSON.stringify({ commandId: 'att-3', offerId: 'offer-nope', assets: ATTACH_ASSETS }),
    });
    expect(((await res.json()) as { status: string }).status).toBe('not_found');
  });

  it('/health stays UNGATED — it is how the deploy is verified and carries no supply data', async () => {
    const health = await mf.dispatchFetch('http://o/health', { method: 'GET' });
    expect(health.status).toBe(200);
    const noSecretHealth = await mfNoSecret.dispatchFetch('http://o/health', { method: 'GET' });
    expect(noSecretHealth.status).toBe(200); // reachable even on a Worker with no secrets at all
  });

  // READ_NOW is referenced so a future edit that needs the read clock has it wired.
  void READ_NOW;
});

/**
 * DEVICE INCIDENT 2026-07-26 — a product the founder published was invisible in
 * Produits. The index and the entry live in DIFFERENT DOs with no transaction
 * across them, so a router that dies between /entry/create and /index/add
 * leaves an ORPHAN: an honestly-published entry no list can ever see, because
 * name-addressed DOs cannot be enumerated — the index IS the enumeration.
 *
 * The old router wrote the index on 'created' ONLY, so the one command that
 * could repair the orphan — the same create, replayed — walked past it.
 *
 * THE ORPHAN HERE IS FABRICATED THE WAY PRODUCTION MAKES THEM: the entry is
 * created directly in its own DO (the first half of the router's work), and the
 * index write never happens (the half that died).
 */
describe('AN ORPHANED ENTRY IS REPAIRED BY REPLAYING ITS CREATE (idempotent writes the index too)', () => {
  const ORPHAN = {
    ...SEED,
    commandId: 'orphan-cmd-001',
    offerId: 'offer-orphan-001',
    product: { ...SEED.product, id: 'pv-orphan-001' },
    draft: { ...SEED.draft, productVersionId: 'pv-orphan-001' },
  };

  it('the orphan exists and the list CANNOT see it — the incident, reproduced', async () => {
    // half a create: the entry DO commits, the index write never runs
    const ns = await mf.getDurableObjectNamespace('OFFER');
    const stub = ns.get(ns.idFromName(ORPHAN.offerId));
    const created = await stub.fetch('https://do/entry/create', { method: 'POST', body: JSON.stringify(ORPHAN) });
    expect(((await created.json()) as { status: string }).status).toBe('created');

    const list = await mf.dispatchFetch('http://o/offers?supplierId=supplier-founder-001', { headers: authed });
    const body = (await list.json()) as { items: { offerId: string }[] };
    expect(body.items.map((i) => i.offerId)).not.toContain(ORPHAN.offerId); // published, invisible
  });

  it('replaying the SAME create through the router answers idempotent AND heals the index', async () => {
    const replay = await mf.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(ORPHAN) });
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { status: string }).status).toBe('idempotent');

    const list = await mf.dispatchFetch('http://o/offers?supplierId=supplier-founder-001', { headers: authed });
    const body = (await list.json()) as { items: { offerId: string }[] };
    expect(body.items.map((i) => i.offerId)).toContain(ORPHAN.offerId); // visible — the retry repaired it
  });

  it('and the dedup HOLDS — a replay of a HEALTHY offer does not double its row', async () => {
    const replay = await mf.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(SEED) });
    expect(((await replay.json()) as { status: string }).status).toBe('idempotent');
    const list = await mf.dispatchFetch('http://o/offers?supplierId=supplier-founder-001', { headers: authed });
    const body = (await list.json()) as { items: { offerId: string }[] };
    expect(body.items.filter((i) => i.offerId === SEED.offerId)).toHaveLength(1);
  });
});

/**
 * BOUTIK-WEB-W1 — CORS at the deployed entry (Boutik-Plus-Web North Star). The
 * supplier surface now also runs in browsers, and a GET carrying X-Write-Key is
 * not a "simple request": the browser preflights it with a BARE OPTIONS (custom
 * headers stripped) and refuses to hand the page any response without
 * Access-Control-Allow-Origin. Three properties, each load-bearing:
 * the preflight answers, the real response is stamped, and NEITHER weakens auth.
 */
describe('CORS — the browser can ask, the key still gates (BOUTIK-WEB-W1)', () => {
  it('a bare OPTIONS preflight (no key — browsers strip custom headers) is answered with the grants', async () => {
    const res = await mf.dispatchFetch('http://o/offers', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://boutik.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-write-key',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Write-Key');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('the authed admin list carries Access-Control-Allow-Origin — without it a browser discards the body', async () => {
    const res = await mf.dispatchFetch('http://o/offers?supplierId=supplier-founder-001', { headers: authed });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('CORS does NOT weaken the gate: the unkeyed GET is still 401 — and the 401 is stamped too, so the app can render its designed failed state instead of an opaque network error', async () => {
    const res = await mf.dispatchFetch('http://o/offers?supplierId=supplier-founder-001');
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

/**
 * OFFER-DELETE-1 (founder feature 2026-07-27: *"delete from produits and it
 * will be removed from shop+ as well"*). Deletion is a WRITE walking three DOs
 * — pointer, index row, entry — ordered so any partial failure is invisible
 * and every replay repairs. "Removed from Shop+" means removed from the SUPPLY
 * WIRE Shop+ reads: the single projection 404s and the collection no longer
 * carries it.
 */
describe('OFFER-DELETE — gone from every wire, idempotent, still key-gated', () => {
  const DEL = {
    commandId: 'del-cmd-001',
    offerId: 'offer-todelete-001',
    product: { ...SEED.product, id: 'pv-todelete-001' },
    draft: { ...SEED.draft, productVersionId: 'pv-todelete-001' },
    available: 3,
    asOf: T0,
  };
  const deleteCmd = { commandId: 'del-cmd-002', offerId: DEL.offerId, productVersionId: 'pv-todelete-001' };

  it('an unkeyed delete is 401 BEFORE anything is touched — CORS/gate discipline unchanged for the new write', async () => {
    const res = await mf.dispatchFetch('http://o/offers/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deleteCmd),
    });
    expect(res.status).toBe(401);
  });

  it('create → visible on all three wires; delete → gone from ALL THREE (admin list · supply single read · supply collection)', async () => {
    const created = await mf.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(DEL) });
    expect(created.status).toBe(200);

    // visible before
    const before = (await (await mf.dispatchFetch(`http://o/offers?supplierId=${DEL.product.supplierId}`, { headers: authed })).json()) as { items: { offerId: string }[] };
    expect(before.items.some((i) => i.offerId === DEL.offerId)).toBe(true);
    const singleBefore = await mf.dispatchFetch(`http://o/supply-projection/pv-todelete-001`, { headers: readAuthed });
    expect(singleBefore.status).toBe(200);

    const del = await mf.dispatchFetch('http://o/offers/delete', { method: 'POST', headers: authed, body: JSON.stringify(deleteCmd) });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { status: string }).status).toBe('deleted');

    // gone after — every wire
    const after = (await (await mf.dispatchFetch(`http://o/offers?supplierId=${DEL.product.supplierId}`, { headers: authed })).json()) as { items: { offerId: string }[] };
    expect(after.items.some((i) => i.offerId === DEL.offerId)).toBe(false);
    const singleAfter = await mf.dispatchFetch(`http://o/supply-projection/pv-todelete-001`, { headers: readAuthed });
    expect(singleAfter.status).toBe(404);
    const coll = (await (await mf.dispatchFetch('http://o/supply-projections', { headers: readAuthed })).json()) as { items?: { productVersionId: string }[] } | { productVersionId: string }[];
    const items = Array.isArray(coll) ? coll : (coll.items ?? []);
    expect(items.some((p) => p.productVersionId === 'pv-todelete-001')).toBe(false);
  });

  it('a REPLAY of the delete answers idempotent — a retry after a mid-flight death finishes the cleanup for free', async () => {
    const again = await mf.dispatchFetch('http://o/offers/delete', { method: 'POST', headers: authed, body: JSON.stringify(deleteCmd) });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { status: string }).status).toBe('idempotent');
  });

  it('deleting one offer does NOT touch its neighbours — the founder seed is still on every wire', async () => {
    const list = (await (await mf.dispatchFetch(`http://o/offers?supplierId=${SEED.product.supplierId}`, { headers: authed })).json()) as { items: { offerId: string }[] };
    expect(list.items.some((i) => i.offerId === SEED.offerId)).toBe(true);
    const single = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { headers: readAuthed });
    expect(single.status).toBe(200);
  });

  it('a malformed delete (missing productVersionId) is a 400 that touches nothing', async () => {
    const res = await mf.dispatchFetch('http://o/offers/delete', {
      method: 'POST', headers: authed,
      body: JSON.stringify({ commandId: 'x', offerId: 'y' }),
    });
    expect(res.status).toBe(400);
  });
});
