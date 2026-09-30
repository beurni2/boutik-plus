import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { money } from '@platform/ui-tokens/legacy';
import { fee, net, formatF, digitsToAmount } from '../src/v2/money';

/**
 * WO-FP-PIXEL §3.3/§3.4/§3.5 — the V2 seed money, asserted to the FRANC and to
 * the BYTE against the Phase-0 values table (the board's own rendered strings).
 * fee = round(B×rate) — 0 since FRAIS-ZERO (founder 2026-08-25) · net = B−C−fee
 * · pending/paid per status sets · separator U+202F (never U+0020). The §3.5
 * board checks pin FORMAT bytes on the Phase-0 (5 %-era) figures, which the
 * static board still carries.
 *
 * LISTER-VRAI-1 (founder 2026-09-30, « make room »): the demo seed is gone, so
 * its four B/C pairs are written in below; the seed-only checks (frozen order
 * amounts, first-render totals, weekly relevés) left with the data they read.
 */

const appDir = join(import.meta.dirname, '..');
const TABLE = JSON.parse(readFileSync(join(appDir, '../../_review/WO-FP-PIXEL/values-table.json'), 'utf8')) as {
  moneyStrings: { screen: string; text: string }[];
};

describe('§3.4 — fee/net on the old board\'s four prices (exact)', () => {
  // FRAIS-ZERO (founder 2026-08-25): rate 0 — fee 0 on every B, net = B − C.
  const cases: readonly { B: number; C: number; net: number }[] = [
    { B: 10_000, C: 1_000, net: 9_000 },
    { B: 15_000, C: 1_500, net: 13_500 },
    { B: 5_500, C: 550, net: 4_950 },
    { B: 12_000, C: 1_200, net: 10_800 },
  ];
  for (const c of cases) {
    it(`B ${c.B} · C ${c.C}: fee 0 · net ${c.net}`, () => {
      expect(fee(c.B)).toBe(0);
      expect(net(c.B, c.C)).toBe(c.net);
    });
  }
});

describe('§3.5 — formatting (WO-FCFA re-pin, founder order 2026-07-18: suffix from canon v1.0.1)', () => {
  it('the pinned token IS the FCFA suffix (U+202F + FCFA) — premise of every row below', () => {
    expect(money.currencySuffix).toBe('\u202fFCFA');
  });

  it('formatF emits U+202F group separators and the canon suffix — never U+0020 groups, never hardcoded', () => {
    expect(formatF(18_700)).toBe('18\u202f700\u202fFCFA');
    expect(formatF(12_750)).toBe('12\u202f750\u202fFCFA');
    expect(formatF(8_500)).toBe('8\u202f500\u202fFCFA');
    expect(formatF(4_675)).toBe('4\u202f675\u202fFCFA');
    expect(formatF(10_200)).toBe('10\u202f200\u202fFCFA');
    expect(formatF(500)).toBe('500\u202fFCFA'); // no group separator under 1000
  });

  it('the grouped DIGITS stay byte-identical to the board (the Phase-0 board predates FCFA and renders « F » — founder-ordered display divergence, values unchanged)', () => {
    const all = TABLE.moneyStrings.map((m) => m.text).join('\n');
    for (const n of [18_700, 12_750, 8_500, 4_675, 10_200]) {
      const grouped = formatF(n).slice(0, -money.currencySuffix.length);
      expect(all, n + ' grouped digits byte-identical on the board').toContain(grouped + ' F');
    }
  });
});

describe('WHAT HE TYPES INTO A MONEY BOX — digits only, and never a NaN', () => {
  it('reads a plain amount', () => {
    expect(digitsToAmount('12500')).toBe(12500);
  });

  it('an EMPTY box is zero — the publish floor then refuses it in words he can read', () => {
    expect(digitsToAmount('')).toBe(0);
    expect(digitsToAmount('   ')).toBe(0);
  });

  it('NO NEGATIVE can be produced, whatever the keyboard offers', () => {
    expect(digitsToAmount('-500')).toBe(500);
    expect(digitsToAmount('−500')).toBe(500);
  });

  it('NO FRACTION and no separator survives — FCFA is an integer currency', () => {
    expect(digitsToAmount('12,50')).toBe(1250);
    expect(digitsToAmount('12.50')).toBe(1250);
    expect(digitsToAmount('12 500')).toBe(12500);
  });

  it('never returns NaN, for any input at all', () => {
    for (const junk of ['abc', 'e5', '1e10', '+', '٣٤', 'NaN', 'Infinity', '\u0663\u0664']) {
      expect(Number.isSafeInteger(digitsToAmount(junk)), `NaN from ${junk}`).toBe(true);
    }
  });

  it('a mistyped run of digits stays inside a safe integer rather than losing precision', () => {
    expect(Number.isSafeInteger(digitsToAmount('9'.repeat(40)))).toBe(true);
  });
});
