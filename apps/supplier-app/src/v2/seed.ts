/**
 * WO-FP-PIXEL §3.2/§3.3 — entities + the EXACT first-open seed, transcribed
 * VERBATIM from HANDOFF V2 (values cross-checked against the Phase-0 table:
 * pending 18 700 F · paid 12 750 F · nets 8 500/12 750/4 675/10 200).
 * §9.5/§9.6 frozen decisions live at their use sites (wizard fallbacks).
 */
import { fee, net } from './money';

export type OrderStatus =
  | 'FUNDED'
  | 'READY'
  | 'READY_FAILED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'PAID'
  | 'BUYER_REFUSED'
  | 'PICKUP_REFUSED'
  | 'RETURNED';

export type Product = {
  id: string;
  name: string;
  cat: string;
  B: number;
  C: number;
  stock: number;
  sizes: string | null;
  glyph: string;
  bg: readonly [string, string]; // tile gradient pair (§1.1)
  paused: boolean;
  mod?: boolean;
};

export type Order = {
  id: string;
  code: `CMD-${number}`;
  pid: string;
  mode: 'A' | 'B'; // A = payé en entier · B = produit payé à la porte (livraison 1 000 F prépayée)
  variant: string | null;
  status: OrderStatus;
  challenge: `WK-${number}`; // §3.6: server-generated, 15 min TTL
  reason?: string;
  buyer: { name: string; zone: string };
  history: { ts: string; l: string }[];
  // §3.6 FROZEN: captured at order time — rendered, never recomputed
  B: number;
  C: number;
  fee: number;
  net: number;
};

import { TILE_GRADIENT } from '../ui/v2/palette';

// §3.3 product glyphs — the prototype's product-PHOTO placeholders on demo
// data (robe 👗 U+1F457 · sac U+1F45C · foulard U+1F9E3 · chemise U+1F454),
// stored as escapes: the WO-6.0 no-emoji gate guards app CHROME (which stays
// C42 SVG-only), and seed CONTENT must not trip it. Rendered verbatim.
const GLYPH = { robe: '\u{1F457}', sac: '\u{1F45C}', foulard: '\u{1F9E3}', chemise: '\u{1F454}' } as const;

export const SEED_PRODUCTS: readonly Product[] = [
  { id: 'p1', name: 'Robe brodée bogolan', cat: 'Mode femme', B: 10_000, C: 1_000, stock: 7, sizes: 'S · M · L', glyph: GLYPH.robe, bg: TILE_GRADIENT.p1, paused: false },
  { id: 'p3', name: 'Sac cuir artisanal', cat: 'Sacs', B: 15_000, C: 1_500, stock: 4, sizes: null, glyph: GLYPH.sac, bg: TILE_GRADIENT.p3, paused: false },
  { id: 'p7', name: 'Foulard Faso Dan Fani', cat: 'Accessoires', B: 5_500, C: 550, stock: 14, sizes: null, glyph: GLYPH.foulard, bg: TILE_GRADIENT.p7, paused: false },
  { id: 'p8', name: 'Chemise Faso Dan Fani', cat: 'Mode homme', B: 12_000, C: 1_200, stock: 5, sizes: 'M · L', glyph: GLYPH.chemise, bg: TILE_GRADIENT.p8, paused: false },
] as const;

const P = Object.fromEntries(SEED_PRODUCTS.map((p) => [p.id, p]));
const frozen = (pid: string) => {
  const p = P[pid]!;
  return { B: p.B, C: p.C, fee: fee(p.B), net: net(p.B, p.C) };
};

/** Iteration order o1, o3, o7, o5, o9 — the §3.3 display order. */
export const SEED_ORDERS: readonly Order[] = [
  {
    id: 'o1', code: 'CMD-2417', pid: 'p1', mode: 'B', variant: 'M', status: 'FUNDED', challenge: 'WK-472',
    buyer: { name: 'Awa Kaboré', zone: 'Ouaga 2000' },
    history: [
      { ts: '09:12', l: 'Frais de livraison payés : 1 000 F, gardés en sécurité chez le partenaire' },
      { ts: '09:12', l: 'Stock réservé · vendeur notifié' },
    ],
    ...frozen('p1'),
  },
  {
    id: 'o3', code: 'CMD-2411', pid: 'p8', mode: 'A', variant: 'L', status: 'READY_FAILED', challenge: 'WK-981',
    buyer: { name: 'Salif Nikiéma', zone: 'Tampouy' },
    history: [
      { ts: '08:40', l: 'Payé en entier — en sécurité' },
      { ts: '08:58', l: 'Photo de préparation refusée : trop sombre' },
    ],
    ...frozen('p8'),
  },
  {
    id: 'o7', code: 'CMD-2409', pid: 'p3', mode: 'A', variant: null, status: 'PAID', challenge: 'WK-118',
    buyer: { name: 'Moussa Traoré', zone: 'Cissin' },
    history: [
      { ts: 'hier', l: 'Payé en entier — en sécurité' },
      { ts: 'hier', l: 'Livré — code client confirmé' },
      { ts: 'hier', l: 'Versements effectués' },
    ],
    ...frozen('p3'),
  },
  {
    id: 'o5', code: 'CMD-2398', pid: 'p7', mode: 'B', variant: null, status: 'BUYER_REFUSED', challenge: 'WK-204',
    buyer: { name: 'Moussa Traoré', zone: 'Cissin' },
    history: [
      { ts: 'lun.', l: "Refusé à la porte : la cliente a changé d'avis" },
      { ts: 'lun.', l: 'Frais de livraison gardés — retour scellé RET-1104' },
    ],
    ...frozen('p7'),
  },
  {
    id: 'o9', code: 'CMD-2402', pid: 'p8', mode: 'A', variant: 'M', status: 'PICKUP_REFUSED', challenge: 'WK-655',
    reason: "variante M au lieu de L à l'enlèvement",
    buyer: { name: 'Fatou Ilboudo', zone: 'Tampouy' },
    history: [
      { ts: '09:20', l: 'Payé en entier — en sécurité' },
      { ts: '10:02', l: "Refusé à l'enlèvement par Issa (Séra) : variante incorrecte — la cliente est remboursée par le fonds de protection" },
    ],
    ...frozen('p8'),
  },
] as const;

/** §3.3 static weekly statements. */
export const SEED_RELEVES = [
  { week: 'Sem. 28 — 6 au 12 juil.', sub: '1 versement Mobile Money', total: 12_750 },
  { week: 'Sem. 27 — 29 juin au 5 juil.', sub: '2 versements Mobile Money', total: 21_400 },
  { week: 'Sem. 26 — 22 au 28 juin', sub: '1 versement Mobile Money', total: 9_200 },
] as const;

export const SEED_DEFAULTS = { shopName: 'Boutique Wendkuni', ownerName: 'Rasmané' } as const;
