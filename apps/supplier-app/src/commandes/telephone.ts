/**
 * TEL-PAIRES (founder order 2026-08-09) — « on the phone make spaced after 2
 * numbers like this 76 16 02 55 », displayed where the founder reads the
 * buyer's contact on « Prêt à livrer ». DISPLAY-ONLY here: the stored contact
 * travels untouched; old orders arrive unspaced and new ones may arrive
 * spaced (the buyer PWA now formats as she types) — this renders both
 * identically. Idempotent: formatting a formatted number changes nothing.
 * Same 5 lines as the buyer PWA's `cliente/telephone.ts` — a two-repo pure
 * function, deliberately duplicated rather than minting a canon package for
 * one formatter.
 */
export function telEnPaires(brut: string): string {
  const plus = brut.trimStart().startsWith('+') ? '+' : '';
  const chiffres = brut.replace(/\D/g, '').slice(0, 15);
  return plus + chiffres.replace(/(\d{2})(?=\d)/g, '$1 ');
}
