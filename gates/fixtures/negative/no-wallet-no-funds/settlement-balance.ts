// NEGATIVE FIXTURE (B1 · B7.1): a settlement surface that keeps a LOCAL BALANCE
// and offers a WITHDRAWAL — both forbidden (B7.1: "no withdrawal; no local
// balance"; Ten Laws #2: no app holds funds). Boutik+ READS SettlementObligation;
// it never computes a running balance and never offers a withdraw button. The
// no-wallet-no-funds gate MUST fail on this file. Never import this.
export interface SupplierSettlementWallet {
  supplierId: string;
  balance: number; // banned: no local balance — the receivable is READ, never accumulated
}
export function withdrawSettlement(w: SupplierSettlementWallet, amount: number): void {
  // banned: a withdrawal that mutates a locally-held balance
  w.balance -= amount;
}
