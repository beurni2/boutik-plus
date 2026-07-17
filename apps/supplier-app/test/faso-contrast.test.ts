import { describe, expect, it } from 'vitest';
import { sharedColour as S, boutikColour as B } from '@platform/ui-tokens';
import { appColour } from '../src/ui/fp';

/**
 * WO-FP-BOUTIK (device review #2) — THE PERMANENT CONTRAST GATE (sera pattern
 * ported to boutik). The founder tapped the money hero and found it unreadable;
 * the fix is not just the one screen but a gate: every text-bearing pairing the
 * app renders is COMPUTED from the tokens and held to WCAG AA. A failing pair
 * can never ship again.
 *
 * WCAG 2.x: contrast = (L1+.05)/(L2+.05) on relative luminance. AA = 4.5 for
 * normal text, 3.0 for large text (≥ 24px, or ≥ 18.66px bold). MONEY-MAJESTY
 * LAW: money surfaces are held to the TOP BAND (AAA, 7.0) — the amount is the
 * most legible element on any screen it appears on. Disabled/inactive controls
 * are WCAG-exempt (1.4.3) and excluded, named.
 */

const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * srgb(((n >> 16) & 255) / 255) + 0.7152 * srgb(((n >> 8) & 255) / 255) + 0.0722 * srgb((n & 255) / 255);
};
const contrast = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** rgba(7,59,46,.95) over paper ≈ deep; the celebration scrim's effective base. */
const CELEBRATION_BASE = B.deep;

// Every text-on-surface pairing the render layer actually paints, its role, and
// its WCAG size class. `min` is the threshold the pair must clear.
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const AAA = 7.0;

const PAIRS: { name: string; fg: string; bg: string; min: number }[] = [
  { name: 'ink on paper (screen text)', fg: S.ink, bg: S.paper, min: AA_NORMAL },
  { name: 'ink on card', fg: S.ink, bg: S.card, min: AA_NORMAL },
  { name: 'body on card', fg: S.body, bg: S.card, min: AA_NORMAL },
  { name: 'body on paper', fg: S.body, bg: S.paper, min: AA_NORMAL },
  { name: 'sub on card (row sub / caps)', fg: S.sub, bg: S.card, min: AA_NORMAL },
  { name: 'sub on paper', fg: S.sub, bg: S.paper, min: AA_NORMAL },
  { name: 'deep on soft (secondary button)', fg: B.deep, bg: B.soft, min: AA_NORMAL },
  { name: 'deep on card (inline price)', fg: B.deep, bg: S.card, min: AA_NORMAL },
  { name: 'soft on primary (ledger caps)', fg: B.soft, bg: B.primary, min: AA_NORMAL },
  { name: 'onPrimary on primary (CTA)', fg: B.onPrimary, bg: B.primary, min: AA_NORMAL },
  { name: 'gold on celebration scrim (label)', fg: B.gold, bg: CELEBRATION_BASE, min: AA_LARGE },
  { name: 'okFg on okBg (fact chip)', fg: S.okFg, bg: S.okBg, min: AA_NORMAL },
  { name: 'warnFgAlt on warnBg (pending)', fg: S.warnFgAlt, bg: S.warnBg, min: AA_NORMAL },
  { name: 'warnFg on warnBg', fg: S.warnFg, bg: S.warnBg, min: AA_NORMAL },
  { name: 'dangerFg on dangerBg (problem)', fg: S.dangerFg, bg: S.dangerBg, min: AA_NORMAL },
  { name: 'mutedFg on mutedBg (neutral chip)', fg: S.mutedFg, bg: S.mutedBg, min: AA_NORMAL },
  { name: 'toastFg on ink (toast)', fg: appColour.toastFg, bg: S.ink, min: AA_NORMAL },
];

// Money surfaces — held to the TOP BAND (AAA). The hero amount + card figures.
const MONEY_PAIRS: { name: string; fg: string; bg: string }[] = [
  { name: 'hero money — onPrimary on primary (ledger)', fg: B.onPrimary, bg: B.primary },
  { name: 'card money — deep on card', fg: B.deep, bg: S.card },
  { name: 'card money — ink on card', fg: S.ink, bg: S.card },
];

describe('WO-FP-BOUTIK contrast gate — every text pairing meets WCAG AA', () => {
  it('every text-on-surface pairing clears its WCAG minimum (AA)', () => {
    const failures = PAIRS.filter((p) => contrast(p.fg, p.bg) < p.min).map(
      (p) => `${p.name}: ${contrast(p.fg, p.bg).toFixed(2)} < ${p.min}`,
    );
    expect(failures, `contrast failures:\n${failures.join('\n')}`).toEqual([]);
  });

  it('MONEY surfaces are held to the TOP BAND (AAA ≥ 7.0) — money majesty', () => {
    const failures = MONEY_PAIRS.filter((p) => contrast(p.fg, p.bg) < AAA).map(
      (p) => `${p.name}: ${contrast(p.fg, p.bg).toFixed(2)} < ${AAA}`,
    );
    expect(failures, `money-majesty contrast failures:\n${failures.join('\n')}`).toEqual([]);
  });

  it('the ledger weave does NOT become the money background — it is a ≤5% white texture on solid accent', () => {
    // the fix for #2: the weave is a faint texture, so the effective money
    // background stays ~solid primary and the AAA money pairing above holds.
    // (a solid onPrimary stroke — the shipped bug — would have made the weave
    // opaque; the docket now pins it to rgba(255,255,255,.05).)
    expect(appColour.ledgerWeave).toBe('rgba(255,255,255,.05)');
    const alpha = Number(appColour.ledgerWeave.match(/,\s*(\.\d+|\d?\.\d+|1|0)\s*\)$/)?.[1]);
    expect(alpha).toBeLessThanOrEqual(0.05);
  });

  it('the contrast function is NON-VACUOUS: known pairs compute correctly', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0); // black/white = 21:1
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5); // identical = 1:1
    expect(contrast('#777777', '#FFFFFF')).toBeLessThan(4.5); // mid-grey/white fails AA
  });
});
