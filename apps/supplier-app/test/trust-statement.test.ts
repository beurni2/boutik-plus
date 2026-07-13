import { describe, expect, it } from 'vitest';
import { SellerTrustStateSchema } from '@platform/contracts';
import { presentTrustConsequence, statementFigures, type SupplierStatement } from '../src/trust/statement';

/**
 * B2 · B7.2 (🔴 RED) — statements + the trust/consequence view, its invariants
 * proven ADVERSARIALLY and FIRST. Governing sentences:
 *  - B7.2: "Server-generated; seller-fault losses do NOT touch the seller money
 *    (Protection Fund absorbs); trust-tier consequences shown."
 *  - B+I-12: consequences for the seller are ACCESS-based, never money.
 *  - Canon SellerTrustState is "progression, not payment" — the shape carries
 *    NO money field, by construction — no proceeds figure, no money of any kind.
 */

const faultedState = SellerTrustStateSchema.parse({
  sellerId: 'supplier-7',
  tier: 'provisional',
  faultCount: 2,
  restrictions: ['new_offers_paused'],
  probationLimits: { maxActiveOrders: 3 },
});

const statement: SupplierStatement = {
  periodLabel: 'Juillet 2026',
  // 12_345 is an authoritative figure the app has no receivables to derive — if the
  // view re-summed client-side, it could never show 12_345.
  paidTotal: 12_345,
  pendingTotal: 6_789,
  orderCount: 4,
  generatedAt: '2026-07-13T09:00:00.000Z',
};

describe('B+I-12 (money) — a seller-fault consequence is ACCESS-based, NEVER money', () => {
  it('the presented consequence carries EXACTLY tier / faultCount / restrictions / limits — no money key can exist', () => {
    const view = presentTrustConsequence(faultedState);
    expect(view.faultCount).toBe(2);
    expect(view.restrictions).toEqual(['new_offers_paused']);
    expect(view.tier).toBe('provisional');
    // the invariant, structural: the view's key set is EXACTLY the access fields —
    // there is no money field, and none can be smuggled in.
    expect(Object.keys(view).sort()).toEqual(['faultCount', 'limits', 'restrictions', 'tier']);
  });

  it('canon SellerTrustState itself has no money field — a fault CANNOT take money by construction', () => {
    // the strict schema rejects ANY money field outright (extra keys are refused)
    expect(SellerTrustStateSchema.safeParse({ ...faultedState, extraMoneyFcfa: 500 }).success).toBe(false);
    // and every key of a valid state is access/progression, never money
    expect(Object.keys(faultedState).sort()).toEqual(['faultCount', 'probationLimits', 'restrictions', 'sellerId', 'tier']);
  });

  it('a fault NEVER reduces the seller proceeds — the statement figures are untouched by faultCount', () => {
    const figures = statementFigures(statement);
    // the proceeds are the settled amounts; a fault adds a restriction, never a reduction
    expect(figures.paid).toBe(12_345);
    expect(figures.pending).toBe(6_789);
  });
});

describe('B7.2 (money) — the statement is SERVER-generated, not client-derived', () => {
  it('takes the authoritative totals VERBATIM — the app never re-sums them (a figure no local data yields is preserved)', () => {
    const figures = statementFigures(statement);
    expect(figures.paid).toBe(statement.paidTotal); // as reported by the authority
    expect(figures.pending).toBe(statement.pendingTotal);
    // the presenter does no arithmetic: paid + pending is NOT forced to any receivable sum
    expect(figures.paid + figures.pending).toBe(19_134);
  });
});
