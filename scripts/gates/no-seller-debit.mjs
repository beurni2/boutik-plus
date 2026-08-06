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

/* Run only when EXECUTED — `fr-pattern-coverage` imports PATTERNS. */
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

/**
 * CI gate: no-seller-debit (WO-2.6; B+I-12).
 * "Seller losses are absorbed by the Protection Fund; consequences for the
 * seller are access-based." A seller fault NEVER moves the seller's money —
 * no charge-back, no withholding, no balance subtraction, in any language.
 * The canonical SellerTrustState is strict (no money field exists), and this
 * gate bans the vocabulary a money consequence would need to arrive in.
 *
 * Pattern notes (maintained list):
 * - debit/déduction/deduct catch sellerDebit, debitSeller, deductFromSeller,
 *   deductedFcfa — the direct forms.
 * - retenue/prélev catch the French money forms (retenue sur ventes,
 *   prélèvement) — copy is scanned too: the ban binds UI wording as much as
 *   code (B+I-12 has no French-language exception).
 * - chargeSeller/sellerCharge and the withhold conjugations catch the polite
 *   English forms.
 * - penalty/pénalité/amende/clawback/sanction/garnish/fine added after the
 *   WO-2.6 verifier evaded the first list with penaltyFcfa/amendeFcfa/
 *   clawbackFcfa (finding recorded verbatim in JOURNAL.md). NOTE: the
 *   English filler word "fine" is therefore banned vocabulary in product
 *   code and comments — write "OK" instead.
 */
export const PATTERNS = [
    { name: 'debit', regex: /d[ée]bit/i },
    { name: 'deduct', regex: /deduct/i },
    { name: 'retenue (fr)', regex: /\bretenues?\b/i },
    { name: 'prélèvement (fr)', regex: /pr[ée]l[èe]v/i },
    { name: 'sellerCharge/chargeSeller', regex: /(seller[_-]?charge|charge[_-]?seller)/i },
    { name: 'withhold/withheld', regex: /withh?[eo]ld/i },
    { name: 'penalty/pénalité', regex: /penalt|p[ée]nalit/i },
    { name: 'amende (fr)', regex: /\bamendes?\b/i },
    { name: 'clawback', regex: /clawback/i },
    { name: 'sanction', regex: /sanction/i },
    { name: 'garnish', regex: /garnish/i },
    { name: 'fine (money)', regex: /\bfines?\b/i },
];

if (isMainModule) {
  runScanGate({
      gateName: 'no-seller-debit',
    invariant: 'B+I-12 seller consequences access-based — never money',
    patterns: PATTERNS,
  });
}
