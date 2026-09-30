import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SZoneCoursiers } from '../src/coursiers/zone';

/**
 * ═══ RENDU-RÉEL — « Courses sur le tableau Séra », the riders desk's retire,
 * driven (AUDIT-B+2 F-64, F-65) ═══
 *
 * F-65: the single retire told him « reprenez la course avant de la retirer »
 * (an act this console does not have), the relay fold told him the opposite
 * (« la livraison en cours va jusqu'au bout »), and the sweep said nothing at
 * all while it retired carried courses. What Séra ACTUALLY does, read at its
 * door (`logistics-do.ts /ops/order/retirer`, `forgetOrder`) and proven by its
 * own e2e (`retirer.e2e.test.ts`: after the retire the rider's session has
 * `assignment: null`): the course leaves his app, custody stays open — he keeps
 * the parcel and can no longer deliver it. ONE sentence says that, everywhere.
 *
 * F-64: since COLIS-2 Séra retires ONE article of a waiting package alone and
 * refuses one article of a carried package by name (409 `colis_en_course`)
 * unless `colisEntier: true` is sent. The desk never sent it and called the
 * refusal « Réessayez » — for ever.
 *
 * ⚠ The stand-ins answer only forms Séra's own suite recorded (the harness
 * fails the walk otherwise), and the retire door refuses exactly as the real
 * one: one article of the carried bag → 409 `colis_en_course`, never a kinder
 * 200.
 *
 * The four questions: the tree survives every tap · each lever is present,
 * pressable and CALLS the door with the right body · a refusal is named and
 * leaves a way out · after the act the BOARD is asked again.
 */

const CLE_SLOT = 'boutik.coursiers.cle';
const T = '2026-09-30T09:00:00.000Z';
const LOC = { directions: '', landmark: "À l'échangeur", maskedRelay: '', zone: 'Zogona' };
const WIN = { start: T, end: '2026-09-30T15:00:00.000Z' };

function file(orderId: string, taskId: string, colis?: readonly string[]): Record<string, unknown> {
  return { admittedAt: T, ...(colis !== undefined ? { colis: { orderIds: colis } } : {}), location: LOC, orderId, taskId, window: WIN };
}
function affectation(orderId: string, taskId: string, assignmentId: string): Record<string, unknown> {
  return {
    ackDeadline: T,
    assignedAt: T,
    assignmentId,
    correlationId: `corr-${assignmentId}`,
    dispatcherId: 'fondateur',
    lease: { riderId: 'rider-boss', taskId, version: 1 },
    orderId,
    riderId: 'rider-boss',
    status: 'acknowledged',
    taskId,
  };
}
function planche(queued: unknown[], assignments: unknown[], colisEnCourse: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok: true, board: { queued, riders: [], assignments, aReprogrammer: [], enDeuxiemePassage: [], manifestes: {}, finDeService: {}, colisEnCourse } };
}

/**
 * Séra's board and its retire door as ONE book, refusing like the real one:
 * an article of a carried bag without `colisEntier` → 409 `colis_en_course`
 * naming the bag; with it → the whole bag leaves. A lone course leaves alone.
 * A waiting package's head leaves alone and its mates leave the queue.
 */
function livre(init: { queued: Record<string, unknown>[]; assignments: Record<string, unknown>[]; colisEnCourse?: Record<string, { orderIds: string[] }> }): { routes: Route[] } {
  const etat = {
    queued: [...init.queued],
    assignments: [...init.assignments],
    colisEnCourse: { ...(init.colisEnCourse ?? {}) } as Record<string, { orderIds: string[] }>,
  };
  const enCourse = (orderId: string): { assignmentId: string; orderIds: string[] } | null => {
    for (const a of etat.assignments) {
      const id = a['assignmentId'] as string;
      const bag = etat.colisEnCourse[id];
      if (a['orderId'] === orderId || bag?.orderIds.includes(orderId)) return { assignmentId: id, orderIds: bag?.orderIds ?? [orderId] };
    }
    return null;
  };
  return {
    routes: [
      (path) => (path === '/ops/riders' ? { status: 200, json: { ok: true, riders: [] } as never } : null),
      (path) => (path === '/ops/rider-codes' ? { status: 200, json: { ok: true, codes: [] } as never } : null),
      (path) =>
        path === '/ops/board'
          ? {
              status: 200,
              json: planche(
                etat.queued,
                etat.assignments,
                Object.fromEntries(Object.entries(etat.colisEnCourse).map(([k, v]) => [k, { orderIds: v.orderIds, packageId: `col-${k}`, reglement: {} }])),
              ) as never,
            }
          : null,
      (path, body) => {
        if (path !== '/ops/order/retirer') return null;
        if (typeof body?.['command_id'] !== 'string' || typeof body?.['orderId'] !== 'string') {
          return { status: 400, json: { ok: false, reason: 'malformed' } };
        }
        if (body['colisEntier'] !== undefined && typeof body['colisEntier'] !== 'boolean') {
          return { status: 400, json: { ok: false, reason: 'malformed' } };
        }
        const orderId = body['orderId'] as string;
        const course = enCourse(orderId);
        if (course !== null && course.orderIds.length > 1 && body['colisEntier'] !== true) {
          return { status: 409, json: { ok: false, reason: 'colis_en_course', orderIds: course.orderIds } };
        }
        const partent = new Set(course !== null && body['colisEntier'] === true ? course.orderIds : [orderId]);
        const avant = etat.queued.length + etat.assignments.length;
        // A waiting package's course is filed under its head: the head leaves,
        // and the task goes with it.
        etat.queued = etat.queued.filter((q) => !partent.has(q['orderId'] as string));
        etat.assignments = etat.assignments.filter((a) => !partent.has(a['orderId'] as string));
        if (course !== null) delete etat.colisEnCourse[course.assignmentId];
        if (etat.queued.length + etat.assignments.length === avant) return { status: 200, json: { ok: true, status: 'inconnu' } };
        return {
          status: 200,
          json: { ok: true, status: 'retire', removed: { tasks: 1, assignments: 0, leases: 0, briefs: 0, ramassage: 0, codesVerification: 0, custodyOutbox: 0, funding: 1, readiness: 1 } },
        };
      },
    ],
  };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://logistics.test';
  storage({ [CLE_SLOT]: 'cle-ops-test' });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

const GARDE = 'il ne pourra plus le livrer';

describe('F-65 — one custody sentence, true to what Séra does, before every retire of a carried course', () => {
  it('the single retire of a carried course says he keeps the parcel and can no longer deliver it — never « reprenez la course »', async () => {
    const { routes } = livre({ queued: [], assignments: [affectation('ord-porte', 'task-1', 'asg-1')] });
    const w = wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    expect(screen.shows('ord-porte')).toBe(true);
    await screen.press('Retirer cette course');
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length, 'arming sends nothing').toBe(0);
    expect(screen.shows(GARDE), 'the custody sentence must be on screen before the tap').toBe(true);
    expect(screen.shows('reprenez la course'), 'this console has no « reprendre » — the old sentence sent him nowhere').toBe(false);

    await screen.press('Oui, retirer');
    const sent = w.calls.filter((c) => c.path === '/ops/order/retirer');
    expect(sent.length).toBe(1);
    expect(sent[0]!.body?.['orderId']).toBe('ord-porte');
    expect(sent[0]!.body?.['colisEntier'], 'a lone course is never sent as a whole bag').toBeUndefined();
    // The BOARD is asked again, and the course is gone from it.
    expect(w.calls.filter((c) => c.path === '/ops/board').length).toBeGreaterThanOrEqual(2);
    expect(screen.shows('ord-porte')).toBe(false);
    screen.unmount();
  });

  it('a waiting course has no custody sentence — nobody holds it', async () => {
    const { routes } = livre({ queued: [file('ord-attente', 'task-2')], assignments: [] });
    wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();
    await screen.press('Retirer cette course');
    expect(screen.shows(GARDE)).toBe(false);
    screen.unmount();
  });

  it('the sweep says how many are with a rider and says the SAME custody sentence before « Oui, tout retirer »', async () => {
    const { routes } = livre({
      queued: [file('ord-attente', 'task-2')],
      assignments: [affectation('ord-porte', 'task-1', 'asg-1')],
    });
    const w = wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press("Retirer les courses d'essai");
    expect(screen.shows('Retirer les 2 courses du tableau ?')).toBe(true);
    expect(screen.shows('Une de ces courses est déjà confiée à un coursier.'), 'the sweep must say a rider holds one').toBe(true);
    expect(screen.shows(GARDE), 'the sweep must say what a retire does to a carried course').toBe(true);
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length).toBe(0);

    await screen.press('Oui, tout retirer');
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').map((c) => c.body?.['orderId']).sort()).toEqual(['ord-attente', 'ord-porte']);
    // The BOARD is asked again after the sweep, and it is empty.
    expect(screen.shows('Aucune course sur le tableau.')).toBe(true);
    screen.unmount();
  });

  it('a sweep with no carried course says no custody sentence', async () => {
    const { routes } = livre({ queued: [file('ord-a', 'task-a'), file('ord-b', 'task-b')], assignments: [] });
    wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();
    await screen.press("Retirer les courses d'essai");
    expect(screen.shows('déjà confiée')).toBe(false);
    expect(screen.shows(GARDE)).toBe(false);
    screen.unmount();
  });
});

describe('F-64 — the desk follows Séra’s package rules (COLIS-2)', () => {
  it('a package a rider carries: « Retirer tout le colis » names every article, sends colisEntier, and the board comes back empty', async () => {
    const { routes } = livre({
      queued: [],
      assignments: [affectation('ord-c-a', 'task-c', 'asg-c')],
      colisEnCourse: { 'asg-c': { orderIds: ['ord-c-a', 'ord-c-b'] } },
    });
    const w = wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    expect(screen.canPress('Retirer cette course'), 'one article of a carried bag can never leave alone — no lever may offer it').toBe(false);
    await screen.press('Retirer tout le colis');
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length, 'arming sends nothing').toBe(0);
    expect(screen.shows('Retirer tout ce colis du tableau ?')).toBe(true);
    expect(screen.shows('ses 2 articles partent ensemble')).toBe(true);
    expect(screen.shows('ord-c-b'), 'every article of the bag is named before the tap').toBe(true);
    expect(screen.shows(GARDE)).toBe(true);

    await screen.press('Oui, retirer');
    const sent = w.calls.filter((c) => c.path === '/ops/order/retirer');
    expect(sent.length).toBe(1);
    expect(sent[0]!.body?.['orderId']).toBe('ord-c-a');
    expect(sent[0]!.body?.['colisEntier'], 'the whole-bag act must ask for the whole bag').toBe(true);
    expect(screen.shows("Cette course n'a pas été retirée"), 'the act went through — no failure sentence').toBe(false);
    expect(screen.shows('Aucune course sur le tableau.'), 'the board, asked again, is empty').toBe(true);
    screen.unmount();
  });

  it('a waiting package: the retire says the other articles come back to « Prêt à livrer » for a new course', async () => {
    const { routes } = livre({ queued: [file('ord-c-a', 'task-c', ['ord-c-a', 'ord-c-b', 'ord-c-c'])], assignments: [] });
    const w = wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press('Retirer cette course');
    expect(screen.shows('Cette course porte un colis de 3 articles.')).toBe(true);
    expect(screen.shows('Seul cet article est retiré.')).toBe(true);
    expect(screen.shows('Prêt à livrer')).toBe(true);
    await screen.press('Oui, retirer');
    const sent = w.calls.filter((c) => c.path === '/ops/order/retirer');
    expect(sent.length).toBe(1);
    expect(sent[0]!.body?.['colisEntier'], 'a waiting package article leaves alone, as Séra decides').toBeUndefined();
    screen.unmount();
  });

  it('a refusal by name (`colis_en_course`, the board was stale) is SAID, never « Réessayez », and the board is read again to offer the whole bag', async () => {
    // The desk read the course as waiting; by the tap a rider had taken the bag.
    let lu = 0;
    const tenu = livre({
      queued: [],
      assignments: [affectation('ord-c-a', 'task-c', 'asg-c')],
      colisEnCourse: { 'asg-c': { orderIds: ['ord-c-a', 'ord-c-b'] } },
    });
    const avant: Route = (path) =>
      path === '/ops/board' && lu++ === 0 ? { status: 200, json: planche([file('ord-c-a', 'task-c', ['ord-c-a', 'ord-c-b'])], []) as never } : null;
    const w = wire([avant, ...tenu.routes]);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press('Retirer cette course');
    await screen.press('Oui, retirer');
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length).toBe(1);
    expect(screen.shows("Cette course n'a pas été retirée. Réessayez."), 'a named refusal is not a network failure').toBe(false);
    expect(screen.shows('Ce colis est chez un coursier'), 'the refusal must be named').toBe(true);
    expect(screen.canPress('Retirer tout le colis'), 'the way out: the board is read again and offers the whole bag').toBe(true);
    screen.unmount();
  });

  it('the sweep takes a carried bag whole (one call, colisEntier) — never one refused call per article', async () => {
    const { routes } = livre({
      queued: [],
      assignments: [affectation('ord-c-a', 'task-c', 'asg-c')],
      colisEnCourse: { 'asg-c': { orderIds: ['ord-c-a', 'ord-c-b'] } },
    });
    const w = wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press("Retirer les courses d'essai");
    await screen.press('Oui, tout retirer');
    const sent = w.calls.filter((c) => c.path === '/ops/order/retirer');
    expect(sent.map((c) => [c.body?.['orderId'], c.body?.['colisEntier']])).toEqual([['ord-c-a', true]]);
    expect(screen.shows("n'ont pas pu l'être"), 'nothing was refused').toBe(false);
    screen.unmount();
  });
});

describe('slice 10 verifier — the desk says the cost, and what a waiting package leaves behind', () => {
  it('the single retire and the sweep both say the order can no longer be given to a rider from here', async () => {
    const { routes } = livre({ queued: [file('ord-attente', 'task-2')], assignments: [] });
    wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();
    await screen.press('Retirer cette course');
    expect(screen.shows('ne pourra plus être confiée à un coursier')).toBe(true);
    await screen.press('Annuler');
    await screen.press("Retirer les courses d'essai");
    expect(screen.shows('ne pourront plus être confiées à un coursier')).toBe(true);
    expect(screen.shows('Vos commandes et vos produits ne bougent pas'), 'the orders DO change').toBe(false);
    screen.unmount();
  });

  it('a sweep over a waiting package says its other articles come back to « Prêt à livrer »', async () => {
    const { routes } = livre({ queued: [file('ord-c-a', 'task-c', ['ord-c-a', 'ord-c-b'])], assignments: [] });
    wire(routes);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();
    await screen.press("Retirer les courses d'essai");
    expect(screen.shows('reviennent dans « Prêt à livrer »')).toBe(true);
    screen.unmount();
  });
});
