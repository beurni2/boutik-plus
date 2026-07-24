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
    ...(withSecret ? { bindings: { OFFER_WRITE_SECRET: WRITE_SECRET } } : {}),
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

  it('READ: GET /supply-projection/:pv is OPEN (no key) and returns the projection from durable state — available is the DECLARED 5', async () => {
    const read = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET' });
    expect(read.status).toBe(200);
    const body = (await read.json()) as { version: number; asOf: string; value: { productVersionId: string; available: number; basePrice: number } };
    expect(body.value.productVersionId).toBe(PV);
    expect(body.value.available).toBe(5); // declared on the create command, not a fixture literal
    expect(body.value.basePrice).toBe(10_000);
    expect(body.asOf).toBe(T0); // truthful write time
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

    const res = await mf.dispatchFetch('http://o/offers', { method: 'GET', headers: { 'X-Write-Key': WRITE_SECRET } });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { offerId: string; productVersionId: string; available: number; basePrice: number; resellerCommission: number; name: string }[];
    const byOffer = Object.fromEntries(rows.map((r) => [r.offerId, r]));
    // founder-#001 — LIVE fields read off the entry
    expect(byOffer['offer-founder-001']).toEqual({
      offerId: 'offer-founder-001',
      productVersionId: PV,
      available: 5,
      basePrice: 10_000,
      resellerCommission: 1_000,
      name: 'Pagne tissé Faso (démo)',
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
    const read = await mf.dispatchFetch(`http://o/supply-projection/${PV}`, { method: 'GET' });
    expect(read.status).toBe(200);
    const body = (await read.json()) as { value: { productVersionId: string; available: number } };
    expect(body.value.productVersionId).toBe(PV); // the write outlived the process — real durability
    expect(body.value.available).toBe(5);
  });

  it('UNKNOWN pv still reads as an honest 404, never a 200-empty', async () => {
    const read = await mf.dispatchFetch('http://o/supply-projection/pv-nope', { method: 'GET' });
    expect(read.status).toBe(404);
    expect(((await read.json()) as { reason: string }).reason).toBe('unknown_product_version');
  });

  it('FAILS CLOSED: a Worker with NO secret configured refuses every write (401), even with a key presented', async () => {
    const attempt = await mfNoSecret.dispatchFetch('http://o/offers', { method: 'POST', headers: authed, body: JSON.stringify(SEED) });
    expect(attempt.status).toBe(401); // no secret ⇒ nothing can match ⇒ closed
  });

  // READ_NOW is referenced so a future edit that needs the read clock has it wired.
  void READ_NOW;
});
