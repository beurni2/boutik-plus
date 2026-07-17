import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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

describe('§3.5 — formatting, byte-exact vs the board strings', () => {
  it('formatF emits U+202F group separators and the « F » suffix — never U+0020 groups', () => {
    const s = formatF(18_700);
    expect(s).toBe('18 700 F');
    expect(formatF(12_750)).toBe('12 750 F');
    expect(formatF(8_500)).toBe('8 500 F');
    expect(formatF(4_675)).toBe('4 675 F');
    expect(formatF(10_200)).toBe('10 200 F');
    expect(formatF(500)).toBe('500 F'); // no separator under 1000
  });

  it('the asserted amounts appear BYTE-IDENTICAL in the board (values-table moneyStrings)', () => {
    const all = TABLE.moneyStrings.map((m) => m.text).join('\n');
    for (const n of [18_700, 12_750, 8_500, 4_675, 10_200]) {
      expect(all, `${n} rendered byte-identical on the board`).toContain(formatF(n));
    }
  });

  it('the weekly relevés totals format to the board strings', () => {
    const all = TABLE.moneyStrings.map((m) => m.text).join('\n');
    for (const r of SEED_RELEVES) expect(all).toContain(formatF(r.total));
  });
});
