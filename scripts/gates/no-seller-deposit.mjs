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
    { name: 'caution (fr)', regex: /\bcaution\b/i },
    { name: 'onboardingFee', regex: /onboarding[_-]?fee/i },
    { name: 'subscriptionFee', regex: /subscription[_-]?fee/i },
  ],
});
