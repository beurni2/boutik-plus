// NEGATIVE FIXTURE (AUDIT-B+1 F23) — THE UNENFORCEABLE FRENCH DEPOSIT TERM.
// The gate carried `caution` from day one, anchored as /\bcaution\b/i — which
// is FALSE for every shape a deposit field would actually take. A live
// `terms: { cautionFcfa: 5000 }` passed this gate while the English sibling
// `sellerDepositFcfa` was caught correctly.
//
// B+I-12: zero seller deposit, ever. No reserve field, no flow, no exception.
// The no-seller-deposit gate MUST fail on this file. Never import this.
export interface ConditionsVendeur {
  vendeurId: string;
  cautionFcfa: number; // banned: the exact shape the anchored pattern missed
  caution_vendeur_fcfa: number; // banned: snake_case
  GARANTIE_VENDEUR_FCFA: number; // banned: SCREAMING_SNAKE
  acompte: number; // banned
  arrhes: number; // banned
}
export function exigerCaution(c: ConditionsVendeur, montant: number): void {
  // banned: a seller is never asked to put money down to sell
  c.cautionFcfa = montant;
}
export const fraisDInscription = 2000; // banned: no onboarding fee
export const nantissement = true; // banned
