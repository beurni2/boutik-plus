import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { AppV2 } from '../src/v2/AppV2';
import { poserActe } from '../src/colis-perdu/acte';

/**
 * ═══ RENDU-RÉEL — « Colis perdu en route », on the REAL console root ═══
 *
 * Only the founder declares a parcel lost on the road, from Opérations,
 * beside the SOS alerts, and only while a rider holds it (Sera-Build-Spec
 * §6.5, canon 3.28.0). This walk mounts the real AppV2, opens Opérations, and
 * answers Séra's board with forms its own suite recorded.
 *
 * « Holds it » is custody's own word on the board: the rider's manifest reads
 * `coursier` for every order of the course. An accepted course whose parcel
 * is still at the stall is « confiée » and is NOT his to lose.
 *
 * Bound: nothing here claims how anything LOOKS.
 */

const SERA_BASE = 'http://sera.test';
const CLE_SERA = 'boutik.coursiers.cle';
const OPS = 'cle-ops-fondateur';
const T = '2026-11-27T09:00:00.000Z';

const TITRE = 'Colis perdu en route';
const DECLARER = 'Déclarer ce colis perdu';

function porteOuverte(): void {
  (globalThis as { window?: unknown }).window = { location: { hash: '#operateur' } };
}

const rider = (riderId: string, displayName: string) => ({
  riderId,
  displayName,
  phoneAlias: '70 00 00 00',
  certified: true,
  assignable: false,
  shift: { status: 'on_shift', startedAt: T, confirmedBy: 'founder' },
  privacyAck: { ackAt: T, noticeVersion: 'v1' },
});

const assignment = (orderId: string, riderId: string) => ({
  assignmentId: `asg-${orderId}`,
  taskId: `task-${orderId}`,
  orderId,
  riderId,
  status: 'acknowledged',
  assignedAt: T,
  ackDeadline: T,
  correlationId: `corr-${orderId}`,
  dispatcherId: 'founder',
  lease: { riderId, taskId: `task-${orderId}`, version: 1 },
});

const manifeste = (riderId: string, orderId: string, reading: 'coursier' | 'ailleurs' | 'inconnue') => ({
  id: `man-${riderId}`,
  riderId,
  version: reading === 'coursier' ? 2 : 1,
  orderedStops: [reading === 'coursier' ? `livraison-asg-${orderId}` : `ramassage-asg-${orderId}`],
  custodyInventory: reading === 'coursier' ? [`pkg-${orderId}`] : [],
  status: 'active',
  stops: [
    {
      stopId: reading === 'coursier' ? `livraison-asg-${orderId}` : `ramassage-asg-${orderId}`,
      kind: reading === 'coursier' ? 'livraison' : 'ramassage',
      assignmentId: `asg-${orderId}`,
      taskId: `task-${orderId}`,
      orderId,
    },
  ],
  currentStop: null,
  custodyReadings: [{ orderId, reading, asOf: reading === 'inconnue' ? null : T }],
});

/** Séra's board with one live course per row, each rider's manifest as custody last said. */
function planche(lignes: { orderId: string; riderId: string; nom: string; reading: 'coursier' | 'ailleurs' | 'inconnue' }[]) {
  return {
    ok: true,
    board: {
      queued: [],
      riders: lignes.map((l) => rider(l.riderId, l.nom)),
      assignments: lignes.map((l) => assignment(l.orderId, l.riderId)),
      aReprogrammer: [],
      enDeuxiemePassage: [],
      manifestes: Object.fromEntries(lignes.map((l) => [l.riderId, manifeste(l.riderId, l.orderId, l.reading)])),
      finDeService: {},
      colisEnCourse: {},
    },
  };
}

/**
 * The SOS strip reads `/ops/sos` on every boot, and Séra's alerts section
 * reads `/ops/alertes` on Opérations; neither read is this walk's subject, so
 * each meets a network fault (the network's word, not Séra's).
 *
 * The declare door has no recorded answer yet. `porte` is the network's fault
 * (no answer, a stall, a body that is not JSON) or one of the door's answers
 * in the exact form Séra gives it; each of those answers is also walked on
 * the real Séra Workers in `rendu-colis-perdu.e2e.test.tsx`. Everything else
 * goes to the recorded stand-in.
 *
 * `tenir` holds every board read made while it is set, each until its own
 * release, so a walk can choose which read lands first.
 */
type Porte = (signal: AbortSignal | undefined) => Promise<Response>;

function brancher(routes: readonly Route[], porte?: Porte) {
  const w = wire(routes);
  const envois: Record<string, unknown>[] = [];
  const tenues: (() => void)[] = [];
  const tenir = { v: false };
  const viaWire = (globalThis as { fetch: (i: string, init?: RequestInit) => Promise<Response> }).fetch;
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const path = new URL(input).pathname;
    if (path === '/ops/sos') throw new TypeError('Failed to fetch');
    if (path === '/ops/alertes') throw new TypeError('Failed to fetch');
    if (path === '/ops/colis/perdu') {
      envois.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (porte === undefined) throw new Error('no answer was set for the declare door in this walk');
      return porte(init?.signal ?? undefined);
    }
    if (path === '/ops/board' && tenir.v) await new Promise<void>((r) => tenues.push(r));
    return viaWire(input, init);
  };
  return { ...w, envois, tenues, tenir };
}

/** The door's answer as Séra writes it. */
const repond = (status: number, corps: unknown): Porte => async () => Response.json(corps, { status });

/** A send that waits for the walk to let Séra answer. */
function enAttente(apres: Porte): { porte: Porte; lacher: () => void } {
  let lacher = (): void => {};
  const ouvert = new Promise<void>((r) => { lacher = r; });
  return { porte: async (signal) => { await ouvert; return apres(signal); }, lacher: () => lacher() };
}

/** A request that never comes back: it ends only when the port gives up on it. */
const bloque: Porte = (signal) =>
  new Promise((_, rejeter) => {
    signal?.addEventListener('abort', () => rejeter(new DOMException('aborted', 'AbortError')));
  });
const horsLigne: Porte = async () => {
  throw new TypeError('Failed to fetch');
};
const pasDuJson: Porte = async () => new Response('<html>502 Bad Gateway</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });

beforeEach(() => {
  // The open declaration outlives a mounted screen by design: each walk starts with none.
  poserActe(null);
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = SERA_BASE;
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { fetch?: unknown }).fetch;
  delete (globalThis as { window?: unknown }).window;
  delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
});

async function ouvrirOperations(): Promise<Screen> {
  const screen = await mountEcran(<AppV2 />);
  // The shell boots on a real ¾ s timer before the Dock shows.
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  await screen.settle();
  await screen.press('Opérations');
  for (let i = 0; i < 20; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  return screen;
}

describe('« Colis perdu en route » sits in Opérations, beside the SOS alerts', () => {
  it('a course whose parcel a rider holds: the section is there, names the order and the rider, and « Déclarer ce colis perdu » is pressable', async () => {
    porteOuverte();
    storage({ 'boutik.operateur.cle': OPS, [CLE_SERA]: 'cle-sera-du-fondateur' });
    const w = brancher([
      (path) => (path === '/ops/board' ? { status: 200, json: planche([{ orderId: 'ord-perdu-1', riderId: 'rider-awa', nom: 'Awa', reading: 'coursier' }]) } : null),
    ]);
    const screen = await ouvrirOperations();
    expect(screen.shows(TITRE), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Commande ord-perdu-1 · chez Awa')).toBe(true);
    expect(screen.canPress(DECLARER), 'the action is present and pressable').toBe(true);
    const lecture = w.calls.find((c) => c.path === '/ops/board');
    expect(lecture?.headers['authorization'], 'the board is read on his Séra key').toBe(`Bearer ${CLES[CLE_SERA]}`);
    screen.unmount();
  }, 20_000);

  it('an accepted course whose parcel is still at the stall (or whose custody is unknown) offers no action', async () => {
    porteOuverte();
    storage({ 'boutik.operateur.cle': OPS, [CLE_SERA]: 'cle-sera-du-fondateur' });
    brancher([
      (path) =>
        path === '/ops/board'
          ? {
              status: 200,
              json: planche([
                { orderId: 'ord-au-stand', riderId: 'rider-awa', nom: 'Awa', reading: 'ailleurs' },
                { orderId: 'ord-inconnu', riderId: 'rider-boss', nom: 'Boss', reading: 'inconnue' },
              ]),
            }
          : null,
    ]);
    const screen = await ouvrirOperations();
    expect(screen.shows(TITRE), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows("Aucun coursier n'a de colis en main en ce moment.")).toBe(true);
    expect(screen.shows('ord-au-stand'), 'a parcel no rider holds is not listed').toBe(false);
    expect(screen.shows('ord-inconnu'), 'a parcel whose holder is unknown is not listed').toBe(false);
    expect(screen.canPress(DECLARER)).toBe(false);
    screen.unmount();
  }, 20_000);
});

const AWA = { orderId: 'ord-perdu-1', riderId: 'rider-awa', nom: 'Awa', reading: 'coursier' as const };
const CLES = { 'boutik.operateur.cle': OPS, [CLE_SERA]: 'cle-sera-du-fondateur' };
const unePlanche = (lignes = [AWA]): Route => (path) => (path === '/ops/board' ? { status: 200, json: planche(lignes) } : null);

/** A parcel of two orders on one course (Séra's `colisEnCourse`), both sealed to Boss. */
function plancheColis() {
  const p = planche([{ orderId: 'ord-c-a', riderId: 'rider-boss', nom: 'Boss', reading: 'coursier' }]);
  const m = p.board.manifestes['rider-boss']!;
  m.custodyReadings.push({ orderId: 'ord-c-b', reading: 'coursier', asOf: T });
  (p.board as Record<string, unknown>)['colisEnCourse'] = {
    'asg-ord-c-a': { orderIds: ['ord-c-a', 'ord-c-b'], packageId: 'pkg-c', reglement: { 'ord-c-a': 'paye', 'ord-c-b': 'paye' } },
  };
  return p;
}

/** The amount fields only: Opérations has other fields of its own. */
const champs = (screen: Screen) =>
  screen.tree.root.findAllByType('TextInput' as never).filter((c) => String(c.props['accessibilityLabel'] ?? '').startsWith('Commande '));

/** Up to the confirmation, with the amounts he typed. */
async function jusquALaConfirmation(screen: Screen, montant = '15000'): Promise<void> {
  await screen.press(DECLARER);
  await screen.type(montant, 'Commande ord-perdu-1');
  await screen.press('Continuer');
}

async function attendre(screen: Screen, ok: () => boolean): Promise<void> {
  for (let i = 0; i < 40 && !ok(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
}

describe('the honest states before anything is sent', () => {
  it('no Séra key on this browser: it says where the key goes, and asks Séra nothing', async () => {
    porteOuverte();
    storage({ 'boutik.operateur.cle': OPS });
    const w = brancher([]);
    const screen = await ouvrirOperations();
    expect(screen.shows(TITRE)).toBe(true);
    expect(screen.shows('Pour déclarer un colis perdu, tapez d\'abord la clé Séra dans « Coursiers ».')).toBe(true);
    expect(screen.canPress(DECLARER)).toBe(false);
    expect(w.calls.some((c) => c.path === '/ops/board')).toBe(false);
    screen.unmount();
  }, 20_000);

  it('a build with no Séra address: it says the console is not connected, and offers nothing', async () => {
    delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
    porteOuverte();
    storage(CLES);
    const w = brancher([]);
    const screen = await ouvrirOperations();
    expect(screen.shows("Cette console n'est pas reliée à Séra. Aucun colis ne peut être déclaré perdu ici.")).toBe(true);
    expect(screen.canPress(DECLARER)).toBe(false);
    expect(w.calls.some((c) => c.path === '/ops/board')).toBe(false);
    screen.unmount();
  }, 20_000);

  it('a board Séra refused the key for: the key is cleared and the sentence says where to type it again', async () => {
    porteOuverte();
    const disque = storage(CLES);
    brancher([(path) => (path === '/ops/board' ? { status: 401, json: { error: 'unauthorized' } } : null)]);
    const screen = await ouvrirOperations();
    expect(screen.shows('Pour déclarer un colis perdu, tapez d\'abord la clé Séra dans « Coursiers ».'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(disque.has(CLE_SERA), 'the refused key is not kept').toBe(false);
    expect(disque.get('boutik.operateur.cle'), 'his Boutik+ ops key is another door, untouched').toBe(OPS);
    screen.unmount();
  }, 20_000);

  it('a board that could not be read: it says so, never « nothing held », and « Réessayer » reads again', async () => {
    porteOuverte();
    storage(CLES);
    // Other desks of the console read the same board; it stays down until he presses.
    let revenu = false;
    const w = brancher([
      (path) => {
        if (path !== '/ops/board') return null;
        return revenu ? { status: 200, json: planche([AWA]) } : { status: 503, json: { ok: false } };
      },
    ]);
    const screen = await ouvrirOperations();
    expect(screen.shows('Les courses n\'ont pas pu être lues chez Séra. Réessayez.'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows("Aucun coursier n'a de colis en main en ce moment.")).toBe(false);
    const avant = w.calls.filter((c) => c.path === '/ops/board').length;
    revenu = true;
    // The first « Réessayer » in render order is this section's: it sits above the board's own.
    await screen.press('Réessayer', 0);
    await attendre(screen, () => screen.canPress(DECLARER));
    expect(w.calls.filter((c) => c.path === '/ops/board').length, 'his press read the board again').toBeGreaterThan(avant);
    expect(screen.canPress(DECLARER), 'the second read offers the parcel').toBe(true);
    screen.unmount();
  }, 20_000);
});

describe('the steps: the parcel, one amount per order, a confirmation that says it is final', () => {
  it('a parcel of two orders: two EMPTY fields, « Continuer » only once both are whole francs above zero, then the confirmation names each amount and what happens next', async () => {
    porteOuverte();
    storage(CLES);
    const w = brancher([(path) => (path === '/ops/board' ? { status: 200, json: plancheColis() } : null)]);
    const screen = await ouvrirOperations();
    expect(screen.shows('Colis de 2 commandes · chez Boss'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().some((x) => x.includes('FCFA')), 'no price on the list').toBe(false);
    await screen.press(DECLARER);
    expect(champs(screen).map((c) => c.props['value']), 'nothing is suggested: both fields empty').toEqual(['', '']);
    expect(screen.canPress('Continuer'), 'no amount yet').toBe(false);
    await screen.type('12 000', 'Commande ord-c-a');
    expect(screen.canPress('Continuer'), 'one order still has no amount').toBe(false);
    await screen.type('0', 'Commande ord-c-b');
    expect(screen.shows('Chaque montant est un nombre entier de francs, plus grand que zéro.')).toBe(true);
    expect(screen.canPress('Continuer')).toBe(false);
    await screen.type('2500,50', 'Commande ord-c-b');
    expect(screen.canPress('Continuer'), 'not whole francs').toBe(false);
    await screen.type('2500', 'Commande ord-c-b');
    expect(screen.canPress('Continuer')).toBe(true);
    await screen.press('Continuer');
    expect(screen.shows("C'est définitif. Une fois déclaré, on ne revient pas en arrière.")).toBe(true);
    expect(screen.shows("L'acheteur est remboursé en entier par Shop+, livraison comprise. Le coursier est libéré.")).toBe(true);
    // The console's own money format (its thin and no-break spaces read as spaces here).
    expect(screen.texts().filter((x) => x.startsWith('Commande ord-c-')).map((x) => x.replace(/\s/g, ' '))).toEqual(['Commande ord-c-a : 12 000 FCFA', 'Commande ord-c-b : 2 500 FCFA']);
    expect(screen.canPress('Oui, déclarer perdu')).toBe(true);
    expect(w.envois, 'nothing is sent before « Oui »').toEqual([]);
    screen.unmount();
  }, 20_000);

  it('« Annuler » at the confirmation sends nothing and gives the list back', async () => {
    porteOuverte();
    storage(CLES);
    const w = brancher([unePlanche()]);
    const screen = await ouvrirOperations();
    await jusquALaConfirmation(screen);
    await screen.press('Annuler');
    expect(screen.canPress(DECLARER)).toBe(true);
    expect(w.envois).toEqual([]);
    screen.unmount();
  }, 20_000);
});

describe('a send that does not come back is « not known », never « declared », and the retry is the same declaration', () => {
  it('a stalled send: after the console\'s 12 s it says nobody knows yet, and « Réessayer » sends the SAME command id with the same amounts', async () => {
    porteOuverte();
    storage(CLES);
    const w = brancher([unePlanche()], bloque);
    const screen = await ouvrirOperations();
    await jusquALaConfirmation(screen);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await screen.press('Oui, déclarer perdu');
    expect(screen.shows('Envoi à Séra…')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    await screen.settle();
    vi.useRealTimers();
    expect(screen.shows("Séra n'a pas répondu. On ne sait pas encore si le colis est déclaré. Réessayez."), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Séra a déclaré le colis perdu'), 'a stall is never a success').toBe(false);
    expect(w.envois).toHaveLength(1);
    expect(w.envois[0]).toEqual({ command_id: expect.any(String), orderId: 'ord-perdu-1', montants: [{ orderId: 'ord-perdu-1', amount: 15000 }] });
    await screen.press('Réessayer', 0);
    await attendre(screen, () => w.envois.length === 2);
    expect(w.envois).toHaveLength(2);
    expect(w.envois[1], 'the retry is the same declaration, under the same id').toEqual(w.envois[0]);
    screen.unmount();
  }, 30_000);

  it('no network at all, then a body that is not JSON: each says « not known », each retry keeps the id, and « Fermer » gives the list back', async () => {
    porteOuverte();
    storage(CLES);
    let n = 0;
    const w = brancher([unePlanche()], (signal) => (n++ === 0 ? horsLigne(signal) : pasDuJson(signal)));
    const screen = await ouvrirOperations();
    await jusquALaConfirmation(screen);
    await screen.press('Oui, déclarer perdu');
    await attendre(screen, () => screen.shows("Séra n'a pas répondu."));
    expect(screen.shows("Séra n'a pas répondu. On ne sait pas encore si le colis est déclaré. Réessayez.")).toBe(true);
    await screen.press('Réessayer', 0);
    await attendre(screen, () => w.envois.length === 2 && !screen.shows('Envoi à Séra…'));
    expect(screen.shows("Séra n'a pas répondu. On ne sait pas encore si le colis est déclaré. Réessayez."), 'a page that is not Séra\'s answer is not a success').toBe(true);
    expect(w.envois[1]).toEqual(w.envois[0]);
    const lectures = w.calls.filter((c) => c.path === '/ops/board').length;
    await screen.press('Fermer');
    await attendre(screen, () => screen.canPress(DECLARER));
    expect(screen.canPress(DECLARER), 'he is back on the list').toBe(true);
    expect(w.calls.filter((c) => c.path === '/ops/board').length, 'the board is asked again').toBe(lectures + 1);
    screen.unmount();
  }, 20_000);
});

const DECLARE = "Séra a déclaré le colis perdu. L'acheteur sera remboursé en entier, et le coursier est libre.";
const NON_SU = "Séra n'a pas répondu. On ne sait pas encore si le colis est déclaré. Réessayez.";
const SANS_CLE = 'Pour déclarer un colis perdu, tapez d\'abord la clé Séra dans « Coursiers ».';
const CLE_REFUSEE = 'Séra a refusé la clé. Tapez-la de nouveau dans « Coursiers ».';
const CHARGEMENT = 'On lit chez Séra les colis que les coursiers ont en main…';
const VIDE = "Aucun coursier n'a de colis en main en ce moment.";
const OUI = 'Oui, déclarer perdu';

/** This section's « Réessayer », told apart from the other desks' own by counting. */
const reessais = (screen: Screen) => screen.texts().filter((x) => x === 'Réessayer').length;

describe('each refusal Séra gives by name is said by name, and ends the act', () => {
  const cas: [string, number, unknown, string][] = [
    ['no_active_course', 409, { ok: false, reason: 'no_active_course' }, "Cette course n'est plus en route chez Séra. Le colis est peut-être déjà déclaré : regardez dans « Coursiers » avant de recommencer."],
    ['montants_incomplets', 400, { ok: false, reason: 'montants_incomplets' }, "Séra attend un montant pour chaque commande du colis. Rien n'a été déclaré."],
    ['malformed', 400, { ok: false, reason: 'malformed' }, "Séra n'a pas pu lire la demande. Rien n'a été déclaré."],
    ['custody_refused', 409, { ok: false, reason: 'custody_refused', detail: 'refused' }, 'Séra a refusé la déclaration. Une partie est peut-être déjà faite : regardez la course dans « Coursiers » avant de recommencer.'],
  ];
  for (const [nom, status, corps, phrase] of cas) {
    it(`${status} ${nom}: its sentence, no « Réessayer », and « Fermer » gives the list back`, async () => {
      porteOuverte();
      storage(CLES);
      const w = brancher([unePlanche()], repond(status, corps));
      const screen = await ouvrirOperations();
      await jusquALaConfirmation(screen);
      const avant = reessais(screen);
      await screen.press(OUI);
      await attendre(screen, () => screen.shows(phrase));
      expect(screen.shows(phrase), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      expect(screen.shows(DECLARE)).toBe(false);
      expect(reessais(screen), 'a refusal by name is not sent again').toBe(avant);
      expect(w.envois).toHaveLength(1);
      await screen.press('Fermer');
      await attendre(screen, () => screen.canPress(DECLARER));
      expect(screen.canPress(DECLARER)).toBe(true);
      screen.unmount();
    }, 20_000);
  }

  it('401 on the declaration: the key is said refused and cleared, his ops key stays, and « Fermer » reaches the no-key state', async () => {
    porteOuverte();
    const disque = storage(CLES);
    brancher([unePlanche()], repond(401, { error: 'unauthorized' }));
    const screen = await ouvrirOperations();
    await jusquALaConfirmation(screen);
    await screen.press(OUI);
    await attendre(screen, () => screen.shows(CLE_REFUSEE));
    expect(screen.shows(CLE_REFUSEE), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(disque.has(CLE_SERA), 'the refused key is not kept').toBe(false);
    expect(disque.get('boutik.operateur.cle')).toBe(OPS);
    await screen.press('Fermer');
    await attendre(screen, () => screen.shows(SANS_CLE));
    expect(screen.shows(SANS_CLE)).toBe(true);
    expect(screen.canPress(DECLARER)).toBe(false);
    screen.unmount();
  }, 20_000);
});

describe('a declared parcel leaves the list at once', () => {
  it('declared while he watches: « Fermer » shows the list as being read, never the old one, until Séra\'s new board lands', async () => {
    porteOuverte();
    storage(CLES);
    let lignes = [AWA];
    const w = brancher([(path) => (path === '/ops/board' ? { status: 200, json: planche(lignes) } : null)], repond(200, { ok: true, status: 'declare' }));
    const screen = await ouvrirOperations();
    await jusquALaConfirmation(screen);
    await screen.press(OUI);
    await attendre(screen, () => screen.shows(DECLARE));
    expect(screen.shows(DECLARE)).toBe(true);
    w.tenir.v = true;
    await screen.press('Fermer');
    await attendre(screen, () => w.tenues.length > 0);
    expect(screen.shows(CHARGEMENT), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress(DECLARER), 'the declared parcel is not offered again').toBe(false);
    lignes = [];
    w.tenir.v = false;
    for (const r of w.tenues.splice(0)) r();
    await attendre(screen, () => screen.shows(VIDE));
    expect(screen.shows(VIDE)).toBe(true);
    screen.unmount();
  }, 20_000);
});

describe('leaving the tab never drops a declaration in flight', () => {
  it('he leaves Opérations while it is sent; Séra declares it meanwhile; coming back shows the answer, and a late old board never brings the parcel back', async () => {
    porteOuverte();
    storage(CLES);
    let lignes = [AWA];
    const reponse = enAttente(repond(200, { ok: true, status: 'declare' }));
    const w = brancher([(path) => (path === '/ops/board' ? { status: 200, json: planche(lignes) } : null)], reponse.porte);
    const screen = await ouvrirOperations();
    await jusquALaConfirmation(screen);
    await screen.press(OUI);
    expect(screen.shows('Envoi à Séra…')).toBe(true);
    await screen.press('Accueil');
    await attendre(screen, () => !screen.shows(TITRE));
    expect(screen.shows(TITRE), 'Opérations is gone from the screen').toBe(false);
    reponse.lacher();
    // Séra's answer lands while Opérations is not on screen.
    for (let i = 0; i < 4; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    }
    // Board reads made on the way back are held: the oldest will land last.
    w.tenir.v = true;
    await screen.press('Opérations');
    await attendre(screen, () => screen.shows(DECLARE));
    expect(screen.shows(DECLARE), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(w.envois).toHaveLength(1);
    await screen.press('Fermer');
    await attendre(screen, () => w.tenues.length >= 2);
    expect(screen.shows(CHARGEMENT)).toBe(true);
    // His « Fermer » read is the latest: Séra's new board, without the parcel.
    lignes = [];
    w.tenues.pop()!();
    await attendre(screen, () => screen.shows(VIDE));
    expect(screen.shows(VIDE)).toBe(true);
    // The reads from before land now, with the board as it was.
    lignes = [AWA];
    w.tenir.v = false;
    for (const r of w.tenues.splice(0)) r();
    for (let i = 0; i < 10; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
      await screen.settle();
    }
    expect(screen.canPress(DECLARER), 'an older read never sets the list').toBe(false);
    expect(screen.shows(VIDE)).toBe(true);
    screen.unmount();
  }, 30_000);

  it('an unknown answer lands while he is away: coming back shows it; with no key « Réessayer » sends nothing and keeps the act; with the key back it sends the SAME id', async () => {
    porteOuverte();
    const disque = storage(CLES);
    const reponse = enAttente(horsLigne);
    let n = 0;
    const w = brancher([unePlanche()], (signal) => (n++ === 0 ? reponse.porte(signal) : repond(200, { ok: true, status: 'declare' })(signal)));
    const screen = await ouvrirOperations();
    await jusquALaConfirmation(screen);
    await screen.press(OUI);
    await screen.press('Accueil');
    await attendre(screen, () => !screen.shows(TITRE));
    reponse.lacher();
    for (let i = 0; i < 4; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    }
    await screen.press('Opérations');
    await attendre(screen, () => screen.shows(NON_SU));
    expect(screen.shows(NON_SU), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    disque.delete(CLE_SERA);
    await screen.press('Réessayer', 0);
    await attendre(screen, () => screen.shows(SANS_CLE));
    expect(screen.shows(SANS_CLE), 'no key: it says where the key goes').toBe(true);
    expect(screen.shows(CLE_REFUSEE), 'nothing was sent, so no key was refused').toBe(false);
    expect(w.envois, 'nothing sent without a key').toHaveLength(1);
    expect(screen.shows('Commande ord-perdu-1 · chez Awa'), 'the act is still open').toBe(true);

    disque.set(CLE_SERA, CLES[CLE_SERA]);
    await screen.press('Réessayer', 0);
    await attendre(screen, () => screen.shows(DECLARE));
    expect(screen.shows(DECLARE)).toBe(true);
    expect(w.envois).toHaveLength(2);
    expect(w.envois[1], 'the same declaration, under the same id').toEqual(w.envois[0]);
    screen.unmount();
  }, 30_000);
});
