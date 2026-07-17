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
 * Format (§3.5): toLocaleString('fr-FR') + ' F' — thousands separator U+202F
 * (fallback U+00A0, NEVER U+0020), suffix U+0020 + 'F'. tnum + nowrap at the
 * text sites.
 */
import type { OrderStatus } from './seed';

export const fee = (B: number): number => Math.round(B * 0.05);
export const net = (B: number, C: number): number => B - C - fee(B);

const NNBSP = ' ';
export function formatF(n: number): string {
  const s = n.toLocaleString('fr-FR');
  // normalize any locale-emitted group separator to U+202F (never U+0020)
  return `${s.replace(/[  ]/g, NNBSP)} F`;
}

const OUT_OF_PENDING: readonly OrderStatus[] = ['PAID', 'BUYER_REFUSED', 'PICKUP_REFUSED', 'RETURNED'];

export function pendingTotal(orders: readonly { status: OrderStatus; net: number }[]): number {
  return orders.filter((o) => !OUT_OF_PENDING.includes(o.status)).reduce((s, o) => s + o.net, 0);
}
export function paidTotal(orders: readonly { status: OrderStatus; net: number }[]): number {
  return orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.net, 0);
}
