#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

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
runScanGate({
  gateName: 'no-seller-deposit',
  invariant: 'B+I-12 zero seller deposit/reserve/bond, ever',
  patterns: [
    { name: 'deposit', regex: /deposit/i },
    { name: 'dépôt de garantie', regex: /d[ée]p[oô]t/i },
    { name: 'sellerReserve', regex: /seller[_-]?reserve/i },
    { name: 'reserveField/Balance/Amount', regex: /reserve[_-]?(field|balance|amount)/i },
    { name: 'bond', regex: /\b(security[_-]?)?bond\b/i },
    /* AUDIT-B+1 F23 — the word boundary made this pattern unenforceable.
       `/\bcaution\b/i` is false for `cautionFcfa`, `caution_fcfa`,
       `sellerCaution`, `cautionAmount` — every shape a deposit FIELD would
       actually take — while the sibling `deposit` pattern (no anchors) catches
       `sellerDepositFcfa` correctly. A live `terms: { cautionFcfa: 5000 }`
       passed this gate. Dropping the trailing anchor alone was wrong too — it
       fired on the English « cautionary » in a comment. Same house shape as the
       other French money terms: the bare noun, plus identifier position. */
    /* The lookbehind is not decoration: JS `\b` is ASCII-only, so `é` counts as
       a boundary and a plain `\bcaution\b` fires on « précaution » — an
       ordinary French word this product will write sooner or later. */
    { name: 'caution (fr)', regex: /(?<![a-zA-ZÀ-ÿ])cautions?\b/i },
    { name: 'caution… (fr, identifier)', regex: /(caution|CAUTION)[_A-Z]/ },
    { name: '…Caution (fr, identifier)', regex: /[a-z0-9]Caution\b/ },
    /* Zero occurrences in any of the three repos today, so these are banned
       outright rather than in identifier position — no innocent use to protect
       (contrast `no-wallet-no-funds`, where the nouns also name the law). */
    { name: 'acompte (fr)', regex: /\bacomptes?\b/i },
    { name: 'arrhes (fr)', regex: /\barrhes\b/i },
    { name: 'gage/nantissement (fr)', regex: /\b(gages?|nantissement)\b/i },
    { name: 'garantie… (fr, identifier)', regex: /(garantie|GARANTIE)[_A-Z]/ },
    { name: '…Garantie (fr, identifier)', regex: /[a-z0-9]Garantie\b/ },
    { name: 'frais d\'inscription (fr)', regex: /frais[_-]?d[_'-]?inscription/i },
    { name: 'onboardingFee', regex: /onboarding[_-]?fee/i },
    { name: 'subscriptionFee', regex: /subscription[_-]?fee/i },
  ],
});
