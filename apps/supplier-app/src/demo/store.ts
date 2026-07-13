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

/**
 * B2.2 · A1 — the REAL moderation state, a UI mirror of the authoritative
 * catalog-service `moderation.ts` (ECOSYSTEM-MASTER-REFERENCE Part 9 / B+3:
 * "draft → submitted → changes-requested (with *specific* reasons) → approved …";
 * B2.2: "Moderation timeout = pending"). The SERVICE decides; this renders it
 * honestly. moderationState is INDEPENDENT of the fulfillment lifecycle `status`
 * — a product past its readiness deadline (echeance) is still moderation-`approved`.
 */
export type ModerationState = 'submitted' | 'changes_requested' | 'approved' | 'pending';

/** Specific, actionable moderation reasons (mirror of catalog-service CHANGE_REASONS). */
export type ChangeReason =
  | 'facts_incomplete'
  | 'no_public_safe_proof'
  | 'price_or_contact_in_image'
  | 'not_neutral_packaging'
  | 'prohibited_or_unlaunched_category'
  | 'authenticity_concern';

export interface DemoProduct {
  readonly id: string;
  /** Seed data, not UI chrome — obviously fictional French demo content. */
  readonly name: string;
  readonly landmark: string;
  readonly priceB: number;
  readonly commissionC: number;
  readonly status: DemoStatus;
  /** The real moderation state (never derived from `status`); service is authoritative. */
  readonly moderationState: ModerationState;
  readonly money: QuoteMoney;
  /** Catalog keys of the failed pickup checks (corrective flow). */
  readonly refusedChecks?: readonly string[];
  /** Minutes left on the correction clock (demo display). */
  readonly correctionMinLeft?: number;
  /** Specific reasons — REQUIRED when moderationState is changes_requested (never silent). */
  readonly changeReasons?: readonly ChangeReason[];
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
  extra?: Partial<Pick<DemoProduct, 'refusedChecks' | 'correctionMinLeft' | 'moderationState' | 'changeReasons'>>,
): DemoProduct => ({
  id,
  name,
  landmark,
  priceB,
  commissionC,
  status,
  moderationState: 'approved', // default: a selling product passed moderation; overridden below
  money: quoteFor(priceB, commissionC),
  ...extra,
});

export function seedProducts(): DemoProduct[] {
  return [
    seed('p1', 'Pagne tissé main (démo)', 'Marché Rood-Woko', 10_000, 1_000, 'pret'),
    seed('p2', 'Sac en cuir de Kaya (démo)', 'Gare de l’Est', 15_500, 1_500, 'pret'),
    seed('p3', 'Beurre de karité 500 g (démo)', 'Quartier Gounghin', 3_500, 350, 'pret'),
    // en attente d'un examen — SUBMITTED, honestly not yet approved
    seed('p4', 'Chemise Faso Dan Fani (démo)', 'Avenue Kwame-Nkrumah', 12_000, 1_200, 'en_attente', {
      moderationState: 'submitted',
    }),
    seed('p5', 'Bissap séché 1 kg (démo)', 'Marché de Paglayiri', 2_000, 200, 'pret'),
    // CHANGES REQUESTED — carries specific, actionable reasons (never silent)
    seed('p6', 'Sandales artisanales (démo)', 'Quartier Dapoya', 7_500, 750, 'refuse_correctable', {
      refusedChecks: ['check.colour', 'check.qty'],
      correctionMinLeft: 240,
      moderationState: 'changes_requested',
      changeReasons: ['price_or_contact_in_image', 'not_neutral_packaging'],
    }),
    // review took longer than the window — PENDING, never auto-approved (B2.2)
    seed('p7', 'Collier bronze de Ouaga (démo)', 'Village artisanal', 9_000, 900, 'correction_en_cours', {
      correctionMinLeft: 45,
      moderationState: 'pending',
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
// WO-6.0 ruling ③ — the money separator must PAINT, not tofu. fr-FR groups
// with U+202F (narrow no-break space), but Archivo has no U+202F glyph (nor
// U+2009 thin space) in any available subset — it WOULD tofu. The founder's
// ruling ③ authorizes a fallback: normalize every narrow/no-break space to
// U+00A0 (NBSP), which Archivo DOES draw and which keeps « 11 500 F »
// unbreakable. money.groupSeparator stays U+202F (the intent); this is the
// renderable display fallback for a typeface that lacks the glyph.
/** NBSP — the renderable no-break money space (ruling ③ fallback for U+202F). */
export const MONEY_SPACE = ' ';
export const formatFcfa = (n: number): string =>
  n.toLocaleString('fr-FR').replace(/[\u202f\u00a0\u2009]/g, MONEY_SPACE);
