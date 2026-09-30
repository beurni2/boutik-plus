import { describe, expect, it } from 'vitest';
import {
  initialState, reduce, bootEffect, MS, disabled,
  type A, type Effect, type S,
} from '../src/v2/machine';

/**
 * WO-FP-PIXEL §4 — the machine's transitions, VERBATIM texts and EXACT delays,
 * driven end-to-end as pure reductions (§8: mechanically verifiable).
 *
 * LISTER-VRAI-1 (founder 2026-09-30, « make room »): the demo order lifecycle,
 * sheets, simulator, studio mock-up and seed left with the screens that
 * dispatched them; their tests left with them. The wizard, the §9.5 frozen
 * fallback and the moderation timer are unchanged and still pinned here.
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
  it('T01 boot 750ms · T29 toast 2800ms · T19 moderation 6000ms', () => {
    expect(bootEffect).toEqual({ kind: 'timer', afterMs: 750, action: { t: 'BOOT_DONE' } });
    expect(MS).toEqual({ boot: 750, tween: 800, toast: 2800, moderation: 6000 });
  });
});

describe('THE DEMO BOARD IS GONE — the machine boots with nothing invented', () => {
  it('no seed products, no seed orders: the console shows his real rows or nothing', () => {
    const s = initialState();
    expect(s.products).toEqual({});
    expect(s.porder).toEqual([]);
    expect(Object.keys(s)).not.toContain('orders');
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
    // F-98 (founder 2026-09-30): the price and the commission open EMPTY — he types them.
    expect(s.wiz).toMatchObject({ step: 0, cat: 'Mode femme', B: null, C: null, stock: 5, photos: false });
    ({ s } = run(s, { t: 'WIZ_NEXT' }, { t: 'WIZ_SET', patch: { name: 'Robe wax' } }, { t: 'WIZ_NEXT' },
      { t: 'WIZ_SET', patch: { B: 10_000, C: 1_000 } }, { t: 'WIZ_NEXT' })); // → step 3 (Photos), name and prices set
    expect(s.wiz.step).toBe(3);
    expect(disabled.wizContinue(s)).toBe(true);
    expect(reduce(s, { t: 'WIZ_NEXT' }).s.wiz.step).toBe(3); // gated
    ({ s } = run(s, { t: 'OPEN_STUDIO' }, { t: 'STUDIO_APPROVE' }));
    expect(s.wiz.photos).toBe(true);
    // F-46: approval claims nothing about the photographs — nothing checked them.
    expect(s.toasts).toEqual([]);
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
    ({ s } = run(s, { t: 'OPEN_STUDIO' }, { t: 'STUDIO_APPROVE' }, { t: 'WIZ_NEXT' }));
    s = reduce(s, { t: 'WIZ_SET', patch: { name: '' } }).s; // the guard is a FOOTER gate, not a state invariant
    const r = reduce(s, { t: 'WIZ_NEXT' });
    expect(r.s.products['np1']).toMatchObject({ name: 'Robe brodée bogolan' }); // §9.5, unedited — frozen
  });
});
