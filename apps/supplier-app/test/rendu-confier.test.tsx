import React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
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

/** The buyer GAVE her quartier and repère: the quartier fills the read-only
 *  zone row and her repère rides the brief unseen (CONFIER-AUTO) — the
 *  founder's exact one-tap road. */
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
    ? { status: 200, json: { ok: true, board: { queued: [], riders: [], assignments: [], aReprogrammer: [], enDeuxiemePassage: [], manifestes: {}, finDeService: {}, colisEnCourse: {} } } }
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
      ? { status: 200, json: { ok: true, board: { queued: [], riders: [], assignments: [], aReprogrammer: [], enDeuxiemePassage: [], manifestes: {}, finDeService: {}, colisEnCourse: {} } } }
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
  it('the founder\'s whole recovery road: 409 named → two-tap « Retirer la course » → retirée, and the fold says the order can no longer be sent from here', async () => {
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

    // The NAMED sentence shows — the true state, pointing at the act BELOW
    // it, and (AUDIT-B+2 F-63) promising nothing the retire cannot deliver:
    // the old « puis créez la course à nouveau » could never come true.
    expect(screen.shows('Cette commande a déjà une course côté Séra')).toBe(true);
    expect(screen.shows('ci-dessous')).toBe(true);
    expect(screen.shows('à nouveau'), 'the sentence must not promise a re-creation the retire makes impossible').toBe(false);

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
    // F-63: the question says the order cannot be sent again from here.
    expect(screen.shows('ne pourra plus être confiée à un coursier depuis ici'), 'the cost is said BEFORE the tap').toBe(true);
    // F-65: the ONE custody sentence, true to what Séra does — never « va
    // jusqu'au bout » (the rider's course leaves his app).
    expect(screen.shows('il ne pourra plus le livrer'), 'the custody bound must be on screen before the tap').toBe(true);
    expect(screen.shows("va jusqu'au bout"), 'the old sentence contradicted what Séra does').toBe(false);

    // CANCEL leaves everything intact: the question folds, the control and the
    // refusal sentence stay, still nothing sent, the primary is still his.
    await screen.press('Annuler');
    expect(screen.shows('Retirer la course de cette commande du tableau Séra ?')).toBe(false);
    expect(screen.canPress('Retirer la course')).toBe(true);
    expect(screen.shows('Cette commande a déjà une course côté Séra')).toBe(true);
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

    // On `retire`: he is TOLD the truth (AUDIT-B+2 F-63). The swept facts
    // never return, so the order cannot be sent to a rider again from here —
    // and he cannot « créer une nouvelle commande » either (orders come from
    // buyers). The road ENDS, said plainly: no « Créer la course » is left
    // to lead him into « Réessayez dans une minute » for ever.
    expect(screen.shows('La course est retirée du tableau Séra'), 'the retire outcome must be said to him').toBe(true);
    expect(screen.shows('ne peut plus être confiée à un coursier depuis ici'), 'the end of the road is said').toBe(true);
    expect(screen.shows('créez une nouvelle commande'), 'he cannot create an order — the old sentence sent him nowhere').toBe(false);
    expect(screen.shows('Cette commande a déjà une course côté Séra')).toBe(false);
    expect(screen.canPress('Créer la course'), 'a compose the door refuses for ever must not be offered').toBe(false);
    expect(screen.shows('Confier à un coursier'), 'the tree survives the retire').toBe(true);
    expect(w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST').length).toBe(1);
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
    // Same convergence as `retire`: told plainly, no error sentence, and the
    // same honest end of the road.
    expect(screen.shows('La course est retirée')).toBe(true);
    expect(screen.shows("n'a pas été retirée"), '`inconnu` is convergence, never a failure').toBe(false);
    expect(screen.shows('Séra ne répond pas')).toBe(false);
    expect(screen.canPress('Créer la course')).toBe(false);
    screen.unmount();
  });

  it('every OTHER unnamed refusal keeps the generic banner — nothing else in the mapping moved', async () => {
    // any refusal the console does not name — one the real door gives (the recordings)
    wire([planche, porteCompose({ status: 422, json: { ok: false, admitted: false, reason: 'colis_fournisseurs_differents' } })]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    await screen.press('Créer la course');

    expect(screen.shows('Séra a refusé. Réessayez, ou regardez la commande côté Séra.')).toBe(true);
    expect(screen.shows('Cette commande a déjà une course côté Séra')).toBe(false);
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

/* ═══ AUDIT-B+2 F-62 — « déjà lancée », naming the rider ═══
 * The fold read the board's QUEUE only. A course a rider already carries is
 * not queued, so the fold offered « Créer la course »; Séra answered the
 * replay as a 200 duplicate and the fold landed back on the same button with
 * no sentence — the « déjà lancée » state was rendered and never set. The
 * board's live assignments (certified form: Séra's recorded `/ops/board`)
 * now decide it, and the rider is named by the name Séra gives him. */

const RIDER_ISSOUF = {
  assignable: false,
  certified: true,
  displayName: 'Issouf',
  phoneAlias: 'alias-issouf',
  privacyAck: { ackAt: '2026-09-30T07:00:00.000Z', noticeVersion: 'privacy-notice.v1' },
  riderId: 'rider-issouf',
  shift: { confirmedBy: 'server', startedAt: '2026-09-30T07:00:05.000Z', status: 'on_shift' },
};
function affectationDe(orderId: string, assignmentId = 'asg-1'): Record<string, unknown> {
  return {
    ackDeadline: '2026-09-30T09:10:00.000Z',
    assignedAt: '2026-09-30T09:00:00.000Z',
    assignmentId,
    correlationId: `corr-${assignmentId}`,
    dispatcherId: 'fondateur',
    lease: { riderId: 'rider-issouf', taskId: 'task-live', version: 1 },
    orderId,
    riderId: 'rider-issouf',
    status: 'acknowledged',
    taskId: 'task-live',
  };
}
function plancheEnCourse(assignments: unknown[], colisEnCourse: Record<string, unknown> = {}): Route {
  return (path) =>
    path === '/ops/board'
      ? { status: 200, json: { ok: true, board: { queued: [], riders: [RIDER_ISSOUF], assignments, aReprogrammer: [], enDeuxiemePassage: [], manifestes: {}, finDeService: {}, colisEnCourse } } as never }
      : null;
}

describe('F-62 — a course a rider already carries reads « déjà lancée », with his name', () => {
  it('no « Créer la course », one sentence naming the rider, and nothing is sent', async () => {
    const w = wire([plancheEnCourse([affectationDe(ROW.orderId)]), porteCompose({ status: 200, json: { ok: true, admitted: true, duplicate: true, taskId: 'task-live' } })]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    expect(screen.shows('Cette course est déjà lancée côté Séra'), 'the state must be SET, not only rendered').toBe(true);
    expect(screen.shows('Issouf'), 'the rider is named by the name Séra gives him').toBe(true);
    expect(screen.canPress('Créer la course'), 'a second compose of a carried course is never offered').toBe(false);
    expect(w.calls.filter((c) => c.path === '/ops/task').length).toBe(0);
    screen.unmount();
  });

  it('an article of a carried PACKAGE reads the same — Séra names every article of the bag', async () => {
    const PACKAGE_MATE: PaidOrderRow = { ...ROW, orderId: 'ord-colis-b', colis: { packageId: 'col-1', orderIds: ['ord-colis-a', 'ord-colis-b'] } } as PaidOrderRow;
    wire([plancheEnCourse([affectationDe('ord-colis-a', 'asg-c')], { 'asg-c': { orderIds: ['ord-colis-a', 'ord-colis-b'], packageId: 'col-1', reglement: {} } })]);
    const screen = await mountEcran(<ConfierCoursier row={PACKAGE_MATE} buyer={{ ...BUYER, orderId: 'ord-colis-b' }} />);
    await screen.settle();

    expect(screen.shows('Cette course est déjà lancée côté Séra')).toBe(true);
    expect(screen.shows('Issouf')).toBe(true);
    expect(screen.canPress('Créer la course')).toBe(false);
    screen.unmount();
  });

  it('F-64 on the fold: a retire refused `colis_en_course` is SAID and the board is read again — never « Réessayez »', async () => {
    // The fold saw no live course; the compose hit an existing one; by the
    // retire tap a rider had taken the bag. The door refuses one article of
    // a carried bag by name (recorded form), and the re-read shows who has it.
    let enCourse = false;
    const board: Route = (path) =>
      path === '/ops/board'
        ? enCourse
          ? plancheEnCourse([affectationDe(ROW.orderId, 'asg-c')], { 'asg-c': { orderIds: [ROW.orderId, 'ord-mate'], packageId: 'col-1', reglement: {} } })(path, null, new URLSearchParams(), {})
          : planche(path, null, new URLSearchParams(), {})
        : null;
    const retirer: Route = (path, body) => {
      if (path !== '/ops/order/retirer') return null;
      if (typeof body?.['command_id'] !== 'string' || typeof body?.['orderId'] !== 'string') {
        return { status: 400, json: { ok: false, reason: 'malformed' } };
      }
      enCourse = true;
      return { status: 409, json: { ok: false, reason: 'colis_en_course', orderIds: [ROW.orderId, 'ord-mate'] } };
    };
    const w = wire([board, porteCompose(REFUS_COURSE_EXISTANTE), retirer]);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    await screen.press('Créer la course');
    await screen.press('Retirer la course');
    await screen.press('Oui, retirer');
    expect(w.calls.filter((c) => c.path === '/ops/order/retirer').length).toBe(1);
    expect(screen.shows("n'a pas été retirée. Réessayez"), 'a named refusal is not a failure to retry').toBe(false);
    expect(screen.shows('un coursier a pris ce colis'), 'the refusal is named').toBe(true);
    expect(screen.shows('Cette course est déjà lancée côté Séra'), 'the board, read again, says who has it').toBe(true);
    expect(screen.shows('Issouf')).toBe(true);
    screen.unmount();
  });
});

/* ═══ CONFIER-AUTO — HER DATA RIDES BY ITSELF (founder, 2026-08-31: « on
 * boutik+ i do not see the live localization, and remove the GPS section and
 * the repere section there ») ═══
 * The fold no longer renders a Point GPS input, a « Sa position GPS » display
 * or a repère section. Her confirmed pin rides the brief as {lat, lng} on its
 * own — GEO-SERA-1's fallback is now the ONLY road — and the brief's landmark
 * is her TYPED repère first, then honest words for a voice note or a bare
 * point: canon's `Location.landmark` is trimmed NON-EMPTY (kernel-types
 * location.ts), and a fabricated place name must never stand in for it. An
 * order carrying none of the three refuses BEFORE the wire, with a sentence
 * that says what to do — never « remplissez chaque champ » over a fold that
 * has no such field. */

describe('CONFIER-AUTO — the fold without the GPS and repère sections', () => {
  const BUYER_PIN: LivraisonRow = {
    orderId: 'ord-refus-1',
    state: 'paid',
    createdAt: '2026-08-13T09:00:00.000Z',
    contact: { phone: '70 00 00 00', quartier: '', repere: '', pin: { lat: 12.371532, lng: -1.519931, accuracy: 12 } },
    productVersionId: 'pv-1',
    zoneTo: 'Ouagadougou',
  };

  it('the removed sections STAY gone — no pin input, no coordinate text, no repère — and the primary action still stands', async () => {
    // CONFIER-CARTE later gave her point back as a MAP CARD (walked in its
    // own describe below) — the TYPED sections and the coordinate text his
    // order removed must never return.
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    expect(screen.shows('Sa position GPS'), 'the coordinate display was removed by his order').toBe(false);
    expect(screen.shows('Point GPS'), 'the pin input was removed by his order').toBe(false);
    expect(screen.shows('Repère'), 'the repère section was removed by his order').toBe(false);
    expect(screen.canPress('Créer la course'), 'the primary action must survive the removals').toBe(true);
    screen.unmount();
  });

  it('pin-only: one tap — her pin rides as exact {lat, lng}, no accuracy octets, and the landmark says the truth about it', async () => {
    const { routes } = livreSera();
    const w = wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    // No typing anywhere: the zone fell back to the order's own zoneTo and
    // everything else is hers — the founder's whole act is ONE tap.
    await screen.press('Créer la course');

    const sent = w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(sent.length, 'the relay never reached the service').toBe(1);
    const corps = sent[0]!.body as Record<string, unknown>;
    const lieu = corps['location'] as Record<string, unknown>;
    expect(lieu['zone']).toBe('Ouagadougou');
    // Canon's landmark is trimmed non-empty — with neither her words nor a
    // note, the honest sentence about her point stands in, never a fiction.
    expect(lieu['landmark']).toBe('Point GPS confirmé par la cliente');
    // Her bytes exactly — and ONLY {lat, lng}: the accuracy stays behind
    // (the brief's pin is canon's own shape).
    expect(lieu['pin']).toEqual({ lat: 12.371532, lng: -1.519931 });
    expect(JSON.stringify(corps)).not.toContain('accuracy');
    screen.unmount();
  });

  it('voice-only: the landmark points the rider at her note, and the note itself rides beside it', async () => {
    const BUYER_VOIX: LivraisonRow = {
      ...BUYER_PIN,
      contact: {
        phone: '70 00 00 00',
        quartier: 'Zogona',
        repere: '',
        audioRef: 'media/0f0e0d0c-0b0a-4908-8706-050403020100',
      },
    };
    const { routes } = livreSera();
    const w = wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_VOIX} />);
    await screen.settle();

    await screen.press('Créer la course');

    const sent = w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(sent.length).toBe(1);
    const corps = sent[0]!.body as Record<string, unknown>;
    const lieu = corps['location'] as Record<string, unknown>;
    expect(lieu['landmark']).toBe('Repère donné en note vocale');
    expect(corps['repereAudioRef'], 'the note must ride the brief the landmark points at').toBe(
      'media/0f0e0d0c-0b0a-4908-8706-050403020100',
    );
    expect('pin' in lieu, 'an absent pin stays ABSENT — never a zeroed coordinate').toBe(false);
    expect(lieu['zone']).toBe('Zogona, Ouagadougou');
    screen.unmount();
  });

  it('her TYPED repère leads: it is the landmark byte for byte, unseen on the fold, and her pin and note ride beside it', async () => {
    const BUYER_TOUT: LivraisonRow = {
      ...BUYER_PIN,
      contact: {
        phone: '70 00 00 00',
        quartier: 'Zogona',
        repere: "À l'échangeur, portail vert",
        pin: { lat: 12.371532, lng: -1.519931, accuracy: 12 },
        audioRef: 'media/0f0e0d0c-0b0a-4908-8706-050403020100',
      },
    };
    const { routes } = livreSera();
    const w = wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_TOUT} />);
    await screen.settle();

    // The repère section is gone: her words ride WITHOUT rendering.
    expect(screen.shows("À l'échangeur, portail vert")).toBe(false);
    await screen.press('Créer la course');

    const sent = w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(sent.length).toBe(1);
    const corps = sent[0]!.body as Record<string, unknown>;
    const lieu = corps['location'] as Record<string, unknown>;
    expect(lieu['landmark'], 'SE0.3 — her own words lead everything else').toBe("À l'échangeur, portail vert");
    expect(lieu['pin']).toEqual({ lat: 12.371532, lng: -1.519931 });
    expect(corps['repereAudioRef']).toBe('media/0f0e0d0c-0b0a-4908-8706-050403020100');
    screen.unmount();
  });

  it('no pin anywhere: the brief still carries NO pin key (absence stays representable)', async () => {
    const { routes } = livreSera();
    const w = wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    await screen.press('Créer la course');

    const sent = w.calls.filter((c) => c.path === '/ops/task' && c.method === 'POST');
    expect(sent.length).toBe(1);
    const lieu = (sent[0]!.body as Record<string, unknown>)['location'] as Record<string, unknown>;
    expect('pin' in lieu, 'an absent pin stays ABSENT — never a zeroed coordinate').toBe(false);
    expect(lieu['landmark']).toBe("À l'échangeur, portail vert");
    screen.unmount();
  });

  /* ═══ CONFIER-CARTE (founder, 2026-08-31: « i want the pin localization on
   * the map displayed so i can know the buyer's location before relaying to
   * the rider »; 2026-09-01: « make slidable and zoomable ») ═══
   * Her confirmed point renders as a slippy map card on the composer face:
   * OpenStreetMap tiles around the view centre (opening at z16 on her pin —
   * every world pixel and tile number below was computed independently for
   * the fixture's coordinates and pinned as literals), the épingle glued to
   * HER GROUND (never to the frame), +/− zoom steps, « Recentrer » back to
   * her point, the credit riding the view. Nothing on any wire moved:
   * CONFIER-AUTO's auto-ride is walked above and stays the only road. */

  const tuilesVisibles = (screen: Screen): string[] =>
    screen.images().filter((u) => u.startsWith('https://tile.openstreetmap.org/'));

  /** The pin's COMPUTED anchor (marginLeft = its view offset − half the
   *  glyph). A number the app derived, read like `images()` reads computed
   *  URIs — it says where the app ANCHORED the pin, and claims nothing
   *  about rendered pixels (the walks' appearance bound holds). */
  const ancreEpingle = (screen: Screen): number => {
    const ep = screen.tree.root.findAll((n) => n.props['testID'] === 'carte-epingle')[0];
    expect(ep, 'the pin must be mounted').toBeDefined();
    return (ep!.props['style'] as { marginLeft: number }).marginLeft;
  };

  /** Drive the REAL responder handlers on the map's drag surface — the same
   *  props the finger reaches; no app code is stubbed. */
  const glisserCarte = async (
    screen: Screen,
    de: { x: number; y: number },
    vers: { x: number; y: number },
  ): Promise<void> => {
    const toile = screen.tree.root.findAll((n) => n.props['testID'] === 'carte-toile')[0];
    expect(toile, 'the drag surface must be mounted').toBeDefined();
    const ev = (x: number, y: number) => ({ nativeEvent: { pageX: x, pageY: y } });
    const sur = (nom: string, e: unknown): void => {
      (toile!.props[nom] as (e: unknown) => void)(e);
    };
    await act(async () => {
      sur('onResponderGrant', ev(de.x, de.y));
    });
    await act(async () => {
      sur('onResponderMove', ev(vers.x, vers.y));
    });
    await act(async () => {
      sur('onResponderRelease', ev(vers.x, vers.y));
    });
    await screen.settle();
  };

  it('CONFIER-CARTE — her pin renders as a MAP: the tiles derive from HER coordinates, and every control stands', async () => {
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    expect(screen.shows('Sa position'), 'the map card must carry its label').toBe(true);
    // The © glyph is banned from app chrome (WO-6.0 ruling ①); OSM's policy
    // requires a clearly visible credit, not the sign — the words carry it.
    expect(screen.shows('Cartes OpenStreetMap'), "OSM's attribution must ride the view").toBe(true);
    // The CENTRE tile for {12.371532, -1.519931} at z16 — computed off-line
    // from the Mercator forward, pinned as a literal so a broken projection
    // (wrong zoom, wrong axis, degrees/radians slip) goes red HERE. The full
    // window (±215×±100 plus the drag ring) is twenty tiles.
    const tuiles = tuilesVisibles(screen);
    expect(tuiles, 'the card must actually ask for tiles').toContain('https://tile.openstreetmap.org/16/32491/30498.png');
    expect(new Set(tuiles).size).toBe(20);
    // The controls are present AND pressable; the primary action stands.
    expect(screen.canPress('+')).toBe(true);
    expect(screen.canPress('−')).toBe(true);
    expect(screen.canPress('Recentrer')).toBe(true);
    expect(screen.canPress('Créer la course'), 'the tree must survive the map card').toBe(true);
    screen.unmount();
  });

  it('CONFIER-CARTE — « + » and « − » really zoom, and the range is BOUNDED at z13 and z19', async () => {
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    // One step in: z17 tiles on her point, no z16 tile left on screen.
    await screen.press('+');
    expect(tuilesVisibles(screen)).toContain('https://tile.openstreetmap.org/17/64982/60996.png');
    expect(tuilesVisibles(screen).some((u) => u.includes('/16/'))).toBe(false);
    // Up to the z19 CEILING (OSM's deepest tile)…
    await screen.press('+');
    await screen.press('+');
    expect(tuilesVisibles(screen)).toContain('https://tile.openstreetmap.org/19/259930/243984.png');
    // …where one more press changes nothing: an escaped ceiling would fetch
    // nonexistent z20 tiles, every one 404s, and the card would go blank
    // (verifier MINOR — the ceiling was unwalked and its mutation survived).
    await screen.press('+');
    expect(tuilesVisibles(screen)).toContain('https://tile.openstreetmap.org/19/259930/243984.png');
    expect(tuilesVisibles(screen).some((u) => u.includes('/20/'))).toBe(false);
    // Back down, past the start, to the z13 floor…
    for (let i = 0; i < 6; i += 1) await screen.press('−');
    expect(tuilesVisibles(screen)).toContain('https://tile.openstreetmap.org/13/4061/3812.png');
    // …where one MORE press changes nothing: the floor holds.
    await screen.press('−');
    expect(tuilesVisibles(screen)).toContain('https://tile.openstreetmap.org/13/4061/3812.png');
    expect(tuilesVisibles(screen).some((u) => u.includes('/12/'))).toBe(false);
    expect(screen.canPress('Créer la course'), 'the tree survives the whole zoom road').toBe(true);
    screen.unmount();
  });

  it('CONFIER-CARTE — the map SLIDES: the committed view moves by the drag, and « Recentrer » returns to her point', async () => {
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    // Drag the map west by 300 dp and north by 60: the centre commits east/
    // south (the SUBTRACTED offset — the buyer module's sign law), so the
    // window slides one column east: 32494 arrives, 32489 leaves.
    expect(ancreEpingle(screen), 'the pin opens ON her point (offset 0 − half the glyph)').toBe(-18);
    await glisserCarte(screen, { x: 200, y: 100 }, { x: -100, y: 40 });
    const apres = tuilesVisibles(screen);
    expect(apres, 'the new east edge must be fetched').toContain('https://tile.openstreetmap.org/16/32494/30498.png');
    expect(apres.some((u) => u.includes('/16/32489/')), 'the old west edge must be gone').toBe(false);
    // GLUED TO THE GROUND, proven at the screen: after the (-300, ·) drag
    // the app anchors the pin exactly 300 dp west of the new centre.
    expect(Math.round(ancreEpingle(screen))).toBe(-318);
    // « Recentrer » brings the view back to HER pin at the SAME zoom: the
    // original window returns exactly, the pin back on its point.
    await screen.press('Recentrer');
    const retour = tuilesVisibles(screen);
    expect(retour).toContain('https://tile.openstreetmap.org/16/32489/30498.png');
    expect(retour.some((u) => u.includes('/16/32494/'))).toBe(false);
    expect(ancreEpingle(screen)).toBe(-18);
    expect(screen.canPress('Créer la course'), 'the tree survives the slide and the return').toBe(true);
    screen.unmount();
  });

  it('CONFIER-CARTE — the map moves UNDER the finger: the live translate follows the move, then clears on commit', async () => {
    // Verifier MINOR: severing the move-time translate left every walk
    // green while the map would only JUMP on release. The inner container's
    // computed transform is the probe (a number the app derived).
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    const toile = screen.tree.root.findAll((n) => n.props['testID'] === 'carte-toile')[0]!;
    const ev = (x: number, y: number) => ({ nativeEvent: { pageX: x, pageY: y } });
    const transforme = (): { translateX: number; translateY: number } => {
      const monde = screen.tree.root.findAll((n) => n.props['testID'] === 'carte-monde')[0]!;
      const tr = (monde.props['style'] as { transform: [{ translateX: number }, { translateY: number }] }).transform;
      return { translateX: tr[0].translateX, translateY: tr[1].translateY };
    };
    await act(async () => {
      (toile.props['onResponderGrant'] as (e: unknown) => void)(ev(200, 100));
    });
    await act(async () => {
      (toile.props['onResponderMove'] as (e: unknown) => void)(ev(120, 60));
    });
    expect(transforme(), 'mid-drag, the world must have FOLLOWED the finger').toEqual({ translateX: -80, translateY: -40 });
    await act(async () => {
      (toile.props['onResponderRelease'] as (e: unknown) => void)(ev(120, 60));
    });
    await screen.settle();
    expect(transforme(), 'on commit the translate clears — the new centre carries the offset instead').toEqual({
      translateX: 0,
      translateY: 0,
    });
    expect(Math.round(ancreEpingle(screen)), 'and the pin holds its ground through the commit').toBe(-98);
    screen.unmount();
  });

  it('CONFIER-CARTE — a tap is not a drag: a press that never moved (< 4 dp) commits nothing', async () => {
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    const avant = [...new Set(tuilesVisibles(screen))].sort();
    await glisserCarte(screen, { x: 200, y: 100 }, { x: 202, y: 101 });
    expect([...new Set(tuilesVisibles(screen))].sort(), 'a 2 dp press must move NOTHING').toEqual(avant);
    // Tile sets cannot see a 2 dp shift — the pin's computed anchor can:
    // a severed threshold would commit the micro-drag and anchor the pin
    // 2 dp off its point (this exact mutation survived the tile assert).
    expect(ancreEpingle(screen), 'the centre must not have moved AT ALL').toBe(-18);
    screen.unmount();
  });

  it('CONFIER-CARTE — a tile that dies leaves the calm ground, and the fold stays his: the tree survives, the relay stands', async () => {
    // RENDU-RÉEL question three: the tile load fires by itself — its failure
    // must leave a way out. The vignette discipline hides THAT url; the rest
    // of the card and the primary action stand untouched.
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_PIN} />);
    await screen.settle();

    const avant = tuilesVisibles(screen);
    expect(avant.length).toBe(20);
    await screen.imageError(0);

    const apres = tuilesVisibles(screen);
    expect(apres.length, 'the dead tile must be hidden, not left as a broken glyph').toBe(19);
    expect(apres).not.toContain(avant[0]!);
    expect(apres, 'the other tiles must survive their neighbour').toContain('https://tile.openstreetmap.org/16/32491/30498.png');
    expect(screen.shows('Sa position'), 'the card itself must survive').toBe(true);
    expect(screen.canPress('Créer la course'), 'the tree must survive a dead tile').toBe(true);
    screen.unmount();
  });

  it('CONFIER-CARTE — no pin, no map: the card never renders over an order that gave no point', async () => {
    const { routes } = livreSera();
    wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER} />);
    await screen.settle();

    expect(screen.shows('Sa position')).toBe(false);
    expect(
      screen.images().filter((u) => u.startsWith('https://tile.openstreetmap.org/')).length,
      'no point ⇒ no tile is ever fetched',
    ).toBe(0);
    expect(screen.canPress('Créer la course')).toBe(true);
    screen.unmount();
  });

  it('neither words, nor note, nor point: the compose refuses BEFORE the wire, saying what to do — and the tree survives', async () => {
    const BUYER_RIEN: LivraisonRow = {
      ...BUYER_PIN,
      contact: { phone: '70 00 00 00', quartier: 'Zogona', repere: '' },
    };
    const { routes } = livreSera();
    const w = wire(routes);
    const screen = await mountEcran(<ConfierCoursier row={ROW} buyer={BUYER_RIEN} />);
    await screen.settle();

    await screen.press('Créer la course');

    // Nothing left the device: canon's landmark is non-empty, and no honest
    // sentence exists for an order that gave nothing at all.
    expect(w.calls.filter((c) => c.path === '/ops/task').length, 'the refusal must happen BEFORE the wire').toBe(0);
    // Wording that survives the loading race (the fold can mount before her
    // row lands): retry first, then the human way forward — never an absolute
    // claim the screen cannot yet know.
    expect(screen.shows('demandez un repère à la cliente'), 'the sentence must say the way forward').toBe(true);
    expect(screen.canPress('Créer la course'), 'the tree survives — his retry stays his').toBe(true);
    screen.unmount();
  });
});
