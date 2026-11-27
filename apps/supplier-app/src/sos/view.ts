import { t } from '../i18n';

/** Who raised it: what the strip may say about the rider, and nothing more. */
export interface QuiSos {
  readonly riderId: string;
  readonly nom: string | null;
  readonly telephone: string | null;
}

const deux = (n: number): string => String(n).padStart(2, '0');

/**
 * « aujourd'hui à 14 h 05 » or « le 26/11 à 23 h 50 », on the Ouagadougou
 * clock. Burkina Faso keeps UTC all year (no summer time), so the Ouagadougou
 * clock IS the UTC clock: reading the UTC fields says the rider's hour on any
 * device, whatever its time zone. Empty when the time cannot be read.
 */
export function quandOuaga(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heure = t('sos.heure').replace('{h}', String(d.getUTCHours())).replace('{mm}', deux(d.getUTCMinutes()));
  const memeJour =
    d.getUTCFullYear() === maintenant.getUTCFullYear() &&
    d.getUTCMonth() === maintenant.getUTCMonth() &&
    d.getUTCDate() === maintenant.getUTCDate();
  if (memeJour) return t('sos.quand_aujourdhui').replace('{heure}', heure);
  return t('sos.quand_le').replace('{date}', `${deux(d.getUTCDate())}/${deux(d.getUTCMonth() + 1)}`).replace('{heure}', heure);
}

/** When Séra received it, said on the rider's clock; empty when unreadable. */
export function phraseRecu(iso: string, maintenant: Date): string {
  const quand = quandOuaga(iso, maintenant);
  return quand === '' ? '' : t('sos.recu').replace('{quand}', quand);
}

/** The name he typed (or the id Séra gave), and the phone he typed when there is one. */
export function titreSos(o: QuiSos): string {
  const nom = o.nom ?? o.riderId;
  const tel = o.telephone?.trim() ?? '';
  return tel === '' ? t('sos.titre').replace('{nom}', nom) : t('sos.titre_tel').replace('{nom}', nom).replace('{tel}', tel);
}

export function phraseCourse(enCourse: boolean): string {
  return enCourse ? t('sos.en_course') : t('sos.pas_en_course');
}
