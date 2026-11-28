import React from 'react';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { mountEcran, storage, wiredEnv, type Screen } from './rendu';
import { AppV2 } from '../src/v2/AppV2';
import { quandOuaga } from '../src/sos/view';
import { SERA, miniflareDuDepot } from './bundle-voisin';

/**
 * ═══ RENDU-RÉEL + SEAM — Séra's alerts on the founder's console, closed with
 * « J'ai vu » against the REAL Séra worker ═══
 *
 * Séra raises a problem for the founder when a ready parcel waits more than
 * an hour with no course (Execution Contract §6), and keeps it open until he
 * closes it. This walk mounts the REAL console root, opens Opérations, and
 * routes its fetch into Séra's OWN logistics bundle on workerd — no app code
 * stubbed, and no stand-in at all, so none can be kinder than the door. The
 * ready parcel's alert is raised through Séra's own intake doors, with facts
 * dated more than an hour ago; custody's two arrive on logistics' own
 * `/produce/alerte`, with the body custody's `alerteEvent` builds. Every 401
 * and 404 below is the real Worker's own answer: a key
 * it refuses, or a course composed on its own door between his read and his
 * press. The only faults added are the network's: a request that never
 * arrives, an answer lost on its way back, or one held. After each act it
 * ASKS THE BOOK, not the screen.
 *
 * The four questions: the tree survives each press · « J'ai vu » is present,
 * pressable and wired (the book changed) · a failed close or a failed read
 * says so and leaves a way to try again · every tab stays reachable, the
 * rider's SOS still first above them.
 *
 * Opérations' other desks talk to Boutik+'s own services: not answering here.
 *
 * ⚠ The bundle lives in the Séra repo: skipped, with the reason in the title,
 * where no clone sits beside this one.
 *
 * Bound: nothing here claims how anything LOOKS.
 */

const OPS = 'test-sera-ops-alertes-walk';
const INTAKE = 'test-sera-intake-alertes-walk';
/** Custody's key on logistics' `/produce/` door. */
const LIVREE = 'test-sera-livree-alertes-walk';
const BASE = 'http://sera.test';
const CLE_SERA = 'boutik.coursiers.cle';
const CLE_OPS = 'boutik.operateur.cle';
const SUPPLIER = 'supplier-alertes-walk';
const RIDER = 'rider-alertes-walk';
const NOM = 'Awa Sos';
const TEL = '70 11 22 33';
const MINUTE = 60_000;
const LOC = { zone: 'Zogona, Ouagadougou', landmark: "À l'échangeur", directions: '', maskedRelay: '' };

const TITRE = 'Colis prêt, sans course';
const TITRE_GARDE = 'Suivi du colis à vérifier';
const TITRE_PREUVE = 'Preuve de livraison pas encore validée';
const VU = "J'ai vu";
const ENVOI = 'Envoi en cours…';
const PAS_CONFIRME = "Séra n'a pas confirmé. L'alerte reste là. Réessayez.";
const SANS_CLE = 'Les alertes Séra ont besoin de la clé Séra. Tapez-la dans « Coursiers ».';
const RELU_IMPOSSIBLE = "Les alertes Séra n'ont pas pu être relues. Dernière lecture réussie ";
const SUITE = 'Créez sa course dans Commandes, puis confiez-la à un coursier.';
const MASTHEAD = 'La page se met à jour toute seule, chaque minute.';
const PERDU = 'Colis perdu en route';
const SOS = `SOS de ${NOM} · ${TEL}`;
/** ALERTES_RELECTURE_MS, pinned in `alertes-vue.test.ts`. */
const RELECTURE = 60_000;

const Miniflare = miniflareDuDepot();
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

type Json = Record<string, unknown>;
const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

interface Livre {
  readonly appels: string[];
  /** A ready parcel of one order, its facts dated so Séra counts it waiting past the hour. Returns the alert id. */
  lever(orderId: string): Promise<{ id: string; depuis: string }>;
  /** Custody's alert, as its `alerteEvent` builds it, on custody's own door. Returns the alert id. */
  produire(scenario: 'impossible_custody' | 'evidence_not_validated_aging', orderId: string, serverTime: string, payload: Json): Promise<string>;
  /** Ask the book, never the screen: the ids Séra holds open. */
  ouvertes(): Promise<string[]>;
  /** Who closed it, as Séra's stored row says (a second ack answers the first, unchanged); null when Séra holds no such alert. */
  fermeePar(id: string): Promise<string | null>;
  /** A course composed for this order on Séra's own door: the alert is no longer raised. */
  composer(orderId: string): Promise<void>;
  /** A rider presses SOS: the body the rider app's sender posts (`sos-wire.ts`). */
  leverSos(commandId: string): Promise<void>;
  /** The network drops every request this says yes to. */
  couper(f: (cle: string) => boolean): void;
  /** The next answer to `cle` is lost on its way back, after Séra did the work. */
  perdre(cle: string): void;
  /** The next `cle` request is held: before it reaches Séra, or after Séra
   *  answered and before the answer reaches the console. */
  retenir(cle: string, quand: 'avant' | 'apres'): () => void;
}

async function livre(): Promise<Livre> {
  SERA.exigerAJour();
  const dir = mkdtempSync(join(tmpdir(), 'alertes-walk-'));
  dirs.push(dir);
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'sera-logistics.mjs', contents: readFileSync(SERA.bundle, 'utf8') }],
    durableObjects: { LOGISTICS: 'LogisticsDO' },
    durableObjectsPersist: dir,
    bindings: { SERA_OPS_SECRET: OPS, SERA_INTAKE_SECRET: INTAKE, SERA_COURSE_LIVREE_SECRET: LIVREE },
  });
  const appels: string[] = [];
  let coupe: (cle: string) => boolean = () => false;
  const perdues: string[] = [];
  const suspendues: { cle: string; quand: 'avant' | 'apres'; porte: Promise<void>; pris: boolean }[] = [];

  // ONLY globalThis.fetch is replaced: the console's own ports call it.
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (!url.startsWith(BASE)) throw new TypeError('Failed to fetch');
    const cle = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    appels.push(cle);
    if (coupe(cle)) throw new TypeError('Failed to fetch');
    const r = suspendues.find((x) => x.cle === cle && !x.pris);
    if (r !== undefined) r.pris = true;
    if (r?.quand === 'avant') await r.porte;
    const res = (await mf.dispatchFetch(url, init as never)) as unknown as Response;
    if (r?.quand === 'apres') await r.porte;
    const perdue = perdues.indexOf(cle);
    if (perdue >= 0) {
      perdues.splice(perdue, 1);
      await res.text();
      throw new TypeError('Failed to fetch');
    }
    return res;
  };

  const direct = async (path: string, key: string, body?: unknown): Promise<{ status: number; json: Json }> => {
    const r = (await mf.dispatchFetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })) as unknown as Response;
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Json };
  };
  const ok = async (path: string, key: string, body?: unknown): Promise<Json> => {
    const r = await direct(path, key, body);
    expect(r.status, `${path}: ${JSON.stringify(r.json)}`).toBe(200);
    return r.json;
  };
  let code: string | null = null;

  return {
    appels,
    lever: async (orderId) => {
      const depuis = iso(-61 * MINUTE);
      await ok('/intake/funding', INTAKE, { orderId, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: iso(-90 * MINUTE) });
      await ok('/intake/readiness', INTAKE, { orderId, ready: true, asOf: depuis, supplierRef: SUPPLIER });
      return { id: `ready_package_no_task:${orderId}:${depuis}`, depuis };
    },
    produire: async (scenario, orderId, serverTime, payload) => {
      const r = await ok('/produce/alerte', LIVREE, {
        name: 'reconciliation.alert.v1',
        envelope: { command_id: `alerte-${scenario}-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 0, actor: 'custody-service:ops-monitor', serverTime, version: '1' },
        payload: { scenario, order_id: orderId, ...payload },
      });
      expect(r['duplicate']).toBe(false);
      return `${scenario}:${orderId}`;
    },
    ouvertes: async () => ((await ok('/ops/alertes', OPS))['alertes'] as Json[]).map((a) => a['id'] as string),
    fermeePar: async (id) => {
      const r = await direct('/ops/alertes/ack', OPS, { id, by: 'le-livre-seulement' });
      if (r.status === 404) return null;
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      expect(r.json['duplicate'], 'asked of a row already closed').toBe(true);
      return (r.json['alerte'] as Json)['acknowledgedBy'] as string;
    },
    composer: async (orderId) => {
      await ok('/ops/task', OPS, { command_id: `t-${orderId}`, orderId, location: LOC, window: { start: iso(0), end: iso(8 * 60 * MINUTE) } });
    },
    leverSos: async (commandId) => {
      if (code === null) {
        await ok('/ops/riders', OPS, { riderId: RIDER, displayName: NOM, phoneAlias: TEL });
        await ok('/ops/riders/certify', OPS, { riderId: RIDER, certified: true });
        code = (await ok('/ops/rider-code/mint', OPS, { riderId: RIDER }))['code'] as string;
      }
      await ok('/rider/sos', code, { command_id: commandId, riderId: RIDER, hours: 'in_hours', onShift: true, activeCourseId: null, raisedAt: iso(0) });
    },
    couper: (f) => {
      coupe = f;
    },
    perdre: (cle) => {
      perdues.push(cle);
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

/** Real I/O runs outside React's microtasks: wait, inside act, until it lands. */
async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 200 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

async function laisser(screen: Screen): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
}

/** His console, opened on Opérations with both his keys on this browser. */
async function ouvrirOperations(): Promise<Screen> {
  const screen = await mountEcran(<AppV2 />);
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  await screen.settle();
  await screen.press('Opérations');
  await attendre(screen, () => screen.shows(PERDU), 'Opérations reached');
  return screen;
}

/** The section's clock, moved by hand: one tick of the re-read. */
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

const acks = (l: Livre): number => l.appels.filter((c) => c === 'POST /ops/alertes/ack').length;
const lectures = (l: Livre): number => l.appels.filter((c) => c === 'GET /ops/alertes').length;
/** Where a sentence sits in render order: -1 when it is not on screen. */
const rang = (screen: Screen, fragment: string): number => screen.texts().findIndex((t) => t.includes(fragment));

/** Every tab of the console, each reached and still itself; the alert only on Opérations. */
async function partout(screen: Screen, sos: boolean): Promise<void> {
  const lieux: [string, () => boolean][] = [
    ['Accueil', () => screen.canPress('Vendre un nouveau produit')],
    ['Produits', () => screen.canPress('Lister un produit — gratuit')],
    ['Commandes', () => screen.shows('La liste n’est pas arrivée.')],
    ['Gains', () => screen.shows('Vos gains')],
    // Coming back mounts the section again: its own read brings the alert back.
    ['Opérations', () => screen.shows(PERDU) && screen.shows(TITRE)],
  ];
  for (const [onglet, ici] of lieux) {
    await screen.press(onglet);
    await attendre(screen, ici, `« ${onglet} » reached and itself`);
    if (sos) expect(screen.shows(SOS), `« ${onglet} »: the rider's SOS is above it`).toBe(true);
    expect(screen.shows(TITRE), `« ${onglet} »: Séra's alert ${onglet === 'Opérations' ? 'is' : 'is not'} here`).toBe(onglet === 'Opérations');
  }
}

describe.skipIf(SERA.raisonSaut !== null)(SERA.titre('ALERTES — Séra\'s alerts on Opérations, closed against the real Séra book'), () => {
  it('a real alert shows first on Opérations; « J\'ai vu » sends ONE close, and only Séra\'s answer takes it away', async () => {
    const l = await livre();
    const O = 'ord-alertes-walk-1';
    const { id, depuis } = await l.lever(O);
    const stored = storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE), 'Séra\'s alert on screen');
    expect(screen.shows(`Commande ${O}`), 'which order').toBe(true);
    expect(screen.shows(`Prêt depuis ${quandOuaga(depuis, new Date())}, heure de Ouagadougou.`), 'since when, on the Ouagadougou clock').toBe(true);
    expect(screen.shows(SUITE), 'and the next step he can take').toBe(true);
    expect(screen.texts().some((t) => t.includes('ready_package_no_task')), 'no raw Séra word on screen').toBe(false);
    // First card under the masthead, above « Colis perdu en route ».
    expect(rang(screen, MASTHEAD)).toBeGreaterThanOrEqual(0);
    expect(rang(screen, TITRE), 'under the masthead').toBeGreaterThan(rang(screen, MASTHEAD));
    expect(rang(screen, TITRE), 'above « Colis perdu en route »').toBeLessThan(rang(screen, PERDU));
    expect(screen.canPress(VU), '« J\'ai vu » is present and pressable').toBe(true);
    await partout(screen, false);

    const relacher = l.retenir('POST /ops/alertes/ack', 'avant');
    await doubleTape(screen, VU);
    expect(acks(l), 'two quick presses send ONE close').toBe(1);
    expect(screen.shows(ENVOI), 'it says it is sending').toBe(true);
    expect(screen.shows(TITRE), 'until Séra answers, the alert stays').toBe(true);
    relacher();
    await attendre(screen, () => !screen.shows(TITRE), 'the alert leaving on Séra\'s answer');
    expect(await l.ouvertes(), 'ASK THE BOOK: closed').not.toContain(id);
    expect(await l.fermeePar(id), 'ASK THE BOOK: by the founder').toBe('founder');
    expect(screen.shows(PERDU), 'the tree survived the press, on Opérations').toBe(true);
    expect(stored.get(CLE_SERA), 'the key stays where he put it').toBe(OPS);
    screen.unmount();
  }, 60_000);

  it('custody\'s two problems: the custody file in plain words and never its code, the proof since Séra received it, neither with a next step; each closes on « J\'ai vu »', async () => {
    const l = await livre();
    const P = 'ord-alertes-walk-preuve';
    const G = 'ord-alertes-walk-garde';
    const soumise = iso(-31 * MINUTE);
    const vueA = iso(-5 * MINUTE);
    const preuve = await l.produire('evidence_not_validated_aging', P, iso(0), { task_id: `task-${P}`, submitted_at: soumise, age_min: 31 });
    const garde = await l.produire('impossible_custody', G, vueA, { package_id: `pkg-${G}`, task_id: `task-${G}`, detail: 'chain_tampered' });
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE_GARDE) && screen.shows(TITRE_PREUVE), 'custody\'s two alerts on screen');
    const maintenant = new Date();
    expect(screen.shows(`Commande ${G}`)).toBe(true);
    expect(screen.shows(`Vu par Séra ${quandOuaga(vueA, maintenant)}, heure de Ouagadougou.`), 'since Séra saw it').toBe(true);
    expect(screen.shows('La chaîne de contrôle du colis a été changée après coup.'), 'what is wrong, in plain words').toBe(true);
    expect(screen.shows(`Commande ${P}`)).toBe(true);
    expect(screen.shows(`Preuve reçue par Séra ${quandOuaga(soumise, maintenant)}, heure de Ouagadougou.`), 'since Séra received the proof').toBe(true);
    for (const brut of ['chain_tampered', 'impossible_custody', 'evidence_not_validated_aging']) {
      expect(screen.texts().some((t) => t.includes(brut)), `« ${brut} » never on screen`).toBe(false);
    }
    expect(screen.shows(SUITE), 'no next step is invented for either').toBe(false);
    // Séra's order, oldest first: the proof (31 min) above the custody file (5 min).
    expect(rang(screen, TITRE_PREUVE)).toBeLessThan(rang(screen, TITRE_GARDE));

    await screen.press(VU, 0);
    await attendre(screen, () => !screen.shows(TITRE_PREUVE), 'the proof alert leaving on Séra\'s answer');
    expect(screen.shows(TITRE_GARDE), 'the other stays until it is closed').toBe(true);
    expect(await l.fermeePar(preuve), 'ASK THE BOOK: closed by the founder').toBe('founder');
    await screen.press(VU);
    await attendre(screen, () => !screen.shows(TITRE_GARDE), 'the custody alert leaving on Séra\'s answer');
    expect(await l.fermeePar(garde), 'ASK THE BOOK: closed by the founder').toBe('founder');
    expect(await l.ouvertes(), 'ASK THE BOOK: nothing open').toEqual([]);
    expect(screen.shows(PERDU), 'the tree survived, on Opérations').toBe(true);
    screen.unmount();
  }, 60_000);

  it('a close that never reaches Séra keeps the alert and says « Réessayez »; the retry is the one that lands', async () => {
    const l = await livre();
    const { id } = await l.lever('ord-alertes-walk-2');
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE), 'Séra\'s alert on screen');

    l.couper((cle) => cle === 'POST /ops/alertes/ack');
    await screen.press(VU);
    await attendre(screen, () => screen.shows(PAS_CONFIRME), 'the « Réessayez » sentence');
    expect(screen.shows(TITRE), 'a lost close never takes the alert away').toBe(true);
    expect(screen.canPress(VU), 'and the button is there to try again').toBe(true);
    expect(await l.ouvertes(), 'ASK THE BOOK: still open').toContain(id);

    l.couper(() => false);
    await screen.press(VU);
    await attendre(screen, () => !screen.shows(TITRE), 'the alert leaving on the retry');
    expect(screen.shows(PAS_CONFIRME), 'the failure sentence leaves with the alert').toBe(false);
    expect(await l.fermeePar(id), 'ASK THE BOOK: closed by the founder').toBe('founder');
    screen.unmount();
  }, 60_000);

  it('Séra closed it but the answer was lost: the alert stays, not confirmed; the retry gets Séra\'s « already closed » and it leaves', async () => {
    const l = await livre();
    const { id } = await l.lever('ord-alertes-walk-3');
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE), 'Séra\'s alert on screen');

    l.perdre('POST /ops/alertes/ack');
    await screen.press(VU);
    await attendre(screen, () => screen.shows(PAS_CONFIRME), 'the « Réessayez » sentence');
    expect(screen.shows(TITRE), 'an answer that never arrived is never « closed » on screen').toBe(true);
    expect(await l.ouvertes(), 'ASK THE BOOK: Séra did close it').not.toContain(id);

    await screen.press(VU);
    await attendre(screen, () => !screen.shows(TITRE), 'the alert leaving on the retry');
    expect(acks(l), 'two closes sent, the second answered as a repeat').toBe(2);
    expect(await l.fermeePar(id), 'ASK THE BOOK: closed once, by the founder').toBe('founder');
    screen.unmount();
  }, 60_000);

  it('its course composed between his read and his press: Séra answers it is not raised, the alert stays said not confirmed, and the next read takes it away', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    const O = 'ord-alertes-walk-4';
    const { id } = await l.lever(O);
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE), 'Séra\'s alert on screen');

    await l.composer(O);
    await screen.press(VU);
    await attendre(screen, () => screen.shows(PAS_CONFIRME), 'the « Réessayez » sentence');
    expect(acks(l), 'his close was sent').toBe(1);
    expect(screen.shows(TITRE), 'a close Séra did not record never takes the alert away').toBe(true);
    expect(await l.fermeePar(id), 'ASK THE BOOK: nothing was closed').toBeNull();

    await tic(screen);
    await attendre(screen, () => !screen.shows(TITRE), 'the alert leaving on a read without it');
    expect(screen.shows(PAS_CONFIRME), 'the failure sentence leaves with the alert').toBe(false);
    expect(await l.ouvertes(), 'ASK THE BOOK: nothing open').toEqual([]);
    screen.unmount();
  }, 60_000);

  it('a key refused on his press is cleared, the alert stays said not confirmed, the section says where the key goes; the good key back, his close lands', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    const { id } = await l.lever('ord-alertes-walk-5');
    const stored = storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE), 'Séra\'s alert on screen');

    // Between the read and his press, the key on this browser became one Séra refuses.
    stored.set(CLE_SERA, 'une-cle-que-sera-refuse');
    await screen.press(VU);
    await attendre(screen, () => !stored.has(CLE_SERA), 'the refused key leaving this browser');
    await attendre(screen, () => screen.shows(SANS_CLE), 'the sentence saying where the key goes');
    expect(screen.shows(TITRE), 'a refused key never takes away an alert Séra still holds open').toBe(true);
    expect(screen.shows(PAS_CONFIRME), 'the card he pressed says his close was not confirmed').toBe(true);
    expect(screen.canPress(VU), 'the button is there to try again').toBe(true);
    expect(await l.ouvertes(), 'ASK THE BOOK: still open').toContain(id);

    // He types the good key again in « Coursiers »: the next read keeps the alert, and his close lands.
    stored.set(CLE_SERA, OPS);
    const avant = lectures(l);
    await tic(screen);
    await attendre(screen, () => !screen.shows(SANS_CLE) && lectures(l) > avant, 'a read with the good key');
    expect(screen.shows(TITRE), 'still open in the book, still on screen').toBe(true);
    await screen.press(VU);
    await attendre(screen, () => !screen.shows(TITRE), 'the alert leaving on Séra\'s answer');
    expect(await l.fermeePar(id), 'ASK THE BOOK: closed by the founder').toBe('founder');
    screen.unmount();
  }, 60_000);

  it('a key Séra refuses on the read is cleared, and the section shows no alert it did not read', async () => {
    const l = await livre();
    await l.lever('ord-alertes-walk-6');
    const stored = storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: 'une-cle-que-sera-refuse' });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(SANS_CLE), 'the sentence saying where the key goes');
    expect(stored.has(CLE_SERA), 'the refused key is gone from this browser').toBe(false);
    expect(screen.shows(TITRE), 'a refused read shows no alert').toBe(false);
    expect(screen.canPress(VU)).toBe(false);
    screen.unmount();
  }, 60_000);

  it('nothing open: the section takes no space; a new alert shows at the next read; one read at a time', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => lectures(l) === 1, 'the first read');
    await laisser(screen);
    expect(screen.texts().filter((t) => t.includes('alertes Séra') || t.includes(TITRE)), 'an empty read takes no words').toEqual([]);
    expect(rang(screen, PERDU), 'nothing between the masthead and « Colis perdu en route »').toBe(rang(screen, MASTHEAD) + 1);

    // A ready parcel crosses its hour while he is looking at Opérations.
    await l.lever('ord-alertes-walk-7');
    const lente = l.retenir('GET /ops/alertes', 'avant');
    await tic(screen);
    await tic(screen);
    expect(lectures(l), 'a tick while a read is in flight is skipped').toBe(2);
    lente();
    await attendre(screen, () => screen.shows(TITRE), 'the new alert at the next read');
    screen.unmount();
  }, 60_000);

  it('Séra unreachable after a good read: the alert it read stays, and the section says it could not read again and when it last could', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    await l.lever('ord-alertes-walk-8');
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE), 'Séra\'s alert on screen');

    l.couper((cle) => cle === 'GET /ops/alertes');
    await tic(screen);
    await attendre(screen, () => screen.shows(RELU_IMPOSSIBLE), 'the « could not read again » sentence');
    expect(screen.texts().some((t) => t.startsWith(RELU_IMPOSSIBLE) && t.endsWith(', heure de Ouagadougou.')), 'and when it last could, on the Ouagadougou clock').toBe(true);
    expect(screen.shows(TITRE), 'an alert he was shown does not vanish because the network did').toBe(true);

    l.couper(() => false);
    await tic(screen);
    await attendre(screen, () => !screen.shows(RELU_IMPOSSIBLE), 'the sentence leaving once Séra answers');
    expect(screen.shows(TITRE), 'still open in the book, still on screen').toBe(true);
    screen.unmount();
  }, 60_000);

  it('a read already on its way when he closed it does not bring the closed alert back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const l = await livre();
    const { id } = await l.lever('ord-alertes-walk-9');
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE), 'Séra\'s alert on screen');

    // A re-read leaves, Séra answers it (still open), and that answer is slow.
    const enRoute = l.retenir('GET /ops/alertes', 'apres');
    await tic(screen);
    await attendre(screen, () => lectures(l) === 2, 'the second read leaving');
    await screen.press(VU);
    await attendre(screen, () => !screen.shows(TITRE), 'the alert leaving on Séra\'s answer');
    enRoute();
    await laisser(screen);
    expect(screen.shows(TITRE), 'the late read, taken before his close, does not undo it').toBe(false);
    expect(await l.fermeePar(id)).toBe('founder');
    screen.unmount();
  }, 60_000);

  it('a rider\'s open SOS still shows first: the SOS above every tab, then Opérations\' masthead, then the alert; every tab reachable', async () => {
    const l = await livre();
    await l.lever('ord-alertes-walk-10');
    await l.leverSos('sos-alertes-walk-1');
    storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE) && screen.shows(SOS), 'the SOS and Séra\'s alert on screen');
    expect(rang(screen, SOS), 'the rider\'s SOS comes first').toBeLessThan(rang(screen, MASTHEAD));
    expect(rang(screen, MASTHEAD)).toBeLessThan(rang(screen, TITRE));
    expect(rang(screen, TITRE)).toBeLessThan(rang(screen, PERDU));
    await partout(screen, true);
    screen.unmount();
  }, 60_000);
});
