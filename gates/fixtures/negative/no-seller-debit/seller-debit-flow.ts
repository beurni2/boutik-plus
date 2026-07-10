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
