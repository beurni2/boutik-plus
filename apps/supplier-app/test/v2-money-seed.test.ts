import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { money } from '@platform/ui-tokens/legacy';
import { fee, net, formatF, pendingTotal, paidTotal } from '../src/v2/money';
import { SEED_ORDERS, SEED_PRODUCTS, SEED_RELEVES } from '../src/v2/seed';

/**
 * WO-FP-PIXEL §3.3/§3.4/§3.5 — the V2 seed money, asserted to the FRANC and to
 * the BYTE against the Phase-0 values table (the board's own rendered strings).
 * fee = round(B×.05) · net = B−C−fee · pending/paid per status sets ·
 * separator U+202F (never U+0020).
 */

const appDir = join(import.meta.dirname, '..');
const TABLE = JSON.parse(readFileSync(join(appDir, '../../_review/WO-FP-PIXEL/values-table.json'), 'utf8')) as {
  moneyStrings: { screen: string; text: string }[];
};

describe('§3.4 — fee/net per seed product (exact)', () => {
  const expected: Record<string, { fee: number; net: number }> = {
    p1: { fee: 500, net: 8_500 },
    p3: { fee: 750, net: 12_750 },
    p7: { fee: 275, net: 4_675 },
    p8: { fee: 600, net: 10_200 },
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
  it('pending = 18 700 (o1 8 500 + o3 10 200) · paid = 12 750 (o7)', () => {
    expect(pendingTotal(SEED_ORDERS)).toBe(18_700);
    expect(paidTotal(SEED_ORDERS)).toBe(12_750);
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

  it('the weekly relevés totals: grouped digits match the board strings', () => {
    const all = TABLE.moneyStrings.map((m) => m.text).join('\n');
    for (const r of SEED_RELEVES) {
      const grouped = formatF(r.total).slice(0, -money.currencySuffix.length);
      expect(all).toContain(grouped + ' F');
    }
  });
});
