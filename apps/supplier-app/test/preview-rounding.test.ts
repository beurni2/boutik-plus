import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELLER_PLATFORM_FEE } from '@platform/contracts';
import { previewSellerNet } from '../src/supply/preview';
import { CATEGORY_FLOOR_FCFA, buildCreateOffer, netLineRefusal, type AuthoringContext, type AuthoringForm } from '../src/supply/authoring';
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

/** A form that is valid in every field EXCEPT the price under test. */
const FLOOR_FORM: AuthoringForm = {
  name: 'Pagne tissé Faso', productCode: 'PAGNE-7K2M', category: 'textile',
  zone: 'Gounghin', basePrice: '10 000', resellerCommission: '1000', available: '5',
};
const FLOOR_CTX: AuthoringContext = {
  supplierId: 'supplier-founder-001', productVersionId: 'pv-1', offerId: 'offer-1',
  commandId: 'cmd-1', now: '2026-07-24T21:00:00.000Z',
  effective: '2026-07-24T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  moderationState: 'approved',
};

describe('the real flow floors — RoundingLaw v1, to the franc', () => {
  it('OFF-GRID B: at the FRAIS-ZERO rate, floor and round AGREE at 0 — the divergence this test used to pin needs a fraction to exist', () => {
    // Under the 5 % rate, 0.05 × 10_010 = 500.5 discriminated floor (500) from
    // round (501). FRAIS-ZERO (founder 2026-08-25): rate 0 × anything has no
    // fraction, so canon and the frozen demo math agree on this B — both 0.
    // The floor-vs-round discrimination returns with any non-zero rate; the
    // rate-general floor law below is what carries it meanwhile.
    const canon = previewSellerNet(10_010, 1_000);
    expect(canon.sellerPlatformFeeFcfa).toBe(0);
    expect(canon.sellerNetFcfa).toBe(10_010 - 1_000); // 9_010, by subtraction
    expect(fee(10_010)).toBe(0);
    expect(net(10_010, 1_000)).toBe(9_010);
    expect(canon.sellerNetFcfa).toBe(net(10_010, 1_000));
  });

  it('the fraction ALWAYS stays with the seller — the floor law, rate-general, every remainder class of 20', () => {
    // REWRITTEN for FRAIS-ZERO: the old bounds (`f·100 ≤ B·5 < (f+1)·100`)
    // were the 5 %-rate specialisation — the upper bound is unsatisfiable at
    // rate 0. This is the same floor law written from the canon constants, so
    // it holds at ANY rate the founder sets — including today's 0, where it
    // degenerates to f === 0 on every B (asserted literally as well).
    const { numerator: num, denominator: den } = SELLER_PLATFORM_FEE;
    for (let B = 10_000; B < 10_020; B += 1) {
      const f = previewSellerNet(B, 0).sellerPlatformFeeFcfa;
      expect(den * f, `B=${B}: fee must never exceed rate × B`).toBeLessThanOrEqual(B * num);
      expect(B * num, `B=${B}: fee must be the largest such integer`).toBeLessThan(den * (f + 1));
      expect(f, `B=${B}: FRAIS-ZERO — the fee is 0`).toBe(0);
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
    // FRAIS-ZERO: fee 0, net = B — the whole base stays with him.
    expect(previewSellerNet(500, 0)).toEqual({ sellerNetFcfa: 500, sellerPlatformFeeFcfa: 0 });
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
    // and the wizard reads its figures off the passed-in canon preview, at both
    // money sites, inside the `kind === 'figure'` arm of the union.
    // FRAIS-ZERO (founder 2026-08-25): the fee line is gone from the
    // breakdown, so the only money bindings left are the net's.
    expect(src).not.toMatch(/sellerPlatformFeeFcfa/);
    expect(src).toMatch(/netV=\{formatF\(money\.net\.sellerNetFcfa\)\}/);
    expect(src).toMatch(/\{formatF\(money\.net\.sellerNetFcfa\)\}<\/Text>/);
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
    // the SHARED predicate decides, the canon call produces the figure, and the
    // reason is mapped through the EXISTING typed table — no second mapping
    expect(src).toMatch(/const refusal = netLineRefusal\(st\.wiz\.B, st\.wiz\.C\);/);
    expect(src).toMatch(/\{ kind: 'figure', net: previewSellerNet\(st\.wiz\.B, st\.wiz\.C\) \}/);
    expect(src).toMatch(/\{ kind: 'refused', reasonKey: ERROR_KEY\[refusal\] \}/);
    expect(src).toMatch(/money=\{money\}/);
  });

  it('§3.4 money.ts keeps its frozen CONSTRUCTION — round(B × rate), rate 0 since FRAIS-ZERO (founder 2026-08-25)', () => {
    const src = readFileSync(join(appDir, 'src/v2/money.ts'), 'utf8');
    expect(src).toMatch(/export const fee = \(B: number\): number => Math\.round\(B \* 0\);/);
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
    // (FRAIS-ZERO nets: fee 0, so net = B − C exactly)
    expect(previewSellerNet(500, 1_000).sellerNetFcfa).toBe(-500);
    expect(previewSellerNet(1_000, 1_000).sellerNetFcfa).toBe(0);
    // so staying silent about it is a deliberate refusal, not "nothing to show"
    expect(previewSellerNet(4_500, 1_000).sellerNetFcfa).toBeGreaterThan(0);
  });

  /**
   * REWRITTEN after the verifier (MEDIUM). The first version walked a COPY of
   * the predicate — `for (B...) if (B < CATEGORY_FLOOR_FCFA)` — and asserted
   * `4_500 < CATEGORY_FLOOR_FCFA`, which tests JavaScript's `<` against the
   * test's own literals. Production was never evaluated, and the comment
   * claiming it was "the predicate itself" was false. That is precisely the
   * standing rule (JOURNAL 2026-07-25) committed one slice after writing it.
   *
   * This version walks the REAL CORE VALIDATOR, `buildCreateOffer`, over every
   * stepper-reachable B. That is the second of the two independent refusals,
   * and the one that decides whether an offer can exist at all.
   */
  it('the REAL validator refuses every stepper position below the floor, and accepts every one at or above it', () => {
    const priced = (B: number) => buildCreateOffer({ ...FLOOR_FORM, basePrice: String(B) }, FLOOR_CTX);
    const refused: number[] = [];
    const accepted: number[] = [];
    for (let B = 500; B <= 20_000; B += 500) {
      const r = priced(B);
      const hit = r.ok === false && r.errors.includes('base_price_below_floor');
      (hit ? refused : accepted).push(B);
      // nothing ELSE may fail on these forms — otherwise "accepted" would be
      // measuring the wrong thing and this walk would prove nothing
      if (!hit) expect(r.ok, `B=${B} must be valid for the right reason`).toBe(true);
    }
    expect(refused).toEqual([500, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_500]); // the nine
    expect(accepted[0], 'the floor itself must publish').toBe(5_000);
    expect(accepted).toHaveLength(31);
  });

  it('THE SCREEN AND THE CORE AGREE AT THE BOUNDARY — one constant, one operator, no divergence', () => {
    // the screen calls the SAME predicate the core does — pinned as text (this
    // repo has no render harness, so this regex is the load-bearing part —
    // labelled, not disguised). One law, one home, two enforcement points.
    const source = readFileSync(join(appDir, 'src/v2/lister-real.tsx'), 'utf8');
    expect(source).toMatch(/const refusal = netLineRefusal\(st\.wiz\.B, st\.wiz\.C\);/);
    // and the core's own answer at the two values either side of it, RUN
    const at = (B: number) => buildCreateOffer({ ...FLOOR_FORM, basePrice: String(B) }, FLOOR_CTX);
    expect(at(4_500).ok, 'one step below the floor must be refused').toBe(false);
    expect(at(5_000).ok, 'the floor itself must be accepted').toBe(true);
    // the screen imports the SAME constant the core validates against — not a
    // second copy that could drift
    expect(CATEGORY_FLOOR_FCFA).toBe(5_000);
    // and the screen holds NO threshold of its own — no floor constant, no
    // hardcoded twin, no local comparison it could drift on
    expect(source).not.toContain('CATEGORY_FLOOR_FCFA');
    expect(source).not.toMatch(/< 5[_ ]?000/);
  });

  it('the wizard cannot print a net when none was handed to it — the type carries the absence', () => {
    const src = readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
    // the prop is a UNION, so `money.net` cannot be reached unguarded
    expect(src).toMatch(/money: SellerNetLine/);
    // both money render sites branch on it, and neither formats a net in the null arm
    const step2 = /money\.kind === 'refused' \? \([\s\S]{0,600}?tr\(money\.reasonKey\)[\s\S]{0,600}?<MoneyBreakdown/;
    expect(src, 'step 2 must refuse before it breaks down').toMatch(step2);
    const step4 = /money\.kind === 'refused' \? \([\s\S]{0,300}?tr\(money\.reasonKey\)[\s\S]{0,400}?Vous recevez \/ vente/;
    expect(src, 'step 4 must refuse before it states a net').toMatch(step4);
    // the screen never hardcodes WHICH refusal — it states the key it is handed
    expect(src).not.toMatch(/tr\('publier\.err_prix_plancher'\)|tr\('publier\.err_commission_net'\)/);
  });

  it('continue is BLOCKED on step 2 below the floor — the frozen reducer predicate is untouched', () => {
    const src = readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
    expect(src).toMatch(/disabled=\{disabled\.wizContinue\(st\) \|\| \(w\.step === 2 && noNet\)\}/);
    const machine = readFileSync(join(appDir, 'src/v2/machine.ts'), 'utf8');
    // the floor is a REAL-FLOW rule and must not have leaked into the demo machine
    expect(machine).not.toMatch(/CATEGORY_FLOOR|5_000|below_category_floor/);
  });

  /**
   * THE LOAD-BEARING CLAIM, NOW GATED (verifier finding, LOW). The whole
   * "step 3 and 4 are unreachable below the floor" argument rests on the
   * wizard footer being the ONLY dispatcher of WIZ_NEXT. That was true by
   * inspection and asserted by nothing — so a second dispatcher added later
   * would silently defeat the floor block while every other test stayed green.
   * Same instrument as the custody absence scan: count the real dispatch sites.
   */
  it('exactly ONE WIZ_NEXT dispatcher exists in the app — the gated wizard footer', () => {
    const files = ['src/v2/screens2.tsx', 'src/v2/screens1.tsx', 'src/v2/lister-real.tsx',
                   'src/v2/studio-real.tsx', 'src/v2/AppV2.tsx', 'src/v2/components.tsx', 'src/v2/machine.ts'];
    const sites: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(appDir, f), 'utf8');
      // a DISPATCH, not a comparison (`a.t === 'WIZ_NEXT'`) and not the reducer
      // case label — `d(...)`/`dd(...)` called with the action object
      for (const m of src.matchAll(/\b(?:d|dd)\(\s*\{\s*t:\s*'WIZ_NEXT'/g)) sites.push(`${f}:${m.index}`);
    }
    expect(sites, `WIZ_NEXT dispatchers found: ${sites.join(', ')}`).toHaveLength(1);
    expect(sites[0]).toContain('src/v2/screens2.tsx');
    // and that one site is the footer button whose disabled prop carries the floor
    const screens2 = readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
    expect(screens2).toMatch(
      /disabled=\{disabled\.wizContinue\(st\) \|\| \(w\.step === 2 && noNet\)\}\s*\n\s*onPress=\{\(\) => d\(\{ t: 'WIZ_NEXT' \}\)\}/,
    );
  });

  it('the refusal reuses HIS existing string — no new copy was invented for it', () => {
    const entry = catalog.find((e) => e.key === 'publier.err_prix_plancher');
    expect(entry, 'publier.err_prix_plancher must already exist').toBeDefined();
    expect(entry!.fr).toBe('Le prix de base est de 5 000 FCFA au minimum.');
    // and the sentence names the SAME number the code refuses on
    expect(entry!.fr).toContain('5 000');
  });
});

describe('THE COMMISSION AXIS — both refusals, and the threshold is NON-POSITIVE (founder ruling 2026-07-25)', () => {
  /**
   * The floor ruling closed the B axis but not the CLASS. C is unbounded above
   * (`disabled.wizC` bounds it only from below) and no commission ceiling
   * exists anywhere, so B = 5 000 with C = 4 800 published a REAL offer whose
   * seller net was −50, rendered in the green this app reserves for money he
   * receives. Unlike the floor, nothing behind the screen refused it.
   *
   * Founder: "BOTH REFUSALS, not one." And: "non-positive, not negative. A net
   * of exactly zero is as meaningless to publish as minus fifty and it would
   * slip through a strictly-negative test."
   */
  const priced = (B: number, C: number) =>
    buildCreateOffer({ ...FLOOR_FORM, basePrice: String(B), resellerCommission: String(C) }, FLOOR_CTX);

  it('ZERO IS REFUSED, not just negative — the exact case a strictly-negative test would pass', () => {
    // FRAIS-ZERO: B=5000 → fee 0 → net = 5000 − C. C=5000 makes it EXACTLY 0.
    expect(previewSellerNet(5_000, 5_000).sellerNetFcfa).toBe(0);
    expect(netLineRefusal(5_000, 5_000)).toBe('commission_leaves_no_net'); // screen
    expect(priced(5_000, 5_000).ok).toBe(false); // core, independently
    // and one franc less commission passes — the boundary is exact, not fuzzy
    expect(previewSellerNet(5_000, 4_999).sellerNetFcfa).toBe(1);
    expect(netLineRefusal(5_000, 4_999)).toBeNull();
    expect(priced(5_000, 4_999).ok).toBe(true);
  });

  it('the class the verifier found — a commission that swallows the net — is refused BY BOTH; the old C 4 800 case now PUBLISHES (FRAIS-ZERO boundary move)', () => {
    // The 2026-07-25 verifier case was B=5 000, C=4 800 → net −50 under the
    // 5 % fee. FRAIS-ZERO moved the refusal boundary from C ≥ B − fee to
    // C ≥ B: that same C now leaves net 200 and publishes — a REAL behaviour
    // change, journalled for the founder. The CLASS stays refused: any C at
    // or beyond B still swallows the net.
    expect(previewSellerNet(5_000, 4_800).sellerNetFcfa).toBe(200);
    expect(netLineRefusal(5_000, 4_800)).toBeNull();
    expect(priced(5_000, 4_800).ok).toBe(true);
    expect(previewSellerNet(5_000, 5_050).sellerNetFcfa).toBe(-50);
    expect(netLineRefusal(5_000, 5_050)).toBe('commission_leaves_no_net');
    const core = priced(5_000, 5_050);
    expect(core.ok).toBe(false);
    if (core.ok === false) expect(core.errors).toContain('commission_leaves_no_net');
  });

  it('TWO INDEPENDENT REFUSALS: the core refuses even with no screen involved, over the whole C grid', () => {
    // C moves in ±100 steps. FRAIS-ZERO: at B=10 000 the fee is 0, so the net
    // crosses zero at C=10 000 — every step from there up must be refused by
    // the CORE alone.
    for (let C = 0; C <= 20_000; C += 100) {
      const net = previewSellerNet(10_000, C).sellerNetFcfa;
      const core = priced(10_000, C);
      expect(core.ok, `B=10000 C=${C} net=${net}`).toBe(net > 0);
      if (net <= 0) expect(netLineRefusal(10_000, C)).toBe('commission_leaves_no_net');
    }
    expect(previewSellerNet(10_000, 10_000).sellerNetFcfa).toBe(0); // the crossing, named
  });

  it('the floor still wins when BOTH are wrong — one cause is never reported twice', () => {
    // B=500 is below the floor AND its net is negative at the default C.
    expect(netLineRefusal(500, 1_000)).toBe('base_price_below_floor');
    const core = priced(500, 1_000);
    expect(core.ok).toBe(false);
    if (core.ok === false) {
      expect(core.errors).toContain('base_price_below_floor');
      // the net rule does NOT also fire — the price is the cause he must fix
      expect(core.errors).not.toContain('commission_leaves_no_net');
      // AND NO CAUSE APPEARS TWICE (verifier finding: the test name promised
      // this and nothing checked it — a mutant that pushed the predicate's
      // answer unconditionally produced ['base_price_below_floor',
      // 'base_price_below_floor'] with the whole suite still green. The pane
      // joins errors with '\n', so that prints the same sentence twice).
      expect(new Set(core.errors).size, core.errors.join(' | ')).toBe(core.errors.length);
    }
  });

  it('no cause is duplicated on ANY refused combination the steppers can reach', () => {
    for (const B of [500, 1_000, 4_500, 5_000, 10_000]) {
      for (const C of [0, 1_000, 4_750, 4_800, 9_500, 20_000]) {
        const r = priced(B, C);
        if (r.ok === false) {
          expect(new Set(r.errors).size, `B=${B} C=${C}: ${r.errors.join(' | ')}`).toBe(r.errors.length);
        }
      }
    }
  });

  it('a healthy offer is untouched — the common case still states its net', () => {
    expect(netLineRefusal(10_000, 1_000)).toBeNull();
    expect(priced(10_000, 1_000).ok).toBe(true);
    expect(previewSellerNet(10_000, 1_000).sellerNetFcfa).toBe(9_000); // FRAIS-ZERO: B − C
  });

  it('the refusal reason is from the EXISTING vocabulary and reaches a real, lint-clean string', () => {
    const entry = catalog.find((e) => e.key === 'publier.err_commission_net');
    expect(entry, 'the new string must exist in the catalog').toBeDefined();
    expect(entry!.register).toBe('money'); // money register, like its sibling refusals
    // the wrapper maps the typed reason through the SAME exhaustive table
    const src = readFileSync(join(appDir, 'src/v2/lister-real.tsx'), 'utf8');
    expect(src).toMatch(/commission_leaves_no_net: 'publier\.err_commission_net',/);
  });
});
