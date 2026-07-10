#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

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
runScanGate({
  gateName: 'no-seller-debit',
  invariant: 'B+I-12 seller consequences access-based — never money',
  patterns: [
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
  ],
});
