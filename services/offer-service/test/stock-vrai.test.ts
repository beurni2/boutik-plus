import { describe, expect, it } from 'vitest';
import { ProductVersionSchema, SupplierOfferSchema } from '@platform/contracts';
import {
  decideConfirmStock,
  decideCreateOffer,
  decideProlonger,
  OFFER_RENEWAL_MS,
  type CreateOfferCommand,
  type OfferEntry,
} from '../src/offer-core.js';
import { buildSupplierList } from '../src/supplier-list.js';

/**
 * STOCK-VRAI-1 (AUDIT-B+2 slice 6) — the units of two laws.
 *
 * F-03: what he types is what is in his hands; a paid parcel waiting for the
 * rider is in his hands but already left the counter at payment. The counter
 * becomes `max(0, typed − enAttente)`, and the journal keeps both numbers.
 *
 * F-12: « Prolonger d'un an » moves the end of the sale window one year past
 * today or past the current end, whichever is later — same offer, same
 * product, same money, same status, the version up by one (B+I-04).
 */

const T0 = '2026-09-28T08:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const plus = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();

const product = ProductVersionSchema.parse({
  id: 'pv-sv-1',
  supplierId: 'supplier-founder-001',
  version: 1,
  name: 'Bazin',
  productCode: 'BAZ-01',
  facts: {},
  category: 'textile',
  zone: 'Gounghin',
  moderationState: 'approved',
  status: 'active',
  supplyMode: 'SELLER_HELD',
});

const cmd = (available: number, expiry = '2027-07-01T00:00:00.000Z'): CreateOfferCommand => ({
  commandId: 'cmd-sv-1',
  offerId: 'offer-sv-1',
  product,
  draft: {
    productVersionId: product.id,
    basePrice: 10_000,
    resellerCommission: 750,
    eligibleVariants: [],
    zones: [],
    effective: '2026-07-01T00:00:00.000Z',
    expiry,
  },
  available,
  asOf: T0,
});

function created(available: number, expiry?: string): OfferEntry {
  const { decision } = decideCreateOffer(undefined, cmd(available, expiry), T0);
  if (decision.status !== 'created') throw new Error('fixture create failed');
  return decision.entry;
}

describe('F-03 — the count takes off the parcels still waiting for the rider', () => {
  it('the audit probe: 3 declared, one sold and not collected (counter 2), he counts 3 in hand → the counter stays 2, `confirme`', () => {
    const vendu = { ...created(3), available: 2 };
    const d = decideConfirmStock(vendu, { commandId: 'act-1', available: 3, enAttente: 1 }, T0);
    expect(d.status).toBe('confirmed');
    if (d.status === 'refused') return;
    expect(d.entry.available).toBe(2);
    expect(d.row).toMatchObject({ kind: 'confirme', from: 2, to: 2, compte: 3, enAttente: 1 });
  });

  it('he counts more than the counter and the parcels → `ajuste` to the difference, both numbers journalled', () => {
    const d = decideConfirmStock(created(2), { commandId: 'act-2', available: 7, enAttente: 2 }, T0);
    expect(d.status).toBe('adjusted');
    if (d.status === 'refused') return;
    expect(d.entry.available).toBe(5);
    expect(d.row).toMatchObject({ kind: 'ajuste', from: 2, to: 5, compte: 7, enAttente: 2 });
  });

  it('fewer in hand than the parcels waiting → the counter floors at 0, never negative', () => {
    const d = decideConfirmStock(created(4), { commandId: 'act-3', available: 1, enAttente: 3 }, T0);
    if (d.status === 'refused') throw new Error('refused');
    expect(d.entry.available).toBe(0);
    expect(d.row).toMatchObject({ from: 4, to: 0, compte: 1, enAttente: 3 });
  });

  it('a waiting count that is not a whole number ≥ 0 subtracts nothing (it can only lower the counter, never raise it)', () => {
    for (const bad of [-2, 1.5, Number.NaN]) {
      const d = decideConfirmStock(created(1), { commandId: 'act-4', available: 6, enAttente: bad }, T0);
      if (d.status === 'refused') throw new Error('refused');
      expect(d.entry.available, `enAttente ${bad}`).toBe(6);
      expect(d.row.enAttente).toBe(0);
    }
  });

  it('a bad typed count is still refused by name, whatever is waiting', () => {
    expect(decideConfirmStock(created(1), { commandId: 'x', available: -1, enAttente: 2 }, T0)).toEqual({ status: 'refused', reason: 'invalid_qty' });
  });
});

describe('F-12 — « Prolonger d’un an »', () => {
  it('a live offer: one year after its CURRENT end (not after today), same ids and money, version + 1', () => {
    const e = created(3, '2027-01-15T00:00:00.000Z');
    const next = decideProlonger(e, T0);
    expect(next.offer.expiry).toBe(plus('2027-01-15T00:00:00.000Z', OFFER_RENEWAL_MS));
    expect(next.offer.version).toBe(e.offer.version + 1);
    expect(next.offer).toMatchObject({
      id: e.offer.id,
      productVersionId: e.offer.productVersionId,
      basePrice: e.offer.basePrice,
      resellerCommission: e.offer.resellerCommission,
      effective: e.offer.effective,
      status: e.offer.status,
    });
    expect(next.offerId).toBe(e.offerId);
    expect(next.product).toEqual(e.product);
    expect(next.available).toBe(e.available);
    expect(SupplierOfferSchema.safeParse(next.offer).success).toBe(true);
  });

  it('a LAPSED offer: one year after TODAY — the lapsed months are not counted as renewed', () => {
    const e = created(3, '2026-08-01T00:00:00.000Z');
    expect(decideProlonger(e, T0).offer.expiry).toBe(plus(T0, OFFER_RENEWAL_MS));
  });

  it('the year is 365 days', () => {
    expect(OFFER_RENEWAL_MS).toBe(365 * DAY);
  });

  it('a lapsed offer the ladder hid is back on sale after the renewal — on his own list, same row', () => {
    const e = created(3, '2026-08-01T00:00:00.000Z');
    const avant = buildSupplierList(product.supplierId, [e], T0).items[0]!;
    expect(avant.hiddenReason).toBe('offer_not_effective');
    const apres = buildSupplierList(product.supplierId, [decideProlonger(e, T0)], T0).items[0]!;
    expect(apres.hiddenReason).toBeUndefined();
    expect(apres.expiry).toBe(plus(T0, OFFER_RENEWAL_MS));
    expect(apres.offerId).toBe(avant.offerId);
    expect(apres.productVersionId).toBe(avant.productVersionId);
  });

  it('never mutates its input', () => {
    const e = created(3);
    const before = JSON.stringify(e);
    decideProlonger(e, T0);
    expect(JSON.stringify(e)).toBe(before);
  });
});
