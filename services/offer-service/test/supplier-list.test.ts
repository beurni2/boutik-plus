import { describe, expect, it } from 'vitest';
import { ProductAssetsSchema, ProductVersionSchema, type ProductAssets } from '@platform/contracts';
import { decideCreateOffer, type CreateOfferCommand, type OfferEntry } from '../src/offer-core.js';
import { buildSupplierList } from '../src/supplier-list.js';

/**
 * PRODUITS-READ-1 — the supplier-facing list. The properties under test are the
 * founder's rulings: the scope is real (not decorative), the photographs travel
 * in wire order, his typed words travel verbatim, and an offer Shop+ has stopped
 * serving is SHOWN AND MARKED rather than quietly dropped.
 */

const NOW = '2026-07-25T08:00:00.000Z';
const ref = (r: string) => ({ ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });
const assets = (): ProductAssets =>
  ProductAssetsSchema.parse({
    masterRef: ref('private/device/deadbeef'),
    heroSquare: ref('media/hero-square'),
    heroVertical: ref('media/hero-vertical'),
    proof: ref('media/proof'),
    detail: [ref('media/detail-1')],
    hashes: ['a'.repeat(64)],
    processingVersion: 'premium-frame.v1',
  });

function entry(over: {
  supplierId?: string;
  offerId?: string;
  pv?: string;
  name?: string;
  effective?: string;
  expiry?: string;
  withAssets?: boolean;
  variantsNote?: string;
  productStatus?: string;
}): OfferEntry {
  const product = ProductVersionSchema.parse({
    id: over.pv ?? 'pv-1',
    supplierId: over.supplierId ?? 'supplier-founder-001',
    version: 1,
    name: over.name ?? 'Bazin',
    productCode: 'BAZ-01',
    facts: {},
    category: 'textile',
    zone: 'Gounghin',
    moderationState: 'approved',
    status: over.productStatus ?? 'active',
    supplyMode: 'SELLER_HELD',
  });
  const cmd: CreateOfferCommand = {
    commandId: `cmd-${over.offerId ?? 'offer-1'}`,
    offerId: over.offerId ?? 'offer-1',
    product,
    draft: {
      productVersionId: product.id,
      basePrice: 10_000,
      resellerCommission: 750,
      eligibleVariants: [],
      zones: [],
      effective: over.effective ?? '2026-07-01T00:00:00.000Z',
      expiry: over.expiry ?? '2027-07-01T00:00:00.000Z',
    },
    available: 10,
    asOf: NOW,
    ...(over.withAssets === true ? { assets: assets() } : {}),
    ...(over.variantsNote === undefined ? {} : { variantsNote: over.variantsNote }),
  };
  const { decision } = decideCreateOffer(undefined, cmd);
  if (decision.status !== 'created') throw new Error('fixture create failed');
  return decision.entry;
}

describe('THE SCOPE IS REAL — one supplier never sees another (the fail-open hazard, closed)', () => {
  it('returns only the requested supplier’s offers, never everyone’s', () => {
    const mine = entry({ supplierId: 'supplier-founder-001', offerId: 'o-mine', pv: 'pv-mine' });
    const theirs = entry({ supplierId: 'supplier-other-002', offerId: 'o-theirs', pv: 'pv-theirs', name: 'Pagne' });
    const out = buildSupplierList('supplier-founder-001', [mine, theirs], NOW);
    expect(out.items.map((i) => i.offerId)).toEqual(['o-mine']);
    // the OTHER supplier's data is absent in every field, not merely unlisted
    expect(JSON.stringify(out)).not.toContain('supplier-other-002');
    expect(JSON.stringify(out)).not.toContain('Pagne');
  });

  it('a supplier with no offers gets an HONEST EMPTY — different from a refused scope', () => {
    const out = buildSupplierList('supplier-nobody-999', [entry({})], NOW);
    expect(out.items).toEqual([]);
    expect(out.asOf).toBe(NOW); // still a real envelope, not an error
  });
});

describe('THE ENVELOPE — serve clock, matching the supply collection', () => {
  it('asOf is the clock it was SERVED at, not the entry’s write time', () => {
    const e = entry({});
    expect(e.asOf).toBe(NOW);
    const served = '2026-12-25T10:30:00.000Z';
    const out = buildSupplierList('supplier-founder-001', [e], served);
    expect(out.asOf).toBe(served); // the asOf reversal, applied here too
  });
});

describe('WHAT A TILE GETS — real sources only', () => {
  it('photographs travel in WIRE ORDER, hero first, master EXCLUDED', () => {
    const out = buildSupplierList('supplier-founder-001', [entry({ withAssets: true })], NOW);
    expect(out.items[0]!.assetRefs).toEqual([
      'media/hero-square',
      'media/hero-vertical',
      'media/proof',
      'media/detail-1',
    ]);
    // the on-device master must never reach the app's image loader
    expect(out.items[0]!.assetRefs).not.toContain('private/device/deadbeef');
  });

  it('no photographs is an HONEST EMPTY ARRAY — never a placeholder ref', () => {
    const out = buildSupplierList('supplier-founder-001', [entry({ withAssets: false })], NOW);
    expect(out.items[0]!.assetRefs).toEqual([]);
  });

  it('his variants travel VERBATIM — never reformatted into the demo board’s style', () => {
    const out = buildSupplierList('supplier-founder-001', [entry({ variantsNote: 'S, M, L' })], NOW);
    expect(out.items[0]!.variantsNote).toBe('S, M, L'); // NOT 'S · M · L'
  });

  it('a supplier who typed no variants gets the field ABSENT, not an empty string', () => {
    const out = buildSupplierList('supplier-founder-001', [entry({})], NOW);
    expect('variantsNote' in out.items[0]!).toBe(false);
  });

  it('carries the fields a tile actually needs, and no seller-net (money stays a preview)', () => {
    const row = buildSupplierList('supplier-founder-001', [entry({})], NOW).items[0]!;
    expect(row.name).toBe('Bazin');
    expect(row.category).toBe('textile');
    expect(row.basePrice).toBe(10_000);
    expect(row.resellerCommission).toBe(750);
    expect(row.available).toBe(10);
    expect(JSON.stringify(row)).not.toMatch(/sellerNet|net"/);
  });
});

describe('LAPSED OFFERS ARE SHOWN AND MARKED — the disappearance this read would otherwise create', () => {
  it('a live offer carries NO hiddenReason', () => {
    const out = buildSupplierList('supplier-founder-001', [entry({})], NOW);
    expect('hiddenReason' in out.items[0]!).toBe(false);
  });

  it('an offer past its expiry is STILL LISTED, marked with the LADDER’S OWN reason', () => {
    const lapsed = entry({ expiry: '2026-07-01T00:00:00.000Z' }); // NOW is 2026-07-25
    const out = buildSupplierList('supplier-founder-001', [lapsed], NOW);
    expect(out.items).toHaveLength(1); // shown, not hidden
    expect(out.items[0]!.hiddenReason).toBe('offer_not_effective');
  });

  it('the mark is DERIVED FROM THE LADDER, not from a local date comparison — other refusals surface too', () => {
    const takenDown = entry({ productStatus: 'inactive' });
    const out = buildSupplierList('supplier-founder-001', [takenDown], NOW);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.hiddenReason).toBe('product_not_active');
  });

  it('the same offer flips to hidden purely by the CLOCK MOVING — no write, no republish', () => {
    const e = entry({ expiry: '2026-08-01T00:00:00.000Z' });
    const before = buildSupplierList('supplier-founder-001', [e], '2026-07-25T00:00:00.000Z');
    const after = buildSupplierList('supplier-founder-001', [e], '2026-08-02T00:00:00.000Z');
    expect('hiddenReason' in before.items[0]!).toBe(false);
    expect(after.items[0]!.hiddenReason).toBe('offer_not_effective');
    // and it is the SAME offer in both — a lapse is not a deletion
    expect(after.items[0]!.offerId).toBe(before.items[0]!.offerId);
  });
});
