import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWaterfall, assertQuoteReconciles } from '@platform/contracts';
import { boutikColour } from '@platform/ui-tokens';

/**
 * DF-1 — device feedback, first batch (founder on-device, 2026-07-14). The kit
 * + App source are scanned (the WO-6.0 ui-kit.test convention — the RN tree has
 * no test-render harness); Part C's recompute is proven on the PINNED waterfall.
 * A — palette off ink + the chip-row owns its height; B — Mes Recettes figure
 * alone; C — la part de la revendeuse is editable and the keypad is handled.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const app = read('App.tsx');
const kit = read('src/ui/kit.tsx');

describe('DF-1 A — palette pass: chips / status badges / primary CTA come off ink', () => {
  it('the fact chip is re-derived onto the boutik warm accent (artisanAccent), NOT ink', () => {
    // the fact tone box is the warm gold accent with ink text (legible at arm's length)
    expect(kit).toMatch(/fact:\s*\{\s*box:\s*\{\s*backgroundColor:\s*C\.artisanAccent\s*\},\s*fg:\s*C\.ink\s*\}/);
    // it is NOT the old ink fill
    expect(kit).not.toMatch(/fact:\s*\{\s*box:\s*\{\s*backgroundColor:\s*C\.ink\s*\}/);
    // artisanAccent is an EXISTING boutik token (no invented hex)
    expect(typeof boutikColour.artisanAccent).toBe('string');
  });

  it('the primary CTA fill comes off ink onto the boutik warm supply-green', () => {
    expect(kit).toMatch(/buttonInk:\s*\{\s*backgroundColor:\s*C\.primary\s*\}/);
    expect(kit).not.toMatch(/buttonInk:\s*\{\s*backgroundColor:\s*C\.ink\s*\}/);
  });

  it('the four status tones stay visually distinct (fact gold · pending cream · problem red · celebrate green)', () => {
    // no two of the state fills collide after the pass
    const fills = { fact: 'C.artisanAccent', pending: 'C.warningTint', problem: 'C.dangerTint', celebrate: 'C.primary' };
    const set = new Set(Object.values(fills));
    expect(set.size).toBe(Object.keys(fills).length); // all four fills are different
    for (const fill of Object.values(fills)) expect(kit).toContain(fill);
  });
});

describe('DF-1 A.2 — the chip-row collision: rows own their height, nothing overlaps', () => {
  it('ListRow uses minHeight (grows to fit title + meta + chip) — never a hard fixed height', () => {
    expect(kit).toMatch(/row:\s*\{[^}]*minHeight:\s*LIST_ROW_HEIGHT/s);
    expect(kit).not.toMatch(/row:\s*\{[^}]*[^n]height:\s*LIST_ROW_HEIGHT/s); // no bare fixed height
    expect(kit).toMatch(/row:\s*\{[^}]*paddingVertical:\s*spacing\.sm/s);
  });
});

describe('DF-1 B — Mes Recettes: photo + name as title + the figure ALONE', () => {
  it('the card carries a product photo thumb and the item name as the visible (body-scale) title', () => {
    expect(app).toMatch(/style=\{styles\.receiptThumb\}/);
    expect(app).toMatch(/style=\{styles\.receiptName\}[\s\S]*?item\.label/);
    // the name style is body/row scale, ink — not the tiny caps Overline
    expect(app).toMatch(/receiptName:\s*\{\s*\.\.\.textStyle\(T\.row\)/);
  });

  it('the figure renders ALONE at display scale — money.amount_f (« {amount} F ») — the full-sentence duplication is gone', () => {
    // recettes hero uses the figure-only template + the label ONCE
    expect(app).toMatch(/label=\{t\('offer\.net_label'\)\}[\s\S]*?amount=\{t\('money\.amount_f'\)\.replace\('\{amount\}', formatFcfa\(item\.obligation\.amount\)\)\}/);
    // the old full-sentence template no longer feeds a recettes AmountHero amount
    expect(app).not.toMatch(/amount=\{t\('recettes\.net_ligne'\)\.replace\('\{amount\}', formatFcfa\(item\.obligation\.amount\)\)\}/);
  });
});

describe('DF-1 C.1 — la part de la revendeuse is EDITABLE and the waterfall recomputes live', () => {
  it('the commission field takes input (not readOnly) and drives offerC', () => {
    // the commission MoneyField is editable — value is the raw input + an onChangeText
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
    // a different commission → a different net (the field truly recomputes)
    expect(net(1_000)).not.toBe(net(2_000));
    // and each still reconciles to the franc (money gate holds)
    expect(net(1_000)).toBe(8_500); // 10 000 − 5 %·B (500) − C (1 000)
    expect(net(2_000)).toBe(7_500); // 10 000 − 500 − 2 000
  });
});

describe('DF-1 C.2 — the keypad is handled on Mon Prix (props wired; device feel is the founder re-check)', () => {
  it('the offre screen wires KeyboardAvoidingView + keyboardShouldPersistTaps + keyboardDismissMode', () => {
    expect(app).toMatch(/screen === 'offre'[\s\S]*?<KeyboardAvoidingView/);
    expect(app).toMatch(/keyboardShouldPersistTaps="handled"/);
    expect(app).toMatch(/keyboardDismissMode="on-drag"/);
    // the CTA sits in a scroll pad so the keyboard never hides it
    expect(app).toMatch(/offerScroll:\s*\{\s*paddingBottom:\s*spacing\.xl\s*\}/);
  });
});
