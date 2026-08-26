import { describe, expect, it } from 'vitest';
import { ProductVersionSchema } from '@platform/contracts';
import { CATEGORY_FLOOR_FCFA, type OfferDraft } from '../src/offer.js';
import { decideCreateOffer, OfferAvailableError, type CreateOfferCommand, type OfferEntry } from '../src/offer-core.js';

/**
 * OFFER DECISION CORE — the pure per-offer transition. Proven here without any
 * storage: idempotent on the create command id, collision on a different id,
 * refusals from the REAL OfferBook.create path surface verbatim, `available` is
 * validated at the boundary, and — the property this slice must not break — the
 * seller-net PREVIEW rides on the decision and is NEVER written into the entry.
 */

const ASOF = '2026-07-15T08:00:00.000Z';

function cmd(overrides: Partial<CreateOfferCommand> & { basePrice?: number; available?: number } = {}): CreateOfferCommand {
  const product = ProductVersionSchema.parse({
    id: overrides.product?.id ?? 'pv-1',
    supplierId: 'supplier-1',
    version: 1,
    name: 'Article',
    productCode: 'ART-1',
    facts: {},
    category: 'textile',
    zone: 'Gounghin',
    moderationState: 'approved',
    status: 'active',
    supplyMode: 'SELLER_HELD',
  });
  const draft: OfferDraft = {
    productVersionId: product.id,
    basePrice: overrides.basePrice ?? 10_000,
    resellerCommission: 1_000,
    eligibleVariants: [],
    zones: [],
    effective: '2026-07-10T00:00:00.000Z',
    expiry: '2026-12-31T00:00:00.000Z',
  };
  return {
    commandId: overrides.commandId ?? 'cmd-1',
    offerId: overrides.offerId ?? 'offer-1',
    product,
    draft,
    available: overrides.available ?? 5,
    asOf: overrides.asOf ?? ASOF,
  };
}

describe('decideCreateOffer', () => {
  it('a first create runs the REAL command path and returns the entry + the seller-net preview', () => {
    const { decision, next } = decideCreateOffer(undefined, cmd());
    expect(decision.status).toBe('created');
    if (decision.status !== 'created') return;
    expect(next).toBeDefined();
    expect(decision.entry.offerId).toBe('offer-1');
    expect(decision.entry.available).toBe(5);
    // previewSellerNet ran (FRAIS-ZERO: 10000 - 1000 - 0 fee = 9000) — RETURNED, never stored
    expect(decision.preview.sellerNetFcfa).toBe(9_000);
    expect(decision.preview.sellerPlatformFeeFcfa).toBe(0);
    // the persisted entry carries NO seller-net field — money stays a preview
    // (platformFeeVersion is a legit offer field — the fee-schedule pointer, not the net)
    expect(Object.keys(decision.entry)).toEqual(['offerId', 'product', 'offer', 'available', 'asOf', 'createCommandId']);
    expect(JSON.stringify(decision.entry)).not.toMatch(/sellerNet|sellerPlatformFee|8500/);
  });

  it('is idempotent on the create command id — same commandId re-applied is a no-op with no new write', () => {
    const first = decideCreateOffer(undefined, cmd());
    const current = first.next as OfferEntry;
    const replay = decideCreateOffer(current, cmd({ commandId: 'cmd-1' }));
    expect(replay.decision.status).toBe('idempotent');
    expect(replay.next).toBeUndefined(); // nothing to persist
  });

  it('a DIFFERENT command id against an existing offer is a collision — never a silent re-create', () => {
    const first = decideCreateOffer(undefined, cmd());
    const current = first.next as OfferEntry;
    const collide = decideCreateOffer(current, cmd({ commandId: 'cmd-2' }));
    expect(collide.decision.status).toBe('collision');
    expect(collide.next).toBeUndefined();
  });

  it('a below-floor base price is refused verbatim from OfferBook.create (never persisted)', () => {
    const { decision, next } = decideCreateOffer(undefined, cmd({ basePrice: CATEGORY_FLOOR_FCFA - 1 }));
    expect(decision.status).toBe('refused');
    if (decision.status === 'refused') {
      expect(decision.reason).toBe('below_category_floor');
      expect(decision.floor).toBe(CATEGORY_FLOOR_FCFA);
    }
    expect(next).toBeUndefined();
  });

  it('a non-integer or negative declared available is refused at the boundary (never persisted to fail on the wire)', () => {
    expect(() => decideCreateOffer(undefined, cmd({ available: -1 }))).toThrow(OfferAvailableError);
    expect(() => decideCreateOffer(undefined, cmd({ available: 2.5 }))).toThrow(OfferAvailableError);
    // zero is a valid declared stock (int ≥ 0)
    expect(decideCreateOffer(undefined, cmd({ available: 0 })).decision.status).toBe('created');
  });
});
