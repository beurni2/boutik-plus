import { describe, expect, it } from 'vitest';
import { ProductVersionSchema } from '@platform/contracts';
import {
  decideConfirmStock,
  decideCreateOffer,
  journalRow,
  STOCK_RECONFIRM_DUE_MS,
  stockOverdue,
  type CreateOfferCommand,
  type OfferEntry,
} from '../src/offer-core.js';
import { stockDueMs } from '../src/stock-freeze.js';
import { buildSupplyProjection } from '../src/projection.js';
import { buildSupplierList } from '../src/supplier-list.js';

/**
 * STOCK-JOURNAL-1 (B5.2 « Immutable adjustments + reconfirmation freeze ») —
 * the UNITS of the two laws.
 *
 * THE JOURNAL: every movement of `available` is a row, numbered, stamped with
 * the SERVER clock, saying from and to. The declaration is row one. Rows are
 * never edited (nothing here can edit one — there is no function for it).
 *
 * THE FREEZE: a stock nobody has vouched for within the window is refused by
 * the ladder as `stock_unconfirmed` — the last rung, so it can only hide an
 * offer that would otherwise be live. Absent means « never confirmed » and is
 * NOT frozen (the pre-slice catalogue must not vanish at deploy).
 */

const T0 = '2026-09-17T08:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const plus = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();

const product = ProductVersionSchema.parse({
  id: 'pv-sj-1',
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

const cmd = (available = 10): CreateOfferCommand => ({
  commandId: 'cmd-sj-1',
  offerId: 'offer-sj-1',
  product,
  draft: {
    productVersionId: product.id,
    basePrice: 10_000,
    resellerCommission: 750,
    eligibleVariants: [],
    zones: [],
    effective: '2026-07-01T00:00:00.000Z',
    expiry: '2027-07-01T00:00:00.000Z',
  },
  available,
  asOf: '2020-01-01T00:00:00.000Z', // a DEVICE clock, deliberately absurd — must never be the stamp
});

function created(available = 10, now = T0): OfferEntry {
  const { decision } = decideCreateOffer(undefined, cmd(available), now);
  if (decision.status !== 'created') throw new Error('fixture create failed');
  return decision.entry;
}

describe('THE DECLARATION IS ROW ONE, stamped with the SERVER clock', () => {
  it('create stamps stockConfirmedAt with nowIso — never the command’s own asOf', () => {
    const { decision, next } = decideCreateOffer(undefined, cmd(), T0);
    expect(decision.status).toBe('created');
    if (decision.status !== 'created') return;
    expect(decision.entry.stockConfirmedAt).toBe(T0);
    expect(decision.entry.stockConfirmedAt).not.toBe(cmd().asOf);
    expect(next?.stockConfirmedAt).toBe(T0);
  });

  it('create returns the `declare` row: seq 1, 0 → available, carrying the create commandId', () => {
    const { decision } = decideCreateOffer(undefined, cmd(7), T0);
    if (decision.status !== 'created') throw new Error('unreachable');
    expect(decision.row).toEqual({ seq: 1, at: T0, kind: 'declare', from: 0, to: 7, commandId: 'cmd-sj-1' });
    expect(decision.entry.journalSeq).toBe(1);
  });

  it('an idempotent replay returns NO row and does not restamp (the counter did not move)', () => {
    const first = decideCreateOffer(undefined, cmd(), T0);
    const replay = decideCreateOffer(first.next, cmd(), plus(T0, DAY));
    expect(replay.decision.status).toBe('idempotent');
    expect('row' in replay.decision).toBe(false);
    expect(replay.next).toBeUndefined();
  });
});

describe('journalRow — one call mints the row AND advances the sequence', () => {
  it('numbers rows consecutively off the entry’s own counter', () => {
    const e = created(10);
    const a = journalRow(e, 'vendu', 10, 9, T0, { orderId: 'ord-1' });
    const b = journalRow(a.next, 'vendu', 9, 8, T0, { orderId: 'ord-2' });
    expect(a.row.seq).toBe(2);
    expect(b.row.seq).toBe(3);
    expect(b.next.journalSeq).toBe(3);
    expect(a.row).toEqual({ seq: 2, at: T0, kind: 'vendu', from: 10, to: 9, orderId: 'ord-1' });
  });

  it('a pre-slice entry (no journalSeq) starts at 1', () => {
    const { journalSeq: _drop, ...legacy } = created(3);
    expect(journalRow(legacy as OfferEntry, 'vendu', 3, 2, T0, { orderId: 'o' }).row.seq).toBe(1);
  });

  it('omits orderId / commandId keys rather than writing undefined', () => {
    const row = journalRow(created(), 'rendu', 1, 2, T0, { orderId: 'ord-9' }).row;
    expect(Object.keys(row)).toEqual(['seq', 'at', 'kind', 'from', 'to', 'orderId']);
  });
});

describe('decideConfirmStock — the challenge capture', () => {
  it('the typed count EQUAL to the counter → `confirme`, counter unchanged, clock restarted', () => {
    const e = created(10, T0);
    const later = plus(T0, 3 * DAY);
    const d = decideConfirmStock(e, { commandId: 'act-1', available: 10 }, later);
    expect(d.status).toBe('confirmed');
    if (d.status !== 'confirmed') return;
    expect(d.entry.available).toBe(10);
    expect(d.entry.stockConfirmedAt).toBe(later);
    expect(d.row).toEqual({ seq: 2, at: later, kind: 'confirme', from: 10, to: 10, commandId: 'act-1' });
    expect(d.entry.journalSeq).toBe(2);
  });

  it('a DIFFERENT count → `ajuste`, the counter is SET to what he typed (not a delta), clock restarted', () => {
    const e = created(10, T0);
    const later = plus(T0, 3 * DAY);
    const d = decideConfirmStock(e, { commandId: 'act-2', available: 4 }, later);
    expect(d.status).toBe('adjusted');
    if (d.status !== 'adjusted') return;
    expect(d.entry.available).toBe(4);
    expect(d.entry.stockConfirmedAt).toBe(later);
    expect(d.row).toEqual({ seq: 2, at: later, kind: 'ajuste', from: 10, to: 4, commandId: 'act-2' });
  });

  it('zero is a legal count (he sold out at the stall); negatives, fractions and NaN are refused', () => {
    const e = created(10);
    expect(decideConfirmStock(e, { commandId: 'z', available: 0 }, T0).status).toBe('adjusted');
    for (const bad of [-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = decideConfirmStock(e, { commandId: 'bad', available: bad }, T0);
      expect(d).toEqual({ status: 'refused', reason: 'invalid_qty' });
    }
    expect(e.available, 'a refused act mutated the entry').toBe(10);
  });

  it('never mutates its input', () => {
    const e = created(10, T0);
    decideConfirmStock(e, { commandId: 'act-3', available: 2 }, plus(T0, DAY));
    expect(e.available).toBe(10);
    expect(e.stockConfirmedAt).toBe(T0);
    expect(e.journalSeq).toBe(1);
  });
});

describe('stockOverdue — the window, and what absent means', () => {
  it('within the window → not overdue; past it → overdue (boundary: exactly the window is NOT overdue)', () => {
    expect(stockOverdue(T0, plus(T0, STOCK_RECONFIRM_DUE_MS - 1))).toBe(false);
    expect(stockOverdue(T0, plus(T0, STOCK_RECONFIRM_DUE_MS))).toBe(false);
    expect(stockOverdue(T0, plus(T0, STOCK_RECONFIRM_DUE_MS + 1))).toBe(true);
  });

  it('the window is SEVEN DAYS', () => {
    expect(STOCK_RECONFIRM_DUE_MS).toBe(7 * DAY);
  });

  it('ABSENT (a pre-slice entry) is never overdue — shown as unconfirmed, not frozen at deploy', () => {
    expect(stockOverdue(undefined, plus(T0, 400 * DAY))).toBe(false);
  });

  it('an unparseable stamp is treated as absent, never as frozen forever', () => {
    expect(stockOverdue('not-a-date', plus(T0, 400 * DAY))).toBe(false);
  });

  it('a custom window (the seam’s knob) is honoured', () => {
    expect(stockOverdue(T0, plus(T0, 1_001), 1_000)).toBe(true);
    expect(stockOverdue(T0, plus(T0, 999), 1_000)).toBe(false);
  });
});

describe('stockDueMs — the LOWER-ONLY env knob', () => {
  it('unset / malformed / non-positive / larger-than-canon all read as the constant', () => {
    for (const v of [undefined, '', 'abc', '0', '-5', '1.5', String(STOCK_RECONFIRM_DUE_MS + 1), String(30 * DAY)]) {
      expect(stockDueMs({ STOCK_RECONFIRM_DUE_MS: v })).toBe(STOCK_RECONFIRM_DUE_MS);
    }
  });
  it('a smaller integer SHORTENS the window (the seam test’s use)', () => {
    expect(stockDueMs({ STOCK_RECONFIRM_DUE_MS: '1000' })).toBe(1_000);
    expect(stockDueMs({ STOCK_RECONFIRM_DUE_MS: String(STOCK_RECONFIRM_DUE_MS) })).toBe(STOCK_RECONFIRM_DUE_MS);
  });
});

describe('THE LADDER — `stock_unconfirmed` is the LAST rung', () => {
  const e = created(10, T0);

  it('confirmed within the window → the projection serves', () => {
    const out = buildSupplyProjection(e.product, e.offer, e.available, plus(T0, 6 * DAY), undefined, undefined, {
      confirmedAt: e.stockConfirmedAt,
    });
    expect(out.ok).toBe(true);
  });

  it('confirmed OUTSIDE the window → refused as stock_unconfirmed', () => {
    const out = buildSupplyProjection(e.product, e.offer, e.available, plus(T0, 8 * DAY), undefined, undefined, {
      confirmedAt: e.stockConfirmedAt,
    });
    expect(out).toEqual({ ok: false, reason: 'stock_unconfirmed' });
  });

  it('the rung is LAST: an expired offer answers offer_not_effective even when the stock is also overdue', () => {
    const out = buildSupplyProjection(e.product, e.offer, e.available, '2028-01-01T00:00:00.000Z', undefined, undefined, {
      confirmedAt: e.stockConfirmedAt,
    });
    expect(out).toEqual({ ok: false, reason: 'offer_not_effective' });
  });

  it('no stock argument at all → no freeze decided (the pure caller’s choice, never a default here)', () => {
    // 200 days: far past the window, still inside the offer's own validity.
    expect(buildSupplyProjection(e.product, e.offer, e.available, plus(T0, 200 * DAY)).ok).toBe(true);
  });

  it('a custom window flows through', () => {
    const out = buildSupplyProjection(e.product, e.offer, e.available, plus(T0, 2_000), undefined, undefined, {
      confirmedAt: e.stockConfirmedAt,
      dueMs: 1_000,
    });
    expect(out).toEqual({ ok: false, reason: 'stock_unconfirmed' });
  });
});

describe('HIS LIST — the row says when it was confirmed, and why it is hidden', () => {
  it('a fresh offer carries stockConfirmedAt and no hiddenReason', () => {
    const e = created(10, T0);
    const row = buildSupplierList(product.supplierId, [e], plus(T0, DAY)).items[0]!;
    expect(row.stockConfirmedAt).toBe(T0);
    expect(row.hiddenReason).toBeUndefined();
  });

  it('past the window the SAME row says hiddenReason: stock_unconfirmed — shown, marked, never dropped', () => {
    const e = created(10, T0);
    const out = buildSupplierList(product.supplierId, [e], plus(T0, 8 * DAY));
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.hiddenReason).toBe('stock_unconfirmed');
    expect(out.items[0]!.stockConfirmedAt).toBe(T0);
  });

  it('the list honours the shortened window exactly as the wire does (one ladder, one home)', () => {
    const e = created(10, T0);
    expect(buildSupplierList(product.supplierId, [e], plus(T0, 2_000), 1_000).items[0]!.hiddenReason).toBe('stock_unconfirmed');
    expect(buildSupplierList(product.supplierId, [e], plus(T0, 500), 1_000).items[0]!.hiddenReason).toBeUndefined();
  });

  it('a PRE-SLICE entry (no stamp) has no stockConfirmedAt on its row and is NOT hidden', () => {
    const { stockConfirmedAt: _drop, ...legacy } = created(10, T0);
    // 200 days: far past the window, still inside the offer's own validity.
    const row = buildSupplierList(product.supplierId, [legacy as OfferEntry], plus(T0, 200 * DAY)).items[0]!;
    expect('stockConfirmedAt' in row).toBe(false);
    expect(row.hiddenReason).toBeUndefined();
  });
});
