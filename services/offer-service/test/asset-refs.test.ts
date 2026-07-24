import { describe, expect, it } from 'vitest';
import { ProductAssetsSchema, ProductVersionSchema, SupplierOfferSchema, SupplyProjectionSchema, type ProductAssets } from '@platform/contracts';
import { ASSET_REFS_MAX, buildSupplyProjection, wireAssetRefs } from '../src/projection.js';
import { decideCreateOffer, type CreateOfferCommand } from '../src/offer-core.js';
import { assertServableValue } from '../src/supply-endpoint.js';

/**
 * BOUTIK-MEDIA-1 (producer half) — the product's real images on the wire.
 * Founder rulings under test: ALL images travel EXCEPT the private masterRef ·
 * index 0 is the hero, by mandated convention not insertion luck · the cap is SIX
 * wire refs, enforced at the CREATE COMMAND with a TYPED refusal, never by silent
 * truncation.
 */

const NOW = '2026-07-24T12:00:00.000Z';
const SUPPLIER_ID = 'supplier-founder-001';

const ref = (r: string) => ({ ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });

function assetsWith(detailCount: number): ProductAssets {
  return ProductAssetsSchema.parse({
    masterRef: ref('private/master/capture-1'),
    heroSquare: ref('media/11111111-1111-4111-8111-111111111111'),
    heroVertical: ref('media/22222222-2222-4222-8222-222222222222'),
    proof: ref('media/33333333-3333-4333-8333-333333333333'),
    detail: Array.from({ length: detailCount }, (_, i) => ref(`media/detail-${i}`)),
    hashes: ['a'.repeat(64)],
    processingVersion: 'premium-frame.v1',
  });
}

const product = ProductVersionSchema.parse({
  id: 'pv-1', supplierId: SUPPLIER_ID, version: 1, name: 'Pagne tissé', productCode: 'PAG-01',
  facts: {}, category: 'textile', zone: 'Gounghin', moderationState: 'approved',
  status: 'active', supplyMode: 'SELLER_HELD',
});
const offer = SupplierOfferSchema.parse({
  id: 'offer-1', productVersionId: 'pv-1', version: 1, basePrice: 10_000, resellerCommission: 1_000,
  platformFeeVersion: 'fee-v1', eligibleVariants: [], zones: [],
  effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z', status: 'active',
});

function cmd(assets?: ProductAssets): CreateOfferCommand {
  return {
    commandId: 'cmd-1', offerId: 'offer-1', product,
    draft: {
      productVersionId: 'pv-1', basePrice: 10_000, resellerCommission: 1_000,
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 5, asOf: NOW,
    ...(assets !== undefined ? { assets } : {}),
  };
}

describe('masterRef NEVER travels — the private original is not expressible on the wire', () => {
  it('the master ref is absent from assetRefs while every other role is present', () => {
    const assets = assetsWith(1);
    const refs = wireAssetRefs(assets);
    expect(refs).not.toContain(assets.masterRef.ref);
    expect(refs.some((r) => r.startsWith('private/'))).toBe(false); // nothing private-namespaced escapes
    expect(refs).toContain(assets.heroSquare.ref);
    expect(refs).toContain(assets.heroVertical.ref);
    expect(refs).toContain(assets.proof.ref);
    expect(refs).toContain(assets.detail[0]!.ref);
  });

  it('it is excluded from the CAP COUNT too — masterRef never consumes a supplier’s six', () => {
    // 6 wire refs (hero×2 + proof + 3 detail) + masterRef = 7 MediaRefs total, still legal
    const decision = decideCreateOffer(undefined, cmd(assetsWith(3))).decision;
    expect(decision.status).toBe('created');
  });
});

describe('INDEX 0 IS THE HERO — a mandated convention, not insertion luck', () => {
  it('assetRefs[0] is heroSquare, and the full order is hero · heroVertical · proof · detail…', () => {
    const assets = assetsWith(2);
    const refs = wireAssetRefs(assets);
    expect(refs[0]).toBe(assets.heroSquare.ref); // THE tile art
    expect(refs).toEqual([
      assets.heroSquare.ref,
      assets.heroVertical.ref,
      assets.proof.ref,
      assets.detail[0]!.ref,
      assets.detail[1]!.ref,
    ]);
  });

  it('the convention survives the REAL builder — not just the helper', () => {
    const assets = assetsWith(1);
    const built = buildSupplyProjection(product, offer, 4, NOW, assets);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.projection.assetRefs[0]).toBe(assets.heroSquare.ref);
  });

  it('does NOT deduplicate or reorder — a supplier’s declared assets are carried as declared', () => {
    const dup = ProductAssetsSchema.parse({
      ...assetsWith(0),
      heroVertical: ref('media/11111111-1111-4111-8111-111111111111'), // same as heroSquare
    });
    const refs = wireAssetRefs(dup);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toBe(refs[1]); // both emitted — silently collapsing would modify their data
  });
});

describe('THE CAP — six wire refs, refused at the create command, never truncated', () => {
  it('six refs is ACCEPTED (four photographs can legitimately produce six refs)', () => {
    const { decision } = decideCreateOffer(undefined, cmd(assetsWith(3))); // 3 + 3 detail = 6
    expect(wireAssetRefs(assetsWith(3))).toHaveLength(ASSET_REFS_MAX);
    expect(decision.status).toBe('created');
  });

  it('SEVEN refs is REFUSED with a typed, readable reason naming both numbers', () => {
    const { decision, next } = decideCreateOffer(undefined, cmd(assetsWith(4))); // 3 + 4 = 7
    expect(decision.status).toBe('refused');
    if (decision.status !== 'refused') return;
    expect(decision.reason).toBe('too_many_asset_refs');
    expect(decision.max).toBe(6);
    expect(decision.presented).toBe(7);
    expect(next).toBeUndefined(); // nothing persisted
  });

  it('NEVER TRUNCATES: an over-cap create stores no offer at all, rather than dropping a photograph silently', () => {
    const { decision, next } = decideCreateOffer(undefined, cmd(assetsWith(10)));
    expect(decision.status).toBe('refused');
    expect(next).toBeUndefined();
    // and the refusal is a DECISION, in the same shape as the rest of the ladder — not a throw
    expect(() => decideCreateOffer(undefined, cmd(assetsWith(10)))).not.toThrow();
  });

  it('the cap is enforced at the COMMAND, so a persisted entry can never exceed it on the wire', () => {
    const { next } = decideCreateOffer(undefined, cmd(assetsWith(3)));
    expect(next).toBeDefined();
    if (!next) return;
    const built = buildSupplyProjection(next.product, next.offer, next.available, NOW, next.assets);
    if (!built.ok) return;
    expect(built.projection.assetRefs.length).toBeLessThanOrEqual(ASSET_REFS_MAX);
  });
});

describe('the images reach the wire, and the guards still hold on a NON-empty array', () => {
  it('a created offer carries its assets into the projection and parses @2.0.0', () => {
    const { next } = decideCreateOffer(undefined, cmd(assetsWith(1)));
    if (!next) throw new Error('setup');
    const built = buildSupplyProjection(next.product, next.offer, next.available, NOW, next.assets);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.projection.assetRefs).toHaveLength(4);
    expect(() => SupplyProjectionSchema.parse(built.projection)).not.toThrow();
    // the out-guard accepts opaque, non-supplier-keyed refs
    expect(() => assertServableValue(built.projection, SUPPLIER_ID)).not.toThrow();
  });

  it('the VALUE-SIDE guard still bites on a real populated array — a supplier-keyed ref is refused on the way out', () => {
    const leaking = ProductAssetsSchema.parse({
      ...assetsWith(0),
      detail: [ref(`media/${SUPPLIER_ID}/hero.jpg`)], // the storage-key leak canon warns about
    });
    const built = buildSupplyProjection(product, offer, 4, NOW, leaking);
    if (!built.ok) throw new Error('setup');
    expect(() => assertServableValue(built.projection, SUPPLIER_ID)).toThrow();
  });

  it('an offer created WITHOUT assets still emits [] — the honest empty, never a seed image', () => {
    const { next } = decideCreateOffer(undefined, cmd());
    if (!next) throw new Error('setup');
    expect(next.assets).toBeUndefined();
    const built = buildSupplyProjection(next.product, next.offer, next.available, NOW, next.assets);
    if (!built.ok) return;
    expect(built.projection.assetRefs).toEqual([]);
  });
});
