#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runScanGate } from './scan.mjs';

/**
 * ── THIS GATE IS A TRIPWIRE, NOT A PROOF ───────────────────────────────────
 * Read this before trusting it, and before widening it.
 *
 * It matches VOCABULARY. Two fresh-context verifier rounds defeated earlier
 * versions in both directions at once, because French money vocabulary IS
 * ordinary French vocabulary: « solde » is also a clearance sale, « avoir » is
 * also the verb to have, « en cours » is also "in progress", « retrait » is
 * also a pickup, « dépôt » is also a warehouse, « garantie » is also a
 * warranty, « balance » is also the scales a market seller weighs goods on.
 * Cross that with unbounded synonyms for the money noun AND for the actor and
 * no regex over the product is both leak-free and safe.
 *
 * So this gate catches the OBVIOUS and the ACCIDENTAL. A synonym outside its
 * lists escapes it, by design and on the record. It does NOT establish that no
 * wallet exists. The gate that carries that weight is
 * `persisted-state-declared` — a wallet must be PERSISTED to be a wallet, and
 * that surface is declared rather than guessed at.
 *
 * The priority when tuning is fixed: NEVER break honest work. A gate that cries
 * wolf on « engagement vendeur » or « la balance du marché » teaches everyone
 * to disable gates, and costs more than the leak it closed.
 */

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
    { name: 'caution/arrhes/nantissement bound to an earner (fr)', regex: /(?<![a-zA-Z\u00C0-\u00FF])(caution|arrhes|nantissement|gage)s?\w{0,12}(vendeur|vendeuse|revendeur|revendeuse|fournisseur|marchand|commer[cç]ant|grossiste|boutique|g[ée]rant|agent|membre|b[ée]n[ée]ficiaire|livreur|coursier|client|cliente|utilisateur|compte)/i },
    { name: 'earner carrying caution/arrhes (fr)', regex: /(vendeur|vendeuse|revendeur|revendeuse|fournisseur|marchand|commer[cç]ant|grossiste|boutique|g[ée]rant|agent|membre|b[ée]n[ée]ficiaire|livreur|coursier|client|cliente|utilisateur|compte)\w{0,12}(caution|arrhes|nantissement)/i },
    { name: 'caution/arrhes carrying an amount (fr)', regex: /(?<![a-zA-ZÀ-ÿ])(caution|arrhes|nantissement|gage)[_-]?(fcfa|xof|montant|amount|min|max)/i },
    { name: 'exiger/verser une caution (fr)', regex: /(exiger|demander|verser|bloquer)[_.-]?(une?|la|le)?[_.-]?(caution|arrhes|garantie[_-]?financi[eè]re)/i },
];

if (isMainModule) {
    runScanGate({
      gateName: 'no-seller-deposit',
    invariant: 'B+I-12 zero seller deposit/reserve/bond, ever',
    patterns: PATTERNS,
  });
}

