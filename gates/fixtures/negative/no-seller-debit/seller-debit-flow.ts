// NEGATIVE FIXTURE (WO-2.6 DoD): a seller-fault money consequence — the
// no-seller-debit gate MUST fail on this file. Never import this.
export interface SellerFaultConsequence {
  sellerId: string;
  debitFcfa: number; // banned: B+I-12 — consequences are access-based, never money
}
export function deductFromSellerPayout(consequence: SellerFaultConsequence): number {
  // banned: withholding the seller's money over a fault
  const retenue = consequence.debitFcfa; // banned: retenue sur ventes
  return retenue;
}
// The verifier's evasion file (WO-2.6 finding 1) — every line below MUST hit:
export const penaltyFcfa = 500; // banned: penalty
export const amendeFcfa = 500; // banned: amende
export const clawbackFcfa = 500; // banned: clawback
export const payoutSanction = 'suspend'; // banned: sanction
export const withheldFcfa = 500; // banned: withheld (past tense escaped /withh?old/)
export const fineFcfa = 500; // banned: fine
