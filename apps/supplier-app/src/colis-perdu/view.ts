import type { ReponseColis } from './service';

/**
 * What he typed, as whole francs: digits only (spaces he typed between
 * thousands are dropped), and more than zero. Anything else is no amount: the
 * console never rounds, splits or guesses one.
 */
export function montantTape(brut: string): number | null {
  const s = brut.replace(/\s/g, '');
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The sentence for each of Séra's answers, by name. */
export function phraseReponse(r: ReponseColis): string {
  switch (r.kind) {
    case 'declare':
      return 'perdu.declare';
    case 'deja_declare':
      return 'perdu.deja';
    case 'no_active_course':
      return 'perdu.course_finie';
    case 'pas_chez_le_livreur':
      return 'perdu.pas_chez_livreur';
    case 'montants_incomplets':
      return 'perdu.montants_refuses';
    case 'malformed':
      return 'perdu.mal_lu';
    case 'custody':
      return 'perdu.pas_fini';
    case 'bad_key':
      return 'perdu.cle_refusee';
    case 'non_su':
      return 'perdu.non_su';
  }
}

/**
 * The answers after which the SAME declaration may be sent again, under the
 * same command id: nobody knows yet whether it landed, or Séra could not
 * finish (custody not reached) and part of it may already be declared. A new
 * id here could open a second claim; every other answer ends the act.
 */
export function aRenvoyer(r: ReponseColis): boolean {
  return r.kind === 'non_su' || r.kind === 'custody';
}
