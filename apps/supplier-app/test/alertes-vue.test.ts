import { describe, expect, it } from 'vitest';
import { ligneCommande, phraseDepuis, phraseGarde, suiteAlerte, titreAlerte } from '../src/alertes/view';
import { ALERTES_PAR, ALERTES_RELECTURE_MS, type AlerteOuverte } from '../src/alertes/service';

/**
 * The words of Séra's alerts on the founder's console, decided purely. Séra
 * names three problems (Execution Contract §6: a ready parcel with no course
 * past its window, a parcel whose custody file does not vouch for itself,
 * proof of delivery received and not yet validated). Each is said in plain
 * words; no raw custody word reaches the screen, and only the ready parcel
 * has a next step he can take from this console.
 *
 * Ouagadougou keeps UTC all year, so « heure de Ouagadougou » is the UTC
 * clock (`quandOuaga`, pinned in `sos-vue.test.ts`).
 */

const MAINTENANT = new Date('2026-11-28T15:00:00.000Z');

const pret = (over: Partial<AlerteOuverte> = {}): AlerteOuverte => ({
  id: 'ready_package_no_task:ord-1:2026-11-28T13:55:00.000Z',
  scenario: 'ready_package_no_task',
  orderId: 'ord-1',
  orderIds: null,
  depuis: '2026-11-28T13:55:00.000Z',
  detail: null,
  ...over,
});
const garde = (detail: string): AlerteOuverte => ({
  id: 'impossible_custody:ord-2',
  scenario: 'impossible_custody',
  orderId: 'ord-2',
  orderIds: null,
  depuis: '2026-11-27T23:50:00.000Z',
  detail,
});
const preuve: AlerteOuverte = {
  id: 'evidence_not_validated_aging:ord-3',
  scenario: 'evidence_not_validated_aging',
  orderId: 'ord-3',
  orderIds: null,
  depuis: '2026-11-28T09:04:00.000Z',
  detail: null,
};

describe('titreAlerte — what the problem is, in his words', () => {
  it('one title per problem Séra names', () => {
    expect(titreAlerte(pret())).toBe('Colis prêt, sans course');
    expect(titreAlerte(garde('chain_tampered'))).toBe('Suivi du colis à vérifier');
    expect(titreAlerte(preuve)).toBe('Preuve de livraison pas encore validée');
  });
});

describe('ligneCommande — which order, by the reference Séra gave', () => {
  it('one order', () => {
    expect(ligneCommande(pret())).toBe('Commande ord-1');
    expect(ligneCommande(preuve)).toBe('Commande ord-3');
  });
  it('a parcel of several orders: how many, under its first order', () => {
    expect(ligneCommande(pret({ orderId: 'ord-a', orderIds: ['ord-a', 'ord-b'] }))).toBe('Colis de 2 commandes · commande ord-a');
    expect(ligneCommande(pret({ orderId: 'ord-a', orderIds: ['ord-a', 'ord-b', 'ord-c'] }))).toBe('Colis de 3 commandes · commande ord-a');
  });
});

describe('phraseDepuis — since when, on the Ouagadougou clock, said for what it is', () => {
  it('the ready parcel: since it was ready', () => {
    expect(phraseDepuis(pret(), MAINTENANT)).toBe("Prêt depuis aujourd'hui à 13 h 55, heure de Ouagadougou.");
  });
  it('the custody file: since Séra saw it', () => {
    expect(phraseDepuis(garde('replay_diverged'), MAINTENANT)).toBe('Vu par Séra le 27/11 à 23 h 50, heure de Ouagadougou.');
  });
  it('the proof: since Séra received it', () => {
    expect(phraseDepuis(preuve, MAINTENANT)).toBe("Preuve reçue par Séra aujourd'hui à 9 h 04, heure de Ouagadougou.");
  });
  it('a time the reader cannot read is not dressed up as one', () => {
    expect(phraseDepuis(pret({ depuis: 'pas une date' }), MAINTENANT)).toBe('');
  });
});

describe('phraseGarde — the six ways a custody file fails to vouch for itself, in plain words', () => {
  it('says each, and never the custody word itself', () => {
    const six: [string, string][] = [
      ['existing_command_log_without_chain', 'Les étapes du colis sont notées, mais leur chaîne de contrôle manque.'],
      ['head_missing_for_existing_record', 'La dernière étape notée du colis manque.'],
      ['chain_tampered', 'La chaîne de contrôle du colis a été changée après coup.'],
      ['command_log_tampered', 'La liste des étapes du colis a été changée après coup.'],
      ['replay_diverged', 'Séra relit les étapes du colis et ne retrouve pas le même résultat.'],
      ['chain_does_not_name_this_object', "La chaîne de contrôle notée ici parle d'un autre colis."],
    ];
    for (const [code, phrase] of six) {
      expect(phraseGarde(code), code).toBe(phrase);
      expect(phraseGarde(code)!.includes(code), `${code} never on screen`).toBe(false);
    }
  });
  it('no detail, or one Séra does not name: no meaning line, never a guessed one', () => {
    expect(phraseGarde(null)).toBeNull();
    expect(phraseGarde('something_else')).toBeNull();
  });
});

describe('suiteAlerte — the next step, only where this console has one', () => {
  it('the ready parcel: create its course in Commandes, then hand it to a rider', () => {
    expect(suiteAlerte(pret())).toBe('Créez sa course dans Commandes, puis confiez-la à un coursier.');
  });
  it('the custody file and the proof: no step is invented', () => {
    expect(suiteAlerte(garde('chain_tampered'))).toBeNull();
    expect(suiteAlerte(preuve)).toBeNull();
  });
});

describe('the two fixed values of the alerts section', () => {
  it('re-read every 60 s while he looks, closed as « founder »', () => {
    // The walks move the section's clock by this much; a change here is a
    // change the coordinator rules and the founder is told.
    expect(ALERTES_RELECTURE_MS).toBe(60_000);
    expect(ALERTES_PAR).toBe('founder');
  });
});
