/**
 * WO-FP-PIXEL §3.2 — the Product entity the wizard's frozen publish branch
 * writes (machine.ts T19).
 *
 * LISTER-VRAI-1 (founder 2026-09-30, « make room »): the demo board's first-open
 * seed — its four products, five orders, weekly relevés and shop defaults — is
 * gone with the screens that read it. No live screen ever read it: the console
 * shows his real offers and real paid orders.
 */
export type Product = {
  id: string;
  name: string;
  cat: string;
  B: number | null; // the wizard's own, empty until typed (LISTER-VRAI-1, F-98)
  C: number | null;
  stock: number;
  sizes: string | null;
  glyph: string;
  bg: readonly [string, string]; // tile gradient pair (§1.1)
  paused: boolean;
  mod?: boolean;
};
