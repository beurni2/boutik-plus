import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWaterfall, assertQuoteReconciles } from '@platform/contracts';
import { sharedColour } from '@platform/ui-tokens';

/**
 * DF-1 — device feedback, carried across the Faso Premium adoption. The kit +
 * App source are scanned (the RN tree has no test-render harness); Part C's
 * recompute is proven on the PINNED waterfall. The DF-1 PALETTE ruling
 * (artisan-gold chips / supply-green CTAs) is SUPERSEDED by the FP system — the
 * chip tones are re-based to the status palette (fact = server-truth ok green),
 * the CTA stays supply-green. The BEHAVIOURS DF-1 fixed all SURVIVE: rows own
 * their height, Mes Recettes shows the figure alone, la part is editable, the
 * keypad is handled.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const app = read('App.tsx');
const kit = read('src/ui/kit.tsx');

describe('DF-1 A — palette (SUPERSEDED by FP): chips on the status palette, CTA supply-green', () => {
  it('the fact chip is server-truth OK green (not ink, not the retired gold ruling)', () => {
    expect(kit).toMatch(/fact:\s*\{\s*bg:\s*C\.okBg,\s*fg:\s*C\.okFg\s*\}/);
    expect(kit).not.toMatch(/fact:\s*\{\s*(?:box:\s*\{\s*)?backgroundColor:\s*C\.ink/); // never a green/ink lie
    expect(kit).not.toMatch(/C\.artisanAccent/); // the DF-1 gold ruling is superseded, not carried
    expect(typeof sharedColour.okBg).toBe('string');
  });

  it('the primary CTA fill is the boutik supply-green accent', () => {
    expect(kit).toMatch(/buttonPrimary:\s*\{\s*backgroundColor:\s*C\.primary/);
  });

  it('the status tones stay visually distinct (fact ok · pending warn · problem danger · celebrate soft)', () => {
    const fills = { fact: 'C.okBg', pending: 'C.warnBg', problem: 'C.dangerBg', celebrate: 'C.soft' };
    expect(new Set(Object.values(fills)).size).toBe(Object.keys(fills).length);
    for (const fill of Object.values(fills)) expect(kit).toContain(fill);
  });
});

describe('DF-1 A.2 — the chip-row collision: rows own their height, nothing overlaps', () => {
  it('ListRow uses minHeight (grows to fit title + sub + chip) — never a hard fixed height', () => {
    expect(kit).toMatch(/row:\s*\{[^}]*minHeight:\s*56/s);
    expect(kit).not.toMatch(/row:\s*\{[^}]*[^n]height:\s*56/s); // no bare fixed height
    expect(kit).toMatch(/row:\s*\{[^}]*padding:\s*D\.rowPad/s);
  });
});

describe('DF-1 B — Mes Recettes: product art + name as title + the figure ALONE', () => {
  it('the card carries a product-art thumb (duotone) and the item name as the visible title', () => {
    expect(app).toMatch(/<DuotoneTile label=\{item\.label\}[\s\S]*?style=\{styles\.receiptThumb\}/);
    expect(app).toMatch(/ts\('row', C\.ink\)[\s\S]*?item\.label/);
  });

  it('the figure renders ALONE at display scale — money.amount_f (« {amount} F ») — no full-sentence duplication', () => {
    expect(app).toMatch(/label=\{t\('offer\.net_label'\)\}[\s\S]*?amount=\{t\('money\.amount_f'\)\.replace\('\{amount\}', formatFcfa\(item\.obligation\.amount\)\)\}/);
    expect(app).not.toMatch(/amount=\{t\('recettes\.net_ligne'\)\.replace\('\{amount\}', formatFcfa\(item\.obligation\.amount\)\)\}/);
  });
});

describe('DF-1 C.1 — la part de la revendeuse is EDITABLE and the waterfall recomputes live', () => {
  it('the commission field takes input (not readOnly) and drives offerC', () => {
    expect(app).toMatch(/label=\{t\('offre\.champ_commission'\)\}[\s\S]*?value=\{commissionInput\}[\s\S]*?onChangeText=\{\(txt\) => setCommissionInput/);
    expect(app).toMatch(/const offerC = Number\.parseInt\(commissionInput, 10\) \|\| 0/);
  });

  it('the net RECOMPUTES on the commission through the PINNED waterfall (never re-derived)', () => {
    const B = 10_000;
    const net = (c: number) => {
      const m = computeWaterfall({ sellerBasePrice: B, sellerFundedCommission: c, resellerMarkup: 0, deliveryFee: 0, paymentMode: 'FULL_PREPAY' });
      assertQuoteReconciles(m);
      return m.sellerNet;
    };
    expect(net(1_000)).not.toBe(net(2_000));
    expect(net(1_000)).toBe(8_500); // 10 000 − 5 %·B (500) − C (1 000)
    expect(net(2_000)).toBe(7_500); // 10 000 − 500 − 2 000
  });
});

describe('DF-1 C.2 — the keypad is handled on Mon Prix (props wired; device feel is the founder re-check)', () => {
  it('the offre screen wires KeyboardAvoidingView + keyboardShouldPersistTaps + keyboardDismissMode + a scroll pad', () => {
    expect(app).toMatch(/screen === 'offre'[\s\S]*?<KeyboardAvoidingView/);
    expect(app).toMatch(/keyboardShouldPersistTaps="handled"/);
    expect(app).toMatch(/keyboardDismissMode="on-drag"/);
    // the CTA sits in a scroll pad (scrollFlow bottom pad) so the keyboard never hides it
    expect(app).toMatch(/scrollFlow:\s*\{\s*paddingBottom:\s*D\.scrollFlow/);
  });
});
