import { describe, expect, it } from 'vitest';
import { estRetireAcces, restaurerApresAcces, retirerPourAcces, STATUT_RETIRE } from '../src/retrait-acces.js';
import { buildFullInventory, buildSupplierList } from '../src/supplier-list.js';
import { buildSupplyProjection } from '../src/projection.js';
import type { OfferEntry } from '../src/offer-core.js';

/**
 * RETRAIT-ACCÈS — the pure decision, at the unit level.
 *
 * The end-to-end proof is in `test/fulfillment-readiness.e2e.test.ts`, on real
 * workerd: revoke → the product leaves `/supply-projections` and the inventory;
 * re-mint → it comes back. What is here is the NARROWNESS, which a seam test
 * would pass straight over: an offer the founder retired for his OWN reasons
 * must never be resurrected by a re-mint.
 */

const AT = '2026-08-11T15:00:00.000Z';
const NOW = '2026-08-11T16:00:00.000Z';

function entry(over: Partial<OfferEntry> = {}, statut = 'active'): OfferEntry {
  return {
    offerId: 'offer-ra-1',
    product: {
      id: 'pv-ra-1', supplierId: 'supplier-ra-1', version: 1, name: 'Bogolan',
      productCode: 'RA-001', facts: {}, category: 'fashion_bags_fabrics',
      zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
    },
    offer: {
      id: 'offer-ra-1', productVersionId: 'pv-ra-1', version: 1,
      basePrice: 8_000, resellerCommission: 800, platformFeeVersion: 'v1',
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
      status: statut,
    },
    available: 3,
    asOf: AT,
    createCommandId: 'cmd-ra-1',
    ...over,
  } as OfferEntry;
}

describe('RETRAIT-ACCÈS — retiring, and what it refuses to touch', () => {
  it('takes a live offer off sale and MARKS why', () => {
    const next = retirerPourAcces(entry(), AT);
    expect(next).not.toBeNull();
    expect(next!.offer.status).toBe(STATUT_RETIRE);
    expect(next!.retraitAcces).toBe(AT);
    // THE REAL CONSEQUENCE, asserted through the ladder that governs Shop+
    // rather than by reading the flag back: the product stops projecting.
    const built = buildSupplyProjection(next!.product, next!.offer, next!.available, NOW, next!.assets);
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toBe('offer_not_active');
    // …and NOTHING was deleted: the entry, its product and its price survive.
    expect(next!.product).toEqual(entry().product);
    expect(next!.offer.basePrice).toBe(8_000);
  });

  it('leaves an offer the FOUNDER already retired exactly as it is, unmarked', () => {
    // The narrowness that makes the reverse safe. Without this, a re-mint would
    // resurrect a product he deliberately pulled for his own reasons.
    const sien = entry({}, 'retiré_par_le_fondateur');
    expect(retirerPourAcces(sien, AT)).toBeNull();
    expect(estRetireAcces(sien)).toBe(false);
  });

  it('is idempotent — a second pass over an already-retired offer moves nothing', () => {
    const once = retirerPourAcces(entry(), AT)!;
    expect(retirerPourAcces(once, '2026-08-11T18:00:00.000Z')).toBeNull();
    expect(once.retraitAcces, 'the original timestamp is not overwritten').toBe(AT);
  });
});

describe('RETRAIT-ACCÈS — restoring, and what it refuses to touch', () => {
  it('puts back exactly what this act put away, and clears the mark', () => {
    const retire = retirerPourAcces(entry(), AT)!;
    const back = restaurerApresAcces(retire)!;
    expect(back.offer.status).toBe('active');
    expect(back.retraitAcces).toBeUndefined();
    expect(buildSupplyProjection(back.product, back.offer, back.available, NOW, back.assets).ok).toBe(true);
  });

  it('REFUSES to resurrect an offer the founder retired himself', () => {
    // The whole reason the mark exists rather than reading `status` alone.
    expect(restaurerApresAcces(entry({}, 'retiré_par_le_fondateur'))).toBeNull();
    expect(restaurerApresAcces(entry())).toBeNull(); // already live — nothing to do
  });
});

describe('RETRAIT-ACCÈS — his screens lose the products AND the chip', () => {
  const retire = retirerPourAcces(entry(), AT)!;
  const autre = entry({ offerId: 'offer-ra-2', product: { ...entry().product, id: 'pv-ra-2', supplierId: 'supplier-ra-2' } });

  it('the scoped list drops a retired supplier’s products', () => {
    expect(buildSupplierList('supplier-ra-1', [retire], NOW).items).toEqual([]);
  });

  it('the INVENTORY drops them too — so the chip row, derived from who owns visible products, loses him', () => {
    const inv = buildFullInventory([retire, autre], NOW);
    expect(inv.items.map((i) => i.supplierId)).toEqual(['supplier-ra-2']);
    // Explicit, because this IS the founder's sentence: « their products and
    // their chip on boutik+ gets removed as well ».
    expect(JSON.stringify(inv.items)).not.toContain('supplier-ra-1');
  });

  it('an offer with NO mark is still reached, whatever its status — the morning’s safety net', () => {
    // INVENTAIRE-COMPLET's property survives: the exclusion is keyed on the
    // MARK, never on « does this supplier hold a code ». So a product orphaned
    // some other way — including a retirement half that did not finish — is
    // still visible and still deletable, which is what that slice was for.
    const orphelin = entry({ offerId: 'offer-ra-3' }, 'inactive');
    const inv = buildFullInventory([orphelin], NOW);
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0]?.hiddenReason, 'shown, MARKED — never silently dropped').toBe('offer_not_active');
  });
});
