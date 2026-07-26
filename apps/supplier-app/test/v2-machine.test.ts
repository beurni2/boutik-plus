import { describe, expect, it } from 'vitest';
import {
  initialState, reduce, bootEffect, MS, disabled, flowOf, flowLabel, SEG_OF,
  type A, type Effect, type S,
} from '../src/v2/machine';
import { formatF } from '../src/v2/money';

/**
 * WO-FP-PIXEL §4 — the machine's transitions, VERBATIM texts and EXACT delays,
 * driven end-to-end as pure reductions (§8: mechanically verifiable).
 */

const timers = (fx: Effect[]) => fx.filter((e): e is Extract<Effect, { kind: 'timer' }> => e.kind === 'timer');
const run = (s: S, ...actions: A[]) => {
  let cur = s;
  const allFx: Effect[] = [];
  for (const a of actions) {
    const r = reduce(cur, a);
    cur = r.s;
    allFx.push(...r.fx);
  }
  return { s: cur, fx: allFx };
};

describe('§4.3 exact delays (timers as data)', () => {
  it('T01 boot 750ms · T29 toast 2800ms · T19 moderation 6000ms · T22 tick 620ms · T16 celebration 2200ms', () => {
    expect(bootEffect).toEqual({ kind: 'timer', afterMs: 750, action: { t: 'BOOT_DONE' } });
    expect(MS).toEqual({ boot: 750, tween: 800, toast: 2800, moderation: 6000, studioTick: 620, celebration: 2200 });
  });
});

describe('§4.2 lifecycle + flowLabels verbatim', () => {
  it('mode A 8 steps · mode B 10 steps (AWAIT_PAY → PAY_OK inserted)', () => {
    expect(flowOf('A')).toHaveLength(8);
    expect(flowOf('B')).toHaveLength(10);
    expect(flowOf('B')[5]).toBe('AWAIT_PAY');
    expect(flowOf('B')[6]).toBe('PAY_OK');
  });
  it('labels verbatim (FUNDED mode-split)', () => {
    expect(flowLabel('FUNDED', 'B')).toBe('Frais de livraison payés — en sécurité');
    expect(flowLabel('FUNDED', 'A')).toBe('Paiement complet — en sécurité');
    expect(flowLabel('TRANSIT', 'A')).toBe('Vérifié, scellé, pris en charge par Séra');
    expect(flowLabel('PAID', 'A')).toBe('Vendeur et revendeuse payés');
  });
});

describe('T13→T15 — honorer une commande (o1 FUNDED, mode B)', () => {
  it('ready sheet gate (§4.4), history + toast verbatim, READY, tween', () => {
    let { s } = run(initialState(), { t: 'BOOT_DONE' }, { t: 'OPEN_ORDER', id: 'o1' }, { t: 'OPEN_READY' });
    expect(s.sheet).toBe('ready');
    expect(disabled.confirmReady(s)).toBe(true); // no photo yet
    // T15 refused without the shot
    expect(reduce(s, { t: 'CONFIRM_READY' }).s.orders['o1']!.status).toBe('FUNDED');
    const r2 = run(s, { t: 'TAKE_SHOT' }, { t: 'CONFIRM_READY' });
    s = r2.s;
    expect(s.orders['o1']!.status).toBe('READY');
    expect(s.sheet).toBeNull();
    expect(s.orders['o1']!.history.at(-1)!.l).toBe('Produit prêt confirmé (code WK-472) — Séra assigne un livreur');
    expect(s.toasts.at(-1)!.m).toBe('Prêt — Issa (Séra) est notifié');
    expect(r2.fx.some((e) => e.kind === 'tween')).toBe(true);
  });
});

describe('T16 [DEMO] — walk o1 (mode B) to PAID: celebration 2200ms + Mobile-Money suffix', () => {
  it('9 sims land on PAID with the formatted net as celebration', () => {
    let { s } = run(initialState(), { t: 'BOOT_DONE' }, { t: 'OPEN_ORDER', id: 'o1' }, { t: 'OPEN_READY' }, { t: 'TAKE_SHOT' }, { t: 'CONFIRM_READY' });
    let fx: Effect[] = [];
    for (let i = 0; i < 8; i++) {
      const r = reduce(s, { t: 'SIM_NEXT' });
      s = r.s;
      fx = r.fx;
    }
    expect(s.orders['o1']!.status).toBe('PAID');
    expect(s.orders['o1']!.history.at(-1)!.l).toBe('Vendeur et revendeuse payés — versement Mobile Money effectué');
    expect(s.celebr).toBe(formatF(8_500)); // o1 frozen net
    expect(timers(fx).some((t) => t.afterMs === MS.celebration && t.action.t === 'CELEBR_DONE')).toBe(true);
    // one more sim is a no-op (last step)
    expect(reduce(s, { t: 'SIM_NEXT' }).s.orders['o1']!.status).toBe('PAID');
  });
});

describe('T04/T18/T19 — wizard: §4.4 gates, §9.5 name fallback, moderation 6000ms', () => {
  it('THE EMPTY-NAME BLOCK: step 1 refuses continue until a name exists — the §9.5 fallback is unreachable via the footer', () => {
    let { s } = run(initialState(), { t: 'BOOT_DONE' }, { t: 'OPEN_WIZ' }, { t: 'WIZ_NEXT' }); // → step 1
    expect(s.wiz.step).toBe(1);
    expect(disabled.wizContinue(s)).toBe(true); // empty name
    expect(reduce(s, { t: 'WIZ_NEXT' }).s.wiz.step).toBe(1); // gated — the fallback cannot be reached this way
    expect(disabled.wizContinue(reduce(s, { t: 'WIZ_SET', patch: { name: '   ' } }).s)).toBe(true); // whitespace is not a name
    ({ s } = run(s, { t: 'WIZ_SET', patch: { name: 'Pagne' } }));
    // NAME ALONE OPENS THE STEP (founder ruling 2026-07-26 — Quartier left the
    // listing flow, so it left this gate; the record's zone is the seller's).
    expect(disabled.wizContinue(s)).toBe(false);
  });

  it('step 4/5 blocks without photos; publish creates np1 mod:true then approves at +6000ms', () => {
    let { s } = run(initialState(), { t: 'BOOT_DONE' }, { t: 'OPEN_WIZ' });
    expect(s.wiz).toMatchObject({ step: 0, cat: 'Mode femme', B: 10_000, C: 1_000, stock: 5, photos: false });
    ({ s } = run(s, { t: 'WIZ_NEXT' }, { t: 'WIZ_SET', patch: { name: 'Robe wax' } }, { t: 'WIZ_NEXT' }, { t: 'WIZ_NEXT' })); // → step 3 (Photos), name set (the step-1 gate)
    expect(s.wiz.step).toBe(3);
    expect(disabled.wizContinue(s)).toBe(true);
    expect(reduce(s, { t: 'WIZ_NEXT' }).s.wiz.step).toBe(3); // gated
    ({ s } = run(s, { t: 'OPEN_STUDIO' }, { t: 'STUDIO_CAPTURE' }, { t: 'STUDIO_CAPTURE' }, { t: 'STUDIO_CAPTURE' }, { t: 'STUDIO_APPROVE' }));
    expect(s.wiz.photos).toBe(true);
    expect(s.toasts.at(-1)!.m).toBe('Photos canoniques prêtes — sans prix, sans contact');
    ({ s } = run(s, { t: 'WIZ_NEXT' })); // → 4 (recap)
    const r = reduce(s, { t: 'WIZ_NEXT' }); // T19 publish
    s = r.s;
    expect(s.tab).toBe('produits');
    expect(s.products['np1']).toMatchObject({ name: 'Robe wax', mod: true, B: 10_000, C: 1_000 });
    expect(s.toasts.at(-1)!.m).toBe('Envoyé en modération — catégorie, allégations, photos');
    const mod = timers(r.fx).find((t) => t.action.t === 'MOD_APPROVED');
    expect(mod?.afterMs).toBe(6000);
    const r2 = reduce(s, mod!.action);
    expect(r2.s.products['np1']!.mod).toBe(false);
    expect(r2.s.toasts.at(-1)!.m).toBe('Modération : approuvé — en ligne chez les revendeuses');
  });

  it('§9.5 STAYS LITERALLY INTACT — the fallback still fires if a future path jumps the guard (the journaled caveat, pinned)', () => {
    // Drive the reducer to step 4 WITH a name (the lawful route), then blank the
    // name — the exact shape of a future action that skips the step-1 predicate.
    let { s } = run(initialState(), { t: 'BOOT_DONE' }, { t: 'OPEN_WIZ' },
      { t: 'WIZ_NEXT' }, { t: 'WIZ_SET', patch: { name: 'x' } }, { t: 'WIZ_NEXT' }, { t: 'WIZ_NEXT' });
    ({ s } = run(s, { t: 'OPEN_STUDIO' }, { t: 'STUDIO_CAPTURE' }, { t: 'STUDIO_CAPTURE' }, { t: 'STUDIO_CAPTURE' }, { t: 'STUDIO_APPROVE' }, { t: 'WIZ_NEXT' }));
    s = reduce(s, { t: 'WIZ_SET', patch: { name: '' } }).s; // the guard is a FOOTER gate, not a state invariant
    const r = reduce(s, { t: 'WIZ_NEXT' });
    expect(r.s.products['np1']).toMatchObject({ name: 'Robe brodée bogolan' }); // §9.5, unedited — frozen
  });
});

describe('T08–T10 stock sheet · T11 pause · T21/T22 studio gates', () => {
  it('stock lower bound (shown ≥ 0), save toast verbatim; pause toggles with verbatim toasts; low light blocks capture', () => {
    let { s } = run(initialState(), { t: 'BOOT_DONE' }, { t: 'OPEN_PRODUCT', id: 'p3' }, { t: 'OPEN_STOCK' });
    for (let i = 0; i < 10; i++) s = reduce(s, { t: 'STOCK_DELTA', d: -1 }).s;
    expect(s.stkDelta).toBe(-4); // p3 stock 4 → floor at shown 0
    s = reduce(s, { t: 'STOCK_DELTA', d: 1 }).s;
    const saved = reduce(s, { t: 'STOCK_SAVE' }).s;
    expect(saved.products['p3']!.stock).toBe(1);
    expect(saved.toasts.at(-1)!.m).toBe('Stock mis à jour : 1 unités');
    const paused = reduce(saved, { t: 'TOGGLE_PAUSE' }).s;
    expect(paused.products['p3']!.paused).toBe(true);
    expect(paused.toasts.at(-1)!.m).toBe('Produit en pause — masqué chez les revendeuses');
    const low = run(paused, { t: 'OPEN_STUDIO' }, { t: 'STUDIO_TOGGLE_LOW' }).s;
    expect(disabled.studioCapture(low)).toBe(true);
    expect(reduce(low, { t: 'STUDIO_CAPTURE' }).s.studio.step).toBe(0);
  });
});

describe('§3.1 segments over the seed', () => {
  it('traiter 2 (o1 FUNDED + o3 READY_FAILED) · cours 0 · fini 1 (o7) · incidents 2 (o5, o9)', () => {
    const s = initialState();
    const os = s.oorder.map((id) => s.orders[id]!);
    expect(os.filter(SEG_OF.traiter).map((o) => o.id)).toEqual(['o1', 'o3']);
    expect(os.filter(SEG_OF.cours)).toHaveLength(0);
    expect(os.filter(SEG_OF.fini).map((o) => o.id)).toEqual(['o7']);
    expect(os.filter(SEG_OF.incidents).map((o) => o.id)).toEqual(['o5', 'o9']);
  });
});
