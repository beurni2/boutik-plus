import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motion, type as fpType } from '@platform/ui-tokens';

/**
 * WO-FP-BOUTIK — the Faso Premium visual layer obeys the tokens. The colour scan
 * is the DoD's "zero hand-copied hex — a scan proves it" on the render files
 * (App / kit / signature / anim), which consume the tokens + the single app-local
 * design module (src/ui/fp.ts); fp.ts's docketed app-local tones are proven by
 * token-docket.test.ts. Motion runs on the seven fp* tokens through src/ui/anim;
 * the celebration fires only on server-true confirmation, tap-to-skip,
 * reduced-motion honoured, demo-labelled. Navigation pins stay in
 * journey-spine.test.ts (byte-untouched).
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const RENDER_FILES = ['App.tsx', 'src/ui/kit.tsx', 'src/ui/signature.tsx', 'src/ui/anim.tsx'];

describe('WO-FP-BOUTIK Faso Premium visual layer', () => {
  it('SCAN: zero hand-copied hex/rgb anywhere in the render layer (fp.ts is the only home)', () => {
    for (const f of RENDER_FILES) {
      const src = read(f);
      expect(src, `${f} carries a hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} carries an rgb() color`).not.toMatch(/\brgba?\(/);
      expect(src, `${f} carries a named CSS color literal`).not.toMatch(/color:\s*'(?!#)[a-z]+'/);
    }
  });

  it('money renders tabular through the frozen formatter, and the offre net is the live waterfall net', () => {
    const kit = read('src/ui/kit.tsx');
    const fp = read('src/ui/fp.ts');
    // the money text preset is tnum + nowrap, and the kit applies it to the heroes
    expect(fp).toMatch(/MONEY_TEXT\s*=\s*\{\s*fontVariant:\s*\['tabular-nums'\]/);
    expect(kit).toMatch(/MONEY_TEXT/);
    const app = read('App.tsx');
    // the offre net is the seller's LIVE net through the pinned waterfall, counted up
    expect(app).toMatch(/<MoneyHero label=\{t\('offer\.net_label'\)\} amount=\{offerNet\}/);
    expect(app).toMatch(/const rawNet = priceBelowFloor \? 0 : livePreviewNet\(priceB, offerC\)/);
    expect(app).toMatch(/const offerNet = belowMin \? 0 : rawNet/);
    // count-up is a real re-run over the token duration, cubic-out (HANDOFF § Motion)
    expect(read('src/ui/anim.tsx')).toMatch(/1 - Math\.pow\(1 - k, 3\)/);
    // the money hero size is bigger than a card figure (money in majesty)
    expect(fpType.scale.heroMoney.size.max).toBeGreaterThan(fpType.scale.cardMoney.size);
  });

  it('the celebration fires only on server-true confirmation — once, tap-to-skip, reduced-motion, demo-labelled', () => {
    const kit = read('src/ui/kit.tsx');
    const app = read('App.tsx');
    // motion is consumed AS AUTHORED — the fp tokens, never invented spring physics
    expect(kit).not.toMatch(/damping|stiffness|Animated\.spring/);
    expect(read('src/ui/anim.tsx')).not.toMatch(/damping|stiffness|Animated\.spring/);
    // tap anywhere = skip; reduced motion = no layer
    expect(kit).toMatch(/onPress=\{onDone\}/);
    expect(kit).toMatch(/if \(!visible \|\| reduced\) return null/);
    expect(kit).toMatch(/useReducedMotion/);
    // the auto-dismiss + animation run in an effect, never in render body
    expect(kit).toMatch(/useEffect\(\(\) => \{\s*if \(!visible\) return;/);
    // the demo trigger renders a « démo » marker (the un-labelled payout is E3-only)
    expect(kit).toMatch(/demo === true &&/);
    // the App fires it exactly on the CONFIRMED B7 state — never queued/pending
    expect(app).toMatch(/<CelebrationLayer\s+visible=\{celebrating && screen === 'pret' && b7Phase === 'confirmed'\}/);
    expect(app).toMatch(/demo=\{IS_PREVIEW\}/);
    // fires exactly once — from finishConfirmation (operator confirmed)
    expect(app.match(/setCelebrating\(true\)/g)).toHaveLength(1);
    expect(app).toMatch(/const finishConfirmation = useCallback\(\(\) => \{\s*setB7Phase\('confirmed'\);\s*setCelebrating\(true\);/);
  });

  it('every screen mounts with fpIn (native driver), static under reduced motion', () => {
    const kit = read('src/ui/kit.tsx');
    const anim = read('src/ui/anim.tsx');
    expect(kit).toMatch(/export function ScreenEnter/);
    expect(kit).toMatch(/<FpIn motionKey=\{screenKey\}/);
    // FpIn is driven by the fpIn token, native driver, reduced-motion static
    expect(anim).toMatch(/duration: motion\.fpIn\.durationMs/);
    expect(anim).toMatch(/easing: rnEasing\(motion\.fpIn\.timingFunction\)/);
    expect(anim).toMatch(/useNativeDriver: true/);
    expect(anim).toMatch(/if \(reduced\)/);
    expect(read('App.tsx')).toMatch(/<ScreenEnter screenKey=\{screen\}>/);
  });

  it('skeleton-first: a shimmer sized to the content, static under reduced motion — no bare spinner anywhere', () => {
    const anim = read('src/ui/anim.tsx');
    expect(anim).toMatch(/export function Shimmer/);
    expect(anim).toMatch(/duration: motion\.fpShimmer\.durationMs/);
    expect(anim).toMatch(/if \(reduced/);
    for (const f of RENDER_FILES) expect(read(f)).not.toMatch(/ActivityIndicator/);
  });

  it('motion runs on the native driver everywhere it animates transform/opacity — never false', () => {
    const anim = read('src/ui/anim.tsx');
    expect(anim).toMatch(/useNativeDriver: true/);
    expect(anim).not.toMatch(/useNativeDriver: false/);
    // reduced-motion is a global veto the primitives all honour
    expect(anim).toMatch(/prefers-reduced-motion|useReducedMotion|isReduceMotionEnabled/);
  });

  it('ZERO emoji survive in the render layer (chrome) — icons are the canon set', () => {
    const EMOJI = /\p{Extended_Pictographic}/u;
    for (const f of RENDER_FILES) {
      const stripped = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(EMOJI.test(stripped), `${f} carries an emoji codepoint`).toBe(false);
    }
  });

  it('the signature module is ONE shared module (six elements), not per-view forks', () => {
    const sig = read('src/ui/signature.tsx');
    for (const el of ['WovenBand', 'HeroLedgerBand', 'DuotoneTile', 'Selectable', 'CornerTicks', 'QuoteRule']) {
      expect(sig, `signature exports ${el}`).toMatch(new RegExp(`export function ${el}`));
    }
    // the kit re-exports them so every view consumes the one module
    expect(read('src/ui/kit.tsx')).toMatch(/export \{ WovenBand, HeroLedgerBand, DuotoneTile, Selectable, CornerTicks, QuoteRule \}/);
  });

  it('navigation chrome: header everywhere, hubs = Accueil·Produits·Échéances, tabs are waypoint RESETS', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/<AppHeader/);
    expect(app).toMatch(/HUBS: readonly Screen\[\] = \['accueil', 'produits', 'echeances'\]/);
    expect(app).toMatch(/setStack\(hub === START \? \[START\] : \[START, hub\]\)/);
    for (const key of ['nav.tab_accueil', 'nav.tab_produits', 'nav.tab_echeances']) {
      expect(app).toContain(`t('${key}')`);
    }
    expect(app).toMatch(/JOURNEY\[stack\[stack\.length - 1\] \?\? START\]\.includes\(next\)/);
    expect(app).toMatch(/\{HUBS\.includes\(screen\) && \(\s*<TabBar/);
  });

  it('the kit imports stay inside the RN + tokens world (banned-import law extended to the kit)', () => {
    const BANNED = /@platform\/certification|@platform\/contracts|@platform\/i18n\/(data-loader|lint-cli)|^node:/;
    const kit = read('src/ui/kit.tsx');
    const specs = [...kit.matchAll(/^(?:import|export) [^;]*from '([^']+)';/gm)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) expect(spec, `kit imports ${spec}`).not.toMatch(BANNED);
  });

  it('the fp motion token surface is the seven fp* (no orphan reference to retired curves)', () => {
    expect(Object.keys(motion).sort()).toEqual(['fpBar', 'fpIn', 'fpPop', 'fpPulse', 'fpShake', 'fpShimmer', 'fpUp']);
  });
});
