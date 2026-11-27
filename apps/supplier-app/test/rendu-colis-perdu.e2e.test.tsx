import React from 'react';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wiredEnv, type Screen } from './rendu';
import { AppV2 } from '../src/v2/AppV2';
import { httpColisPerdu } from '../src/colis-perdu/service';
import { poserActe } from '../src/colis-perdu/acte';
import { SERA, miniflareDuDepot, voisin } from './bundle-voisin';

/**
 * ═══ RENDU-RÉEL + SEAM — « Colis perdu en route », pressed against the REAL
 * Séra logistics and custody Workers ═══
 *
 * The founder declares a parcel lost on the road from Opérations (Sera-Build-
 * Spec §6.5, canon 3.28.0). This walk mounts the REAL console root and routes
 * its fetch into Séra's OWN logistics bundle, bound to Séra's OWN custody
 * bundle, on workerd. No app code is stubbed. After each act it asks custody's
 * LEDGER, its claims, logistics' board and the rider's session, never the
 * screen or the response alone.
 *
 * The rider's gestures (privacy, shift, accept, the stall check, the seal) are
 * made on Séra's own doors with his own code, as his phone would.
 *
 * Stand-ins, stated:
 *   · Shop+'s progress door (custody's SHOP_PROGRESS) answers 503 to every
 *     call: package.lost.v1 stays queued on custody's own outbox. What Shop+
 *     does with it is not this walk's claim; an outage is never kinder.
 *   · ONE test makes the custody binding fail at the network, to walk Séra's
 *     own `custody_unreachable`; everything else is the real custody Worker.
 *   · Only the network's faults are added: an answer lost after Séra did the
 *     work, and a host outside Séra that does not answer.
 *
 * ⚠ The bundles live in the Séra repo: skipped, with the reason in the title,
 * where no clone sits beside this one.
 *
 * Bound: nothing here claims how anything LOOKS.
 */

const CUSTODY = voisin({
  depot: 'sera',
  env: 'SERA_REPO',
  service: 'services/custody-service',
  dist: 'dist-worker/worker.mjs',
  rebuild: 'pnpm --filter @sera/custody-service bundle:worker',
});

const OPS = 'test-sera-ops-perdu-walk';
const INTAKE = 'test-sera-intake-perdu-walk';
const VERIFY = 'test-sera-verify-perdu-walk';
const CUSTODY_OPS = 'test-sera-custody-ops-perdu-walk';
const PRODUCE = 'test-sera-produce-perdu-walk';
const SHOP_ARM = 'test-sera-shop-arm-perdu-walk';
const LIVREE = 'test-sera-livree-perdu-walk';
const SHOP_PROGRESS = 'test-sera-shop-progress-perdu-walk';
const BASE = 'http://sera.test';
const CLE_SERA = 'boutik.coursiers.cle';
const CLE_OPS = 'boutik.operateur.cle';
const SUPPLIER = 'supplier-perdu-walk';
const T = '2026-11-27T09:00:00.000Z';
const LOC = { zone: 'Zogona, Ouagadougou', landmark: "À l'échangeur", directions: '', maskedRelay: '' };
const WIN = { start: T, end: '2026-11-27T16:00:00.000Z' };
const ALL_PASS = { produit_conforme: true, quantite_complete: true, emballage_intact: true };

const TITRE = 'Colis perdu en route';
const DECLARER = 'Déclarer ce colis perdu';
const OUI = 'Oui, déclarer perdu';
const DECLARE = "Séra a déclaré le colis perdu. L'acheteur sera remboursé en entier, et le coursier est libre.";
const DEJA = "Ce colis est déjà déclaré perdu : rien n'a été fait deux fois. L'acheteur sera remboursé en entier, et le coursier est libre.";
const NON_SU = "Séra n'a pas répondu. On ne sait pas encore si le colis est déclaré. Réessayez.";
const PAS_FINI = "Séra n'a pas pu finir la déclaration. Réessayez : ce qui est déjà fait ne sera pas refait.";
const PAS_CHEZ = "Séra dit que le coursier n'a pas ce colis en main. Une partie est peut-être déjà déclarée : regardez la course dans « Coursiers » avant de recommencer.";
const SANS_CLE = 'Pour déclarer un colis perdu, tapez d\'abord la clé Séra dans « Coursiers ».';

type Json = Record<string, unknown>;
type Mf = { dispatchFetch(url: string, init?: unknown): Promise<Response>; dispose(): Promise<void> };

const Miniflare = miniflareDuDepot();
const dirs: string[] = [];
let vivants: Mf[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
afterEach(async () => {
  await Promise.all(vivants.map((m) => m.dispose().catch(() => undefined)));
  vivants = [];
});

const dossier = (tag: string): string => {
  const d = mkdtempSync(join(tmpdir(), `perdu-walk-${tag}-`));
  dirs.push(d);
  return d;
};

interface Seres {
  logistics: Mf;
  custody: Mf;
  /** The custody binding fails at the network while this is true. */
  custodyCoupee: { v: boolean };
  /** The next declare answer is lost on its way back, after Séra did the work. */
  perdreReponse: { v: boolean };
  /** Every declare body the console sent, as Séra received it. */
  envois: Json[];
}

function seres(o: { sansCustody?: boolean } = {}): Seres {
  SERA.exigerAJour();
  CUSTODY.exigerAJour();
  const custodyCoupee = { v: false };
  let custody!: Mf;
  let logistics!: Mf;
  logistics = new Miniflare({
    modules: [{ type: 'ESModule', path: 'sera-logistics.mjs', contents: readFileSync(SERA.bundle, 'utf8') }],
    durableObjects: { LOGISTICS: 'LogisticsDO' },
    durableObjectsPersist: dossier('logistics'),
    ...(o.sansCustody === true
      ? {}
      : {
          serviceBindings: {
            CUSTODY: (async (request: Request) => {
              if (custodyCoupee.v) throw new TypeError('custody unreachable');
              return custody.dispatchFetch(request.url, request as never);
            }) as never,
          },
        }),
    bindings: { SERA_OPS_SECRET: OPS, SERA_INTAKE_SECRET: INTAKE, SERA_RIDER_VERIFY_SECRET: VERIFY, SERA_PRODUCE_SECRET: PRODUCE, SERA_COURSE_LIVREE_SECRET: LIVREE },
  }) as Mf;
  custody = new Miniflare({
    modules: [{ type: 'ESModule', path: 'sera-custody.mjs', contents: readFileSync(CUSTODY.bundle, 'utf8') }],
    compatibilityDate: '2025-07-05',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { CUSTODY: 'CustodyDO', PACKAGE_CLAIM: 'PackageClaimDO' },
    durableObjectsPersist: dossier('custody'),
    serviceBindings: {
      LOGISTICS: ((request: Request) => logistics.dispatchFetch(request.url, request as never)) as never,
      SHOP_PROGRESS: (async () => Response.json({ ok: false, reason: 'unavailable' }, { status: 503 })) as never,
    },
    bindings: {
      SERA_CUSTODY_OPS_SECRET: CUSTODY_OPS,
      SERA_PRODUCE_SECRET: PRODUCE,
      SHOP_ARM_SECRET: SHOP_ARM,
      SERA_RIDER_VERIFY_SECRET: VERIFY,
      SERA_COURSE_LIVREE_SECRET: LIVREE,
      SHOP_PROGRESS_SECRET: SHOP_PROGRESS,
    },
  }) as Mf;
  vivants.push(logistics, custody);
  const s: Seres = { logistics, custody, custodyCoupee, perdreReponse: { v: false }, envois: [] };

  // ONLY globalThis.fetch is replaced: the console's own ports call it.
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    // Opérations' other desks talk to Boutik+'s own services: not answering here.
    if (!url.startsWith(BASE)) throw new TypeError('Failed to fetch');
    const path = new URL(url).pathname;
    if (path === '/ops/colis/perdu') s.envois.push(JSON.parse(String(init?.body)) as Json);
    const res = await logistics.dispatchFetch(url, init as never);
    if (path === '/ops/colis/perdu' && s.perdreReponse.v) {
      s.perdreReponse.v = false;
      await res.text();
      throw new TypeError('Failed to fetch');
    }
    return res;
  };
  return s;
}

async function appel(mf: Mf, url: string, key: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await mf.dispatchFetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}
const ops = (s: Seres, path: string, body?: unknown) => appel(s.logistics, `${BASE}${path}`, OPS, body);
const intake = async (s: Seres, path: string, body: unknown): Promise<void> => {
  const r = await appel(s.logistics, `${BASE}${path}`, INTAKE, body);
  expect(r.status, `${path}: ${JSON.stringify(r.json)}`).toBe(200);
};
const rider = (s: Seres, path: string, code: string, body?: unknown) => appel(s.logistics, `${BASE}${path}`, code, body ?? {});
const riderCustody = (s: Seres, path: string, code: string, body: unknown) => appel(s.custody, `http://custody${path}`, code, body);
const custodyOps = (s: Seres, path: string) => appel(s.custody, `http://custody/ops${path}`, CUSTODY_OPS);

const moi = async (s: Seres, code: string): Promise<Json | null> => {
  const r = await appel(s.logistics, `${BASE}/rider/moi`, code);
  expect(r.status).toBe(200);
  return (r.json['rider'] as Json)['assignment'] as Json | null;
};
const custodian = async (s: Seres, orderId: string): Promise<unknown> => (await custodyOps(s, `/ledger?orderId=${orderId}`)).json['currentCustodian'];
const claims = async (s: Seres, orderId: string): Promise<unknown> => (await custodyOps(s, `/liability-claims?orderId=${orderId}`)).json['claims'];

async function patienter<T>(lire: () => Promise<T>, fini: (v: T) => boolean, pourquoi: string): Promise<T> {
  let v = await lire();
  for (let i = 0; i < 120 && !fini(v); i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    v = await lire();
  }
  if (!fini(v)) throw new Error(`${pourquoi} — last: ${JSON.stringify(v)}`);
  return v;
}

/** One course of these orders, accepted by its rider, the supplier's code confirmed (Séra's own doors). */
async function confie(s: Seres, orderIds: string[], riderId: string, nom: string, prefix: string): Promise<{ code: string; assignmentId: string }> {
  const colis = { packageId: `col-${prefix}`, orderIds };
  for (const o of orderIds) {
    await intake(s, '/intake/funding', { orderId: o, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: T, ...(orderIds.length > 1 ? { package: colis } : {}) });
    await intake(s, '/intake/readiness', { orderId: o, ready: true, asOf: T, supplierRef: SUPPLIER });
  }
  const tache = await ops(s, '/ops/task', {
    command_id: `${prefix}-t`, orderId: orderIds[0], location: LOC, window: WIN,
    articles: orderIds.map((o, i) => ({ orderId: o, libelle: `Article ${i + 1}` })),
  });
  expect(tache.status, JSON.stringify(tache.json)).toBe(200);
  expect((await ops(s, '/ops/riders', { riderId, displayName: nom, phoneAlias: prefix })).status).toBe(200);
  expect((await ops(s, '/ops/riders/certify', { riderId, certified: true })).status).toBe(200);
  const code = (await ops(s, '/ops/rider-code/mint', { riderId })).json['code'] as string;
  expect((await rider(s, '/rider/ack-privacy', code)).status).toBe(200);
  expect((await rider(s, '/rider/shift/start', code)).status).toBe(200);
  const donne = await ops(s, '/ops/assign', { command_id: `${prefix}-a`, taskId: tache.json['taskId'], riderId });
  expect(donne.json['ok'], JSON.stringify(donne.json)).toBe(true);
  const assignmentId = (donne.json['assignment'] as Json)['assignmentId'] as string;
  expect((await rider(s, '/rider/assignment/ack', code, { assignmentId })).status).toBe(200);
  const a = (await moi(s, code))!;
  await intake(s, '/intake/ramassage/verify', { command_id: `${prefix}-ram`, orderId: orderIds[0], code: a['codeRamassage'] });
  return { code, assignmentId };
}

/** Checked at the stall, then (unless told otherwise) sealed: the rider holds it. */
async function enMain(s: Seres, orderIds: string[], code: string, sceller = true): Promise<{ codeScelle: string; chains: Record<string, Json> }> {
  for (const o of orderIds) await patienter(async () => (await custodyOps(s, `/ledger?orderId=${o}`)).status, (x) => x === 200, `custody chain ${o}`);
  const a = (await moi(s, code))!;
  const chains: Record<string, Json> = {};
  for (const o of orderIds) {
    const v = await riderCustody(s, '/rider/verification', code, { orderId: o, command_id: `v-${o}`, presentedPickupCode: a['codeVerification'], checkResults: ALL_PASS, dwellSec: 150, evidenceBundleId: `ev-${o}` });
    expect(v.json, JSON.stringify(v.json)).toMatchObject({ ok: true, kind: 'accepted' });
    if (!sceller) continue;
    const b = await riderCustody(s, '/rider/custody/begin', code, { orderId: o, command_id: `b-${o}`, custodySealId: a['codeScelle'], sealPhotoRefs: [] });
    expect(b.status, JSON.stringify(b.json)).toBe(200);
    chains[o] = b.json['chain'] as Json;
  }
  // His phone reads its session after the seal, as it does on its own clock:
  // that read is what brings custody's word back to the board.
  await moi(s, code);
  return { codeScelle: a['codeScelle'] as string, chains };
}

beforeEach(() => {
  // The open declaration outlives a mounted screen by design: each walk starts with none.
  poserActe(null);
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = BASE;
  (globalThis as { window?: unknown }).window = { location: { hash: '#operateur' } };
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete (globalThis as { window?: unknown }).window;
  delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
});

/** Real I/O runs outside React's microtasks: wait, inside act, until it lands. */
async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 400 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

async function ouvrirOperations(): Promise<Screen> {
  const screen = await mountEcran(<AppV2 />);
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  await screen.settle();
  await screen.press('Opérations');
  await attendre(screen, () => screen.shows(TITRE) && !screen.shows('On lit chez Séra'), 'the section read the board');
  return screen;
}

/** The first « Réessayer » in render order is this section's: it sits above the board's own. */
const reessayer = (screen: Screen) => screen.press('Réessayer', 0);

describe.skipIf(SERA.raisonSaut !== null || CUSTODY.raisonSaut !== null)(
  SERA.titre(CUSTODY.titre('COLIS-PERDU — the founder declares a parcel lost, pressed against the real Séra logistics and custody')),
  () => {
    it('a sealed parcel of two orders: listed by name, two amounts typed, the answer lost on the way back, « Réessayer » with the same id answers « déjà déclaré », and the LEDGER says lost:sera with ONE claim each at the typed amount, the course closed, the rider free', async () => {
      const A = 'ord-walk-a';
      const B = 'ord-walk-b';
      const s = seres();
      const { code, assignmentId } = await confie(s, [A, B], 'rider-walk-boss', 'Boss', 'wa');
      await enMain(s, [A, B], code);
      for (const o of [A, B]) expect(await custodian(s, o), o).toBe('courier:rider-walk-boss');

      storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
      const screen = await ouvrirOperations();
      expect(screen.shows('Colis de 2 commandes · chez Boss'), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      await screen.press(DECLARER);
      await screen.type('12000', `Commande ${A}`);
      await screen.type('7500', `Commande ${B}`);
      await screen.press('Continuer');
      s.perdreReponse.v = true;
      await screen.press(OUI);
      await attendre(screen, () => screen.shows(NON_SU), 'the lost answer said as « not known »');
      expect(screen.shows(DECLARE), 'an answer that never arrived is never « declared »').toBe(false);

      // Séra did the work: asked of custody's own ledger and claims.
      for (const o of [A, B]) expect(await custodian(s, o), o).toBe('lost:sera');
      await reessayer(screen);
      await attendre(screen, () => screen.shows(DEJA), 'the retry answered « déjà déclaré »');
      expect(s.envois).toHaveLength(2);
      expect(s.envois[1], 'the retry is the same declaration under the same id').toEqual(s.envois[0]);
      expect(s.envois[0]).toEqual({ command_id: expect.any(String), orderId: A, montants: [{ orderId: A, amount: 12000 }, { orderId: B, amount: 7500 }] });

      expect(await claims(s, A)).toEqual([{ orderId: A, cause: 'sera_loss', amount: 12000, evidenceBundleId: `ev-${A}`, state: 'opened' }]);
      expect(await claims(s, B)).toEqual([{ orderId: B, cause: 'sera_loss', amount: 7500, evidenceBundleId: `ev-${B}`, state: 'opened' }]);
      expect(await moi(s, code), 'no course on the rider\'s phone').toBeNull();
      const board = (await ops(s, '/ops/board')).json;
      expect(JSON.stringify(board).includes(assignmentId), 'the course is off the live board').toBe(false);
      expect((await rider(s, '/rider/shift/end', code)).status, 'the rider is free to end his shift').toBe(200);

      // Back on the list: the parcel is no longer offered.
      await screen.press('Fermer');
      await attendre(screen, () => screen.shows("Aucun coursier n'a de colis en main en ce moment."), 'the list read again');
      expect(screen.canPress(DECLARER)).toBe(false);

      // A second declaration on the console's own port, under a NEW id: still « déjà déclaré », still one claim each.
      const port = httpColisPerdu(BASE, OPS);
      expect(await port.declarer('a-new-id', A, [{ orderId: A, amount: 99000 }, { orderId: B, amount: 1 }])).toEqual({ kind: 'deja_declare' });
      expect(await claims(s, A)).toHaveLength(1);
      expect(await claims(s, B)).toHaveLength(1);
      screen.unmount();
    }, 180_000);

    it('Séra could not reach custody: the screen says it could not finish, nothing is said as declared, and « Réessayer » with the same id declares it', async () => {
      const O = 'ord-walk-coupe';
      const s = seres();
      const { code } = await confie(s, [O], 'rider-walk-awa', 'Awa', 'wc');
      await enMain(s, [O], code);
      storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
      const screen = await ouvrirOperations();
      expect(screen.shows(`Commande ${O} · chez Awa`), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      await screen.press(DECLARER);
      await screen.type('5000', `Commande ${O}`);
      await screen.press('Continuer');
      s.custodyCoupee.v = true;
      await screen.press(OUI);
      await attendre(screen, () => screen.shows(PAS_FINI), 'custody_unreachable said by name');
      expect(screen.shows("Rien n'a été déclaré")).toBe(false);
      s.custodyCoupee.v = false;
      expect(await custodian(s, O)).toBe('courier:rider-walk-awa');
      expect(await claims(s, O)).toEqual([]);

      await reessayer(screen);
      await attendre(screen, () => screen.shows(DECLARE), 'the retry declared it');
      expect(s.envois[1]).toEqual(s.envois[0]);
      expect(await custodian(s, O)).toBe('lost:sera');
      expect(await claims(s, O)).toEqual([{ orderId: O, cause: 'sera_loss', amount: 5000, evidenceBundleId: `ev-${O}`, state: 'opened' }]);
      screen.unmount();
    }, 120_000);

    it('the list was read while the rider held both orders, then one was delivered: « Oui » is answered « pas chez le livreur », said by name, and nothing moved', async () => {
      const A = 'ord-walk-livre-a';
      const B = 'ord-walk-livre-b';
      const s = seres();
      const { code } = await confie(s, [A, B], 'rider-walk-ali', 'Ali', 'wl');
      const { codeScelle, chains } = await enMain(s, [A, B], code);
      storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
      const screen = await ouvrirOperations();
      await screen.press(DECLARER);
      await screen.type('4000', `Commande ${A}`);
      await screen.type('6000', `Commande ${B}`);
      await screen.press('Continuer');

      // Meanwhile B reaches its buyer (Séra's own door road).
      const DROP = 'DROP-WALK-LIVRE';
      expect((await appel(s.custody, 'http://custody/produce-shop/secrets/arm', SHOP_ARM, { orderId: B, command_id: `arm-${B}`, kind: 'buyer_drop_code', secret: DROP })).status).toBe(200);
      const chain = chains[B]!;
      expect((await riderCustody(s, '/rider/delivery/evidence', code, { orderId: B, command_id: `e-${B}`, bundle: { taskId: chain['task_id'], packageId: chain['package_id'], custodySealId: codeScelle, artifacts: [], capturedAt: T } })).status).toBe(200);
      await riderCustody(s, '/rider/door/inspection', code, {
        orderId: B, command_id: `i-${B}`, inspectionCategory: 'uncategorised_conservative', packageOpened: false, manufacturerSealOpened: false,
        custodySealIntact: true, buyerAccepts: true, startedAt: T, completedAt: T, evidenceBundleId: `sans-photo-porte-${B}`,
      });
      expect((await riderCustody(s, '/rider/delivery/drop', code, { orderId: B, command_id: `d-${B}`, dropCode: DROP })).status).toBe(200);
      expect(await custodian(s, B)).toBe('customer');

      // Opérations' own desks carry « Réessayer » buttons of their own: count them.
      const avant = screen.texts().filter((x) => x === 'Réessayer').length;
      await screen.press(OUI);
      await attendre(screen, () => screen.shows(PAS_CHEZ), 'pas_chez_le_livreur said by name');
      expect(screen.texts().filter((x) => x === 'Réessayer').length, 'a refusal by name is not retried').toBe(avant);
      expect(screen.canPress('Fermer'), 'the way out').toBe(true);
      expect(await custodian(s, A)).toBe('courier:rider-walk-ali');
      expect(await claims(s, A)).toEqual([]);
      expect(await claims(s, B)).toEqual([]);
      screen.unmount();
    }, 120_000);

    it('before the seal the parcel is not offered, and Séra itself refuses it; its other answers reach the console\'s own port by name', async () => {
      const O = 'ord-walk-avant';
      const s = seres();
      const { code } = await confie(s, [O], 'rider-walk-iso', 'Iso', 'wv');
      await enMain(s, [O], code, false);
      const avant = await custodian(s, O);
      storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: OPS });
      const screen = await ouvrirOperations();
      expect(screen.shows("Aucun coursier n'a de colis en main en ce moment."), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      expect(screen.canPress(DECLARER)).toBe(false);
      screen.unmount();

      const port = httpColisPerdu(BASE, OPS);
      expect(await port.declarer('w-1', O, [{ orderId: O, amount: 5000 }])).toEqual({ kind: 'pas_chez_le_livreur' });
      expect(await port.declarer('w-2', 'ord-nobody', [{ orderId: 'ord-nobody', amount: 5000 }])).toEqual({ kind: 'no_active_course' });
      expect(await port.declarer('w-3', O, [{ orderId: O, amount: 5000 }, { orderId: 'ord-extra', amount: 1 }])).toEqual({ kind: 'montants_incomplets' });
      expect(await port.declarer('w-4', O, [{ orderId: O, amount: 0 }])).toEqual({ kind: 'malformed' });
      expect(await httpColisPerdu(BASE, 'not-the-key').declarer('w-5', O, [{ orderId: O, amount: 5000 }])).toEqual({ kind: 'bad_key' });
      expect(await custodian(s, O)).toBe(avant);
      expect(await claims(s, O)).toEqual([]);
    }, 120_000);

    it('a Séra with no custody binding answers « custody non relié » by name, and a wrong key on the board clears it from the browser', async () => {
      const s = seres({ sansCustody: true });
      const O = 'ord-walk-seul';
      await intake(s, '/intake/funding', { orderId: O, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: T });
      await intake(s, '/intake/readiness', { orderId: O, ready: true, asOf: T, supplierRef: SUPPLIER });
      const tache = await ops(s, '/ops/task', { command_id: 'ws-t', orderId: O, location: LOC, window: WIN, articles: [{ orderId: O, libelle: 'Article 1' }] });
      expect(tache.status, JSON.stringify(tache.json)).toBe(200);
      await ops(s, '/ops/riders', { riderId: 'rider-walk-seul', displayName: 'Seul', phoneAlias: 'ws' });
      await ops(s, '/ops/riders/certify', { riderId: 'rider-walk-seul', certified: true });
      const code = (await ops(s, '/ops/rider-code/mint', { riderId: 'rider-walk-seul' })).json['code'] as string;
      await rider(s, '/rider/ack-privacy', code);
      await rider(s, '/rider/shift/start', code);
      const donne = await ops(s, '/ops/assign', { command_id: 'ws-a', taskId: tache.json['taskId'], riderId: 'rider-walk-seul' });
      expect(donne.json['ok'], JSON.stringify(donne.json)).toBe(true);
      expect(await httpColisPerdu(BASE, OPS).declarer('w-6', O, [{ orderId: O, amount: 5000 }])).toEqual({ kind: 'custody' });

      const disque = storage({ [CLE_OPS]: 'cle-ops-boutik', [CLE_SERA]: 'une-cle-que-sera-refuse' });
      const screen = await ouvrirOperations();
      expect(screen.shows(SANS_CLE), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      expect(disque.has(CLE_SERA), 'the refused key is gone from this browser').toBe(false);
      expect(disque.get(CLE_OPS)).toBe('cle-ops-boutik');
      screen.unmount();
    }, 120_000);
  },
);
