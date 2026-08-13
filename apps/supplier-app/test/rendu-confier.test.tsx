import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { ConfierCoursier } from '../src/commandes/confier';
import type { PaidOrderRow } from '../src/operations/service';
import type { LivraisonRow } from '../src/operations/dispatch-service';

/**
 * ═══ RENDU-RÉEL — REFUS-NOMMÉ: « Créer la course » stops saying « Réessayez »
 * for a refusal a retry can never fix ═══
 *
 * FOUNDER BUG (2026-08-13, screenshot): « on boutik+ when i tap creer la
 * course to relay a product to a sera rider it is not working » — his banner
 * was « Séra a refusé. Réessayez, ou regardez la commande côté Séra. » That is
 * `confier.refus_generique`, the collapse of every unnamed refusal — and the
 * refusal he hit is NAMED and PERMANENT: `order_already_has_task` (a delivered
 * course's queue row deliberately stays `assigned`; only « Retirer cette
 * course », onglet Coursiers, clears it). « Réessayez » was a lie.
 *
 * Per the standing order this walk was written FIRST, red on his banner, then
 * the mapping was fixed.
 *
 ⚠ * CONTRACT-CERTIFIED to the real Worker. The 409 bytes below are pinned by
 * sera `services/logistics-service/test/course-livree.e2e.test.ts`
 * (REFUS-NOMMÉ describe) against the SHIPPED logistics bundle: a compose for
 * an order whose open task was admitted by a DIFFERENT command answers exactly
 * 409 `{ok:false, reason:'order_already_has_task', taskId, status}`. (The SAME
 * command replays 200 `{ok:true,admitted:true,duplicate:true,taskId}` — the
 * port maps that to ok and no banner shows; the refusal road is this one.)
 * The double also keeps the door's own bounds — a malformed compose refuses
 * 400 like `logistics-do.ts` does, never a kinder answer.
 *
 * The four questions, for this control:
 *   · did the tree survive the tap — the fold still renders after the 409
 *   · present AND pressable AND wired — the port is CALLED with the console's
 *     deterministic command naming the order
 *   · a way out when it fails — the sentence names the REAL cleanup control
 *     by its on-screen words
 *   · can he reach the next step — the button stays pressable; the named act
 *     (« Retirer cette course ») is the road
 */

const CLE_SLOT = 'boutik.coursiers.cle';

const ROW: PaidOrderRow = {
  orderId: 'ord-refus-1',
  productVersionId: 'pv-1',
  productName: 'Pagne tissé',
  productPhotoRef: '',
  offerVersion: 'v1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-08-13T09:00:00.000Z',
  zoneTo: 'Ouagadougou',
  sellerBasePrice: 10000,
  supplierId: 'sup-1',
  supplierResolved: true,
  registeredAt: '2026-08-13T09:00:00.000Z',
};

/** The buyer GAVE her quartier and repère (PRET-SECTIONS): both sections are
 *  prefilled read-only, so the compose needs no typing and the pin is
 *  facultatif — the founder's exact one-tap road. */
const BUYER: LivraisonRow = {
  orderId: 'ord-refus-1',
  state: 'paid',
  createdAt: '2026-08-13T09:00:00.000Z',
  contact: { phone: '70 00 00 00', quartier: 'Zogona', repere: "À l'échangeur, portail vert" },
  productVersionId: 'pv-1',
  zoneTo: 'Ouagadougou',
};

/** An empty board: no queued task for this order, so the fold offers the
 *  compose form — exactly where the founder stood. */
const planche: Route = (path) =>
  path === '/ops/board'
    ? { status: 200, json: { ok: true, board: { queued: [], riders: [], assignments: [] } } }
    : null;

/**
 ⚠ * THE DOOR'S REAL CONTRACT, never a kinder one (`logistics-do.ts /ops/task`):
 * command_id and orderId must be strings, the location block and the window
 * must be whole, and a body naming its own taskId is refused outright. A
 * console that stopped sending the window would go red HERE instead of green.
 */
function porteCompose(reponse: { status: number; json: Record<string, unknown> }): Route {
  return (path, body) => {
    if (path !== '/ops/task') return null;
    const loc = body?.['location'] as Record<string, unknown> | undefined;
    const win = body?.['window'] as Record<string, unknown> | undefined;
    if (
      typeof body?.['command_id'] !== 'string' ||
      typeof body?.['orderId'] !== 'string' ||
      loc === undefined ||
      typeof loc['zone'] !== 'string' ||
      typeof loc['landmark'] !== 'string' ||
      typeof loc['directions'] !== 'string' ||
      typeof loc['maskedRelay'] !== 'string' ||
      win === undefined ||
      typeof win['start'] !== 'string' ||
      typeof win['end'] !== 'string'
    ) {
      return { status: 400, json: { ok: false, reason: 'malformed' } };
    }
    if (body['taskId'] !== undefined) {
      return { status: 400, json: { ok: false, reason: 'task_id_is_not_yours_to_choose' } };
    }
    return reponse;
  };
}

/** The CERTIFIED refusal bytes — what sera's door actually sends for a course
 *  already on the book (delivered included), pinned by the e2e named above. */
const REFUS_COURSE_EXISTANTE = {
  status: 409,
  json: { ok: false, reason: 'order_already_has_task', taskId: 'task-x', status: 'assigned' },
};

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://logistics.test';
  storage({ [CLE_SLOT]: 'cle-ops-test' });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('REFUS-NOMMÉ — « Créer la course » on an order whose course already lives at Séra', () => {
  it('the 409 order_already_has_task shows the NAMED sentence with the real way out — never « Séra a refusé. Réessayez »', async () => {
    const w = wire([planche, porteCompose(REFUS_COURSE_EXISTANTE)]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    // The compose form is up and the primary action is his to press.
    expect(screen.canPress('Créer la course'), 'the primary action must be present and pressable').toBe(true);

    await screen.press('Créer la course');

    // The port was CALLED — with the console's deterministic command naming
    // this order (call sites, not guards).
    const sent = w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(sent.length, 'the tap never reached the service').toBe(1);
    expect(sent[0]!.body?.['command_id']).toBe('cmd-boutik-tache-ord-refus-1');
    expect(sent[0]!.body?.['orderId']).toBe('ord-refus-1');
    expect(sent[0]!.headers['authorization']).toBe('Bearer cle-ops-test');

    // ⚠ THE FOUNDER'S BANNER, VERBATIM — it must NOT show: « Réessayez » can
    // never fix a refusal that is permanent by design.
    expect(
      screen.shows('Séra a refusé. Réessayez'),
      'the generic banner is the reported bug — the refusal must be NAMED',
    ).toBe(false);

    // The NAMED sentence shows, and it is the way out: the true state, then
    // the REAL control by its on-screen words.
    expect(screen.shows('Cette commande a déjà sa course côté Séra')).toBe(true);
    expect(screen.shows('Retirer cette course')).toBe(true);
    expect(screen.shows('onglet Coursiers')).toBe(true);

    // The tree survived the tap, and nothing trapped him: the fold's title is
    // still there and the action is still pressable.
    expect(screen.shows('Confier à un coursier')).toBe(true);
    expect(screen.canPress('Créer la course')).toBe(true);
    screen.unmount();
  });

  it('every OTHER unnamed refusal keeps the generic banner — nothing else in the mapping moved', async () => {
    wire([planche, porteCompose({ status: 422, json: { ok: false, admitted: false, reason: 'not_funded_for_mode' } })]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    await screen.press('Créer la course');

    expect(screen.shows('Séra a refusé. Réessayez, ou regardez la commande côté Séra.')).toBe(true);
    expect(screen.shows('Cette commande a déjà sa course côté Séra')).toBe(false);
    screen.unmount();
  });
});
