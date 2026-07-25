import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewSellerNet } from '../src/supply/preview';
import { CATEGORY_FLOOR_FCFA } from '../src/supply/authoring';
import { catalog } from '../src/i18n';
import { fee, net } from '../src/v2/money';

/**
 * THE ROUNDING RULING (founder, 2026-07-25) — "the real flow computes its
 * preview through THE CANON-CORRECT ROUNDING … do not edit frozen §3.4, and do
 * not remove the seller-net preview."
 *
 * RoundingLaw v1: sellerPlatformFee = FLOOR(0.05 × B); sellerNet = B − C − fee,
 * by subtraction. « floor » means the fraction of a franc stays with the
 * participant, never the platform.
 *
 * WHICH ASSERTIONS ARE WHICH — stated because a looser version of this header
 * claimed the whole file was value-based, and the second describe is not
 * (verifier finding, MEDIUM):
 *   · describe #1 IS value-based: real numbers in, real francs out. It is what
 *     discriminates floor from round.
 *   · describe #2 is SOURCE-TEXT ONLY — capability-absence checks. They are
 *     honest substitutes for a render assertion this repo cannot make (no RN
 *     renderer in vitest), and each says so at its own site.
 *
 * The standing red-proof rule (JOURNAL 2026-07-25): a proof about call
 * structure cannot catch a defect about arguments. Which is exactly why the
 * two kinds are labelled apart instead of averaged into one claim.
 */

const appDir = join(import.meta.dirname, '..');

describe('the real flow floors — RoundingLaw v1, to the franc', () => {
  it('OFF-GRID B: the canon preview FLOORS where the frozen demo math ROUNDS UP', () => {
    // 0.05 × 10_010 = 500.5 → floor 500, round 501. One franc, and it belongs
    // to the seller, not the platform.
    const canon = previewSellerNet(10_010, 1_000);
    expect(canon.sellerPlatformFeeFcfa).toBe(500);
    expect(canon.sellerNetFcfa).toBe(10_010 - 1_000 - 500); // 8_510, by subtraction

    // the frozen §3.4 demo math, untouched, still rounds — and disagrees here.
    // This is the divergence the ruling closes on the real flow.
    expect(fee(10_010)).toBe(501);
    expect(net(10_010, 1_000)).toBe(8_509);
    expect(canon.sellerNetFcfa).not.toBe(net(10_010, 1_000));
    expect(canon.sellerNetFcfa).toBeGreaterThan(net(10_010, 1_000)); // the franc stays with HIM
  });

  it('the fraction ALWAYS stays with the seller — every remainder class of 20', () => {
    // 0.05×B has a fractional part iff B % 20 !== 0. Walk one full cycle so no
    // remainder class is assumed rather than checked.
    for (let B = 10_000; B < 10_020; B += 1) {
      const f = previewSellerNet(B, 0).sellerPlatformFeeFcfa;
      // CHARACTERISED, NOT RESTATED (verifier finding): asserting
      // `f === Math.floor(B*5/100)` would just re-type canon's own arithmetic
      // and pass for that reason. These two bounds define floor independently —
      // f is the LARGEST integer whose fee does not exceed 5% of B. `Math.round`
      // fails the upper bound on every B where 0.05*B has fraction >= .5.
      expect(f * 100, `B=${B}: fee must never exceed 5% of B`).toBeLessThanOrEqual(B * 5);
      expect((f + 1) * 100, `B=${B}: fee must be the largest such integer`).toBeGreaterThan(B * 5);
    }
  });

  it('ON-GRID B (every value the stepper can reach today): canon and demo AGREE — the change is a latent fix, not a visible one', () => {
    // machine.ts bounds: B ≥ 500 in ±500 steps, C ≥ 0 in ±100 steps.
    for (let B = 500; B <= 200_000; B += 500) {
      const canon = previewSellerNet(B, 0);
      expect(canon.sellerPlatformFeeFcfa, `B=${B}`).toBe(fee(B));
      expect(canon.sellerNetFcfa, `B=${B}`).toBe(net(B, 0));
    }
  });

  it('C is subtracted, never rounded, and never enters the fee base (commission is seller-funded)', () => {
    const a = previewSellerNet(10_000, 0);
    const b = previewSellerNet(10_000, 1_337);
    expect(a.sellerPlatformFeeFcfa).toBe(b.sellerPlatformFeeFcfa); // fee is 5%·B alone
    expect(a.sellerNetFcfa - b.sellerNetFcfa).toBe(1_337); // exactly C, to the franc
  });

  it('the boundary the steppers actually reach: B=500, C=0 — no throw, canon figures', () => {
    expect(previewSellerNet(500, 0)).toEqual({ sellerNetFcfa: 475, sellerPlatformFeeFcfa: 25 });
  });

  it('a negative or fractional amount THROWS at the canon boundary, never a quiet wrong figure', () => {
    expect(() => previewSellerNet(-1, 0)).toThrow();
    expect(() => previewSellerNet(10_000.5, 0)).toThrow();
    expect(() => previewSellerNet(10_000, -1)).toThrow();
  });
});

describe('the wizard cannot fall back to the demo math — the capability is gone, not just unused', () => {
  // SOURCE-TEXT CHECK, not a behavioural one (verifier finding: this title used
  // to assert the consequence while the body only read the file). What it
  // actually asserts: screens2.tsx holds no BINDING to the demo math. The
  // consequence — that no S## in it can render non-canon money — follows from
  // that absence, but is not observed here.
  it('screens2.tsx holds no fee/net binding [source-text check]', () => {
    const src = readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
    const moneyImport = /^import \{([^}]*)\} from '\.\/money';/m.exec(src);
    expect(moneyImport, 'screens2 still imports from ./money').not.toBeNull();
    const bound = moneyImport![1]!.split(',').map((s) => s.trim());
    expect(bound).not.toContain('fee');
    expect(bound).not.toContain('net');
    // and the wizard reads its figures off the passed-in canon preview
    // and the wizard reads its figures off the passed-in canon preview, at both
    // money sites, guarded by the null arm (the floor ruling replaced the two
    // hoisted `feeV`/`netV` consts with reads inside the non-null branches).
    expect(src).toMatch(/feeV=\{formatF\(money\.sellerPlatformFeeFcfa\)\}/);
    expect(src).toMatch(/netV=\{formatF\(money\.sellerNetFcfa\)\}/);
    expect(src).toMatch(/\{formatF\(money\.sellerNetFcfa\)\}<\/Text>/);
  });

  /**
   * THE LIMIT, STATED RATHER THAN PAPERED OVER: this repo has no RN renderer in
   * vitest, so there is no test here that RENDERS the wizard and reads the franc
   * off the screen. The wiring defect this cannot catch by value is
   * `lister-real` passing DEMO figures into the (correctly typed) `money` prop.
   * What is asserted instead is that the wrapper has no BINDING to the demo math
   * to pass — expressing that defect would require adding an import, which is a
   * visible one-line diff in review. That is a capability check, not a value
   * check, and it is named as one.
   */
  it('lister-real holds no binding to fee/net — it cannot pass demo figures into the money prop', () => {
    const src = readFileSync(join(appDir, 'src/v2/lister-real.tsx'), 'utf8');
    const moneyImport = /^import \{([^}]*)\} from '\.\/money';/m.exec(src);
    expect(moneyImport, 'lister-real still imports from ./money').not.toBeNull();
    const bound = moneyImport![1]!.split(',').map((s) => s.trim());
    expect(bound).toEqual(['formatF']); // formatting only — no arithmetic
    // the canon call, and the floor refusal that now gates it, on one line
    expect(src).toMatch(/const money = st\.wiz\.B < CATEGORY_FLOOR_FCFA \? null : previewSellerNet\(st\.wiz\.B, st\.wiz\.C\);/);
    expect(src).toMatch(/money=\{money\}/);
  });

  it('§3.4 money.ts itself is UNTOUCHED — the demo board still rounds, exactly as frozen', () => {
    const src = readFileSync(join(appDir, 'src/v2/money.ts'), 'utf8');
    expect(src).toMatch(/export const fee = \(B: number\): number => Math\.round\(B \* 0\.05\);/);
    expect(src).toMatch(/export const net = \(B: number, C: number\): number => B - C - fee\(B\);/);
  });
});

describe('BELOW THE PUBLISH FLOOR — no figure is stated at all (founder ruling 2026-07-25)', () => {
  /**
   * The stepper keeps its full designed range (B down to 500); the publish
   * floor is 5 000. The nine positions between describe an offer that cannot
   * exist. Canon still HAPPILY computes a number for them — including a
   * negative one — so the refusal is a decision, not an arithmetic outcome.
   * These assertions are about which francs exist and which are left unsaid.
   */
  it('canon WOULD return a figure below the floor — including a NEGATIVE net at the default C', () => {
    // this is the number the screen used to print in large green type
    expect(previewSellerNet(500, 1_000).sellerNetFcfa).toBe(-525);
    expect(previewSellerNet(1_000, 1_000).sellerNetFcfa).toBe(-50);
    // so staying silent about it is a deliberate refusal, not "nothing to show"
    expect(previewSellerNet(4_500, 1_000).sellerNetFcfa).toBeGreaterThan(0);
  });

  it('EVERY stepper position below the floor is refused, and every one at or above it is served', () => {
    const source = readFileSync(join(appDir, 'src/v2/lister-real.tsx'), 'utf8');
    expect(source).toMatch(/const money = st\.wiz\.B < CATEGORY_FLOOR_FCFA \? null : previewSellerNet\(st\.wiz\.B, st\.wiz\.C\);/);
    // the predicate itself, walked over the real stepper grid (±500 from 500)
    const refused: number[] = [];
    for (let B = 500; B <= 20_000; B += 500) if (B < CATEGORY_FLOOR_FCFA) refused.push(B);
    expect(refused).toEqual([500, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_500]); // the nine
    expect(CATEGORY_FLOOR_FCFA).toBe(5_000);
    // the boundary is inclusive-at-the-floor: 5 000 publishes, 4 500 does not
    expect(4_500 < CATEGORY_FLOOR_FCFA).toBe(true);
    expect(5_000 < CATEGORY_FLOOR_FCFA).toBe(false);
  });

  it('the wizard cannot print a net when none was handed to it — the type carries the absence', () => {
    const src = readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
    // the prop admits null, so `money.sellerNetFcfa` cannot be reached unguarded
    expect(src).toMatch(/money: SellerPreview \| null/);
    // both money render sites branch on it, and neither formats a net in the null arm
    const step2 = /money === null \? \([\s\S]{0,400}?publier\.err_prix_plancher[\s\S]{0,600}?<MoneyBreakdown/;
    expect(src, 'step 2 must refuse before it breaks down').toMatch(step2);
    const step4 = /money === null \? \([\s\S]{0,300}?publier\.err_prix_plancher[\s\S]{0,400}?Vous recevez \/ vente/;
    expect(src, 'step 4 must refuse before it states a net').toMatch(step4);
  });

  it('continue is BLOCKED on step 2 below the floor — the frozen reducer predicate is untouched', () => {
    const src = readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
    expect(src).toMatch(/disabled=\{disabled\.wizContinue\(st\) \|\| \(w\.step === 2 && belowFloor\)\}/);
    const machine = readFileSync(join(appDir, 'src/v2/machine.ts'), 'utf8');
    // the floor is a REAL-FLOW rule and must not have leaked into the demo machine
    expect(machine).not.toMatch(/CATEGORY_FLOOR|5_000|below_category_floor/);
  });

  it('the refusal reuses HIS existing string — no new copy was invented for it', () => {
    const entry = catalog.find((e) => e.key === 'publier.err_prix_plancher');
    expect(entry, 'publier.err_prix_plancher must already exist').toBeDefined();
    expect(entry!.fr).toBe('Le prix de base est de 5 000 FCFA au minimum.');
    // and the sentence names the SAME number the code refuses on
    expect(entry!.fr).toContain('5 000');
  });
});
