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

// Additional English shapes — one per otherwise-unexercised pattern.
export const depotDeGarantie = 'banned: dépôt';
export const sellerReserve = 0; // banned
export const securityBond = 0; // banned
export const subscriptionFee = 0; // banned
export const signupFee = 500; // banned
export const joiningFee = 500; // banned
