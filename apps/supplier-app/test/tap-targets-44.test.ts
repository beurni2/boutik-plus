import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUDIT-B+1 F18 — TWO TAP TARGETS UNDER THE 44 px DOCTRINE MINIMUM.
 *
 * CLAUDE.md §5: "≥44px touch targets". Measured by the audit in headless
 * Chromium at a 360×640 Android-Go viewport, on the exported web root that
 * `web-deploy.yml` actually ships:
 *   « Vérifié » chip                          91 × 38
 *   « Voir le parcours d'inscription vendeur » 320 × 15
 *
 * A 15-pixel-high link is not reachable for Aïcha on a hot phone in the sun.
 *
 * ── WHY THESE ARE FIXED WITH LAYOUT AND NOT `hitSlop` ──────────────────────
 * The house idiom in this repo is `hitSlop={8}` (kit.tsx, studio-real.tsx,
 * screens2.tsx). On this surface that idiom does nothing: **react-native-web
 * 0.21.2 does not implement `hitSlop` on `Pressable`** — the prop survives
 * only in the legacy `Touchable` export. Verified directly in the installed
 * package: `grep -rl hitSlop dist/` returns Touchable and nothing else.
 *
 * The console SHIPS AS WEB. A hitSlop "fix" would have re-measured at the
 * same 15 px while reading like a fix in the diff. That is the trap this test
 * exists to keep shut, so it asserts the LAYOUT properties that survive the
 * web build — not the presence of a prop.
 */

const lire = (rel: string): string => readFileSync(join(import.meta.dirname, '..', rel), 'utf8');

/** Bound a region STRUCTURALLY between two anchors — never a character budget. */
function bloc(source: string, debut: string, fin: string): string {
  const a = source.indexOf(debut);
  expect(a, `anchor not found: ${debut}`).toBeGreaterThan(-1);
  const b = source.indexOf(fin, a + debut.length);
  expect(b, `closing anchor not found after ${debut}: ${fin}`).toBeGreaterThan(a);
  const region = source.slice(a, b);
  expect(region.length, 'region collapsed to nothing — the pin would assert over an empty string').toBeGreaterThan(40);
  return region;
}

describe('§5 doctrine — every tap target reaches 44 px on the SHIPPED web root', () => {
  it('the « Vérifié » chip carries a 44 px touch box (the painted 38 px pill is untouched)', () => {
    const src = lire('src/v2/components.tsx');
    const region = bloc(src, 'export const ChipVerified', 'export const EcheanceRow');
    expect(region, 'ChipVerified no longer uses the 44 px hit style').toContain('chipVerifiedHit');
    expect(region, 'the painted pill was dropped instead of being wrapped').toContain('s.chipVerified');

    const hit = bloc(src, 'chipVerifiedHit:', '},');
    expect(hit, 'the touch box fell below the 44 px doctrine minimum').toContain('minHeight: 44');
  });

  it('the C14 pill keeps its 38 px design token — the fix must not resize the visual chip', () => {
    const styles = lire('src/ui/v2/styles.ts');
    const c14 = bloc(styles, 'export const C14', 'export const C15');
    expect(c14, 'the painted pill height changed — that is a design change, not an a11y fix').toContain('height: 38');
  });

  it('the « parcours d’inscription » link carries minHeight 44 and centres its text', () => {
    const src = lire('src/v2/screens1.tsx');
    const region = bloc(src, "OPEN_ONBOARD", 'fp.voir_parcours_inscription');
    expect(region, 'the 15 px link is back').toContain('minHeight: 44');
    expect(region, 'a 44 px box with top-aligned text still reads as a thin strip').toContain("justifyContent: 'center'");
  });

  /**
   * THE CONTROL, and the reason this file is not decoration: it pins the fact
   * that made hitSlop the wrong tool. If a future react-native-web bump starts
   * implementing hitSlop on Pressable, this test goes red and someone re-reads
   * the decision instead of inheriting it.
   */
  it('CONTROL: react-native-web still does NOT implement hitSlop on Pressable', () => {
    const racine = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.pnpm');
    const { readdirSync, existsSync } = require('node:fs') as typeof import('node:fs');
    const dossier = readdirSync(racine).find((d) => d.startsWith('react-native-web@'));
    expect(dossier, 'react-native-web is not installed where this control expects it').toBeDefined();

    const pressable = join(racine, dossier as string, 'node_modules', 'react-native-web', 'dist', 'exports', 'Pressable', 'index.js');
    expect(existsSync(pressable), 'the Pressable export moved — re-verify the hitSlop question by hand').toBe(true);
    expect(
      readFileSync(pressable, 'utf8').includes('hitSlop'),
      'react-native-web now mentions hitSlop in Pressable — re-read F18: hitSlop may finally be a valid fix, and these layout pins can relax',
    ).toBe(false);
  });
});
