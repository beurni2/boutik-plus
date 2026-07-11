import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motion, money, boutikPlusTheme } from '@platform/ui-tokens';

/**
 * WO-4.2R — the visual layer obeys the tokens. The scan test IS the DoD's
 * "zero hardcoded colors/sizes — a scan proves it": every color is a theme
 * token, every size/spacing/radius/type value is a token expression; the
 * celebration runs on the named moment's tokens under the motion-law
 * ceilings; reduced motion is honored; tabular numerals wherever francs
 * render. Navigation pins stay in journey-spine.test.ts (byte-untouched).
 */

const appDir = join(import.meta.dirname, '..');
const FILES = ['App.tsx', 'src/ui/kit.tsx'];
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

describe('WO-4.2R visual layer', () => {
  it('SCAN: zero hardcoded colors anywhere in the visual layer', () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, `${f} carries a hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} carries an rgb() color`).not.toMatch(/\brgba?\(/);
      expect(src, `${f} carries a named CSS color literal`).not.toMatch(/color:\s*'(?!#)[a-z]+'/);
    }
  });

  it('SCAN: zero hardcoded size/spacing/type values — every number is a token expression', () => {
    const SIZE_PROPS =
      /(?:fontSize|lineHeight|borderRadius|padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|margin[A-Za-z]*|minHeight|minWidth|maxWidth|height|width|gap|letterSpacing|top|bottom|left|right):\s*(\d+(?:\.\d+)?)\b/g;
    for (const f of FILES) {
      const src = read(f);
      const offenders: string[] = [];
      for (const m of src.matchAll(SIZE_PROPS)) {
        if (Number(m[1]) !== 0) offenders.push(m[0]);
      }
      expect(offenders, `${f} hardcodes size values: ${offenders.join(' · ')}`).toEqual([]);
    }
  });

  it('the money hero consumes money.amountScale.hero with tabular numerals', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/money\.amountScale\.hero\.size/);
    expect(kit).toMatch(/money\.amountScale\.hero\.weight/);
    expect(kit).toMatch(/fontVariant: \['tabular-nums'\]/);
    // the App renders the hero on the offre screen from the catalog template
    const app = read('App.tsx');
    expect(app).toMatch(/AmountHero label=\{t\('offer\.net_label'\)\}/);
    expect(app).toMatch(/t\('money\.amount_f'\)\.replace\('\{amount\}', formatFcfa\(livePreviewNet\(E1_B, E1_C\)\)\)/);
    // francs render tabular in the App too (baseline + stats)
    expect(app).toMatch(/fontVariant: \['tabular-nums'\]/);
    // the hero size is a real hero (doctrine: the amount is the screen's hero)
    expect(money.amountScale.hero.size).toBeGreaterThan(boutikPlusTheme.typeScale.displayFcfa.size);
  });

  it('the celebration is the NAMED moment, token-timed under the ceilings, non-blocking, reduced-motion honored', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/theme\.celebration\.produit_pret/);
    expect(kit).not.toMatch(/premiere_vente|course_validee/); // boutik owns ONE moment
    expect(kit).toMatch(/motion\.springSoft\.damping/);
    expect(kit).toMatch(/motion\.celebrate\.durationMs/);
    expect(kit).toMatch(/setTimeout\(onDone, motion\.celebrationMaxMs\)/); // the hard ceiling
    expect(kit).toMatch(/pointerEvents="none"/); // never blocks input
    expect(kit).toMatch(/AccessibilityInfo\.isReduceMotionEnabled/);
    expect(kit).toMatch(/reduceMotionChanged/);
    // token-level law: the animation duration fits the doctrine ceiling
    expect(motion.celebrate.durationMs).toBeLessThanOrEqual(motion.celebrationMaxMs);
    expect(motion.quick.durationMs).toBeGreaterThanOrEqual(150);
    expect(motion.standard.durationMs).toBeLessThanOrEqual(250);
    // the App fires it exactly on « Produit prêt »
    const app = read('App.tsx');
    expect(app).toMatch(/<Celebration visible=\{celebrating && screen === 'pret'\}/);
    expect(app.match(/setCelebrating\(true\)/g)).toHaveLength(2); // offre → pret AND corrective → pret
  });

  it('the screen change eases in on the ONE soft spring — token params, static under reduced motion', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/export function ScreenTransition/);
    const transition = kit.slice(kit.indexOf('export function ScreenTransition'), kit.indexOf('/* « La célébration »'));
    expect(transition).toMatch(/motion\.springSoft\.damping/);
    expect(transition).toMatch(/useNativeDriver: true/);
    expect(transition).toMatch(/if \(reduced\) \{/);
    const app = read('App.tsx');
    expect(app).toMatch(/<ScreenTransition screenKey=\{screen\}>/);
  });

  it('the skeleton pulses on motion tokens and is static under reduced motion — no bare spinner anywhere', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/motion\.standard\.durationMs/);
    expect(kit).toMatch(/if \(reduced\) return;/);
    for (const f of FILES) expect(read(f)).not.toMatch(/ActivityIndicator/);
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
    const specs = [...kit.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) expect(spec, `kit imports ${spec}`).not.toMatch(BANNED);
  });
});
