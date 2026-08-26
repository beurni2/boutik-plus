import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { money } from '@platform/ui-tokens/legacy';
import { fee, net, formatF, pendingTotal, paidTotal, digitsToAmount } from '../src/v2/money';
import { SEED_ORDERS, SEED_PRODUCTS, SEED_RELEVES } from '../src/v2/seed';

/**
 * WO-FP-PIXEL §3.3/§3.4/§3.5 — the V2 seed money, asserted to the FRANC and to
 * the BYTE against the Phase-0 values table (the board's own rendered strings).
 * fee = round(B×rate) — 0 since FRAIS-ZERO (founder 2026-08-25) · net = B−C−fee
 * · pending/paid per status sets · separator U+202F (never U+0020). The §3.5
 * board checks pin FORMAT bytes on the Phase-0 (5 %-era) figures, which the
 * static board still carries.
 */

const appDir = join(import.meta.dirname, '..');
const TABLE = JSON.parse(readFileSync(join(appDir, '../../_review/WO-FP-PIXEL/values-table.json'), 'utf8')) as {
  moneyStrings: { screen: string; text: string }[];
};

describe('§3.4 — fee/net per seed product (exact)', () => {
  // FRAIS-ZERO (founder 2026-08-25): rate 0 — fee 0 on every B, net = B − C.
  const expected: Record<string, { fee: number; net: number }> = {
    p1: { fee: 0, net: 9_000 },
    p3: { fee: 0, net: 13_500 },
    p7: { fee: 0, net: 4_950 },
    p8: { fee: 0, net: 10_800 },
  };
  for (const p of SEED_PRODUCTS) {
    it(`${p.id} ${p.name}: fee ${expected[p.id]!.fee} · net ${expected[p.id]!.net}`, () => {
      expect(fee(p.B)).toBe(expected[p.id]!.fee);
      expect(net(p.B, p.C)).toBe(expected[p.id]!.net);
    });
  }
  it('orders carry the §3.6 FROZEN amounts (captured, equal to the product at seed time)', () => {
    for (const o of SEED_ORDERS) {
      const p = SEED_PRODUCTS.find((x) => x.id === o.pid)!;
      expect(o.net).toBe(net(p.B, p.C));
      expect(o.fee).toBe(fee(p.B));
    }
  });
});

describe('§3.4 — first-render aggregates', () => {
  it('pending = 19 800 (o1 9 000 + o3 10 800) · paid = 13 500 (o7) — FRAIS-ZERO nets', () => {
    expect(pendingTotal(SEED_ORDERS)).toBe(19_800);
    expect(paidTotal(SEED_ORDERS)).toBe(13_500);
  });
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

  it('the weekly relevés totals: Sem. 28 IS o7’s PAID net (one payment, one franc — FRAIS-ZERO coherence); the untouched weeks still match the board', () => {
    // Sem. 28's single versement is o7's settlement, so its total is pinned to
    // the ORDER's frozen net, not to the 5 %-era board — the verifier caught
    // the gains board saying 13 500 while the relevé still said 12 750.
    const o7 = SEED_ORDERS.find((o) => o.id === 'o7')!;
    expect(SEED_RELEVES[0]!.total).toBe(o7.net);
    expect(SEED_RELEVES[0]!.total).toBe(13_500);
    // The two older weeks describe unseeded history; their authored totals
    // still match the Phase-0 board strings byte-for-byte.
    const all = TABLE.moneyStrings.map((m) => m.text).join('\n');
    for (const r of SEED_RELEVES.slice(1)) {
      const grouped = formatF(r.total).slice(0, -money.currencySuffix.length);
      expect(all).toContain(grouped + ' F');
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
