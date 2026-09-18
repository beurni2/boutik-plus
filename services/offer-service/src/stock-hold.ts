/**
 * ═══ B5.1 — THE SUPPLIER-SIDE HOLD (RESERVATION-FOURNISSEUR-1), pure ═══
 *
 * Plan B5.1: « Atomic reservation (Durable Object) — Reserve/release atomic;
 * no negative; concurrency test. » Spec acceptance: « concurrent reservation
 * cannot oversell ». Founder ruling 2026-09-17: a PRIVATE door, not canon —
 * Shop+ calls Boutik+ over the binding and credential it already uses for
 * the confirmed-order wire, and the hold carries Shop+'s OWN reservation id
 * so the chain stays one id (`quote_id → reservation_id → …`).
 *
 * WHAT A HOLD IS: a unit of `available` set aside for one buyer's order while
 * she pays. It is NOT a movement of the counter — the counter is the physical
 * count (B5.2's journal describes it) — it is a claim on top of it. Readers
 * see the NET (`available − held`), so the last unit disappears from every
 * reseller's page the moment it is held; the confirmed sale later CONSUMES
 * the unit (counter −1, hold gone, one atomic write). A release, or the hold's
 * own expiry, gives the unit back without any counter movement.
 *
 * NO NEGATIVE BY CONSTRUCTION: a hold is granted only while
 * `available − heldUnits ≥ qty`, and every decision for one offer runs inside
 * that offer's Durable Object, so twenty concurrent holds on one unit are
 * serialized by the runtime and exactly one is granted.
 *
 * EXPIRY IS THE NET (⏳ safest default, flagged): Shop+'s own order slot lives
 * two minutes and dies without a word when a buyer abandons; the payment may
 * take longer. A hold nobody confirms or releases therefore expires HERE after
 * `STOCK_HOLD_TTL_MS` — fifteen minutes, the same safest default as Shop+'s
 * stuck-order watch — swept lazily on the next read or write. A Shop+ crash
 * can never strand a unit. Lower-only env knob for the seam.
 */

export const STOCK_HOLD_TTL_MS = 15 * 60 * 1000;

export interface StockHold {
  /** Shop+'s reservation id — the chain's `reservation_id`, one id both sides. */
  readonly reservationId: string;
  /** The order this hold will become (Shop+ derives it from the quote before
   *  the order exists), so the confirmed sale can find its own hold. */
  readonly orderId: string;
  readonly qty: number;
  readonly at: string;
  readonly expiresAt: string;
}

/** reservationId → hold. ONE storage value so it rides the entry's atomic batch. */
export type StockHolds = Readonly<Record<string, StockHold>>;

/** The holds still alive at `nowIso` — expired ones dropped (the lazy sweep). */
export function activeHolds(holds: StockHolds, nowIso: string): StockHolds {
  const now = Date.parse(nowIso);
  const out: Record<string, StockHold> = {};
  for (const [id, h] of Object.entries(holds)) {
    const exp = Date.parse(h.expiresAt);
    // An unparseable expiry reads as EXPIRED, never as forever: a corrupt hold
    // must not block a unit for good.
    if (Number.isFinite(exp) && Number.isFinite(now) && now <= exp) out[id] = h;
  }
  return out;
}

export function heldUnits(holds: StockHolds, nowIso: string): number {
  let n = 0;
  for (const h of Object.values(activeHolds(holds, nowIso))) n += h.qty;
  return n;
}

export interface HoldCommand {
  readonly reservationId: string;
  readonly orderId: string;
}

export type HoldDecision =
  | { readonly status: 'held' | 'idempotent'; readonly holds: StockHolds; readonly hold: StockHold; readonly available: number }
  | { readonly status: 'insufficient_stock'; readonly holds: StockHolds; readonly available: number };

/**
 * Grant ONE unit to this reservation, or refuse. `available` is the PHYSICAL
 * counter; the answer's `available` is the NET after this decision — what a
 * reseller's page will show. Idempotent on `reservationId` (the at-least-once
 * wire may ask twice): a replay answers the same hold and moves nothing.
 */
export function decideHold(available: number, holds: StockHolds, cmd: HoldCommand, nowIso: string, ttlMs: number): HoldDecision {
  const alive = activeHolds(holds, nowIso);
  const existing = alive[cmd.reservationId];
  if (existing !== undefined) {
    return { status: 'idempotent', holds: alive, hold: existing, available: Math.max(0, available - heldUnits(alive, nowIso)) };
  }
  // THE SAME ORDER UNDER A NEW ID. Shop+'s own slot lives two minutes and
  // mints a fresh reservation id when the buyer reserves again on the same
  // quote (offline, app closed, a refusal) — but the order id it names is the
  // same. Her earlier hold is HERS: it is re-keyed to the new id and renewed,
  // never counted twice, and never refused to her as « someone else's ».
  const mine = Object.entries(alive).find(([, h]) => h.orderId === cmd.orderId);
  if (mine !== undefined) {
    const { [mine[0]]: _old, ...rest } = alive;
    const hold: StockHold = {
      ...mine[1],
      reservationId: cmd.reservationId,
      at: nowIso,
      expiresAt: new Date(Date.parse(nowIso) + ttlMs).toISOString(),
    };
    const next: StockHolds = { ...rest, [cmd.reservationId]: hold };
    return { status: 'held', holds: next, hold, available: Math.max(0, available - heldUnits(next, nowIso)) };
  }
  const net = available - heldUnits(alive, nowIso);
  if (net < 1) return { status: 'insufficient_stock', holds: alive, available: Math.max(0, net) };
  const hold: StockHold = {
    reservationId: cmd.reservationId,
    orderId: cmd.orderId,
    qty: 1,
    at: nowIso,
    expiresAt: new Date(Date.parse(nowIso) + ttlMs).toISOString(),
  };
  const next: StockHolds = { ...alive, [cmd.reservationId]: hold };
  return { status: 'held', holds: next, hold, available: net - 1 };
}

/** Give the unit back. Releasing a hold that is gone (expired, consumed,
 *  already released) is `idempotent` — nothing to undo, answered by name. */
export function decideHoldRelease(
  holds: StockHolds,
  reservationId: string,
  nowIso: string,
): { readonly status: 'released' | 'idempotent'; readonly holds: StockHolds } {
  const alive = activeHolds(holds, nowIso);
  if (alive[reservationId] === undefined) return { status: 'idempotent', holds: alive };
  const { [reservationId]: _gone, ...rest } = alive;
  return { status: 'released', holds: rest };
}

/** The live hold this order was placed against, if any — the consume's match. */
export function holdForOrder(holds: StockHolds, orderId: string, nowIso: string): StockHold | undefined {
  return Object.values(activeHolds(holds, nowIso)).find((h) => h.orderId === orderId);
}

/**
 * The LOWER-ONLY knob (the `STOCK_RECONFIRM_DUE_MS` idiom): an env value may
 * only SHORTEN the window so the seam can prove expiry in a second; unset,
 * malformed or larger reads as the constant. Nothing in wrangler.toml sets it.
 */
export function stockHoldTtlMs(env: { readonly STOCK_HOLD_TTL_MS?: string }): number {
  const raw = Number(env.STOCK_HOLD_TTL_MS);
  if (!Number.isInteger(raw) || raw < 1) return STOCK_HOLD_TTL_MS;
  return Math.min(raw, STOCK_HOLD_TTL_MS);
}
