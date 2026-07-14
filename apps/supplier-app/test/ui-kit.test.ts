import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { celebration, money, motion, type as typeTokens } from '@platform/ui-tokens';

/**
 * WO-6.0 — the Grand Teint visual layer obeys the tokens. The color scan is
 * the DoD's "zero hardcoded colors — a scan proves it"; the size scan is its
 * dimension twin. Motion runs on the AUTHORED bezier curves (ruling ②); the
 * celebration is the ONE named boutik moment under the ceilings; reduced
 * motion is honored; francs render tabular. Navigation pins stay in
 * journey-spine.test.ts (byte-untouched).
 *
 * The size scan is RED until the v0.9.2 re-pin (founder ruling): the seven
 * a-class DESIGNER VALUES stated in components.md/motion.md (h56/50/44/30,
 * note w118, halo 220, ring 132) become canon tokens at that pin. Their
 * provenance is proven NOW by test/token-docket.test.ts (the amended
 * token-fidelity gate: every held value byte-matches its doc line).
 */

const appDir = join(import.meta.dirname, '..');
const FILES = ['App.tsx', 'src/ui/kit.tsx'];
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

describe('WO-6.0 Grand Teint visual layer', () => {
  it('SCAN: zero hardcoded colors anywhere in the visual layer', () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, `${f} carries a hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} carries an rgb() color`).not.toMatch(/\brgba?\(/);
      expect(src, `${f} carries a named CSS color literal`).not.toMatch(/color:\s*'(?!#)[a-z]+'/);
    }
  });

  it('the money hero consumes money.amountScale.hero with tabular numerals', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/money\.amountScale\.hero/);
    expect(kit).toMatch(/fontVariant: \['tabular-nums'\]/);
    // the App renders the hero on the offre screen from the catalog template.
    // WO-6.0 B6: the amount is the seller's LIVE net (their editable base price
    // through the pinned waterfall), not a hardcoded example.
    const app = read('App.tsx');
    expect(app).toMatch(/AmountHero\s+label=\{t\('offer\.net_label'\)\}/);
    expect(app).toMatch(/amount=\{t\('money\.amount_f'\)\.replace\('\{amount\}', formatFcfa\(offerNet\)\)\}/);
    // and the net is the pinned-waterfall net of the entered price + the seller's
    // live commission (DF-1 C: offerC is now editable) — never invented.
    expect(app).toMatch(/const rawNet = priceBelowFloor \? 0 : livePreviewNet\(priceB, offerC\)/);
    expect(app).toMatch(/const offerNet = belowMin \? 0 : rawNet/);
    expect(app).toMatch(/const offerC = Number\.parseInt\(commissionInput, 10\) \|\| 0/);
    // francs render tabular in the App too (baseline + stats)
    expect(app).toMatch(/fontVariant: \['tabular-nums'\]/);
    // the hero is bigger than the stat display (doctrine: the amount is the hero)
    expect(money.amountScale.hero.size).toBeGreaterThan(typeTokens.scale.display.size);
  });

  it('the celebration is the NAMED boutik moment, token-timed under the ceilings, tap-to-skip, reduced-motion honored', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/celebration\.produitPret/);
    expect(kit).not.toMatch(/premiereVente|courseValidee/); // boutik owns ONE moment
    // motion consumed AS AUTHORED — the bezier curve, never spring physics
    expect(kit).toMatch(/cubicBezierPoints\(motion\.(springSoft|flyOut|springPop)\)/);
    expect(kit).not.toMatch(/damping|stiffness|Animated\.spring/); // ruling ②: no invented physics
    expect(kit).toMatch(/setTimeout\(onDone, motion\.celebrateMaxMs\)/); // the hard ≤800ms ceiling
    expect(kit).toMatch(/onPress=\{onDone\}/); // tap anywhere = skip
    expect(kit).toMatch(/if \(!visible \|\| reduced\) return null/); // reduced motion = no layer
    expect(kit).toMatch(/AccessibilityInfo\.isReduceMotionEnabled/);
    expect(kit).toMatch(/reduceMotionChanged/);
    // token-level law: the celebration duration fits the doctrine ceiling
    expect(celebration.motifMs).toBeLessThanOrEqual(motion.celebrateMaxMs);
    expect(motion.quickMs).toBeGreaterThanOrEqual(150);
    expect(motion.standardMs).toBeLessThanOrEqual(250);
    // the App fires it exactly on « Produit prêt » — and ONLY on the CONFIRMED
    // B7 state (WO-6.0): never on a queued (offline) or pending confirmation.
    const app = read('App.tsx');
    expect(app).toMatch(/<CelebrationLayer\s+visible=\{celebrating && screen === 'pret' && b7Phase === 'confirmed'\}/);
    // fires exactly once — from finishConfirmation (operator confirmed); the
    // offre/corrective arrivals no longer celebrate (queued must never do).
    expect(app.match(/setCelebrating\(true\)/g)).toHaveLength(1);
    expect(app).toMatch(/const finishConfirmation = useCallback\(\(\) => \{\s*setB7Phase\('confirmed'\);\s*setCelebrating\(true\);/);
  });

  it('the screen change eases in on the authored soft bezier — native driver, static under reduced motion', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/export function ScreenEnter/);
    const enter = kit.slice(kit.indexOf('export function ScreenEnter'), kit.indexOf('export function CelebrationLayer'));
    expect(enter).toMatch(/easing: EASE_SOFT/);
    expect(enter).toMatch(/duration: motion\.standardMs/);
    expect(enter).toMatch(/useNativeDriver: true/);
    expect(enter).toMatch(/if \(reduced\) \{/);
    const app = read('App.tsx');
    expect(app).toMatch(/<ScreenEnter screenKey=\{screen\}>/);
  });

  it('the skeleton pulses on the skeleton token and is static under reduced motion — no bare spinner anywhere', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/skeletonToken\.pulseMs/);
    expect(kit).toMatch(/skeletonToken\.pulseFloor/);
    expect(kit).toMatch(/if \(reduced\) return;/);
    for (const f of FILES) expect(read(f)).not.toMatch(/ActivityIndicator/);
  });

  it('motion runs on the native driver everywhere — never false (native driver forbids layout animation by construction)', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/useNativeDriver: true/);
    expect(kit).not.toMatch(/useNativeDriver: false/);
    // the native driver only accepts transform + opacity; a layout animation
    // would throw at runtime — so this + the useNativeDriver pin IS the
    // "no animated width/height/top/left" guarantee.
    expect(motion.layoutAnimation).toBe('forbidden');
  });

  it('ZERO emoji survive in the app source (ruling ①) — icons are the canon set', () => {
    // Extended_Pictographic is the precise emoji property: it catches 📷✓🏠🏷️⏱
    // and every other pictographic emoji, but NOT typographic arrows (← U+2190)
    // or math/box glyphs — so the gate polices emoji, not punctuation.
    const EMOJI = /\p{Extended_Pictographic}/u;
    for (const f of FILES) {
      expect(EMOJI.test(read(f)), `${f} carries an emoji codepoint`).toBe(false);
    }
  });

  it('navigation chrome: header everywhere, hubs = Accueil·Produits·Échéances, tabs are waypoint RESETS (never edges)', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/<AppHeader/);
    expect(app).toMatch(/HUBS: readonly Screen\[\] = \['accueil', 'produits', 'echeances'\]/);
    expect(app).toMatch(/setStack\(hub === START \? \[START\] : \[START, hub\]\)/);
    for (const key of ['nav.tab_accueil', 'nav.tab_produits', 'nav.tab_echeances']) {
      expect(app).toContain(`t('${key}')`);
    }
    // go() is byte-identical to WO-4.1 (the spine test pins it too)
    expect(app).toMatch(/JOURNEY\[stack\[stack\.length - 1\] \?\? START\]\.includes\(next\)/);
    // the tab bar never renders off-hub (single source: HUBS gate)
    expect(app).toMatch(/\{HUBS\.includes\(screen\) && \(\s*<TabBar/);
  });

  it('the kit imports stay inside the RN + tokens world (banned-import law extended to the kit)', () => {
    const BANNED = /@platform\/certification|@platform\/contracts|@platform\/i18n\/(data-loader|lint-cli)|^node:/;
    const kit = read('src/ui/kit.tsx');
    const specs = [...kit.matchAll(/^(?:import|export) [^;]*from '([^']+)';/gm)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) expect(spec, `kit imports ${spec}`).not.toMatch(BANNED);
  });
});
