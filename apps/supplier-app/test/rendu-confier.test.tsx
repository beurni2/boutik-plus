import React from 'react';
import { Linking } from 'react-native';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { ConfierCoursier } from '../src/commandes/confier';
import type { PaidOrderRow } from '../src/operations/service';
import type { LivraisonRow } from '../src/operations/dispatch-service';

/**
 * ═══ RENDU-RÉEL — REFUS-NOMMÉ: « Créer la course » stops saying « Réessayez »
 * for a refusal a retry can never fix — AND the way out lives ON THIS SCREEN ═══
 *
 * FOUNDER BUG (2026-08-13, screenshot): « on boutik+ when i tap creer la
 * course to relay a product to a sera rider it is not working » — his banner
 * was « Séra a refusé. Réessayez, ou regardez la commande côté Séra. » That is
 * `confier.refus_generique`, the collapse of every unnamed refusal — and the
 * refusal he hit is NAMED and PERMANENT: `order_already_has_task` (a delivered
 * course's queue row deliberately stays `assigned`; only `/ops/order/retirer`
 * clears it).
 *
 * VERIFIER BLOCKER (same slice, closed here): the first fix pointed him at
 * « Retirer cette course » on the Coursiers tab — a DEAD END for the delivered
 * case, because that tab's course list is built from board.queued (queued-only)
 * + board.assignments (live only), and a DELIVERED course appears in neither.
 * So the way out now renders WITH the refusal: a two-tap « Retirer la course »
 * on this very card, calling the real retire door, then « Créer la course »
 * again — his whole recovery road, walked below end to end.
 *
 ⚠ * CONTRACT-CERTIFIED to the real Worker, both doors:
 * · /ops/task — the 409 bytes are pinned by sera
 *   `services/logistics-service/test/course-livree.e2e.test.ts` (REFUS-NOMMÉ
 *   describe) against the SHIPPED logistics bundle: a compose for an order
 *   whose open task was admitted by a DIFFERENT command answers exactly
 *   409 `{ok:false, reason:'order_already_has_task', taskId, status}`. (The
 *   SAME command replays 200 duplicate while its task is ALIVE; the refusal
 *   road is this one.) The double keeps the door's own bounds — a malformed
 *   compose refuses 400 like `logistics-do.ts` does, never a kinder answer.
 * · /ops/order/retirer — `logistics-do.ts` (PURGE-ESSAI door, ~:1056): body
 *   must carry string `command_id` + `orderId` or 400 `malformed`; idempotency
 *   is by STATE, never by the command — something swept answers
 *   `{ok:true,status:'retire',removed:{…}}`, nothing left (a re-run, an order
 *   the book never knew) answers `{ok:true,status:'inconnu'}`, both 200
 *   (pinned by sera `test/retirer.e2e.test.ts`).
 * · after the retire, the compose road's SAME deterministic command
 *   (`cmd-boutik-tache-${orderId}`) is a FRESH admission, not a duplicate:
 *   `ready-queue.ts` keeps `processedCommandIds` across the purge but its
 *   replay branch answers duplicate only while the admitted task is ALIVE —
 *   swept tasks fall through to re-evaluation (ready-queue.ts, onTaskReady +
 *   the « processedCommandIds IS DELIBERATELY LEFT INTACT » note). The double
 *   answers the published admitted shape `{ok:true,admitted:true,duplicate:
 *   false,taskId}` — modelling the state AFTER the producers' at-least-once
 *   outboxes re-post the two projection facts the retire swept; the unhealed
 *   instant answers 422 projection_stale, whose named sentences are pinned in
 *   their own walks below. While the course still lives on the book the double
 *   answers the certified 409 — never kinder.
 *
 * The four questions, for this road:
 *   · did the tree survive the taps — the fold still renders after 409,
 *     after the retire, after the re-compose
 *   · present AND pressable AND wired — « Retirer la course » exists, arms on
 *     ONE tap sending NOTHING, and its confirm CALLS /ops/order/retirer with
 *     THIS orderId (call sites, not guards)
 *   · a way out when it fails — cancel leaves everything intact; the refusal
 *     sentence names the act
 *   · can he reach the next step — after the retire, « Créer la course » is
 *     still his and the fresh compose admits: he reaches « Choisissez un
 *     coursier libre »
 */

const CLE_SLOT = 'boutik.coursiers.cle';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
function porteCompose(
  reponse: { status: number; json: Record<string, unknown> } | (() => { status: number; json: Record<string, unknown> }),
): Route {
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
    return typeof reponse === 'function' ? reponse() : reponse;
  };
}

/** The CERTIFIED refusal bytes — what sera's door actually sends for a course
 *  already on the book (delivered included), pinned by the e2e named above. */
const REFUS_COURSE_EXISTANTE = {
  status: 409,
  json: { ok: false, reason: 'order_already_has_task', taskId: 'task-x', status: 'assigned' },
};

/**
 * The whole recovery road as ONE stateful book, mirroring the real Worker's
 * state machine (bounds cited in the header): the course lives → compose 409;
 * retire sweeps it (once — a re-run answers `inconnu` by STATE).
 *
 * ⚠ AFTER THE SWEEP, A RE-COMPOSE OF THE SAME ORDER REFUSES — FOR EVER. The
 * retire door deletes the funding and readiness FACTS with the tasks
 * (logistics-do.ts `/ops/order/retirer`), and the producers never re-post a
 * fact their outboxes already delivered (shop-plus order-do.ts's recovery
 * hook re-arms `pending` rows only — a `delivered` row is final). So the
 * real door answers 422 `funding_projection_stale` to every same-order
 * re-compose, and no minute heals it. A double that admitted the re-compose
 * was kinder than the service (§9.8) — this one refuses exactly as the wire
 * does, and the walk ends on the honest terminal: a NEW order is the way to
 * a new delivery, which is what the retiree sentence now says.
 */
function livreSera(): { routes: readonly Route[]; etat: { retiree: boolean } } {
  const etat = { retiree: false };
  const tableau: Route = (path) =>
    path === '/ops/board'
      ? { status: 200, json: { ok: true, board: { queued: [], riders: [], assignments: [] } } }
      : null;
  const compose: Route = porteCompose(() => {
    if (!etat.retiree) return REFUS_COURSE_EXISTANTE;
    // The swept order's facts are GONE and never return: the gate's absent
    // default is stale, and the door says so — the certified 422.
    return { status: 422, json: { ok: false, admitted: false, reason: 'funding_projection_stale' } };
  });
  const retirer: Route = (path, body) => {
    if (path !== '/ops/order/retirer') return null;
    // logistics-do.ts: string command_id + orderId or 400 `malformed` — the
    // command is required for shape-consistency and deliberately unused.
    if (typeof body?.['command_id'] !== 'string' || typeof body?.['orderId'] !== 'string') {
      return { status: 400, json: { ok: false, reason: 'malformed' } };
    }
    // Idempotency by STATE: nothing left — wrong order, or a re-run after the
    // sweep — answers `inconnu` 200, never an error.
    if (body['orderId'] !== ROW.orderId || etat.retiree) {
      return { status: 200, json: { ok: true, status: 'inconnu' } };
    }
    etat.retiree = true;
    return {
      status: 200,
      json: {
        ok: true,
        status: 'retire',
        removed: {
          tasks: 1,
          assignments: 1,
          leases: 1,
          briefs: 0,
          ramassage: 0,
          codesVerification: 0,
          custodyOutbox: 0,
          funding: 1,
          readiness: 1,
        },
      },
    };
  };
  return { routes: [tableau, compose, retirer], etat };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://logistics.test';
  storage({ [CLE_SLOT]: 'cle-ops-test' });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('REFUS-NOMMÉ — « Créer la course » on an order whose course already lives at Séra', () => {
  it('the founder\'s whole recovery road: 409 named → two-tap « Retirer la course » → retirée → « Créer la course » admits', async () => {
    const { routes } = livreSera();
    const w = wire(routes);
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

    // The NAMED sentence shows — the true state, with no state claim a
    // stale-board race could falsify, pointing at the act BELOW it.
    expect(screen.shows('Cette commande a déjà sa course côté Séra')).toBe(true);
    expect(screen.shows('Retirez-la ci-dessous')).toBe(true);

    // ═══ THE WAY OUT IS ON THIS SCREEN (verifier BLOCKER) — the Coursiers
    // list cannot show a delivered course, so the control renders HERE. ═══
    expect(
      screen.canPress('Retirer la course'),
      'the refusal must carry its way out ON THIS SCREEN — the Coursiers list never shows a delivered course',
    ).toBe(true);

    // ONE tap ARMS the question — nothing is sent yet, and the custody bound
    // (« board yes, custody no ») is said before any confirmation exists.
    await screen.press('Retirer la course');
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length, 'arming must send NOTHING').toBe(0);
    expect(screen.shows('Retirer la course de cette commande du tableau Séra ?')).toBe(true);
    expect(screen.shows('La course quitte le tableau Séra')).toBe(true);
    expect(screen.shows('il le garde'), 'the custody bound must be on screen before the tap').toBe(true);

    // CANCEL leaves everything intact: the question folds, the control and the
    // refusal sentence stay, still nothing sent, the primary is still his.
    await screen.press('Annuler');
    expect(screen.shows('Retirer la course de cette commande du tableau Séra ?')).toBe(false);
    expect(screen.canPress('Retirer la course')).toBe(true);
    expect(screen.shows('Cette commande a déjà sa course côté Séra')).toBe(true);
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length, 'cancel must send NOTHING').toBe(0);
    expect(screen.canPress('Créer la course')).toBe(true);

    // Re-arm and CONFIRM: the retire door is CALLED with THIS orderId and a
    // minted (never Math.random, never the compose's deterministic) command.
    await screen.press('Retirer la course');
    await screen.press('Oui, retirer');
    const retires = w.calls.filter((c) => c.path === '/ops/order/retirer' && c.method === 'POST');
    expect(retires.length, 'the confirm never reached the retire door').toBe(1);
    expect(retires[0]!.body?.['orderId']).toBe('ord-refus-1');
    expect(retires[0]!.body?.['command_id'], 'the retire command must be a minted UUID').toMatch(UUID_V4);
    expect(retires[0]!.headers['authorization']).toBe('Bearer cle-ops-test');

    // On `retire`: he is TOLD the truth — the board is clean, and a NEW
    // delivery means a NEW order (the swept facts never return; promising
    // « refaites la course » here was the fiction the audit caught).
    expect(screen.shows('La course est retirée du tableau Séra'), 'the retire outcome must be said to him').toBe(true);
    expect(screen.shows('créez une nouvelle commande'), 'the way forward is a NEW order, and the sentence says so').toBe(true);
    expect(screen.shows('Cette commande a déjà sa course côté Séra')).toBe(false);
    expect(screen.canPress('Créer la course'), 'the tree survives — the primary action is never stranded').toBe(true);

    // And if he taps it anyway, the REAL door's answer (the certified 422 —
    // the swept facts are gone for ever) reaches him as the NAMED sentence,
    // never the generic banner: honest at every layer of the road.
    await screen.press('Créer la course');
    const reSent = w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(reSent.length).toBe(2);
    expect(reSent[1]!.body?.['command_id']).toBe('cmd-boutik-tache-ord-refus-1');
    expect(screen.shows('pas encore reçu le paiement'), 'the named projection sentence, never the generic banner').toBe(true);
    expect(screen.shows('Séra a refusé. Réessayez')).toBe(false);
    screen.unmount();
  });

  it('the `inconnu` answer converges to the same good road — a retire that finds nothing is never an error', async () => {
    // The state where nothing remains for the order (a previous retire already
    // landed, or the book never knew it): the door answers `inconnu` by STATE.
    const retirerInconnu: Route = (path, body) =>
      path === '/ops/order/retirer'
        ? typeof body?.['command_id'] === 'string' && typeof body?.['orderId'] === 'string'
          ? { status: 200, json: { ok: true, status: 'inconnu' } }
          : { status: 400, json: { ok: false, reason: 'malformed' } }
        : null;
    const w = wire([planche, porteCompose(REFUS_COURSE_EXISTANTE), retirerInconnu]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    await screen.press('Créer la course');
    await screen.press('Retirer la course');
    await screen.press('Oui, retirer');

    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length).toBe(1);
    // Same convergence as `retire`: told plainly, no error sentence, his re-tap ready.
    expect(screen.shows('La course est retirée')).toBe(true);
    expect(screen.shows("n'a pas été retirée"), '`inconnu` is convergence, never a failure').toBe(false);
    expect(screen.shows('Séra ne répond pas')).toBe(false);
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

  it('`funding_projection_stale` reaches ITS named sentence — a key swap goes red here', async () => {
    wire([planche, porteCompose({ status: 422, json: { ok: false, admitted: false, reason: 'funding_projection_stale' } })]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    await screen.press('Créer la course');

    expect(screen.shows('pas encore reçu le paiement de cette commande'), 'the funding refusal must be NAMED').toBe(true);
    expect(screen.shows('colis prêt')).toBe(false);
    expect(screen.shows('Séra a refusé. Réessayez')).toBe(false);
    // The retire act belongs to `order_already_has_task` ALONE — a projection
    // refusal heals by waiting, and offering a destructive act for it would
    // invite him to destroy a course that does not exist.
    expect(screen.canPress('Retirer la course')).toBe(false);
    screen.unmount();
  });

  it('`readiness_projection_stale` reaches ITS named sentence — a key swap goes red here', async () => {
    wire([planche, porteCompose({ status: 422, json: { ok: false, admitted: false, reason: 'readiness_projection_stale' } })]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    await screen.press('Créer la course');

    expect(screen.shows('colis prêt'), 'the readiness refusal must be NAMED').toBe(true);
    expect(screen.shows('pas encore reçu le paiement de cette commande')).toBe(false);
    expect(screen.shows('Séra a refusé. Réessayez')).toBe(false);
    expect(screen.canPress('Retirer la course')).toBe(false);
    screen.unmount();
  });
});

/* ═══ GEO-ACHAT-2 — HER POSITION ON HIS FOLD, DRIVEN (founder, 2026-08-31:
 * « make the buyer's live position given appear so I can see it before
 * relaying to rider ») ═══
 * The phone-only order arrives with a pin and an EMPTY quartier/repère —
 * the fold must show her position (coordinates + « Voir sur la carte »,
 * dialling his maps app on her exact bytes) and the relay road must remain
 * REACHABLE: the zone falls back to the order's own zoneTo and the repère
 * input is his to type. Display-only by design — her pin never auto-rides
 * the Séra brief (GEO-SERA-1, on his word). */

describe('GEO-ACHAT-2 — the buyer\'s position on the compose fold', () => {
  const BUYER_PIN: LivraisonRow = {
    orderId: 'ord-refus-1',
    state: 'paid',
    createdAt: '2026-08-13T09:00:00.000Z',
    contact: { phone: '70 00 00 00', quartier: '', repere: '', pin: { lat: 12.371532, lng: -1.519931, accuracy: 12 } },
    productVersionId: 'pv-1',
    zoneTo: 'Ouagadougou',
  };

  it('her pin renders in its own read-only section, and « Voir sur la carte » opens his maps app on the exact coordinates', async () => {
    const { routes } = livreSera();
    wire(routes);
    const avant = Linking.opened.length;
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    expect(screen.shows('Sa position GPS'), 'the position section must be present').toBe(true);
    expect(screen.shows('12.371532, -1.519931 · ±12 m'), 'the coordinates must be spoken exactly').toBe(true);
    expect(screen.canPress('Voir sur la carte'), 'the map act must be pressable').toBe(true);

    await screen.press('Voir sur la carte');
    expect(Linking.opened.slice(avant)).toEqual(['https://www.google.com/maps?q=12.371532,-1.519931']);

    // The relay stays REACHABLE on a phone-only order: nothing dead-ends.
    // The zone input is prefilled from the order's own zoneTo, the repère is
    // his to transcribe, and the primary action stands.
    expect(screen.canPress('Créer la course')).toBe(true);
    screen.unmount();
  });

  it('no pin, no section — and nothing else on the fold moved', async () => {
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();
    expect(screen.shows('Sa position GPS')).toBe(false);
    expect(screen.canPress('Créer la course')).toBe(true);
    screen.unmount();
  });
});
