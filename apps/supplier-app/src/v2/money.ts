/**
 * WO-FP-PIXEL §3.4/§3.5 — the V2 money math + formatting, EXACT.
 *
 * fee(B)   = round(B × 0.05)   (Math.round — nearest, .5 up)
 * net(B,C) = B − C − fee(B)
 * prixClient = B + margeRevendeuse (set by the reseller in Shop+) — NEVER B + C.
 * pending  = Σ net(o) for o.status ∉ {PAID, BUYER_REFUSED, PICKUP_REFUSED, RETURNED}
 * paid     = Σ net(o) for o.status = PAID
 *
 * §3.6 FROZEN: an ORDER's net/fee/C/B are captured at order time and rendered,
 * never recomputed from the product (a product edit creates a version; past
 * orders keep their amounts). These helpers derive DISPLAY values only; the
 * client shows what the server derived in prod.
 *
 * Format (§3.5 · WO-FCFA re-pin, founder order 2026-07-18): toLocaleString
 * ('fr-FR') with thousands separator normalized to U+202F (fallback U+00A0,
 * NEVER U+0020), then money.currencySuffix from @platform/ui-tokens/legacy
 * (canon v1.0.1 = U+202F + « FCFA ») — the suffix is never hardcoded here.
 * tnum + nowrap at the text sites.
 */
import { money } from '@platform/ui-tokens/legacy';
import type { OrderStatus } from './seed';

export const fee = (B: number): number => Math.round(B * 0.05);
export const net = (B: number, C: number): number => B - C - fee(B);

const NNBSP = ' ';
export function formatF(n: number): string {
  const s = n.toLocaleString('fr-FR');
  // normalize any locale-emitted group separator to U+202F (never U+0020)
  return `${s.replace(/[  ]/g, NNBSP)}${money.currencySuffix}`;
}

const OUT_OF_PENDING: readonly OrderStatus[] = ['PAID', 'BUYER_REFUSED', 'PICKUP_REFUSED', 'RETURNED'];

export function pendingTotal(orders: readonly { status: OrderStatus; net: number }[]): number {
  return orders.filter((o) => !OUT_OF_PENDING.includes(o.status)).reduce((s, o) => s + o.net, 0);
}
export function paidTotal(orders: readonly { status: OrderStatus; net: number }[]): number {
  return orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.net, 0);
}

/**
 * WHAT HE TYPED INTO A MONEY BOX, AS AN AMOUNT (founder device ruling
 * 2026-07-26 — the price and commission boxes are editable, not just − / +).
 *
 * **DIGITS ONLY, AND AN EMPTY BOX IS ZERO, NOT NaN.** A number-pad on Android
 * still admits separators and a leading minus on some keyboards; every
 * non-digit is dropped rather than parsed, so the field cannot produce a
 * negative, a fraction or a NaN — the three values the money core would have to
 * refuse downstream. Clearing the box gives `0`, which the publish floor then
 * refuses in words he can read.
 *
 * The cap keeps a mistyped run of digits inside a safe integer; `Number.MAX_SAFE_INTEGER`
 * is not a design token, it is the point past which arithmetic stops being exact.
 */
export function digitsToAmount(text: string): number {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits === '') return 0;
  const value = Number(digits.slice(0, 15));
  return Number.isSafeInteger(value) ? value : 0;
}
