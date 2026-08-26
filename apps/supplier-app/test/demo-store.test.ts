import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QuoteReconciliationError, assertQuoteReconciles } from '@platform/contracts';
import {
  DEMO_CORRECTION_DEADLINE_MIN,
  addDemoProduct,
  baselineQuote,
  createDemoWorld,
  markCorrected,
  seedProducts,
} from '../src/demo/store';

/**
 * WO-4.1 — the demo world obeys the money law. Every seeded franc comes
 * from the pinned waterfall and reconciles literally; the §5.4 worked
 * baseline shows the exact canonical numbers in-app; a tampered quote
 * cannot exist even in demo; the correction clock is PINNED to the service
 * policy (the demo bends to the rules, never the reverse).
 */

describe('demo world money law', () => {
  it('every seeded product reconciles to the franc (literal identity, not just no-throw)', () => {
    for (const p of seedProducts()) {
      expect(() => assertQuoteReconciles(p.money)).not.toThrow();
      expect(p.money.sellerNet + p.money.resellerNet + p.money.platformProductFeeRevenue).toBe(
        p.money.productSubtotal,
      );
    }
  });

  it('the in-app baseline card shows the §5.4 worked baseline exactly', () => {
    const q = baselineQuote();
    // FRAIS-ZERO (founder 2026-08-25): both rates 0 — nets keep the whole amount.
    expect(q.productSubtotal).toBe(11_500);
    expect(q.buyerTotal).toBe(12_500);
    expect(q.sellerNet).toBe(9_000);
    expect(q.resellerNet).toBe(2_500);
    expect(q.platformProductFeeRevenue).toBe(0);
  });

  it('a tampered demo quote cannot exist (canon seam refused)', () => {
    const honest = seedProducts()[0]!.money;
    const tampered = { ...honest, sellerNet: honest.sellerNet + 1 };
    expect(() => assertQuoteReconciles(tampered)).toThrow(QuoteReconciliationError);
  });

  it('the demo correction clock is pinned to the service policy value', () => {
    const service = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'services', 'fulfillment-service', 'src', 'fulfillment.ts'),
      'utf8',
    );
    const m = service.match(/correctionDeadlineMin:\s*(\d+)/);
    expect(m, 'policy constant not found in fulfillment.ts').not.toBeNull();
    expect(DEMO_CORRECTION_DEADLINE_MIN).toBe(Number(m![1]));
  });

  it('reset restores the exact seed; walks mutate honestly', () => {
    const world = createDemoWorld();
    const before = world.products.length;
    addDemoProduct(world, 10_000, 1_000);
    expect(world.products.length).toBe(before + 1);
    expect(world.products[0]!.status).toBe('en_attente');
    const refused = world.products.find((p) => p.status === 'refuse_correctable')!;
    markCorrected(world, refused.id);
    expect(world.products.find((p) => p.id === refused.id)!.status).toBe('correction_en_cours');
    expect(createDemoWorld().products).toEqual(seedProducts());
  });

  it('every seed name is obviously fictional (démo-marked)', () => {
    for (const p of seedProducts()) expect(p.name).toContain('(démo)');
  });
});
