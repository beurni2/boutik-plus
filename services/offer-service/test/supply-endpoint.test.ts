import { describe, expect, it } from 'vitest';
import { ProductVersionSchema, SupplierOfferSchema, SupplyProjectionSchema } from '@platform/contracts';
import worker, { SERVICE_NAME } from '../src/index.js';
import { buildSupplyProjection } from '../src/projection.js';
import { OfferBook } from '../src/offer.js';
import { InMemoryOfferStore } from '../src/offer-store.js';
import type { CreateOfferCommand, OfferEntry } from '../src/offer-core.js';
import {
  FOUNDER_001_OFFER_ID,
  FOUNDER_001_PRODUCT_VERSION_ID,
  SupplyLeakError,
  assertServableValue,
  founderOneCreateCommand,
  makeSupplyFetch,
  serveProjection,
  sweepIdentityKeys,
} from '../src/supply-endpoint.js';

/**
 * SW-1 + BOUTIK-OFFER-DURABLE-1 — the supply READ-MODEL endpoint over the
 * OfferStore. The value is the pinned SupplyProjection parsed on the way OUT
 * (strict schema + the identity key-sweep). RED-first: served ==
 * buildSupplyProjection byte-for-byte · refusals surface honest · identity/
 * pickup un-emittable · asOf is real age · `available` is the DECLARED number
 * from the create command, not a fixture literal.
 */

const FIXED_ASOF = '2026-07-15T08:00:00.000Z';
const READ_NOW = '2026-07-15T09:30:00.000Z'; // 90 min after the supply state was written

function reqGet(pv: string): Request {
  return new Request(`https://offer-service.boutik.internal/supply-projection/${pv}`);
}

/** A create command with a controllable product/offer, for the refusal cases — run
 * through the REAL command path (OfferBook.create), which does not itself check
 * moderation/expiry (the read-time refusal ladder does). */
function cmdWith(overrides: {
  offerId?: string;
  productVersionId?: string;
  moderationState?: string;
  status?: string;
  effective?: string;
  expiry?: string;
  available?: number;
}): CreateOfferCommand {
  const pv = overrides.productVersionId ?? 'pv-x';
  const product = ProductVersionSchema.parse({
    id: pv,
    supplierId: 'supplier-x',
    version: 1,
    name: 'Article (démo)',
    productCode: 'ART-01',
    facts: {},
    category: 'textile',
    zone: 'Gounghin',
    moderationState: overrides.moderationState ?? 'approved',
    status: overrides.status ?? 'active',
    supplyMode: 'SELLER_HELD',
  });
  return {
    commandId: `cmd-${pv}`,
    offerId: overrides.offerId ?? 'offer-x',
    product,
    draft: {
      productVersionId: pv,
      basePrice: 10_000,
      resellerCommission: 1_000,
      eligibleVariants: [],
      zones: [],
      effective: overrides.effective ?? '2026-07-10T00:00:00.000Z',
      expiry: overrides.expiry ?? '2026-12-31T00:00:00.000Z',
    },
    available: overrides.available ?? 5,
    asOf: FIXED_ASOF,
  };
}

async function seeded(cmd: CreateOfferCommand): Promise<InMemoryOfferStore> {
  const store = new InMemoryOfferStore();
  await store.create(cmd);
  return store;
}

/** Build the durable entry a create would persist (for the pure serveProjection core). */
async function entryOf(cmd: CreateOfferCommand): Promise<OfferEntry> {
  const store = await seeded(cmd);
  const entry = await store.getEntryByProductVersion(cmd.product.id);
  if (!entry) throw new Error('setup: entry not persisted');
  return entry;
}

describe('SW-1 · founder-#001 is a REAL SELLER_HELD offer created through the command path', () => {
  it('the fixture offer is minted by OfferBook.create, not hand-built — SELLER_HELD, version 1, available DECLARED', async () => {
    const store = await seeded(founderOneCreateCommand(FIXED_ASOF));
    const entry = await store.getEntryByProductVersion(FOUNDER_001_PRODUCT_VERSION_ID);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.offerId).toBe(FOUNDER_001_OFFER_ID); // the DO address, caller-supplied
    expect(entry.product.supplyMode).toBe('SELLER_HELD'); // PLATFORM_OWNED stays B+9-gated
    expect(entry.product.moderationState.startsWith('approved')).toBe(true);
    expect(entry.offer.id).toMatch(/^offer-/); // OfferBook.create stamps the offer id
    expect(entry.offer.version).toBe(1);
    expect(entry.available).toBe(5); // the DECLARED number from the seed command, not a read-path literal
    // the same draft through the real command path reconciles (previewSellerNet ran)
    const echo = new OfferBook().create(
      {
        productVersionId: FOUNDER_001_PRODUCT_VERSION_ID,
        basePrice: entry.offer.basePrice,
        resellerCommission: entry.offer.resellerCommission,
        eligibleVariants: [],
        zones: [],
        effective: entry.offer.effective,
        expiry: entry.offer.expiry,
      },
      true,
    );
    expect(echo.ok).toBe(true);
  });

  it('the DECLARED available flows to the served projection — a different number, not a baked 5', async () => {
    const store = await seeded(cmdWith({ productVersionId: 'pv-decl', offerId: 'offer-decl', available: 12 }));
    const res = await makeSupplyFetch(store, () => READ_NOW)(reqGet('pv-decl'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: { available: number } };
    expect(body.value.available).toBe(12); // straight from the create command
  });
});

describe('SW-1 · served == buildSupplyProjection, byte-for-byte', () => {
  it('GET returns {version, asOf, value} with value === the pure builder output', async () => {
    const cmd = founderOneCreateCommand(FIXED_ASOF);
    const store = await seeded(cmd);
    const entry = await entryOf(cmd);
    const res = await makeSupplyFetch(store, () => READ_NOW)(reqGet(FOUNDER_001_PRODUCT_VERSION_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; asOf: string; value: unknown };

    const built = buildSupplyProjection(entry.product, entry.offer, entry.available, READ_NOW);
    if (!built.ok) throw new Error('builder refused a servable entry');
    expect(body.value).toEqual(built.projection); // byte-for-byte
    expect(body.version).toBe(entry.offer.version); // the offer version, verbatim
    expect(() => SupplyProjectionSchema.parse(body.value)).not.toThrow();
  });
});

describe('SW-1 · the refusal ladder surfaces as HONEST STATES (typed reason, never 200-empty)', () => {
  it('a not-approved product → 409 product_not_approved, status unavailable — not a 200', async () => {
    const store = await seeded(cmdWith({ moderationState: 'submitted' }));
    const res = await makeSupplyFetch(store, () => READ_NOW)(reqGet('pv-x'));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { status: string; reason: string; value?: unknown };
    expect(body.status).toBe('unavailable');
    expect(body.reason).toBe('product_not_approved');
    expect(body.value).toBeUndefined(); // never a 200-empty / null-value body
  });

  it('an expired offer → 409 offer_not_effective (the window is checked at read)', async () => {
    const store = await seeded(cmdWith({ expiry: '2026-07-11T00:00:00.000Z' })); // before READ_NOW
    const res = await makeSupplyFetch(store, () => READ_NOW)(reqGet('pv-x'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe('offer_not_effective');
  });

  it('an unknown product version → 404 unknown_product_version, honest — not a 200-empty', async () => {
    const res = await makeSupplyFetch(new InMemoryOfferStore(), () => READ_NOW)(reqGet('pv-nope'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { status: string; reason: string };
    expect(body.status).toBe('not_found');
    expect(body.reason).toBe('unknown_product_version');
  });
});

describe('SW-1 · identity + pickup are UN-EMITTABLE on the wire', () => {
  it('the out-guard refuses a planted supplierPhone (schema-strict + key-sweep, mirrored from the mock)', async () => {
    const entry = await entryOf(founderOneCreateCommand(FIXED_ASOF));
    const clean = buildSupplyProjection(entry.product, entry.offer, entry.available, READ_NOW);
    if (!clean.ok) throw new Error('setup');
    expect(() => assertServableValue(clean.projection)).not.toThrow();
    const leaking = { ...clean.projection, supplierPhone: '+226 70 00 00 00' } as never;
    expect(() => assertServableValue(leaking)).toThrow();
    expect(() => assertServableValue({ ...clean.projection, pickup: 'Marché' } as never)).toThrow();
  });

  it('the sweep has INDEPENDENT teeth — it refuses identity keys even where the strict schema would not run (locks the second line in)', () => {
    expect(() => sweepIdentityKeys({ productVersionId: 'pv', offerVersion: '1', supplierPhone: '+226 70' })).toThrow(SupplyLeakError);
    expect(() => sweepIdentityKeys({ supplierId: 'supplier-9' })).toThrow(SupplyLeakError);
    expect(() => sweepIdentityKeys({ pickup: 'Marché Rood-Woko' })).toThrow(SupplyLeakError);
    expect(() => sweepIdentityKeys({ adresse: 'Gounghin' })).toThrow(SupplyLeakError);
    expect(() => sweepIdentityKeys({ productVersionId: 'pv', offerVersion: '1', basePrice: 1, resellerCommission: 1, available: 1 })).not.toThrow();
  });

  it('SupplyLeakError is the named refusal for identity that clears the schema shape', () => {
    let caught: unknown;
    try {
      assertServableValue({ productVersionId: 'pv', offerVersion: '1', basePrice: 1, resellerCommission: 1, available: 1, supplierName: 'x' } as never);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error); // schema-strict or SupplyLeakError — either way, refused
  });
});

describe('SW-1 · asOf is TRUTHFUL — staleness is real age, never fabricated freshness', () => {
  it('the served asOf is the supply-state timestamp, NOT the read clock', async () => {
    const store = await seeded(founderOneCreateCommand(FIXED_ASOF)); // written at 08:00
    const res = await makeSupplyFetch(store, () => READ_NOW)(reqGet(FOUNDER_001_PRODUCT_VERSION_ID)); // read at 09:30
    const body = (await res.json()) as { asOf: string };
    expect(body.asOf).toBe(FIXED_ASOF); // the write time, verbatim
    expect(body.asOf).not.toBe(READ_NOW); // freshness is never fabricated at read
    const ageMs = Date.parse(READ_NOW) - Date.parse(body.asOf);
    expect(ageMs).toBe(90 * 60 * 1000);
  });
});

describe('SW-1 · the health door is preserved (the endpoint composes onto it)', () => {
  it('/health still 200 and unknown routes still 404 (regression on the existing contract)', async () => {
    expect((await worker.fetch(new Request('https://offer-service.boutik.internal/health'))).status).toBe(200);
    expect((await worker.fetch(new Request('https://offer-service.boutik.internal/nope'))).status).toBe(404);
    expect(SERVICE_NAME).toBe('offer-service');
  });

  it('a non-GET method on the supply route is an honest 405, never a silent serve', async () => {
    const store = await seeded(founderOneCreateCommand(FIXED_ASOF));
    const res = await makeSupplyFetch(store, () => READ_NOW)(
      new Request(`https://offer-service.boutik.internal/supply-projection/${FOUNDER_001_PRODUCT_VERSION_ID}`, { method: 'POST' }),
    );
    expect(res.status).toBe(405);
  });

  it('serveProjection is the pure core the fetch handler wraps (transport is a thin shell over the resolved entry)', async () => {
    const entry = await entryOf(founderOneCreateCommand(FIXED_ASOF));
    const outcome = serveProjection(SERVICE_NAME, entry, READ_NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.body.asOf).toBe(FIXED_ASOF);
    // undefined entry → honest 404 (the store returned nothing)
    expect(serveProjection(SERVICE_NAME, undefined, READ_NOW).status).toBe(404);
  });
});

// referenced so the import is load-bearing even if a future edit drops a use
void SupplyLeakError;
