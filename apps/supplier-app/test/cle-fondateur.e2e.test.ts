import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { offerBaseConfigured, resolveSupplyService, SUPPLIER_ID } from '../src/supply/service';
import { effacerPhotos, resolveMediaService } from '../src/supply/media';
import { resolveOperationsService } from '../src/operations/service';
import { publish, type AuthoringContext, type AuthoringForm } from '../src/supply/authoring';
import { cleEchecHttp, cleRefus } from '../src/v2/lister-pour';

/**
 * ═══ THE SEAM — CLE-FONDATEUR-1, the console's OWN ports on the REAL Workers ═══
 *
 * The walks prove the screens send the typed keys; the offer-service e2e proves
 * the Worker keeps its doors. This test proves the two MEET: the app's real
 * resolver, its real `publish`, its real product client and its real photo
 * cleanup, driven against the built offer-service and media-service bundles in
 * miniflare — and every outcome is asked of the WORKER (its inventory, its
 * media read route), never taken from the answer the client got.
 *
 * ⚠ THE OLD KEYS ARE LEFT SET IN THE BUILD ENV on purpose, holding the REAL
 * secret values: a client that still read either one would work here, and this
 * test would see it.
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

const OPS = 'seam-ops-secret-cle-fondateur';
const OLD_WRITE = 'seam-old-offer-write-secret';
const MEDIA_WRITE = 'seam-media-write-secret';
const REVOKE = 'seam-media-revoke-secret';

/** His browser storage — the ONE place his keys live now. */
const tiroir = new Map<string, string>();
(globalThis as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => tiroir.get(k) ?? null,
  setItem: (k: string, v: string) => void tiroir.set(k, v),
  removeItem: (k: string) => void tiroir.delete(k),
};

let offre!: InstanceType<MiniflareCtor>;
let media!: InstanceType<MiniflareCtor>;
const dirs: string[] = [];
const previous = globalThis.fetch;

beforeAll(() => {
  if (Miniflare === null || !existsSync(OFFER_BUNDLE) || !existsSync(MEDIA_BUNDLE)) return;
  const d1 = mkdtempSync(join(tmpdir(), 'cle-seam-offre-'));
  const d2 = mkdtempSync(join(tmpdir(), 'cle-seam-media-'));
  dirs.push(d1, d2);
  offre = new Miniflare({
    modules: [{ type: 'ESModule', path: 'offer.mjs', contents: readFileSync(OFFER_BUNDLE, 'utf8') }],
    compatibilityDate: compat('offer-service'),
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: d1,
    // The retired secret stays BOUND, as it may on the live Worker until the
    // founder deletes it — a door that still read it would open here.
    bindings: { FULFILLMENT_OPS_SECRET: OPS, OFFER_WRITE_SECRET: OLD_WRITE },
  });
  media = new Miniflare({
    modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(MEDIA_BUNDLE, 'utf8') }],
    compatibilityDate: compat('media-service'),
    r2Buckets: { BUCKET: 'cle-seam-bucket' },
    r2Persist: d2,
    bindings: { MEDIA_WRITE_SECRET: MEDIA_WRITE, MEDIA_REVOKE_SECRET: REVOKE },
  });
  // NOT A FAKE: every call the app makes is ROUTED to the real Worker it names.
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const mf = u.startsWith('http://media') ? media : offre;
    return mf.dispatchFetch(u, init as never);
  }) as unknown as typeof globalThis.fetch;
  process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer';
  process.env['EXPO_PUBLIC_MEDIA_BASE'] = 'http://media';
  process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = MEDIA_WRITE;
  // The retired names, holding the RIGHT values. They must change nothing.
  process.env['EXPO_PUBLIC_OFFER_WRITE_KEY'] = OLD_WRITE;
  process.env['EXPO_PUBLIC_MEDIA_REVOKE_KEY'] = REVOKE;
});

afterAll(async () => {
  globalThis.fetch = previous;
  delete process.env['EXPO_PUBLIC_OFFER_WRITE_KEY'];
  delete process.env['EXPO_PUBLIC_MEDIA_REVOKE_KEY'];
  await offre?.dispose();
  await media?.dispose();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** The LEDGER: what the offer Worker itself holds, read with his key. */
async function inventaire(): Promise<{ offerId: string; supplierId: string; name: string }[]> {
  const res = await offre.dispatchFetch('http://offer/offers/inventaire', { headers: { Authorization: `Bearer ${OPS}` } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: { offerId: string; supplierId: string; name: string }[] }).items;
}

const FORM: AuthoringForm = {
  name: 'Pagne tissé Faso Dan Fani',
  productCode: 'FDF-SEAM-01',
  category: 'fashion_bags_fabrics',
  zone: 'Ouagadougou',
  basePrice: '10000',
  resellerCommission: '1000',
  available: '3',
};
const ctx = (id: string, pv = `pv-${id}`): AuthoringContext => ({
  supplierId: SUPPLIER_ID,
  productVersionId: pv,
  offerId: `offer-${id}`,
  commandId: `cmd-${id}`,
  now: '2026-09-26T09:00:00.000Z',
  effective: '2026-09-25T09:00:00.000Z',
  expiry: '2026-12-25T09:00:00.000Z',
  moderationState: 'approved',
});

/** A tiny PNG the media Worker's sniff accepts. */
function png(): Uint8Array {
  const b = new Uint8Array(4096).fill(0x5c);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  b.set([0, 0, 2, 0, 0, 0, 2, 0], 16); // 512 × 512
  return b;
}

describe('CLE-FONDATEUR-1 — the console’s ports meet the real Workers on the keys he types', () => {
  it('the seam is RUNNABLE — miniflare resolved and both bundles are built', () => {
    expect(Miniflare, 'miniflare must resolve from services/offer-service').not.toBeNull();
    expect(existsSync(OFFER_BUNDLE), `run pnpm --filter @boutik/offer-service bundle:worker — missing ${OFFER_BUNDLE}`).toBe(true);
    expect(existsSync(MEDIA_BUNDLE), `run pnpm --filter @boutik/media-service bundle:worker — missing ${MEDIA_BUNDLE}`).toBe(true);
  });

  it('with NO key typed there is no client at all — the old key in the build env revives nothing', async () => {
    tiroir.clear();
    expect(resolveSupplyService()).toBeNull();
    expect(offerBaseConfigured()).toBe(true);
    expect(await publish(resolveSupplyService(), FORM, ctx('sans-cle'))).toEqual({ kind: 'not_configured' });
    expect((await inventaire()).map((r) => r.offerId)).not.toContain('offer-sans-cle');
  });

  it('with HIS key typed: the console mints his code, publishes through `publish`, and the WORKER holds the product', async () => {
    tiroir.set('boutik.operateur.cle', OPS);
    const ops = resolveOperationsService();
    expect(ops).not.toBeNull();
    const code = await ops!.mintCode(OPS, SUPPLIER_ID);
    expect(code.ok, JSON.stringify(code)).toBe(true);

    const out = await publish(resolveSupplyService(), FORM, ctx('seam-1'));
    expect(out.kind, JSON.stringify(out)).toBe('published');
    const livre = await inventaire();
    expect(livre.find((r) => r.offerId === 'offer-seam-1')).toMatchObject({ supplierId: SUPPLIER_ID, name: FORM.name });
  });

  it('a WRONG key typed: `publish` fails as a refused key (its own sentence), and the Worker holds nothing new', async () => {
    tiroir.set('boutik.operateur.cle', 'une-cle-qui-nest-pas-la-sienne');
    const out = await publish(resolveSupplyService(), FORM, ctx('seam-mauvaise'));
    expect(out.kind).toBe('failed');
    if (out.kind !== 'failed') return;
    expect(out.cause).toBe('http');
    expect(cleEchecHttp(out.reason, SUPPLIER_ID)).toBe('publier.cle_refusee');
    expect((await inventaire()).map((r) => r.offerId)).not.toContain('offer-seam-mauvaise');
  });

  it('F-34 across the seam — a second offer naming a live product version is refused in plain words; the first keeps it', async () => {
    tiroir.set('boutik.operateur.cle', OPS);
    const out = await publish(resolveSupplyService(), { ...FORM, name: 'Imposteur' }, ctx('seam-2', 'pv-seam-1'));
    expect(out).toEqual({ kind: 'refused', reason: 'refused: product_version_taken' });
    expect(cleRefus(out.kind === 'refused' ? out.reason : '')).toBe('publier.err_version_prise');
    const livre = await inventaire();
    expect(livre.map((r) => r.offerId)).not.toContain('offer-seam-2');
    expect(livre.find((r) => r.offerId === 'offer-seam-1')?.name, 'the product keeps its own name').toBe(FORM.name);
  });

  it('F-35 across the seam — the Worker itself refuses a commission that leaves nothing, and the app has words for it', async () => {
    const svc = resolveSupplyService()!;
    const res = await svc.createOffer({
      commandId: 'cmd-seam-3',
      offerId: 'offer-seam-3',
      product: {
        id: 'pv-seam-3', supplierId: SUPPLIER_ID, version: 1, name: 'Sans marge', productCode: 'FDF-SEAM-03',
        facts: {}, category: 'fashion_bags_fabrics', zone: 'Ouagadougou', moderationState: 'approved',
        status: 'active', supplyMode: 'SELLER_HELD',
      },
      draft: {
        productVersionId: 'pv-seam-3', basePrice: 10_000, resellerCommission: 10_000, eligibleVariants: [], zones: [],
        effective: '2026-09-25T09:00:00.000Z', expiry: '2026-12-25T09:00:00.000Z',
      },
      available: 2,
      asOf: '2026-09-26T09:00:00.000Z',
    });
    expect(res).toEqual({ ok: true, value: { status: 'refused', reason: 'commission_leaves_no_net' } });
    expect(cleRefus('refused: commission_leaves_no_net')).toBe('publier.err_commission_net');
    expect((await inventaire()).map((r) => r.offerId)).not.toContain('offer-seam-3');
  });

  it('the console’s delete goes out on his key and the Worker no longer holds the product', async () => {
    const res = await resolveSupplyService()!.deleteOffer({ commandId: 'del-seam-1', offerId: 'offer-seam-1', productVersionId: 'pv-seam-1' });
    expect(res).toEqual({ ok: true, value: { status: 'deleted' } });
    expect((await inventaire()).map((r) => r.offerId)).not.toContain('offer-seam-1');
  });

  it('F-68 across the seam — a WRONG photo key leaves the photo LIVE and counted; the right key destroys it', async () => {
    const up = await resolveMediaService()!.uploadImage(png());
    expect(up.ok, up.ok ? '' : up.reason).toBe(true);
    const ref = up.ok ? up.value.ref : '';
    const lu = async (): Promise<number> => (await media.dispatchFetch(`http://media/${ref}`)).status;
    expect(await lu()).toBe(200);

    // The old build env holds the RIGHT revoke secret — and must not be used.
    tiroir.set('boutik.photos.cle', 'une-mauvaise-cle-photos');
    expect(await effacerPhotos([ref]), 'the refused photo comes back, to be said and retried').toEqual([ref]);
    expect(await lu(), 'and it is really still there').toBe(200);

    tiroir.set('boutik.photos.cle', REVOKE);
    expect(await effacerPhotos([ref])).toEqual([]);
    expect(await lu(), 'the Worker no longer serves it').toBe(404);
  });
});
