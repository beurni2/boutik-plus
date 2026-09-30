/**
 * WO-FP-PIXEL §4 — the state machine, PURE (no React, no RN): state shape
 * (§3.1), transitions (§4.3 — texts verbatim, delays exact), CTA-disable
 * (§4.4).
 *
 * Timers are returned as DATA ({afterMs, action}) so the exact §4 delays
 * (boot 750 · tween 800 · moderation 6000 · toast 2800) are ASSERTABLE without
 * rendering; the app shell runs them with setTimeout.
 *
 * LISTER-VRAI-1 (founder 2026-09-30, « make room »): the demo board's order
 * lifecycle, sheets, simulator, studio mock-up, relevé, trust screen and
 * sign-up walkthrough are GONE with the screens that dispatched them, and so is
 * the seed they read. What remains is what the live console dispatches: boot,
 * tabs, the five-step wizard, the studio hand-off and the toasts. The publish
 * branch of WIZ_NEXT stays literally intact (§9.5, pinned) — the wizard's
 * wrapper keeps it unreachable.
 */
import { composeVariantes, detailsParDefaut, memesQuestions } from './categorie-details';
import type { Product } from './seed';
import { TILE_GRADIENT } from '../ui/v2/palette';

// ── §3.1 state ────────────────────────────────────────────────────────────────
// CONSOLE-1: 'operations' is the founder's operator surface. It is a TAB like
// any other to the machine (pure, no special case); WHO SEES IT is decided at
// the shell (AppV2) — the Dock shows it only when the operator key is present.
export type Tab = 'home' | 'produits' | 'commandes' | 'argent' | 'operations';
export type View = null | { s: 'add' | 'studio' };
// `code` and `zone` are ADDITIVE (combined slice): the product code (derived
// from the name, editable) and the supplier's quartier (founder reversal
// 2026-07-25: he chooses it per listing — a field he leaves unchanged is
// different from a field the system decided for him). Every §4 transition and
// §9 rule is untouched by them. `zone` NEVER travels: the supply projection
// stays seven fields; it is boutik-side data ahead of the delivery work.
export type Wiz = { step: 0 | 1 | 2 | 3 | 4; cat: string; name: string; code: string; zone: string; B: number; C: number; details: readonly string[]; stock: number; photos: boolean };

export type S = {
  loading: boolean;
  tab: Tab;
  view: View;
  toasts: { id: number; m: string }[];
  products: Record<string, Product>; // written only by the frozen publish branch
  porder: string[]; // product display order
  pseq: number;
  wiz: Wiz;
  tseq: number; // toast id sequence
};

export const WIZ_RESET: Wiz = { step: 0, cat: 'Mode femme', name: '', code: '', zone: '', B: 10_000, C: 1_000, details: detailsParDefaut('Mode femme'), stock: 5, photos: false };

export function initialState(): S {
  return {
    loading: true,
    tab: 'home',
    view: null,
    toasts: [],
    products: {},
    porder: [],
    pseq: 1,
    wiz: { ...WIZ_RESET },
    tseq: 1,
  };
}

// ── timers as data (§4.3 exact ms) ────────────────────────────────────────────
export const MS = { boot: 750, tween: 800, toast: 2800, moderation: 6000 } as const;
export type Effect =
  | { kind: 'timer'; afterMs: number; action: A }
  | { kind: 'tween' } // pending/paid counter re-tween (800ms, cubic — §7)
  | { kind: 'haptic' };

export type A =
  | { t: 'BOOT_DONE' } // T01 after 750ms
  | { t: 'TAB'; tab: Tab } // T02
  | { t: 'OPEN_WIZ' } // T04
  | { t: 'BACK' } // T07 (+ wizard step-back §4.1)
  | { t: 'WIZ_SET'; patch: Partial<Wiz> }
  | { t: 'WIZ_NEXT' } // T18/T19
  | { t: 'OPEN_STUDIO' } // T20
  | { t: 'STUDIO_APPROVE' } // T24
  | { t: 'MOD_APPROVED'; id: string } // T19 +6000ms
  | { t: 'TOAST_EXPIRE'; id: number }; // T29

const NEW_GLYPH = '\u{1F9E5}'; // 🧥 U+1F9E5 (T19; escape — chrome gate)

const toast = (s: S, m: string, fx: Effect[]): S => {
  const id = s.tseq;
  fx.push({ kind: 'timer', afterMs: MS.toast, action: { t: 'TOAST_EXPIRE', id } });
  return { ...s, toasts: [...s.toasts, { id, m }], tseq: id + 1 };
};

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
    case 'OPEN_WIZ':
      return { s: { ...s, wiz: { ...WIZ_RESET }, view: { s: 'add' } }, fx };
    case 'BACK': {
      // §4.1: wizard step-back; step 0 exits
      if (s.view?.s === 'add' && s.wiz.step > 0) return { s: { ...s, wiz: { ...s.wiz, step: (s.wiz.step - 1) as Wiz['step'] } }, fx };
      return { s: { ...s, view: null }, fx };
    }
    case 'WIZ_SET': {
      // RAYONS-1 (extends CAPTURE-PAR-CATEGORIE-1): a category change swaps
      // UNTOUCHED defaults for the new category's own fields; text he typed
      // outranks every default WHILE the categories ask the SAME QUESTIONS
      // (the legacy eight are all one free-variants field, so his text
      // survives those moves exactly as before; Poussette → Chaise haute
      // both ask Marque puis Couleurs, so answers ride). Different questions
      // — even at the same count (verifier BLOCKER: Poussette → Couffin) —
      // swap to the new defaults: old answers under new labels would publish
      // false records.
      if (typeof a.patch.cat === 'string' && a.patch.cat !== s.wiz.cat && a.patch.details === undefined) {
        const anciens = detailsParDefaut(s.wiz.cat);
        const intacts = s.wiz.details.length === anciens.length && s.wiz.details.every((v, i) => v === anciens[i]);
        const details = intacts || !memesQuestions(s.wiz.cat, a.patch.cat) ? detailsParDefaut(a.patch.cat) : s.wiz.details;
        return { s: { ...s, wiz: { ...s.wiz, ...a.patch, details } }, fx };
      }
      return { s: { ...s, wiz: { ...s.wiz, ...a.patch } }, fx };
    }
    case 'WIZ_NEXT': {
      if (s.wiz.step < 4) {
        if (disabled.wizContinue(s)) return { s, fx }; // §4.4
        return { s: { ...s, wiz: { ...s.wiz, step: (s.wiz.step + 1) as Wiz['step'] } }, fx };
      }
      // T19 — publish
      const id = `np${s.pseq}`;
      // §9.5 FROZEN: empty name → « Robe brodée bogolan » · §9.6: stock fallback as-is
      const name = s.wiz.name.trim() === '' ? 'Robe brodée bogolan' : s.wiz.name;
      const note = composeVariantes(s.wiz.cat, s.wiz.details);
      const p: Product = {
        id, name, cat: s.wiz.cat, B: s.wiz.B, C: s.wiz.C, stock: s.wiz.stock,
        sizes: note === '' ? null : note,
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
      return { s: { ...s, view: { s: 'studio' } }, fx };
    case 'STUDIO_APPROVE': {
      let ns: S = { ...s, wiz: { ...s.wiz, photos: true, step: 3 }, view: { s: 'add' } };
      ns = toast(ns, 'Photos canoniques prêtes — sans prix, sans contact', fx);
      return { s: ns, fx };
    }
    case 'TOAST_EXPIRE':
      return { s: { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) }, fx };
  }
}

/** §4.3 T01 — the boot effect (750ms skeleton). */
export const bootEffect: Effect = { kind: 'timer', afterMs: MS.boot, action: { t: 'BOOT_DONE' } };
