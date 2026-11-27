import React from 'react';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { mountEcran, storage, wiredEnv, type Screen } from './rendu';
import { AppV2 } from '../src/v2/AppV2';
import { SERA, miniflareDuDepot } from './bundle-voisin';

/**
 * ═══ RENDU-RÉEL + SEAM — a rider's SOS on the founder's console, pressed
 * against the REAL Séra worker ═══
 *
 * A rider's alert reached Séra's book and showed on no screen. This walk
 * mounts the REAL console root and routes its fetch into Séra's OWN logistics
 * bundle on workerd — no app code stubbed, and no stand-in at all, so none can
 * be kinder than the door. The only faults are the network's: a request that
 * never arrives, or an answer that arrives late. After each act it ASKS THE
 * BOOK, not the screen.
 *
 * The four questions: the tree survives each press · « J'ai vu, j'appelle »
 * is present, pressable and wired (the book changed) · a reading that fails
 * by itself says so and tries again · every screen stays reachable with the
 * strip above it.
 *
 * ⚠ The bundle lives in the Séra repo: skipped, with the reason in the title,
 * where no clone sits beside this one.
 *
 * Bound: nothing here claims how anything LOOKS.
 */

const OPS = 'test-sera-ops-sos-walk';
const INTAKE = 'test-sera-intake-sos-walk';
const BASE = 'http://sera.test';
const CLE_SERA = 'boutik.coursiers.cle';
const RIDER = 'rider-sos-walk';
const NOM = 'Awa Sos';
const TEL = '70 11 22 33';
const T = '2026-11-27T09:00:00.000Z';

const VU = "J'ai vu, j'appelle";
const TITRE = `SOS de ${NOM} · ${TEL}`;
const PAS_RECU = "Séra n'a pas reçu votre réponse. Réessayez.";
const SANS_CLE = 'Les alertes SOS des coursiers ont besoin de la clé Séra';
const RELU_IMPOSSIBLE = "Les alertes SOS n'ont pas pu être relues";
/** SOS_RELECTURE_MS, pinned in `sos-vue.test.ts`. */
const RELECTURE = 15_000;

const Miniflare = miniflareDuDepot();
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

interface Incident {
  commandId: string;
  state: string;
  acknowledgedBy: string | null;
}

interface Livre {
  readonly appels: string[];
  readonly inattendus: string[];
  /** Ask the book, never the screen. */
  incidents(): Promise<Incident[]>;
  /** The rider presses SOS: the body the rider app's sender posts (`sos-wire.ts`). */
  lever(commandId: string, activeCourseId: string | null): Promise<void>;
  /** The network drops every request this says yes to. */
  couper(f: (cle: string) => boolean): void;
  /** The next `cle` request is held: before it reaches Séra, or after Séra
   *  answered and before the answer reaches the console. */
  retenir(cle: string, quand: 'avant' | 'apres'): () => void;
}

async function livre(): Promise<Livre> {
  SERA.exigerAJour();
  const dir = mkdtempSync(join(tmpdir(), 'sos-walk-'));
  dirs.push(dir);
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'sera-logistics.mjs', contents: readFileSync(SERA.bundle, 'utf8') }],
    durableObjects: { LOGISTICS: 'LogisticsDO' },
    durableObjectsPersist: dir,
    bindings: { SERA_OPS_SECRET: OPS, SERA_INTAKE_SECRET: INTAKE },
  });
  const appels: string[] = [];
  const inattendus: string[] = [];
  let coupe: (cle: string) => boolean = () => false;
  const suspendues: { cle: string; quand: 'avant' | 'apres'; porte: Promise<void>; pris: boolean }[] = [];

  // ONLY globalThis.fetch is replaced: the strip's own port calls it.
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (!url.startsWith(BASE)) {
      inattendus.push(url);
      throw new Error(`unexpected call ${url}`);
    }
    const cle = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    appels.push(cle);
    if (coupe(cle)) throw new TypeError('Failed to fetch');
    const r = suspendues.find((x) => x.cle === cle && !x.pris);
    if (r !== undefined) r.pris = true;
    if (r?.quand === 'avant') await r.porte;
    const res = (await mf.dispatchFetch(url, init as never)) as unknown as Response;
    if (r?.quand === 'apres') await r.porte;
    return res;
  };

  const direct = async (path: string, body: unknown, key: string): Promise<Response> =>
    (await mf.dispatchFetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })) as unknown as Response;
  expect((await direct('/ops/riders', { riderId: RIDER, displayName: NOM, phoneAlias: TEL }, OPS)).status).toBe(200);
  expect((await direct('/ops/riders/certify', { riderId: RIDER, certified: true }, OPS)).status).toBe(200);
  const code = ((await (await direct('/ops/rider-code/mint', { riderId: RIDER }, OPS)).json()) as Record<string, unknown>)['code'] as string;

  return {
    appels,
    inattendus,
    incidents: async () => {
      const r = (await mf.dispatchFetch(`${BASE}/ops/sos`, { headers: { Authorization: `Bearer ${OPS}` } })) as unknown as Response;
      return ((await r.json()) as { incidents: Incident[] }).incidents;
    },
    lever: async (commandId, activeCourseId) => {
      const r = await direct(
        '/rider/sos',
        { command_id: commandId, riderId: RIDER, hours: 'in_hours', onShift: true, activeCourseId, raisedAt: T },
        code,
      );
      expect(r.status, await r.clone().text()).toBe(200);
    },
    couper: (f) => {
      coupe = f;
    },
    retenir: (cle, quand) => {
      let ouvrir!: () => void;
      const porte = new Promise<void>((res) => {
        ouvrir = res;
      });
      suspendues.push({ cle, quand, porte, pris: false });
      return ouvrir;
    },
  };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = BASE;
  // His browser: `#operateur` opens the founder's door on this device.
  (globalThis as { window?: unknown }).window = { location: { hash: '#operateur' } };
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { fetch?: unknown }).fetch;
  delete (globalThis as { window?: unknown }).window;
  delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
});

async function demarrer(): Promise<Screen> {
  const screen = await mountEcran(<AppV2 />);
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  await screen.settle();
  return screen;
}

/** Real I/O runs outside React's microtasks: wait, inside act, until it lands. */
async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 200 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

/** The strip's clock, moved by hand: one tick of the re-read. */
async function tic(screen: Screen): Promise<void> {
  await act(async () => { vi.advanceTimersByTime(RELECTURE); });
  await screen.settle();
}

/** Two presses in ONE act, before any redraw: a thumb that taps twice. */
async function doubleTape(screen: Screen, label: string): Promise<void> {
  const porteurs = screen.tree.root.findAll((n) => n.children.some((c) => typeof c === 'string' && c.includes(label)));
  expect(porteurs.length, `« ${label} » on screen`).toBeGreaterThan(0);
  let n: ReactTestInstance | null = porteurs[0]!;
  while (n !== null && typeof n.props['onPress'] !== 'function') n = n.parent;
  expect(n, `« ${label} » can be pressed`).not.toBeNull();
  const onPress = n!.props['onPress'] as () => void;
  await act(async () => {
    onPress();
    onPress();
    await Promise.resolve();
  });
  await screen.settle();
}

const acks = (l: Livre): number => l.appels.filter((c) => c === 'POST /ops/sos/ack').length;
const lectures = (l: Livre): number => l.appels.filter((c) => c === 'GET /ops/sos').length;

/** Every screen of the console, each reached and still itself, with the alert above it. */
async function partout(screen: Screen, attendu: string): Promise<void> {
  const lieux: [string, () => boolean][] = [
    ['Accueil', () => screen.canPress('Vendre un nouveau produit')],
    ['Produits', () => screen.canPress('Ouvrir Opérations')],
    ['Commandes', () => screen.shows('Votre clé d’opérateur')],
    ['Opérations', () => screen.canPress('Ouvrir les opérations')],
    ['Gains', () => screen.shows('Vos gains')],
  ];
  for (const [onglet, ici] of lieux) {
    await screen.press(onglet);
    expect(ici(), `« ${onglet} » is reached and is itself`).toBe(true);
    expect(screen.shows(attendu), `« ${onglet} »: the alert is above it`).toBe(true);
    expect(screen.canPress(VU), `« ${onglet} »: « ${VU} » is pressable`).toBe(true);
  }
  await screen.press('Accueil');
  await screen.press('Vendre un nouveau produit');
  expect(screen.shows('Nouveau produit'), 'the wizard is reached').toBe(true);
  expect(screen.shows(attendu), 'the wizard: the alert is above it').toBe(true);
  expect(screen.canPress(VU), `the wizard: « ${VU} » is pressable`).toBe(true);
  await screen.press('Terminer');
}

describe.skipIf(SERA.raisonSaut !== null)(SERA.titre('SOS-DESK — a rider\'s SOS on the console, pressed against the real Séra book'), () => {
  it('a real SOS shows above every screen; « J\'ai vu, j\'appelle » sends ONE answer, and only Séra\'s « acknowledged » takes it away', async () => {
    const l = await livre();
    await l.lever('sos-walk-1', null);
    const stored = storage({ [CLE_SERA]: OPS });
    const screen = await demarrer();
    await attendre(screen, () => screen.shows(TITRE), 'the rider\'s SOS on screen');
    expect(screen.shows("Pas en course au moment de l'alerte."), 'on a course or not, as the phone said').toBe(true);
    // The exact words of the hour are pinned in `sos-vue.test.ts`.
    expect(screen.texts().some((t) => t.startsWith('Reçu ') && t.includes('heure de Ouagadougou')), 'when Séra received it, on the rider\'s clock, said as such').toBe(true);
    await partout(screen, TITRE);

    // His answer, from the Gains tab: the strip is the same strip everywhere.
    await screen.press('Gains');
    const relacher = l.retenir('POST /ops/sos/ack', 'avant');
    await doubleTape(screen, VU);
    expect(acks(l), 'two quick presses send ONE answer').toBe(1);
    expect(screen.shows(TITRE), 'until Séra answers, the alert stays').toBe(true);
    relacher();
    await attendre(screen, () => !screen.shows(TITRE), 'the strip emptying on Séra\'s answer');
    const livreApres = await l.incidents();
    expect(livreApres.find((i) => i.commandId === 'sos-walk-1')?.state, 'ASK THE BOOK: answered').toBe('acknowledged');
    expect(livreApres.find((i) => i.commandId === 'sos-walk-1')?.acknowledgedBy, 'ASK THE BOOK: by the founder').toBe('founder');
    expect(screen.shows('Vos gains'), 'the tree survived the press, on the tab he was on').toBe(true);
    expect(stored.get(CLE_SERA), 'the key stays where he put it').toBe(OPS);
    expect(l.inattendus, 'nothing but Séra was asked').toEqual([]);
    screen.unmount();
  }, 60_000);

  it('an answer that never reaches Séra keeps the alert and says « Réessayez »; the retry is the one that lands', async () => {
    const l = await livre();
    await l.lever('sos-walk-2', 'course-walk-9');
    storage({ [CLE_SERA]: OPS });
    const screen = await demarrer();
    await attendre(screen, () => screen.shows(TITRE), 'the rider\'s SOS on screen');
    expect(screen.shows("En course au moment de l'alerte.")).toBe(true);

    l.couper((cle) => cle === 'POST /ops/sos/ack');
    await screen.press(VU);
    await attendre(screen, () => screen.shows(PAS_RECU), 'the « Réessayez » sentence');
    expect(screen.shows(TITRE), 'a lost answer never takes the alert away').toBe(true);
    expect(screen.canPress(VU), 'and the button is there to try again').toBe(true);
    expect((await l.incidents()).find((i) => i.commandId === 'sos-walk-2')?.state, 'ASK THE BOOK: still open').toBe('open');

    l.couper(() => false);
    await screen.press(VU);
    await attendre(screen, () => !screen.shows(TITRE), 'the strip emptying on the retry');
    expect(screen.shows(PAS_RECU), 'the failure sentence leaves with the alert').toBe(false);
    expect((await l.incidents()).find((i) => i.commandId === 'sos-walk-2')?.state, 'ASK THE BOOK: answered').toBe('acknowledged');
    screen.unmount();
  }, 60_000);

  it('a Séra key that is refused is cleared, like everywhere in this console, and the strip says where the key goes', async () => {
    const l = await livre();
    await l.lever('sos-walk-3', null);
    const stored = storage({ [CLE_SERA]: 'une-cle-que-sera-refuse' });
    const screen = await demarrer();
    await attendre(screen, () => screen.shows(SANS_CLE), 'the no-key sentence after a refused key');
    expect(stored.has(CLE_SERA), 'the refused key is gone from this browser').toBe(false);
    expect(lectures(l), 'asked once, refused once').toBe(1);
    expect(screen.texts().some((t) => t.startsWith('SOS de ')), 'a refused read shows no alert it did not read').toBe(false);
    screen.unmount();
  }, 60_000);

  it('no alert open: the strip says nothing; a new one shows at the next read; one read at a time', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    storage({ [CLE_SERA]: OPS });
    const screen = await demarrer();
    await attendre(screen, () => lectures(l) === 1, 'the first read');
    await screen.settle();
    expect(screen.texts().filter((t) => t.includes('SOS')), 'an empty desk takes no words').toEqual([]);
    expect(screen.canPress('Vendre un nouveau produit'), 'and the home is itself').toBe(true);

    // A rider raises it while he is looking at the console.
    await l.lever('sos-walk-4', null);
    const lente = l.retenir('GET /ops/sos', 'avant');
    await tic(screen);
    await tic(screen);
    expect(lectures(l), 'a tick while a read is in flight is skipped').toBe(2);
    lente();
    await attendre(screen, () => screen.shows(TITRE), 'the new SOS at the next read');
    screen.unmount();
  }, 60_000);

  it('Séra unreachable after a good read: the alert it read stays, and the strip says it could not read again and when it last could', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    await l.lever('sos-walk-5', null);
    storage({ [CLE_SERA]: OPS });
    const screen = await demarrer();
    await attendre(screen, () => screen.shows(TITRE), 'the rider\'s SOS on screen');

    l.couper(() => true);
    await tic(screen);
    await attendre(screen, () => screen.shows(RELU_IMPOSSIBLE), 'the « could not read again » sentence');
    expect(screen.shows('Dernière lecture réussie'), 'and when it last could').toBe(true);
    expect(screen.shows(TITRE), 'an alert he was shown does not vanish because the network did').toBe(true);

    l.couper(() => false);
    await tic(screen);
    await attendre(screen, () => !screen.shows(RELU_IMPOSSIBLE), 'the sentence leaving once Séra answers');
    expect(screen.shows(TITRE), 'still open in the book, still on screen').toBe(true);
    screen.unmount();
  }, 60_000);

  it('a read already on its way when he answered does not bring the answered alert back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    await l.lever('sos-walk-6', null);
    storage({ [CLE_SERA]: OPS });
    const screen = await demarrer();
    await attendre(screen, () => screen.shows(TITRE), 'the rider\'s SOS on screen');

    // A re-read leaves, Séra answers it (still open), and that answer is slow.
    const enRoute = l.retenir('GET /ops/sos', 'apres');
    await tic(screen);
    await attendre(screen, () => lectures(l) === 2, 'the second read leaving');
    await screen.press(VU);
    await attendre(screen, () => !screen.shows(TITRE), 'the strip emptying on Séra\'s answer');
    enRoute();
    for (let i = 0; i < 20; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
      await screen.settle();
    }
    expect(screen.shows(TITRE), 'the late read, taken before his answer, does not undo it').toBe(false);
    expect((await l.incidents()).find((i) => i.commandId === 'sos-walk-6')?.state).toBe('acknowledged');
    screen.unmount();
  }, 60_000);
});
