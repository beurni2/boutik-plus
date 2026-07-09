// NEGATIVE FIXTURE (WO-B0.1 DoD): a seller deposit field/flow — the
// no-seller-deposit gate MUST fail on this file. Never import this.
export interface SellerAccount {
  sellerId: string;
  sellerDeposit: number; // banned: B+I-12 — zero seller deposit, ever
  reserveBalance: number; // banned: no reserve field
}
export function collectOnboardingFee(seller: SellerAccount, onboardingFee: number): void {
  seller.sellerDeposit += onboardingFee;
}
