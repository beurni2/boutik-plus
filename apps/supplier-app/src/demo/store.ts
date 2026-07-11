import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';

type QuoteMoney = ReturnType<typeof computeWaterfall>;

/**
 * WO-4.1 demo world — in-memory, seeded, honest. Every franc on every demo
 * screen comes from the PINNED waterfall and reconciles before it exists
 * (quoteFor asserts; a tampered quote cannot enter the world, demo or not).
 * Seed names are obviously fictional — « (démo) » on every product — so
 * demo data can never pass for real user data.
 */

export type DemoStatus =
  | 'pret'
  | 'en_attente'
  | 'refuse_correctable'
  | 'correction_en_cours'
  | 'echeance_depassee';

export interface DemoProduct {
  readonly id: string;
  /** Seed data, not UI chrome — obviously fictional French demo content. */
  readonly name: string;
  readonly landmark: string;
  readonly priceB: number;
  readonly commissionC: number;
  readonly status: DemoStatus;
  readonly money: QuoteMoney;
  /** Catalog keys of the failed pickup checks (corrective flow). */
  readonly refusedChecks?: readonly string[];
  /** Minutes left on the correction clock (demo display). */
  readonly correctionMinLeft?: number;
}

export interface DemoWorld {
  products: DemoProduct[];
}

/**
 * Demo view of the correction clock. Pinned by test to the service policy
 * (FULFILLMENT_AGING_POLICY_V2.correctionDeadlineMin) — the demo bends to
 * the rules; it never re-invents them.
 */
export const DEMO_CORRECTION_DEADLINE_MIN = 360;

export function quoteFor(priceB: number, commissionC: number): QuoteMoney {
  const money = computeWaterfall({
    sellerBasePrice: priceB,
    sellerFundedCommission: commissionC,
    resellerMarkup: 0,
    deliveryFee: 0,
    paymentMode: 'FULL_PREPAY',
  });
  assertQuoteReconciles(money);
  return money;
}

/** The §5.4 worked baseline (10 000 / 1 000 / 1 500 / 1 000) — the in-app proof card. */
export function baselineQuote(): QuoteMoney {
  const money = computeWaterfall({
    sellerBasePrice: 10_000,
    sellerFundedCommission: 1_000,
    resellerMarkup: 1_500,
    deliveryFee: 1_000,
    paymentMode: 'FULL_PREPAY',
  });
  assertQuoteReconciles(money);
  return money;
}

const seed = (
  id: string,
  name: string,
  landmark: string,
  priceB: number,
  commissionC: number,
  status: DemoStatus,
  extra?: Partial<Pick<DemoProduct, 'refusedChecks' | 'correctionMinLeft'>>,
): DemoProduct => ({ id, name, landmark, priceB, commissionC, status, money: quoteFor(priceB, commissionC), ...extra });

export function seedProducts(): DemoProduct[] {
  return [
    seed('p1', 'Pagne tissé main (démo)', 'Marché Rood-Woko', 10_000, 1_000, 'pret'),
    seed('p2', 'Sac en cuir de Kaya (démo)', 'Gare de l’Est', 15_500, 1_500, 'pret'),
    seed('p3', 'Beurre de karité 500 g (démo)', 'Quartier Gounghin', 3_500, 350, 'pret'),
    seed('p4', 'Chemise Faso Dan Fani (démo)', 'Avenue Kwame-Nkrumah', 12_000, 1_200, 'en_attente'),
    seed('p5', 'Bissap séché 1 kg (démo)', 'Marché de Paglayiri', 2_000, 200, 'pret'),
    seed('p6', 'Sandales artisanales (démo)', 'Quartier Dapoya', 7_500, 750, 'refuse_correctable', {
      refusedChecks: ['check.colour', 'check.qty'],
      correctionMinLeft: 240,
    }),
    seed('p7', 'Collier bronze de Ouaga (démo)', 'Village artisanal', 9_000, 900, 'correction_en_cours', {
      correctionMinLeft: 45,
    }),
    seed('p8', 'Panier tressé (démo)', 'Quartier Tanghin', 4_500, 450, 'echeance_depassee', {
      correctionMinLeft: 0,
    }),
  ];
}

export function createDemoWorld(): DemoWorld {
  return { products: seedProducts() };
}

/** The « nouveau produit » walk publishes an honest pending product. */
export function addDemoProduct(world: DemoWorld, priceB: number, commissionC: number): DemoProduct {
  const product = seed(
    `p${world.products.length + 1}-${Date.now().toString(36)}`,
    'Nouveau produit (démo)',
    'Votre boutique',
    priceB,
    commissionC,
    'en_attente',
  );
  world.products = [product, ...world.products];
  return product;
}

/** The corrective walk: fixing a refused product re-arms readiness. */
export function markCorrected(world: DemoWorld, id: string): void {
  world.products = world.products.map((p) =>
    p.id === id && p.status === 'refuse_correctable' ? { ...p, status: 'correction_en_cours' as const } : p,
  );
}

// Bare number — the catalog string supplies « F » (the doubled-suffix
// regression was the WO-4.1 verifier's blocking finding #2).
export const formatFcfa = (n: number): string => `${n.toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`;
