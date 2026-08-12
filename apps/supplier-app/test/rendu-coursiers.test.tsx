import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SZoneCoursiers } from '../src/coursiers/zone';

/**
 * ═══ RENDU-RÉEL — RETIRER UN COURSIER, DRIVEN ═══
 *
 * Founder, 2026-08-12: « add a way to remove riders as well on coursiers. »
 * A destructive act on a roster, so the standing order applies at full weight:
 * the control is PRESSED here, not read out of the file.
 *
 * The four questions, for this control:
 *   · did the tree survive the tap — the roster still renders after each one
 *   · is the action present AND pressable AND wired — the port is CALLED, and
 *     the call names the rider
 *   · does an act that can fail leave a way out — a refused removal says WHY,
 *     and the rider stays on the roster
 *   · can he get to the next step — the question can be cancelled, and a
 *     successful removal re-reads the roster from the server
 *
 ⚠ * CONTRACT-CERTIFIED to the real Worker. `/ops/riders/remove` answers exactly
 * what `logistics-do.ts` answers: 200 `{ok:true,status:'removed'}`, 409
 * `{ok:false,reason:'rider_carrying'}`, 404 `{ok:false,reason:'unknown_rider'}`.
 * A double kinder than the service is the §9.8 failure this repo has paid for.
 */

const CLE_SLOT = 'boutik.coursiers.cle';

const RIDER = {
  riderId: 'rider-boss',
  displayName: 'Boss',
  phoneAlias: 'alias-boss',
  certified: true,
  shift: { status: 'on_shift' },
  assignable: true,
};

/** The roster + codes join the desk reads (two routes, one screen). */
function roster(riders: readonly unknown[], codes: readonly unknown[] = []): Route[] {
  return [
    (path) => (path === '/ops/riders' ? { status: 200, json: { ok: true, riders } as never } : null),
    (path) => (path === '/ops/rider-codes' ? { status: 200, json: { ok: true, codes } as never } : null),
    (path) => (path === '/ops/board' ? { status: 200, json: { ok: true, board: { queued: [], riders: [], assignments: [] } } as never } : null),
  ];
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://logistics.test';
  storage({ [CLE_SLOT]: 'cle-ops-test' });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('RETIRER-COURSIER — the founder removes a rider from the desk', () => {
  it('the control is there, the question is a SECOND tap, and cancelling leaves the rider alone', async () => {
    const w = wire(roster([RIDER]));
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    expect(screen.shows('Boss'), 'the roster did not render').toBe(true);
    expect(screen.canPress('Retirer ce coursier'), 'the removal control must be present AND pressable').toBe(true);

    // ONE tap only arms the question — nothing is sent.
    await screen.press('Retirer ce coursier');
    expect(screen.shows('Retirer ce coursier de la liste ? Son code ne marchera plus.')).toBe(true);
    expect(
      w.calls.some((c) => c.path === '/ops/riders/remove'),
      'a single tap sent the removal — the two-tap guard is not holding',
    ).toBe(false);

    // …and he can back out.
    await screen.press('Annuler');
    expect(screen.shows('Retirer ce coursier de la liste ? Son code ne marchera plus.')).toBe(false);
    expect(screen.shows('Boss'), 'cancelling took the rider off the screen').toBe(true);
    screen.unmount();
  });

  it('the second tap REACHES THE SERVICE and names the rider', async () => {
    const w = wire([
      (path) =>
        path === '/ops/riders/remove'
          ? { status: 200, json: { ok: true, status: 'removed', codeRevoked: true } as never }
          : null,
      ...roster([RIDER]),
    ]);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press('Retirer ce coursier');
    await screen.press('Oui, le retirer');
    await screen.settle();

    const sent = w.calls.filter((c) => c.path === '/ops/riders/remove' && c.method === 'POST');
    expect(sent.length, 'the tap never reached the service').toBe(1);
    expect(sent[0]!.body?.['riderId'], 'the removal must name the rider it removes').toBe('rider-boss');
    screen.unmount();
  });

  it('a CARRYING rider is refused, and the screen says WHY — he is not left tapping', async () => {
    const w = wire([
      (path) =>
        path === '/ops/riders/remove'
          ? { status: 409, json: { ok: false, reason: 'rider_carrying' } as never }
          : null,
      ...roster([RIDER]),
    ]);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press('Retirer ce coursier');
    await screen.press('Oui, le retirer');
    await screen.settle();

    // The NAMED sentence, not « ça n'a pas marché » — the fix is his to make.
    expect(
      screen.shows('Ce coursier a un colis. Terminez la course avant de le retirer.'),
      'a carrying refusal must say what to do, never a generic failure',
    ).toBe(true);
    // The tree survived, and the rider is STILL THERE — nothing was erased.
    expect(screen.shows('Boss')).toBe(true);
    expect(w.calls.filter((c) => c.path === '/ops/riders/remove').length).toBe(1);
    screen.unmount();
  });

  it('an UNKNOWN rider gets its own sentence — never the carrying one', async () => {
    wire([
      (path) =>
        path === '/ops/riders/remove'
          ? { status: 404, json: { ok: false, reason: 'unknown_rider' } as never }
          : null,
      ...roster([RIDER]),
    ]);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press('Retirer ce coursier');
    await screen.press('Oui, le retirer');
    await screen.settle();

    expect(screen.shows("Ce coursier n'est plus dans la liste.")).toBe(true);
    expect(screen.shows('Ce coursier a un colis. Terminez la course avant de le retirer.')).toBe(false);
    screen.unmount();
  });
});
