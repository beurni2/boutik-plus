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
    { name: 'deposit', regex: /deposit/i },
    { name: 'dépôt de garantie', regex: /d[ée]p[oô]t/i },
    { name: 'sellerReserve', regex: /seller[_-]?reserve/i },
    { name: 'reserveField/Balance/Amount', regex: /reserve[_-]?(field|balance|amount)/i },
    { name: 'bond', regex: /\b(security[_-]?)?bond\b/i },
    /* ── AUDIT-B+1 F23 — bound to a SELLER, not to the bare word.
       `caution` was unenforceable (anchored `/\bcaution\b/i` misses
       `cautionFcfa`). The first fix banned `garantie` in identifier position and
       a verifier showed that breaks `garantieMois`/`dureeGarantie` — warranty,
       an ordinary commerce concept this catalog will carry. « Acompte » is
       likewise the normal French word for a BUYER down-payment, and shop-plus
       already ships a split/prepay mode. Law 4 is about a SELLER being asked to
       put money down, so that is what these match: the deposit term bound to a
       seller, carrying an amount, or being demanded. */
    { name: 'deposit term bound to a seller (fr)', regex: /(caution|garantie|acompte|arrhes|gage|nantissement)s?\w{0,12}(vendeur|vendeuse|fournisseur|revendeur|revendeuse|marchand|boutique)/i },
    { name: 'seller carrying a deposit term (fr)', regex: /(vendeur|vendeuse|fournisseur|revendeur|revendeuse|marchand)\w{0,12}(caution|arrhes|nantissement)/i },
    { name: 'deposit term carrying an amount (fr)', regex: /(caution|arrhes|nantissement|gage)[_-]?(fcfa|xof|montant|amount|min|max)/i },
    { name: 'exiger/verser une caution (fr)', regex: /(exiger|demander|verser|bloquer|pr[ée]lever)[_.-]?(une?|la|le)?[_.-]?(caution|arrhes|garantie[_-]?financi[eè]re)/i },
    { name: "frais d'inscription (fr)", regex: /frais[_-]?d[_'-]?inscription/i },
    { name: 'onboardingFee', regex: /onboarding[_-]?fee/i },
    { name: 'subscriptionFee', regex: /subscription[_-]?fee/i },
];

if (isMainModule) {
    runScanGate({
      gateName: 'no-seller-deposit',
    invariant: 'B+I-12 zero seller deposit/reserve/bond, ever',
    patterns: PATTERNS,
  });
}

