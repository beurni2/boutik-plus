import type { SellerTrustState } from '@platform/contracts';

/**
 * B2 · B7.2 (🔴 RED) — statements + the trust/consequence view.
 *  - B7.2: "Server-generated; seller-fault losses do NOT touch the seller money
 *    (Protection Fund absorbs); trust-tier consequences shown."
 *  - B+I-12: seller consequences are ACCESS-based, never money.
 *  - Canon SellerTrustState is "progression, not payment" — it carries NO money
 *    field, so a fault can only ever be faultCount++/restrictions, never money.
 *
 * Boutik+ holds no funds and computes no statement: the figures are REPORTED by
 * Ledger&Settlement (server-generated). This module presents them verbatim and
 * presents the trust state as access-based consequences — nothing here takes a
 * seller's money or re-sums a total.
 */

/** A server-generated account statement — authoritative INPUT, displayed verbatim. */
export interface SupplierStatement {
  readonly periodLabel: string;
  /** FCFA reported PAID this period by the authority (never re-summed here). */
  readonly paidTotal: number;
  /** FCFA reported still PENDING by the authority. */
  readonly pendingTotal: number;
  readonly orderCount: number;
  /** Server time the authority generated the statement. */
  readonly generatedAt: string;
}

/** The proceeds figures — taken VERBATIM from the server statement, never recomputed. */
export function statementFigures(s: SupplierStatement): { paid: number; pending: number } {
  return { paid: s.paidTotal, pending: s.pendingTotal };
}

/**
 * The trust/consequence view — ACCESS-based only. Derived solely from the access
 * fields of the canon SellerTrustState; there is no money field to carry and none
 * is added. A fault shows as a raised faultCount and restrictions, never money.
 */
export interface TrustConsequenceView {
  readonly tier: SellerTrustState['tier'];
  readonly faultCount: number;
  readonly restrictions: readonly string[];
  readonly limits: SellerTrustState['probationLimits'];
}

export function presentTrustConsequence(state: SellerTrustState): TrustConsequenceView {
  return {
    tier: state.tier,
    faultCount: state.faultCount,
    restrictions: state.restrictions,
    limits: state.probationLimits,
  };
}
