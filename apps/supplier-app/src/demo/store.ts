import { assertQuoteReconciles, computeWaterfall, type PlatformEvent } from '@platform/contracts';
import { projectReceivables, type SupplierReceivable } from '../settlement/readModel';

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

/** A supplier receivable for B10 « Mes recettes » — the projected settlement
 * obligation (state + LOCKED amount) plus the demo product label to show it by. */
export interface DemoReceivable {
  readonly label: string;
  readonly obligation: SupplierReceivable;
}

export interface DemoWorld {
  products: DemoProduct[];
  receivables: DemoReceivable[];
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

/**
 * Demo settlement EVENTS (as the Ledger&Settlement authority would emit them),
 * projected through the read model into B10's receivables. The demo does NOT
 * write states directly — it emits events and lets the reducer compute them, so
 * B10 shows exactly what the read model produces (a spread across states). The
 * `amount` on each event is the LOCKED obligation (sellerNet at quote time);
 * B10 never recomputes it (B+I-05).
 */
const lockedNet = (b: number, c: number): number => quoteFor(b, c).sellerNet;
const settlementEnv = (n: number) => ({
  command_id: `cmd-set-${n}`,
  correlation_id: `corr-set-${n}`,
  aggregateVersion: n,
  actor: 'ledger-settlement',
  serverTime: '2026-07-13T09:00:00.000Z',
  version: 'v1',
});
const setEvent = (name: string, n: number, payload: Record<string, unknown>): PlatformEvent =>
  ({ name, envelope: settlementEnv(n), payload }) as PlatformEvent;
const payable = (orderId: string, b: number, c: number, state: string, extra: Record<string, unknown> = {}): PlatformEvent =>
  setEvent('settlement.supplier_payable.v1', 1, { orderId, party: 'supplier-1', amount: lockedNet(b, c), state, ...extra });

export function demoSettlementEvents(): PlatformEvent[] {
  return [
    payable('o-karite', 3_500, 350, 'Eligible'), // en attente
    payable('o-pagne', 10_000, 1_000, 'Payable'), // en attente (prochain versement)
    payable('o-sac', 15_500, 1_500, 'Eligible'),
    setEvent('payout.submitted.v1', 2, { orderId: 'o-sac' }), // → Processing
    payable('o-bissap', 2_000, 200, 'Eligible'),
    setEvent('payout.submitted.v1', 2, { orderId: 'o-bissap' }),
    setEvent('payout.paid.v1', 3, { orderId: 'o-bissap', payoutRef: 'MM-2026-0713-004' }), // → Paid (provider ref)
    payable('o-collier', 9_000, 900, 'Held', { holds: ['revue-1'] }), // en révision
  ];
}

const RECEIVABLE_LABELS: Record<string, string> = {
  'o-karite': 'Beurre de karité 500 g (démo)',
  'o-pagne': 'Pagne tissé main (démo)',
  'o-sac': 'Sac en cuir de Kaya (démo)',
  'o-bissap': 'Bissap séché 1 kg (démo)',
  'o-collier': 'Collier bronze de Ouaga (démo)',
};

export function seedReceivables(): DemoReceivable[] {
  return [...projectReceivables(demoSettlementEvents()).values()].map((obligation) => ({
    label: RECEIVABLE_LABELS[obligation.orderId] ?? obligation.orderId,
    obligation,
  }));
}

export function createDemoWorld(): DemoWorld {
  return { products: seedProducts(), receivables: seedReceivables() };
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
