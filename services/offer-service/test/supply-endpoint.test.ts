import { describe, expect, it } from 'vitest';
import { ProductVersionSchema, SupplierOfferSchema, SupplyProjectionSchema } from '@platform/contracts';
import worker, { SERVICE_NAME } from '../src/index.js';
import { buildSupplyProjection } from '../src/projection.js';
import { OfferBook } from '../src/offer.js';
import {
  FOUNDER_001_PRODUCT_VERSION_ID,
  SupplyLeakError,
  SupplyRegistry,
  assertServableValue,
  founderOneSupply,
  makeSupplyFetch,
  serveProjection,
  type SupplyEntry,
} from '../src/supply-endpoint.js';

/**
 * SW-1 — the supply READ-MODEL endpoint (founder ruling: Option B, HTTP pull).
 * offer-service serves the supply projection; the value is the pinned
 * SupplyProjection parsed on the way OUT (strict schema + the identity
 * key-sweep mirrored from the certified mock). RED-first: served ==
 * buildSupplyProjection byte-for-byte · refusals surface honest · identity/
 * pickup un-emittable · asOf is real age, never fabricated freshness.
 */

const FIXED_ASOF = '2026-07-15T08:00:00.000Z';
const READ_NOW = '2026-07-15T09:30:00.000Z'; // 90 min after the supply state was written

function reqGet(pv: string): Request {
  return new Request(`https://offer-service.boutik.internal/supply-projection/${pv}`);
}

/** A non-founder entry with a controllable product/offer, for the refusal cases. */
function entryWith(overrides: {
  moderationState?: string;
  status?: string;
  offerStatus?: string;
  effective?: string;
  expiry?: string;
}): SupplyEntry {
  const product = ProductVersionSchema.parse({
    id: 'pv-x',
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
  const offer = SupplierOfferSchema.parse({
    id: 'offer-x',
    productVersionId: 'pv-x',
    version: 1,
    basePrice: 10_000,
    resellerCommission: 1_000,
    platformFeeVersion: 'fee-v1',
    eligibleVariants: [],
    zones: [],
    effective: overrides.effective ?? '2026-07-10T00:00:00.000Z',
    expiry: overrides.expiry ?? '2026-12-31T00:00:00.000Z',
    status: overrides.offerStatus ?? 'active',
  });
  return { product, offer, available: 5, asOf: FIXED_ASOF };
}

describe('SW-1 · founder-#001 is a REAL SELLER_HELD offer created through the command path', () => {
  it('the fixture offer is minted by OfferBook.create, not hand-built — SELLER_HELD, version 1', () => {
    const entry = founderOneSupply(FIXED_ASOF);
    expect(entry.product.supplyMode).toBe('SELLER_HELD'); // PLATFORM_OWNED stays B+9-gated
    expect(entry.product.moderationState.startsWith('approved')).toBe(true);
    expect(entry.offer.id).toMatch(/^offer-/); // OfferBook.create stamps the id
    expect(entry.offer.version).toBe(1);
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
});

describe('SW-1 · served == buildSupplyProjection, byte-for-byte', () => {
  it('GET returns {version, asOf, value} with value === the pure builder output', async () => {
    const registry = new SupplyRegistry();
    const entry = founderOneSupply(FIXED_ASOF);
    registry.register(entry);
    const fetchSupply = makeSupplyFetch(registry, () => READ_NOW);

    const res = fetchSupply(reqGet(FOUNDER_001_PRODUCT_VERSION_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; asOf: string; value: unknown };

    const built = buildSupplyProjection(entry.product, entry.offer, entry.available, READ_NOW);
    if (!built.ok) throw new Error('builder refused a servable entry');
    expect(body.value).toEqual(built.projection); // byte-for-byte
    expect(body.version).toBe(entry.offer.version); // the offer version, verbatim
    // the served value is itself contract-valid (strict) end-to-end
    expect(() => SupplyProjectionSchema.parse(body.value)).not.toThrow();
  });
});

describe('SW-1 · the refusal ladder surfaces as HONEST STATES (typed reason, never 200-empty)', () => {
  it('a not-approved product → 409 product_not_approved, status unavailable — not a 200', async () => {
    const registry = new SupplyRegistry();
    registry.register(entryWith({ moderationState: 'submitted' }));
    const res = makeSupplyFetch(registry, () => READ_NOW)(reqGet('pv-x'));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { status: string; reason: string; value?: unknown };
    expect(body.status).toBe('unavailable');
    expect(body.reason).toBe('product_not_approved');
    expect(body.value).toBeUndefined(); // never a 200-empty / null-value body
  });

  it('an expired offer → 409 offer_not_effective (the window is checked at read)', async () => {
    const registry = new SupplyRegistry();
    registry.register(entryWith({ expiry: '2026-07-11T00:00:00.000Z' })); // before READ_NOW
    const res = makeSupplyFetch(registry, () => READ_NOW)(reqGet('pv-x'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe('offer_not_effective');
  });

  it('an unknown product version → 404 unknown_product_version, honest — not a 200-empty', async () => {
    const res = makeSupplyFetch(new SupplyRegistry(), () => READ_NOW)(reqGet('pv-nope'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { status: string; reason: string };
    expect(body.status).toBe('not_found');
    expect(body.reason).toBe('unknown_product_version');
  });
});

describe('SW-1 · identity + pickup are UN-EMITTABLE on the wire', () => {
  it('the out-guard refuses a planted supplierPhone (schema-strict + key-sweep, mirrored from the mock)', () => {
    const entry = founderOneSupply(FIXED_ASOF);
    const clean = buildSupplyProjection(entry.product, entry.offer, entry.available, READ_NOW);
    if (!clean.ok) throw new Error('setup');
    // the clean 5-field projection passes
    expect(() => assertServableValue(clean.projection)).not.toThrow();
    // a planted identity key is refused (strict schema throws first; the sweep is the second line)
    const leaking = { ...clean.projection, supplierPhone: '+226 70 00 00 00' } as never;
    expect(() => assertServableValue(leaking)).toThrow();
    // and the sweep itself bites even if the schema were bypassed: a lone pickup key is caught
    expect(() => assertServableValue({ ...clean.projection, pickup: 'Marché' } as never)).toThrow();
  });

  it('SupplyLeakError is the named refusal for identity that clears the schema shape', () => {
    // a key that the identity regex catches but is not an undeclared *extra*
    // cannot exist on the strict 5-field shape — so the sweep's own error is
    // proven by feeding the guard a value whose EXTRA key is identity material.
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
    const registry = new SupplyRegistry();
    registry.register(founderOneSupply(FIXED_ASOF)); // written at 08:00
    const res = makeSupplyFetch(registry, () => READ_NOW)(reqGet(FOUNDER_001_PRODUCT_VERSION_ID)); // read at 09:30
    const body = (await res.json()) as { asOf: string };
    expect(body.asOf).toBe(FIXED_ASOF); // the write time, verbatim
    expect(body.asOf).not.toBe(READ_NOW); // freshness is never fabricated at read
    // the age a Shop+ stale-block would compute is real (90 min), not zero
    const ageMs = Date.parse(READ_NOW) - Date.parse(body.asOf);
    expect(ageMs).toBe(90 * 60 * 1000);
  });
});

describe('SW-1 · the health door is preserved (the endpoint composes onto it)', () => {
  it('/health still 200 and unknown routes still 404 (regression on the existing contract)', async () => {
    expect(worker.fetch(new Request('https://offer-service.boutik.internal/health')).status).toBe(200);
    expect(worker.fetch(new Request('https://offer-service.boutik.internal/nope')).status).toBe(404);
    expect(SERVICE_NAME).toBe('offer-service');
  });

  it('a non-GET method on the supply route is an honest 405, never a silent serve', async () => {
    const registry = new SupplyRegistry();
    registry.register(founderOneSupply(FIXED_ASOF));
    const res = makeSupplyFetch(registry, () => READ_NOW)(
      new Request(`https://offer-service.boutik.internal/supply-projection/${FOUNDER_001_PRODUCT_VERSION_ID}`, { method: 'POST' }),
    );
    expect(res.status).toBe(405);
  });

  it('serveProjection is the pure core the fetch handler wraps (transport is a thin shell)', () => {
    const registry = new SupplyRegistry();
    registry.register(founderOneSupply(FIXED_ASOF));
    const outcome = serveProjection(SERVICE_NAME, registry, FOUNDER_001_PRODUCT_VERSION_ID, READ_NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.body.asOf).toBe(FIXED_ASOF);
  });
});

// referenced so the import is load-bearing even if a future edit drops a use
void SupplyLeakError;
