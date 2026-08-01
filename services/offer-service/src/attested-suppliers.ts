import type { SellerTrustTier } from '@platform/contracts';

/**
 * SELLER-TIER-WIRE-1 — WHO THE FOUNDER HAS ATTESTED AS VERIFIED.
 *
 * ═══ WHY THIS EXISTS, AND WHAT IT DELIBERATELY IS NOT ═══
 *
 * §6.1's first Option-B condition is « seller tier ≥ verified ». This repo can
 * only ever produce `provisional`: every `SellerTrustState` is created at that
 * tier and there is NO promotion path anywhere. « Verification tiers evidence +
 * progression thresholds » is an OPEN ⏳ Decision (Boutik-Plus-Build-Spec.md),
 * so writing criteria here — « verified after N delivered orders », « verified
 * once ID is uploaded » — would be inventing an answer to a question the
 * founder has not settled. That is forbidden and it is not what this is.
 *
 * THIS IS A RECORD OF A HUMAN DECISION, NOT A RULE. The founder names specific
 * suppliers he has personally verified, in configuration. It answers « which
 * named sellers has he vouched for », never « what makes a seller verified ».
 * The ⏳ Decision stays open, and when it closes this is replaced by the real
 * progression, not extended.
 *
 * ═══ WHY CONFIGURATION AND NOT AN ADMIN ROUTE (founder ruling 2026-08-01) ═══
 *
 * A key-gated write route would put a live risk gate behind a credential that
 * travels — and this repo has already journalled a write key ending up inside a
 * client bundle. Configuration cannot be flipped by anyone holding a leaked
 * key: changing it is a deliberate act on the deployment itself, visible in the
 * Worker's settings. For a pilot with a handful of attested sellers that is
 * both smaller and harder to tamper with. The cost — no per-attestation
 * who/when record — is accepted, and arrives properly with the ⏳ Decision.
 *
 * ═══ FAIL-CLOSED, IN EVERY DIRECTION ═══
 *
 * Unset, empty, whitespace, or simply not listing a supplier ⇒ `provisional` ⇒
 * §6.1 refuses Option B. There is no input to this function that produces
 * `verified` by accident: it is an EXACT match against an explicitly typed id.
 * `trusted` is not reachable here at all — this attests the minimum §6.1 asks
 * for and nothing beyond it.
 *
 * NOTHING FROM A REQUEST REACHES THIS. The only arguments are the supplier id
 * the store already holds for the offer, and the deployment's own configuration.
 */

/** The Worker binding carrying the founder's attestations (comma or whitespace separated). */
export interface AttestedSuppliersEnv {
  readonly VERIFIED_SUPPLIERS?: string;
}

/**
 * Parse the attestation list. Separators are commas and/or whitespace so the
 * value stays readable in a Cloudflare settings box; blanks are dropped.
 * Exported for its own test — a silently mis-parsed list would fail OPEN for
 * whoever it wrongly matched, which is the one direction that must not happen.
 */
export function parseAttestedSuppliers(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return raw
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * The tier this deployment can HONESTLY state for a supplier.
 *
 * `verified` only for an EXACT id the founder listed. Everything else —
 * unlisted, unset config, a prefix, a substring, different case — is
 * `provisional`, which is the true tier this repo actually holds.
 */
export function attestedTier(supplierId: string, env: AttestedSuppliersEnv | undefined): SellerTrustTier {
  if (supplierId.length === 0) return 'provisional';
  const attested = parseAttestedSuppliers(env?.VERIFIED_SUPPLIERS);
  // EXACT match, never `includes()` on the raw string: a substring test would
  // make `supplier-founder-0011` match an attestation for `supplier-founder-001`,
  // promoting a seller the founder never named.
  return attested.includes(supplierId) ? 'verified' : 'provisional';
}
