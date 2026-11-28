import { t } from '../i18n';
import { quandOuaga } from '../sos/view';
import type { AlerteOuverte } from './service';

const TITRES = {
  ready_package_no_task: 'alertes.titre_pret',
  impossible_custody: 'alertes.titre_garde',
  evidence_not_validated_aging: 'alertes.titre_preuve',
} as const;

const DEPUIS = {
  ready_package_no_task: 'alertes.pret_depuis',
  impossible_custody: 'alertes.garde_depuis',
  evidence_not_validated_aging: 'alertes.preuve_depuis',
} as const;

/** The six ways custody says a file fails to vouch for itself; each has its plain words. */
const GARDES = [
  'existing_command_log_without_chain',
  'head_missing_for_existing_record',
  'chain_tampered',
  'command_log_tampered',
  'replay_diverged',
  'chain_does_not_name_this_object',
];

export function titreAlerte(a: AlerteOuverte): string {
  return t(TITRES[a.scenario]);
}

/** Which order, by the reference Séra gave; a parcel says how many, under its first. */
export function ligneCommande(a: AlerteOuverte): string {
  return a.orderIds === null
    ? t('alertes.commande').replace('{ref}', a.orderId)
    : t('alertes.colis').replace('{n}', String(a.orderIds.length)).replace('{ref}', a.orderId);
}

/** Since when, on the Ouagadougou clock; empty when the time cannot be read. */
export function phraseDepuis(a: AlerteOuverte, maintenant: Date): string {
  const quand = quandOuaga(a.depuis, maintenant);
  return quand === '' ? '' : t(DEPUIS[a.scenario]).replace('{quand}', quand);
}

/** The custody file's failure in plain words; null when Séra names none this console knows. */
export function phraseGarde(detail: string | null): string | null {
  return detail !== null && GARDES.includes(detail) ? t(`alertes.garde_${detail}`) : null;
}

/** The next step, only where this console has one (runbook 03: create the course, hand it to a rider). */
export function suiteAlerte(a: AlerteOuverte): string | null {
  return a.scenario === 'ready_package_no_task' ? t('alertes.suite_pret') : null;
}
