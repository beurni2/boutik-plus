// NEGATIVE FIXTURE (B2 · B7.2): a seller-fault money consequence on the statement /
// trust surface — the no-seller-debit gate MUST fail on this file. Never import it.
// B+I-12: a seller fault is ACCESS-based (faultCount / restrictions / tier), NEVER
// money; the Protection Fund absorbs the loss. A statement that debits the seller
// for a fault, or a « retenue »/« pénalité » on their proceeds, is forbidden.
export interface FaultStatementLine {
  sellerId: string;
  faultDebitFcfa: number; // banned: a fault debits the seller
}
export function retenueSurFaute(line: FaultStatementLine): number {
  const penalite = line.faultDebitFcfa; // banned: pénalité + débit on a fault
  return penalite;
}

// One line per otherwise-unexercised pattern — a pattern nothing tests can be
// deleted without CI noticing.
export const prelevementSurGains = 100; // banned
export const sellerCharge = 100; // banned
export function chargeSeller(): void {} // banned
export function garnishEarnings(): void {} // banned
