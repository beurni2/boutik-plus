import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveFournisseurService, type FournisseurServicePort } from '../src/fournisseur/service';
import { resolveReadinessUpload } from '../src/fournisseur/media-upload';
import { pretColis } from '../src/fournisseur/pret-colis';
import { fournisseurVue } from '../src/fournisseur/view';
import { stripJpegMetadata } from '../src/studio/normalization';

/**
 * ═══ THE SEAM — PREUVE-PRETE-1 (AUDIT-B+2 F-16): « Envoyer la preuve », on the REAL Workers ═══
 *
 * Readiness is what lets Séra dispatch, and until this file no test had ever
 * sent a supplier's proof through his own code to the real services: a mutant
 * that sent the photo under the wrong key header passed the whole suite.
 *
 * WHAT RUNS: the supplier's OWN ports — `resolveFournisseurService` (his list,
 * his accept, the challenge, « prêt »), `resolveReadinessUpload` (the upload-
 * only photo client) and `pretColis` (the parcel loop the screen calls) —
 * against the built offer-service and media-service bundles in miniflare. The
 * only things done outside his ports are what other actors do: the founder
 * seeds the product and mints his code, Shop+ registers the paid order. Every
 * outcome is then asked of the WORKERS (the founder's order list, the evidence
 * door, the photo read route), never taken from the answer his app got.
 *
 * ⚠ THE DIGEST under vitest is the `expo-crypto` double (the config aliases it
 * for every test here), not SHA-256: this seam proves the photo's bytes reach
 * the store and the store's key reaches the book, not the hash algorithm —
 * that is proved against known vectors in the media-upload suites.
 */

const OFFER_BUNDLE = fileURLToPath(new URL('../../../services/offer-service/dist/worker/worker.mjs', import.meta.url));
const MEDIA_BUNDLE = fileURLToPath(new URL('../../../services/media-service/dist/worker/worker.mjs', import.meta.url));
const compat = (svc: string): string => {
  const toml = readFileSync(fileURLToPath(new URL(`../../../services/${svc}/wrangler.toml`, import.meta.url)), 'utf8');
  const found = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(toml);
  if (found === null) throw new Error(`${svc} wrangler.toml has no compatibility_date`);
  return found[1]!;
};

type MiniflareCtor = new (opts: Record<string, unknown>) => {
  dispatchFetch(url: string, init?: unknown): Promise<Response>;
  dispose(): Promise<void>;
};
const Miniflare = ((): MiniflareCtor | null => {
  try {
    const req = createRequire(fileURLToPath(new URL('../../../services/offer-service/package.json', import.meta.url)));
    return (req('miniflare') as { Miniflare: MiniflareCtor }).Miniflare;
  } catch {
    return null;
  }
})();

const OPS = 'test-seam-ops-secret-preuve';
const INTAKE = 'test-seam-fulfillment-write-preuve';
const MEDIA_WRITE = 'test-seam-media-write-preuve';
const SUPPLIER = 'supplier-preuve-1';
const T0 = '2026-09-29T08:00:00.000Z';

let offre!: InstanceType<MiniflareCtor>;
let media!: InstanceType<MiniflareCtor>;
const dirs: string[] = [];
const previous = globalThis.fetch;
let code = '';

/** The photo his phone made: a JPEG the media Worker reads as 512 × 512,
 *  through the app's OWN privacy strip — the bytes the screen would send. */
const seg = (marker: number, payload: number[]): number[] => {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
};
const PHOTO = stripJpegMetadata(new Uint8Array([
  0xff, 0xd8,
  ...seg(0xe1, [...'Exif\0\0'].map((c) => c.charCodeAt(0))),
  ...seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
  ...seg(0xc0, [8, 0x02, 0x00, 0x02, 0x00, 1, 0x11, 0]),
  ...seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
  ...seg(0xda, [1, 0, 0, 0, 63, 0]),
  0x12, 0x34, 0x56, 0x78,
  0xff, 0xd9,
]));

async function opsPost(path: string, body: unknown, bearer: string): Promise<Response> {
  return await offre.dispatchFetch(`http://offer${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
}

const offreDe = (pv: string, n: string, name: string) => ({
  commandId: `seed-preuve-${n}`,
  offerId: `offer-preuve-${n}`,
  product: {
    id: pv, supplierId: SUPPLIER, version: 1, name,
    productCode: `FASO-P${n}`, facts: {}, category: 'fashion_bags_fabrics',
    zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: pv, basePrice: 8_000, resellerCommission: 800,
    eligibleVariants: [], zones: [],
    effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 3,
  asOf: T0,
});

/** What Shop+ sends when a buyer has paid — the recorded wire. */
const paye = (orderId: string, pv: string, pkg?: { packageId: string; orderIds: string[] }) => ({
  name: 'order.confirmed.v1',
  envelope: {
    command_id: `ord-confirm-${orderId}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
  },
  payload: {
    orderId, productVersionId: pv, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
    paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
    ...(pkg !== undefined ? { package: pkg } : {}),
  },
});

/** THE LEDGER — the founder's own list and the evidence door, read with his key. */
async function readyAtDe(orderId: string): Promise<string | undefined> {
  const res = await offre.dispatchFetch('http://offer/fulfillment/orders', { headers: { Authorization: `Bearer ${OPS}` } });
  expect(res.status).toBe(200);
  const rows = ((await res.json()) as { orders: { orderId: string; fulfillment?: { readyAt?: string } }[] }).orders;
  return rows.find((r) => r.orderId === orderId)?.fulfillment?.readyAt;
}
async function preuveDe(orderId: string): Promise<{ photoRef: { ref: string; mimeType: string } }> {
  const res = await offre.dispatchFetch(`http://offer/fulfillment/order-evidence?orderId=${orderId}`, { headers: { Authorization: `Bearer ${OPS}` } });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as { photoRef: { ref: string; mimeType: string } };
}
/** THE STORE — the photo read route answers with the exact bytes sent. */
async function photoStockee(ref: string): Promise<Uint8Array> {
  const res = await media.dispatchFetch(`http://media/${ref}`);
  expect(res.status, `the media Worker does not hold ${ref}`).toBe(200);
  return new Uint8Array(await res.arrayBuffer());
}

beforeAll(async () => {
  if (Miniflare === null || !existsSync(OFFER_BUNDLE) || !existsSync(MEDIA_BUNDLE)) return;
  const d1 = mkdtempSync(join(tmpdir(), 'preuve-seam-offre-'));
  const d2 = mkdtempSync(join(tmpdir(), 'preuve-seam-media-'));
  dirs.push(d1, d2);
  offre = new Miniflare({
    modules: [{ type: 'ESModule', path: 'offer.mjs', contents: readFileSync(OFFER_BUNDLE, 'utf8') }],
    compatibilityDate: compat('offer-service'),
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: d1,
    bindings: { FULFILLMENT_OPS_SECRET: OPS, FULFILLMENT_WRITE_SECRET: INTAKE },
  });
  media = new Miniflare({
    modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(MEDIA_BUNDLE, 'utf8') }],
    compatibilityDate: compat('media-service'),
    r2Buckets: { BUCKET: 'preuve-seam-bucket' },
    r2Persist: d2,
    bindings: { MEDIA_WRITE_SECRET: MEDIA_WRITE },
  });
  // NOT A FAKE: every call his app makes is ROUTED to the real Worker it names.
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    return (u.startsWith('http://media') ? media : offre).dispatchFetch(u, init as never);
  }) as unknown as typeof globalThis.fetch;
  process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer';
  process.env['EXPO_PUBLIC_MEDIA_BASE'] = 'http://media';
  process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = MEDIA_WRITE;

  // a product may only name a supplier who holds a code: the code comes first
  const minted = await opsPost('/fulfillment/supplier-code', { supplierId: SUPPLIER }, OPS);
  code = ((await minted.json()) as { code: string }).code;
  expect(code.length).toBeGreaterThan(0);
  for (const [pv, n, name] of [['pv-preuve-seul', '1', 'Bazin'], ['pv-preuve-c1', '2', 'Pagne'], ['pv-preuve-c2', '3', 'Sandales']] as const) {
    const seeded = await opsPost('/offers', offreDe(pv, n, name), OPS);
    expect(seeded.status, await seeded.clone().text()).toBe(200);
  }
}, 30_000);

afterAll(async () => {
  globalThis.fetch = previous;
  await offre?.dispose();
  await media?.dispose();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}, 30_000);

function port(): FournisseurServicePort {
  const p = resolveFournisseurService();
  expect(p, 'his port did not resolve on a wired build').not.toBeNull();
  return p!;
}

describe('PREUVE-PRETE-1 — « Envoyer la preuve » through his own code, on the real Workers', () => {
  it('the seam is RUNNABLE — miniflare resolved and both bundles are built', () => {
    expect(Miniflare, 'miniflare must resolve from services/offer-service').not.toBeNull();
    expect(existsSync(OFFER_BUNDLE), `run pnpm --filter @boutik/offer-service bundle:worker — missing ${OFFER_BUNDLE}`).toBe(true);
    expect(existsSync(MEDIA_BUNDLE), `run pnpm --filter @boutik/media-service bundle:worker — missing ${MEDIA_BUNDLE}`).toBe(true);
  });

  it('one order: his list → accept → a fresh challenge → the photo uploaded → « prêt » — and the BOOK says ready, the evidence names the stored photo, the store holds its bytes', async () => {
    const intake = await opsPost('/fulfillment/order-confirmed', paye('ord-preuve-1', 'pv-preuve-seul'), INTAKE);
    expect(intake.status, await intake.clone().text()).toBe(200);
    const svc = port();

    const mine = await svc.listMine(code);
    expect(mine.ok && mine.orders.map((o) => o.orderId)).toContain('ord-preuve-1');
    expect((await svc.accept(code, 'ord-preuve-1')).ok).toBe(true);

    const ch = await svc.challenge(code, 'ord-preuve-1');
    expect(ch.ok, JSON.stringify(ch)).toBe(true);
    const upload = resolveReadinessUpload();
    expect(upload, 'the upload client did not resolve with the media base and key set').not.toBeNull();
    const up = await upload!(PHOTO);
    expect(up.ok, 'the real media Worker refused his photo').toBe(true);
    if (!up.ok || !ch.ok) return;
    expect(up.value.mimeType).toBe('image/jpeg');

    const ready = await svc.ready(code, {
      orderId: 'ord-preuve-1', photoRef: up.value, readinessChallenge: ch.challenge,
      qty: 1, variant: 'pv-preuve-seul', availableConfirmed: true, at: new Date().toISOString(),
    });
    expect(ready, JSON.stringify(ready)).toMatchObject({ ok: true, status: 'ready' });

    // the LEDGER, not the answer
    expect(await readyAtDe('ord-preuve-1'), 'the book does not hold the order as ready').toEqual(expect.any(String));
    const preuve = await preuveDe('ord-preuve-1');
    expect(preuve.photoRef.ref).toBe(up.value.ref);
    expect(await photoStockee(up.value.ref)).toEqual(PHOTO);
    // and his own next read says so — the card turns « Prêt, preuve reçue »
    const apres = await svc.listMine(code);
    const ligne = apres.ok ? apres.orders.find((o) => o.orderId === 'ord-preuve-1') : undefined;
    expect(ligne?.fulfillment?.readyAt).toEqual(expect.any(String));
  });

  it('a colis: ONE upload, then the parcel loop the screen calls — every article ready in the book, all under the same stored photo', async () => {
    const colis = { packageId: 'col-preuve-1', orderIds: ['ord-preuve-c1', 'ord-preuve-c2'] };
    for (const [o, pv] of [['ord-preuve-c1', 'pv-preuve-c1'], ['ord-preuve-c2', 'pv-preuve-c2']] as const) {
      const intake = await opsPost('/fulfillment/order-confirmed', paye(o, pv, colis), INTAKE);
      expect(intake.status, await intake.clone().text()).toBe(200);
    }
    const svc = port();
    for (const o of colis.orderIds) expect((await svc.accept(code, o)).ok, o).toBe(true);

    // the card exactly as his screen builds it from his own list
    const mine = await svc.listMine(code);
    expect(mine.ok).toBe(true);
    const vue = fournisseurVue(mine.ok ? { kind: 'ok', rows: mine.orders } : { kind: 'failed' });
    const carte = vue.kind === 'liste' ? vue.cartes.find((c) => c.kind === 'colis' && c.packageId === 'col-preuve-1') : undefined;
    expect(carte?.kind, `no colis card: ${JSON.stringify(vue)}`).toBe('colis');
    if (carte?.kind !== 'colis') return;
    expect(carte.articles.map((a) => a.etape)).toEqual(['a_preparer', 'a_preparer']);

    const up = await resolveReadinessUpload()!(PHOTO);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    const issue = await pretColis(svc, code, carte.packageId, carte.articles, up.value);
    expect(issue.then, JSON.stringify(issue)).toBe('refresh');

    for (const o of colis.orderIds) {
      expect(await readyAtDe(o), `${o} is not ready in the book`).toEqual(expect.any(String));
      expect((await preuveDe(o)).photoRef.ref, o).toBe(up.value.ref);
    }
    expect(await photoStockee(up.value.ref)).toEqual(PHOTO);
  });

  it('the upload under a WRONG key is refused by the real media Worker — his app says « photo », and the book stays not ready', async () => {
    const intake = await opsPost('/fulfillment/order-confirmed', paye('ord-preuve-2', 'pv-preuve-seul'), INTAKE);
    expect(intake.status).toBe(200);
    const svc = port();
    expect((await svc.accept(code, 'ord-preuve-2')).ok).toBe(true);
    process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = 'test-seam-not-the-media-key';
    try {
      const up = await resolveReadinessUpload()!(PHOTO);
      expect(up.ok).toBe(false);
    } finally {
      process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = MEDIA_WRITE;
    }
    expect(await readyAtDe('ord-preuve-2')).toBeUndefined();
  });
});
