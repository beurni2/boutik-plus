import {
  SellerTrustStateSchema,
  UserSchema,
  type SellerTrustState,
  type User,
} from '@platform/contracts';

/**
 * B0.2 thin — zero-cost supplier onboarding. Money never gates entry: no
 * such field or flow exists here, dormant or otherwise (Ten Laws #4; the
 * scanner gate names the banned vocabulary). New sellers are PROVISIONAL
 * (SellerTrustState tier 'provisional'; D10 is open — the provisional flag
 * is the only tier logic at E1). Publishing requires a VERIFIED phone alias
 * (server-confirmed): unverified cannot publish — enforced here as the
 * single publish-eligibility authority and by a CI gate beside it.
 * Onboarding is idempotent on the phone alias: the same seller onboarding
 * twice gets the SAME record, never a duplicate.
 */

export interface OnboardingInput {
  command_id: string;
  phoneAlias: string;
  displayName: string;
}

export type OnboardingOutcome =
  | { ok: true; user: User; trust: SellerTrustState; duplicate: boolean }
  | { ok: false; reason: 'malformed_input' };

export class SupplierRegistry {
  private readonly byAlias = new Map<string, { user: User; trust: SellerTrustState }>();
  private counter = 0;

  onboard(input: OnboardingInput): OnboardingOutcome {
    if (!input.phoneAlias || !input.displayName) return { ok: false, reason: 'malformed_input' };
    const existing = this.byAlias.get(input.phoneAlias);
    if (existing) return { ok: true, ...existing, duplicate: true };

    this.counter += 1;
    const user = UserSchema.parse({
      id: `supplier-${this.counter}`,
      phoneAlias: { alias: input.phoneAlias, verified: false, unique: true },
      roles: { supplier: true, reseller: false, buyer: false },
      trustState: 'provisional',
    });
    const trust = SellerTrustStateSchema.parse({
      sellerId: user.id,
      tier: 'provisional',
      faultCount: 0,
      restrictions: [],
      probationLimits: {},
    });
    const record = { user, trust };
    this.byAlias.set(input.phoneAlias, record);
    return { ok: true, ...record, duplicate: false };
  }

  /** Phone verification is a server confirmation — never client-set. */
  confirmPhoneVerified(supplierId: string): boolean {
    for (const [alias, record] of this.byAlias) {
      if (record.user.id !== supplierId) continue;
      const user = UserSchema.parse({
        ...record.user,
        phoneAlias: { ...record.user.phoneAlias, verified: true },
      });
      this.byAlias.set(alias, { ...record, user });
      return true;
    }
    return false;
  }

  supplier(supplierId: string): { user: User; trust: SellerTrustState } | undefined {
    for (const record of this.byAlias.values()) {
      if (record.user.id === supplierId) return record;
    }
    return undefined;
  }

  /**
   * THE publish rule (B0.2): a verified phone alias — provisional TIER may
   * publish (it is the E1 normal); an UNVERIFIED alias may not.
   */
  canPublish(supplierId: string): boolean {
    const record = this.supplier(supplierId);
    return record !== undefined && record.user.phoneAlias.verified === true;
  }
}
