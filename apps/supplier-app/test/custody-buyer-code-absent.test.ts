import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CUSTODY — the four-secrets law on the SUPPLIER surface, proven STRUCTURALLY.
 *
 * Boutik-Plus-Build-Spec §154 (verbatim): "Four distinct, non-interchangeable
 * secrets (CI-enforced separation): sellerReadinessChallenge (short-TTL, in-app,
 * seller↔readiness) · pickupVerificationCode (rider↔pickup) · buyerDropCode
 * (buyer↔delivery, PRIVATE — never shown to the seller or in readiness evidence)
 * · HandoffAuthorization (payment-confirmed handoff)." · B+I-06 / ECOSYSTEM-
 * MASTER-REFERENCE §154: "the buyerDropCode NEVER appears in readiness evidence —
 * a supplier must not be able to manufacture proof of a delivery that never
 * happened. This is a CI gate."
 *
 * The absence PATTERN: the supplier app cannot render what it never names. This
 * guard scans every supplier source file and asserts the buyer's delivery code is
 * referenced by ZERO code paths — the strongest possible proof of "never shown".
 */

const appDir = join(import.meta.dirname, '..');

function supplierSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'test' || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  walk(join(appDir, 'src'));
  return out;
}

// The buyer's delivery-code IDENTIFIER (the field/value), in any casing/separator.
// This matches the DATA, not French prose: « code client de livraison » (the
// honesty sentence) is allowed; `buyerDropCode` / `dropCode` (the value) is not.
const BUYER_CODE_IDENT = /\b(buyer[_.]?drop[_.]?code|drop[_.]?code|delivery[_.]?code|buyerCode)\b/i;

describe('CUSTODY — buyerDropCode is NEVER on the supplier surface (structural absence)', () => {
  const files = supplierSourceFiles();

  it('scans a real, non-empty set of supplier source files (the guard has something to prove)', () => {
    expect(files.length).toBeGreaterThan(5);
    // AUDIT-B+2 F-60 — the E1 shell is retired; the supplier's live page is here.
    expect(files.some((f) => f.endsWith('FournisseurApp.tsx'))).toBe(true);
  });

  it('NO supplier code path references the buyer delivery code — it cannot render what it never names', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(BUYER_CODE_IDENT.test(src), `${f} references the buyer delivery code (buyerDropCode/dropCode/deliveryCode)`).toBe(false);
    }
  });

  it('the guard is NON-VACUOUS: a planted buyerDropCode reference WOULD be caught', () => {
    expect(BUYER_CODE_IDENT.test('const x = order.buyerDropCode;')).toBe(true);
    expect(BUYER_CODE_IDENT.test("render(order.dropCode)")).toBe(true);
    // and the honesty PROSE is NOT a false positive (it names no field)
    expect(BUYER_CODE_IDENT.test('Le code client de livraison ne vous est jamais montré.')).toBe(false);
  });

});
