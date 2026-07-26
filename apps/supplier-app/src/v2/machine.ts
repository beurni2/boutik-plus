/**
 * WO-FP-PIXEL §4 — the state machine, PURE (no React, no RN): state shape
 * (§3.1), order lifecycle + flowLabels (§4.2 VERBATIM), transitions T01–T29
 * (§4.3 — texts verbatim, delays exact), CTA-disable (§4.4).
 *
 * Timers are returned as DATA ({afterMs, action}) so the exact §4 delays
 * (boot 750 · tween 800 · moderation 6000 · toast 2800 · studio tick 620 ·
 * celebration 2200) are ASSERTABLE without rendering; the app shell runs them
 * with setTimeout. §3.6 FROZEN rules hold: order amounts are captured at
 * creation and never recomputed; off-flow statuses are backend-pushed,
 * render-only ([DEMO] T16 walks the happy path only).
 */
import { fee, net, formatF } from './money';
import { SEED_ORDERS, SEED_PRODUCTS, type Order, type OrderStatus, type Product } from './seed';
import { TILE_GRADIENT } from '../ui/v2/palette';

// ── §4.2 lifecycle ────────────────────────────────────────────────────────────
export const FLOW_A: readonly OrderStatus[] = ['FUNDED', 'READY', 'TRANSIT', 'ARRIVED', 'INSPECT', 'HANDOFF', 'DELIVERED', 'PAID'];
export const FLOW_B: readonly OrderStatus[] = ['FUNDED', 'READY', 'TRANSIT', 'ARRIVED', 'INSPECT', 'AWAIT_PAY', 'PAY_OK', 'HANDOFF', 'DELIVERED', 'PAID'];
export const OFF_FLOW: readonly OrderStatus[] = ['READY_FAILED', 'PICKUP_REFUSED', 'BUYER_REFUSED', 'RETURNED'];

export const flowOf = (mode: 'A' | 'B'): readonly OrderStatus[] => (mode === 'A' ? FLOW_A : FLOW_B);

/** §4.2 timeline labels, VERBATIM (FUNDED depends on mode). */
export const flowLabel = (s: OrderStatus, mode: 'A' | 'B'): string => {
  if (s === 'FUNDED') return mode === 'B' ? 'Frais de livraison payés — en sécurité' : 'Paiement complet — en sécurité';
  const L: Partial<Record<OrderStatus, string>> = {
    READY: 'Produit prêt chez le vendeur',
    TRANSIT: 'Vérifié, scellé, pris en charge par Séra',
    ARRIVED: 'Livreur arrivé',
    INSPECT: 'La cliente inspecte avant la remise',
    AWAIT_PAY: 'Le produit se paie à la porte',
    PAY_OK: 'Paiement confirmé par le partenaire',
    HANDOFF: 'Remise autorisée — code de la cliente',
    DELIVERED: 'Livré',
    PAID: 'Vendeur et revendeuse payés',
  };
  return L[s] ?? '';
};

// ── §3.1 state ────────────────────────────────────────────────────────────────
export type Tab = 'home' | 'produits' | 'commandes' | 'argent';
export type Seg = 'traiter' | 'cours' | 'fini' | 'incidents';
export type View = null | { s: 'product' | 'order' | 'add' | 'studio' | 'trust' | 'onboard'; id?: string };
// `code` and `zone` are ADDITIVE (combined slice): the product code (derived
// from the name, editable) and the supplier's quartier (founder reversal
// 2026-07-25: he chooses it per listing — a field he leaves unchanged is
// different from a field the system decided for him). Every §4 transition and
// §9 rule is untouched by them. `zone` NEVER travels: the supply projection
// stays seven fields; it is boutik-side data ahead of the delivery work.
export type Wiz = { step: 0 | 1 | 2 | 3 | 4; cat: string; name: string; code: string; zone: string; B: number; C: number; sizes: string; stock: number; photos: boolean };
export type Studio = { step: 0 | 1 | 2 | 3; low: boolean; proc: 0 | 1 | 2 | 3 | 4; orig: boolean };

export type S = {
  loading: boolean;
  tab: Tab;
  view: View;
  seg: Seg;
  sheet: null | 'ready' | 'stock';
  readyShot: boolean;
  stkDelta: number;
  toasts: { id: number; m: string }[];
  products: Record<string, Product>;
  orders: Record<string, Order>;
  porder: string[]; // product display order
  oorder: string[]; // order display order (§3.3: o1, o3, o7, o5, o9)
  pseq: number;
  wiz: Wiz;
  studio: Studio;
  ob: { step: 0 | 1 | 2 | 3 | 4 | 5 };
  celebr: string | null;
  tseq: number; // toast id sequence
};

export const WIZ_RESET: Wiz = { step: 0, cat: 'Mode femme', name: '', code: '', zone: '', B: 10_000, C: 1_000, sizes: 'S, M, L', stock: 5, photos: false };

export function initialState(): S {
  return {
    loading: true,
    tab: 'home',
    view: null,
    seg: 'traiter',
    sheet: null,
    readyShot: false,
    stkDelta: 0,
    toasts: [],
    products: Object.fromEntries(SEED_PRODUCTS.map((p) => [p.id, { ...p }])),
    orders: Object.fromEntries(SEED_ORDERS.map((o) => [o.id, { ...o, history: [...o.history] }])),
    porder: SEED_PRODUCTS.map((p) => p.id),
    oorder: SEED_ORDERS.map((o) => o.id),
    pseq: 1,
    wiz: { ...WIZ_RESET },
    studio: { step: 0, low: false, proc: 0, orig: false },
    ob: { step: 0 },
    celebr: null,
    tseq: 1,
  };
}

// ── timers as data (§4.3 exact ms) ────────────────────────────────────────────
export const MS = { boot: 750, tween: 800, toast: 2800, moderation: 6000, studioTick: 620, celebration: 2200 } as const;
export type Effect =
  | { kind: 'timer'; afterMs: number; action: A }
  | { kind: 'tween' } // pending/paid counter re-tween (800ms, cubic — §7)
  | { kind: 'haptic' };

export type A =
  | { t: 'BOOT_DONE' } // T01 after 750ms
  | { t: 'TAB'; tab: Tab } // T02
  | { t: 'OPEN_TRUST' } // T03
  | { t: 'OPEN_WIZ' } // T04
  | { t: 'OPEN_PRODUCT'; id: string } // T05
  | { t: 'OPEN_ORDER'; id: string } // T06
  | { t: 'BACK' } // T07 (+ wizard/onboard step-back §4.1)
  | { t: 'SEG'; seg: Seg }
  | { t: 'OPEN_STOCK' } // T08
  | { t: 'STOCK_DELTA'; d: 1 | -1 } // T09
  | { t: 'STOCK_SAVE' } // T10
  | { t: 'TOGGLE_PAUSE' } // T11
  | { t: 'EDIT_DEMO' } // T12
  | { t: 'OPEN_READY' } // T13
  | { t: 'TAKE_SHOT' } // T14
  | { t: 'CONFIRM_READY' } // T15
  | { t: 'SIM_NEXT' } // T16 [DEMO]
  | { t: 'DISMISS_OVERLAY' } // T17
  | { t: 'WIZ_SET'; patch: Partial<Wiz> }
  | { t: 'WIZ_NEXT' } // T18/T19
  | { t: 'OPEN_STUDIO' } // T20
  | { t: 'STUDIO_TOGGLE_LOW' } // T21
  | { t: 'STUDIO_CAPTURE' } // T22
  | { t: 'STUDIO_TICK' } // proc advance (620ms cadence)
  | { t: 'STUDIO_TOGGLE_ORIG' } // T23
  | { t: 'STUDIO_APPROVE' } // T24
  | { t: 'OPEN_ONBOARD' } // T25
  | { t: 'OB_NEXT' } // T26
  | { t: 'OB_FINISH' } // T27
  | { t: 'RELEVE_PDF' } // T28
  | { t: 'MOD_APPROVED'; id: string } // T19 +6000ms
  | { t: 'TOAST_EXPIRE'; id: number } // T29
  | { t: 'CELEBR_DONE' };

const NEW_GLYPH = '\u{1F9E5}'; // 🧥 U+1F9E5 (T19; escape — chrome gate)

const toast = (s: S, m: string, fx: Effect[]): S => {
  const id = s.tseq;
  fx.push({ kind: 'timer', afterMs: MS.toast, action: { t: 'TOAST_EXPIRE', id } });
  return { ...s, toasts: [...s.toasts, { id, m }], tseq: id + 1 };
};
const hist = (o: Order, ts: string, l: string): Order => ({ ...o, history: [...o.history, { ts, l }] });
const NOW = '10:24'; // [DEMO] fixed clock for appended history entries (board renders static seed)

/** §4.4 — CTA-disable conditions, pure predicates. */
export const disabled = {
  // THE EMPTY-NAME BLOCK (combined slice, founder technique: make the frozen
  // rule UNREACHABLE, never edit it). §9.5 FROZEN turns an empty name into
  // « Robe brodée bogolan » at the publish branch — harmless on the demo board,
  // a fabricated product title through a REAL write. Blocking continue on step 1
  // with an empty name means the machine can never reach that fallback through
  // the wizard's own footer (the only WIZ_NEXT dispatcher in the app). The rule
  // at the publish branch stays literally intact. Second, independent refusal:
  // the real write's core returns `name_required` regardless.
  // ZONE LEFT THE STEP GATE WITH THE INPUT (founder ruling 2026-07-26 —
  // Quartier is boutique data, out of the listing flow; device incident: the
  // input was removed while this gate still demanded it, so Continue could
  // never enable). The published record's zone comes from SUPPLIER_ZONE at
  // formFromWiz; the Wiz field stays, unused, so §9's frozen shape is intact.
  wizContinue: (s: S) => (s.wiz.step === 1 && s.wiz.name.trim() === '') || (s.wiz.step === 3 && !s.wiz.photos),
  confirmReady: (s: S) => !s.readyShot,
  studioCapture: (s: S) => s.studio.low,
  stockMinus: (s: S, stock: number) => stock + s.stkDelta <= 0,
  wizB: (w: Wiz) => w.B <= 500,
  wizC: (w: Wiz) => w.C <= 0,
  wizStock: (w: Wiz) => w.stock <= 1,
};

export function reduce(s: S, a: A): { s: S; fx: Effect[] } {
  const fx: Effect[] = [];
  switch (a.t) {
    case 'BOOT_DONE':
      fx.push({ kind: 'tween' });
      return { s: { ...s, loading: false }, fx };
    case 'TAB': {
      const ns = { ...s, tab: a.tab, view: null as View };
      if (a.tab === 'home' || a.tab === 'argent') fx.push({ kind: 'tween' });
      return { s: ns, fx };
    }
    case 'OPEN_TRUST':
      return { s: { ...s, view: { s: 'trust' } }, fx };
    case 'OPEN_WIZ':
      return { s: { ...s, wiz: { ...WIZ_RESET }, view: { s: 'add' } }, fx };
    case 'OPEN_PRODUCT':
      return { s: { ...s, view: { s: 'product', id: a.id } }, fx };
    case 'OPEN_ORDER':
      return { s: { ...s, view: { s: 'order', id: a.id } }, fx };
    case 'BACK': {
      // §4.1: wizard/onboard step-back; step 0 exits
      if (s.view?.s === 'add' && s.wiz.step > 0) return { s: { ...s, wiz: { ...s.wiz, step: (s.wiz.step - 1) as Wiz['step'] } }, fx };
      if (s.view?.s === 'onboard' && s.ob.step > 0 && s.ob.step < 5) return { s: { ...s, ob: { step: (s.ob.step - 1) as S['ob']['step'] } }, fx };
      return { s: { ...s, view: null }, fx };
    }
    case 'SEG':
      return { s: { ...s, seg: a.seg }, fx };
    case 'OPEN_STOCK':
      return { s: { ...s, sheet: 'stock', stkDelta: 0 }, fx };
    case 'STOCK_DELTA': {
      const pid = s.view?.id ?? '';
      const stock = s.products[pid]?.stock ?? 0;
      const nd = s.stkDelta + a.d;
      if (stock + nd < 0) return { s, fx }; // T09 lower bound: shown value ≥ 0
      return { s: { ...s, stkDelta: nd }, fx };
    }
    case 'STOCK_SAVE': {
      const pid = s.view?.id ?? '';
      const p = s.products[pid];
      if (!p) return { s, fx };
      const np = { ...p, stock: p.stock + s.stkDelta };
      const ns = { ...s, products: { ...s.products, [pid]: np }, sheet: null as S['sheet'] };
      return { s: toast(ns, `Stock mis à jour : ${np.stock} unités`, fx), fx };
    }
    case 'TOGGLE_PAUSE': {
      const pid = s.view?.id ?? '';
      const p = s.products[pid];
      if (!p) return { s, fx };
      const np = { ...p, paused: !p.paused };
      const ns = { ...s, products: { ...s.products, [pid]: np } };
      return { s: toast(ns, np.paused ? 'Produit en pause — masqué chez les revendeuses' : 'Produit remis en ligne', fx), fx };
    }
    case 'EDIT_DEMO':
      return { s: toast(s, 'Modification (démo) — nouvelle version, les commandes passées ne changent pas', fx), fx };
    case 'OPEN_READY':
      return { s: { ...s, sheet: 'ready', readyShot: false }, fx };
    case 'TAKE_SHOT':
      return { s: { ...s, readyShot: true }, fx };
    case 'CONFIRM_READY': {
      // T15 (guarded by §4.4 confirmReady)
      if (!s.readyShot) return { s, fx };
      const oid = s.view?.id ?? '';
      const o = s.orders[oid];
      if (!o) return { s, fx };
      const no = hist({ ...o, status: 'READY' }, NOW, `Produit prêt confirmé (code ${o.challenge}) — Séra assigne un livreur`);
      let ns: S = { ...s, orders: { ...s.orders, [oid]: no }, sheet: null };
      fx.push({ kind: 'tween' });
      ns = toast(ns, 'Prêt — Issa (Séra) est notifié', fx);
      return { s: ns, fx };
    }
    case 'SIM_NEXT': {
      // T16 [DEMO]: in-flow, not first-not-last constraints are the caller's
      const oid = s.view?.id ?? '';
      const o = s.orders[oid];
      if (!o) return { s, fx };
      const flow = flowOf(o.mode);
      const i = flow.indexOf(o.status);
      if (i < 0 || i >= flow.length - 1) return { s, fx };
      const next = flow[i + 1]!;
      const suffix = next === 'PAID' ? ' — versement Mobile Money effectué' : '';
      const no = hist({ ...o, status: next }, NOW, `${flowLabel(next, o.mode)}${suffix}`);
      let ns: S = { ...s, orders: { ...s.orders, [oid]: no } };
      if (next === 'PAID') {
        ns = { ...ns, celebr: formatF(o.net) };
        fx.push({ kind: 'timer', afterMs: MS.celebration, action: { t: 'CELEBR_DONE' } });
        fx.push({ kind: 'tween' });
      }
      return { s: ns, fx };
    }
    case 'DISMISS_OVERLAY':
      return { s: { ...s, sheet: null, celebr: null }, fx };
    case 'WIZ_SET':
      return { s: { ...s, wiz: { ...s.wiz, ...a.patch } }, fx };
    case 'WIZ_NEXT': {
      if (s.wiz.step < 4) {
        if (disabled.wizContinue(s)) return { s, fx }; // §4.4
        return { s: { ...s, wiz: { ...s.wiz, step: (s.wiz.step + 1) as Wiz['step'] } }, fx };
      }
      // T19 — publish
      const id = `np${s.pseq}`;
      // §9.5 FROZEN: empty name → « Robe brodée bogolan » · §9.6: stock fallback as-is
      const name = s.wiz.name.trim() === '' ? 'Robe brodée bogolan' : s.wiz.name;
      const p: Product = {
        id, name, cat: s.wiz.cat, B: s.wiz.B, C: s.wiz.C, stock: s.wiz.stock,
        sizes: s.wiz.sizes.trim() === '' ? null : s.wiz.sizes,
        glyph: NEW_GLYPH, bg: TILE_GRADIENT.nouveau, paused: false, mod: true,
      };
      let ns: S = {
        ...s,
        products: { ...s.products, [id]: p },
        porder: [...s.porder, id],
        pseq: s.pseq + 1,
        view: null,
        tab: 'produits',
      };
      fx.push({ kind: 'timer', afterMs: MS.moderation, action: { t: 'MOD_APPROVED', id } });
      ns = toast(ns, 'Envoyé en modération — catégorie, allégations, photos', fx);
      return { s: ns, fx };
    }
    case 'MOD_APPROVED': {
      const p = s.products[a.id];
      if (!p) return { s, fx };
      const ns = { ...s, products: { ...s.products, [a.id]: { ...p, mod: false } } };
      return { s: toast(ns, 'Modération : approuvé — en ligne chez les revendeuses', fx), fx };
    }
    case 'OPEN_STUDIO':
      return { s: { ...s, studio: { step: 0, low: false, proc: 0, orig: false }, view: { s: 'studio' } }, fx };
    case 'STUDIO_TOGGLE_LOW':
      return { s: { ...s, studio: { ...s.studio, low: !s.studio.low } }, fx };
    case 'STUDIO_CAPTURE': {
      if (s.studio.low) return { s, fx }; // §4.4
      const step = Math.min(s.studio.step + 1, 3) as Studio['step'];
      const ns = { ...s, studio: { ...s.studio, step, proc: 0 as Studio['proc'] } };
      if (step === 3) fx.push({ kind: 'timer', afterMs: MS.studioTick, action: { t: 'STUDIO_TICK' } });
      return { s: ns, fx };
    }
    case 'STUDIO_TICK': {
      if (s.studio.proc >= 4) return { s, fx };
      const proc = (s.studio.proc + 1) as Studio['proc'];
      if (proc < 4) fx.push({ kind: 'timer', afterMs: MS.studioTick, action: { t: 'STUDIO_TICK' } });
      return { s: { ...s, studio: { ...s.studio, proc } }, fx };
    }
    case 'STUDIO_TOGGLE_ORIG':
      return { s: { ...s, studio: { ...s.studio, orig: !s.studio.orig } }, fx };
    case 'STUDIO_APPROVE': {
      let ns: S = { ...s, wiz: { ...s.wiz, photos: true, step: 3 }, view: { s: 'add' } };
      ns = toast(ns, 'Photos canoniques prêtes — sans prix, sans contact', fx);
      return { s: ns, fx };
    }
    case 'OPEN_ONBOARD':
      return { s: { ...s, ob: { step: 0 }, view: { s: 'onboard' } }, fx };
    case 'OB_NEXT':
      return { s: { ...s, ob: { step: Math.min(s.ob.step + 1, 5) as S['ob']['step'] } }, fx };
    case 'OB_FINISH': {
      const ns: S = { ...s, view: null };
      return { s: toast(ns, 'Compte provisoire créé — démo avec Boutique Wendkuni', fx), fx };
    }
    case 'RELEVE_PDF':
      return { s: toast(s, 'Relevé PDF généré — chaque franc a sa place (démo)', fx), fx };
    case 'TOAST_EXPIRE':
      return { s: { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) }, fx };
    case 'CELEBR_DONE':
      return { s: { ...s, celebr: null }, fx };
  }
}

/** §4.3 T01 — the boot effect (750ms skeleton). */
export const bootEffect: Effect = { kind: 'timer', afterMs: MS.boot, action: { t: 'BOOT_DONE' } };

/** Commandes segments (§3.1 seg → statuses shown). */
export const SEG_OF: Record<Seg, (o: Order) => boolean> = {
  traiter: (o) => o.status === 'FUNDED' || o.status === 'READY_FAILED',
  cours: (o) => ['READY', 'TRANSIT', 'ARRIVED', 'INSPECT', 'AWAIT_PAY', 'PAY_OK', 'HANDOFF', 'DELIVERED'].includes(o.status),
  fini: (o) => o.status === 'PAID',
  incidents: (o) => ['BUYER_REFUSED', 'PICKUP_REFUSED', 'RETURNED'].includes(o.status),
};
