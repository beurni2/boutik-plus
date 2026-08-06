#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runScanGate } from './scan.mjs';

/* Run the gate only when EXECUTED, not when imported. `fr-pattern-coverage`
   imports PATTERNS to prove every one of them is exercised by a fixture; without
   this guard that import would run the gate and exit the coverage process. */
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

/**
 * CI gate: no-seller-deposit (B+I-12, standing guardrail).
 * "No seller deposit, reserve, guarantee, bond, subscription, or onboarding
 * fee may be required." No reserve field, no flow, no exception.
 *
 * Pattern notes (maintained list):
 * - /deposit/ catches sellerDeposit, depositAmount, requiredDeposit, etc.
 *   The canonical buyer-risk field PayAtDoorEligibility.requiredDeposit lives
 *   in the pinned package (not scanned); if app code ever consumes it, this
 *   list gets a scoped allow entry via review — never silently.
 * - "reserve" is NOT banned bare: inventory reservation (B5.x) is core
 *   vocabulary. sellerReserve/reserveField/reserveBalance are.
 */
export const PATTERNS = [
    /* UNAMBIGUOUS. « dépôt » is NOT here: it is also a WAREHOUSE, and « garantie »
       alone is a WARRANTY — banning either breaks ordinary commerce code. */
    { name: 'deposit demanded of an earner', regex: /(seller|reseller|supplier|rider|courier|vendor|merchant)[_-]?deposit|deposit[_-]?(from[_-]?)?(seller|reseller|supplier|rider)/i },
    { name: 'sellerReserve', regex: /(seller|reseller|rider)[_-]?reserve/i },
    { name: 'reserveBalance/reserveAmount', regex: /reserve[_-]?(balance|amount|fcfa)/i },
    { name: 'bond demanded of an earner', regex: /(seller|reseller|rider|courier|security)[_-]?bond\b/i },
    { name: 'onboardingFee', regex: /onboarding[_-]?fee/i },
    { name: 'subscriptionFee', regex: /subscription[_-]?fee/i },
    { name: 'joining/signup/registration fee', regex: /(joining|signup|sign[_-]?up|registration)[_-]?fee/i },
    { name: "frais d'inscription/adhésion (fr)", regex: /frais[_-]?d[_'-]?(inscription|adh[ée]sion)/i },
    { name: 'caution/arrhes/nantissement bound to an earner (fr)', regex: /(caution|arrhes|nantissement|gage)s?\w{0,12}(vendeur|vendeuse|revendeur|revendeuse|fournisseur|marchand|commer[cç]ant|grossiste|boutique|g[ée]rant|agent|membre|b[ée]n[ée]ficiaire|livreur|coursier|client|cliente|utilisateur|compte)/i },
    { name: 'earner carrying caution/arrhes (fr)', regex: /(vendeur|vendeuse|revendeur|revendeuse|fournisseur|marchand|commer[cç]ant|grossiste|boutique|g[ée]rant|agent|membre|b[ée]n[ée]ficiaire|livreur|coursier|client|cliente|utilisateur|compte)\w{0,12}(caution|arrhes|nantissement)/i },
    { name: 'caution/arrhes carrying an amount (fr)', regex: /(caution|arrhes|nantissement|gage)[_-]?(fcfa|xof|montant|amount|min|max)/i },
    { name: 'exiger/verser une caution (fr)', regex: /(exiger|demander|verser|bloquer)[_.-]?(une?|la|le)?[_.-]?(caution|arrhes|garantie[_-]?financi[eè]re)/i },
];

if (isMainModule) {
    runScanGate({
      gateName: 'no-seller-deposit',
    invariant: 'B+I-12 zero seller deposit/reserve/bond, ever',
    patterns: PATTERNS,
  });
}

