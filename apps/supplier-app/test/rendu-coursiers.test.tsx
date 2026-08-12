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
 * `{ok:false,reason:'rider_carrying'}`, 404 `{ok:false,reason:'unknown_rider'}`,
 * and 428 `{ok:false,reason:'custody_bound_not_asserted'}` when the request does
 * not carry `custodyNotBegun: true` — the double REFUSES exactly like the door,
 * so a screen that stopped asserting the bound would go red here. A double
 * kinder than the service is the §9.8 failure this repo has paid for.
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

/**
 ⚠ * THE DOOR'S REAL CONTRACT, never a kinder one. `/ops/riders/remove` refuses
 * 428 unless the request asserts the custody bound, so EVERY removal route in
 * this file goes through here: a screen that quietly stopped sending
 * `custodyNotBegun` would fail every walk below instead of passing them all.
 */
function porteRetrait(reponse: { status: number; json: Record<string, unknown> }): Route {
  return (path, body) => {
    if (path !== '/ops/riders/remove') return null;
    if (body?.['custodyNotBegun'] !== true) {
      return { status: 428, json: { ok: false, reason: 'custody_bound_not_asserted' } };
    }
    return reponse;
  };
}

/**
 * Hold ONE request open, so the screen can be walked WHILE it is in flight.
 * Only `globalThis.fetch` is touched — the harness's own fake still answers
 * underneath it and no app code is stubbed, or the walk would prove nothing.
 * Call it AFTER `wire()`, which is the fetch it wraps.
 */
function retenir(path: string): { ouvrir: () => void } {
  const dessous = globalThis.fetch;
  let liberer = (): void => {};
  const attente = new Promise<void>((r) => {
    liberer = () => r();
  });
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    if (String(input).includes(path)) await attente;
    return dessous(input, init);
  };
  return { ouvrir: () => liberer() };
}

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

  it('the second tap REACHES THE SERVICE, names the rider, ASSERTS the custody bound — and the roster is re-read', async () => {
    // ⚠ THE ROSTER CHANGES BETWEEN THE TWO READS. « Boss is gone » must come
    // from the SERVER, not from a screen quietly hiding a row it still holds;
    // a double that answered the same list twice would prove nothing.
    let lectures = 0;
    const w = wire([
      porteRetrait({ status: 200, json: { ok: true, status: 'removed', codeRevoked: true } }),
      (path) => {
        if (path !== '/ops/riders') return null;
        lectures += 1;
        return { status: 200, json: { ok: true, riders: lectures === 1 ? [RIDER] : [] } as never };
      },
      ...roster([RIDER]).slice(1),
    ]);
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press('Retirer ce coursier');
    // The custody question is on screen BEFORE the destructive tap — Séra's
    // board cannot see a parcel, so the one person who can is asked.
    expect(
      screen.shows("Il ne doit plus avoir de colis en main. S'il est encore sur la route, attendez la fin de la course."),
      'the destructive tap was offered without asking about the parcel',
    ).toBe(true);
    await screen.press('Oui, le retirer');
    await screen.settle();

    const sent = w.calls.filter((c) => c.path === '/ops/riders/remove' && c.method === 'POST');
    expect(sent.length, 'the tap never reached the service').toBe(1);
    expect(sent[0]!.body?.['riderId'], 'the removal must name the rider it removes').toBe('rider-boss');
    expect(
      sent[0]!.body?.['custodyNotBegun'],
      'the door answers 428 without this — the screen asked the question and must carry the answer',
    ).toBe(true);

    expect(lectures, 'the roster was never re-read — the screen is showing its own memory').toBe(2);
    expect(screen.shows('Boss'), 'the removed rider is still on screen after the server dropped him').toBe(false);
    screen.unmount();
  });

  it('IN FLIGHT the question closes and says « Retrait en cours » — no button left to tap into silence', async () => {
    /**
     * ⚠ THE GHOST BUTTON, WALKED. `retraitCoursierStart`'s return value used to
     * be thrown away, so mid-flight « Oui, le retirer » stayed on screen,
     * pressable, and did NOTHING — no request, no notice. That is the exact
     * class of bug this harness exists for (2026-08-08, and again 2026-08-10).
     */
    const w = wire([
      porteRetrait({ status: 200, json: { ok: true, status: 'removed', codeRevoked: true } }),
      ...roster([RIDER]),
    ]);
    const porte = retenir('/ops/riders/remove');
    const screen = await mountEcran(<SZoneCoursiers />);
    await screen.settle();

    await screen.press('Retirer ce coursier');
    await screen.press('Oui, le retirer');
    await screen.settle();

    expect(screen.shows('Retrait en cours…'), 'nothing on screen says the removal is happening').toBe(true);
    expect(
      screen.shows('Retirer ce coursier de la liste ? Son code ne marchera plus.'),
      'the armed question survived its own act — a second « Oui » would be silently dead',
    ).toBe(false);
    expect(screen.canPress('Oui, le retirer'), 'the dead button is still pressable in flight').toBe(false);

    porte.ouvrir();
    await screen.settle();
    expect(screen.shows('Retrait en cours…'), 'the pending line never cleared').toBe(false);
    // Counted here, not above: `retenir` holds the request BEFORE the harness
    // records it, so the count only means anything once the gate is open.
    expect(
      w.calls.filter((c) => c.path === '/ops/riders/remove').length,
      'one tap, one removal — no double send while the first was in flight',
    ).toBe(1);
    screen.unmount();
  });

  it('a CARRYING rider is refused, and the screen says WHY — he is not left tapping', async () => {
    const w = wire([
      porteRetrait({ status: 409, json: { ok: false, reason: 'rider_carrying' } }),
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
    // ⚠ AND NOT BOTH AT ONCE (verifier MAJOR). The generic banner used to fire
    // alongside it, at the TOP of the screen, in the loud voice: « Ça n'a pas
    // marché. Réessayez. » — telling him to retry the one thing that cannot
    // work while the truth whispered at the bottom of the card.
    expect(
      screen.shows("Ça n'a pas marché. Réessayez."),
      'the generic banner fired over a named refusal — he is told to retry the impossible',
    ).toBe(false);
    // The tree survived, and the rider is STILL THERE — nothing was erased.
    expect(screen.shows('Boss')).toBe(true);
    expect(w.calls.filter((c) => c.path === '/ops/riders/remove').length).toBe(1);
    screen.unmount();
  });

  it('an UNKNOWN rider gets its own sentence — never the carrying one', async () => {
    wire([
      porteRetrait({ status: 404, json: { ok: false, reason: 'unknown_rider' } }),
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
