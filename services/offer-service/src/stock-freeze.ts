/**
 * STOCK-JOURNAL-1 (B5.2 « reconfirmation freeze ») — THE RECONFIRMATION
 * WINDOW, and the one question it answers. Its own module because both the
 * decision core (`offer-core.ts`) and the refusal ladder (`projection.ts`)
 * need it, and the two already import each other in one direction.
 *
 * Seven days is the safest reading of a plan line that names no number
 * (« overdue → freeze »); founder-tunable in one place. A stock nobody has
 * vouched for in a week is a stock Shop+ should not sell on: SP2 says stale
 * supply « blocks agreement », and this is where stale is decided. The e2e
 * lowers it through a LOWER-ONLY env knob (`stockDueMs`, worker/index.ts).
 */
export const STOCK_RECONFIRM_DUE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Is this offer's stock OVERDUE for reconfirmation? Absent ⇒ never confirmed
 * ⇒ NOT overdue (a pre-slice entry is shown as unconfirmed, never frozen at
 * deploy — see `OfferEntry.stockConfirmedAt`); an unparseable date is treated
 * as absent rather than as « frozen forever » — a corrupt field must not take
 * a product off sale.
 */
export function stockOverdue(stockConfirmedAt: string | undefined, nowIso: string, dueMs: number = STOCK_RECONFIRM_DUE_MS): boolean {
  if (stockConfirmedAt === undefined) return false;
  const confirmed = Date.parse(stockConfirmedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(confirmed) || !Number.isFinite(now)) return false;
  return now - confirmed > dueMs;
}

/**
 * The LOWER-ONLY knob (the `SESSION_IDLE_MS` / `READINESS_TTL_MS` idiom): an
 * env value may only SHORTEN the window so the seam test can prove the freeze
 * without waiting a week; unset, malformed or larger reads as the constant.
 * Nothing in wrangler.toml sets it.
 */
export function stockDueMs(env: { readonly STOCK_RECONFIRM_DUE_MS?: string }): number {
  const raw = Number(env.STOCK_RECONFIRM_DUE_MS);
  if (!Number.isInteger(raw) || raw < 1) return STOCK_RECONFIRM_DUE_MS;
  return Math.min(raw, STOCK_RECONFIRM_DUE_MS);
}
