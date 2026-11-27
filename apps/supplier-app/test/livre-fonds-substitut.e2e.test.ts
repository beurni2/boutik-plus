import React from 'react';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wiredEnv, type Screen } from './rendu';
import { SZoneFonds } from '../src/fonds/zone';
import { miniflareDuDepot, voisin } from './bundle-voisin';
import {
  MOTIF_CLASSEMENT,
  livreFondsSubstitut,
  motifDe,
  preuveDe,
  reclamation,
  refDe,
  type FauteStockee,
  type ReclamationStockee,
} from './livre-fonds-substitut';

/**
 * ═══ THE FUND STAND-IN, CERTIFIED AGAINST THE REAL BOOK — BOTH READINGS ═══
 *
 * The console's walks read the fund book through `livre-fonds-substitut.ts`.
 * A stand-in kinder than the real door is a bug we own, so this file seeds
 * the REAL book (the platform's own protection-service bundle, on workerd)
 * through its own routes, builds the stand-in from what the real book then
 * lists, and compares status and body, deep, for every read the console
 * makes: the open claims, every closed page to the end at two page sizes,
 * the bounds, every refusal, a wrong key, and the fund's figures.
 *
 * TWO BUILDS, one per reading:
 *   · `PLATFORM_REPO` (or a `platform` clone beside this one) — a build
 *     with the paged reading; the stand-in's `pages` mode is checked on it;
 *   · `PLATFORM_REPO_ANCIEN` (or a `platform-ancien` clone beside this one)
 *     — a build of the book live before it, which ignores every parameter;
 *     the `ancien` mode is checked on it.
 * Each is skipped, with the reason in its title, where its build is absent
 * (this repo's CI checks out one repo).
 *
 * AND THE SEAM ITSELF: the real « Fonds » zone, mounted, its fetch routed
 * into the same real book — the first view, « Voir les réclamations plus
 * anciennes », and every claim the BOOK holds on screen exactly once.
 */

const BUNDLE = { service: 'services/protection-service', dist: 'dist/worker/worker.mjs', rebuild: 'pnpm --filter @platform/protection-service bundle:worker' };
const NOUVEAU = voisin({ depot: 'platform', env: 'PLATFORM_REPO', ...BUNDLE });
const ANCIEN = voisin({ depot: 'platform-ancien', env: 'PLATFORM_REPO_ANCIEN', ...BUNDLE });
const Miniflare = miniflareDuDepot();
const OPS = 'test-protection-ops-substitut';
const BASE = 'http://protection.test';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

type Livre = {
  get(path: string, cle?: string): Promise<{ status: number; json: Record<string, unknown> }>;
  post(path: string, body: Record<string, unknown>): Promise<number>;
  /** Routes `globalThis.fetch` into this book, recording `path?query`. */
  brancher(): string[];
  dispose(): Promise<void>;
};

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_PROTECTION_BASE'];
});

function livreReel(bundle: string): Livre {
  const dir = mkdtempSync(join(tmpdir(), 'fonds-substitut-'));
  dirs.push(dir);
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'protection.mjs', contents: readFileSync(bundle, 'utf8') }],
    compatibilityDate: '2025-07-05',
    durableObjects: { FONDS: 'FondsDO' },
    durableObjectsPersist: dir,
    bindings: { PROTECTION_OPS_SECRET: OPS },
  });
  return {
    async get(path, cle = OPS) {
      const res = await mf.dispatchFetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${cle}` } });
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    },
    async post(path, body) {
      const res = await mf.dispatchFetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPS}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await res.text();
      return res.status;
    },
    brancher() {
      const lus: string[] = [];
      (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
        const url = new URL(String(input));
        if (url.origin !== BASE) throw new Error(`unexpected call ${url.href}`);
        lus.push(`${url.pathname}${url.search}`);
        return mf.dispatchFetch(url.href, init as never) as unknown as Response;
      };
      return lus;
    },
    dispose: () => mf.dispose(),
  };
}

async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 200 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

const FAUTES: readonly FauteStockee[] = ['seller', 'buyer', 'payment_provider', 'platform_system', 'unresolved'];
/** 25 claims; c07 stays opened, c19 goes under review; the other 23 close,
 *  in key order, every third one by payment and the rest without payout. */
const IDS = Array.from({ length: 25 }, (_, i) => `ord-c${String(i + 1).padStart(2, '0')}`);
const OUVERTE = 'ord-c07';
const EXAMEN = 'ord-c19';

/** Seeds the real book through its own doors, as the founder's acts would. */
async function semer(livre: Livre): Promise<void> {
  for (const [i, id] of IDS.entries()) {
    const status = await livre.post('/claims', {
      orderId: id,
      reason: motifDe(id),
      faultClass: FAUTES[i % FAUTES.length],
      amountFcfa: 1_000 * (i + 1),
      evidenceBundleId: preuveDe(id),
    });
    expect(status, `opening ${id}`).toBe(201);
  }
  for (const [i, id] of IDS.entries()) {
    if (id === OUVERTE) continue;
    const avancer = (body: Record<string, unknown>) => livre.post(`/claims/${id}/advance`, body);
    if (id === EXAMEN) {
      expect(await avancer({ to: 'under_review' })).toBe(200);
    } else if (i % 3 === 0) {
      expect(await avancer({ to: 'under_review' })).toBe(200);
      expect(await avancer({ to: 'resolved', settlementRef: refDe(id) })).toBe(200);
    } else {
      expect(await avancer({ to: 'closed_no_payout', closedReason: MOTIF_CLASSEMENT })).toBe(200);
    }
  }
}

/** Every closed page, followed to its end from the REAL book's answers. */
async function pagesFermees(livre: Livre, limite: number): Promise<string[]> {
  const chemins: string[] = [];
  let avant: number | null | undefined;
  for (let tour = 0; tour < 30; tour += 1) {
    const chemin = `/claims?part=closed&limit=${limite}${avant === undefined ? '' : `&before=${avant}`}`;
    chemins.push(chemin);
    const r = await livre.get(chemin);
    const suivant = r.json['nextBefore'];
    if (typeof suivant !== 'number') break;
    avant = suivant;
  }
  return chemins;
}

const BORNES = [
  '/claims',
  '/claims?part=open',
  '/claims?part=closed',
  '/claims?part=closed&limit=20',
  '/claims?part=closed&limit=100',
  '/claims?part=closed&limit=05',
  '/claims?part=closed&before=1',
  '/claims?part=closed&limit=5&before=999',
  '/claims?part=x',
  '/claims?part=',
  '/claims?part=closed&limit=0',
  '/claims?part=closed&limit=101',
  '/claims?part=closed&limit=abc',
  '/claims?part=closed&before=0',
  '/claims?part=closed&before=-3',
  '/claims?part=open&limit=5',
  '/claims?part=open&before=3',
  '/claims?part=closed&unknown=1',
  '/fund',
];

async function comparer(livre: Livre, substitut: ReturnType<typeof livreFondsSubstitut>, chemins: readonly string[]): Promise<number> {
  for (const chemin of chemins) {
    const url = new URL(chemin, BASE);
    const reel = await livre.get(chemin);
    const joue = substitut.repondre(url.pathname, url.searchParams.toString(), `Bearer ${OPS}`);
    expect(joue, `${chemin}: the stand-in answers it`).not.toBeNull();
    expect({ status: joue!.status, json: joue!.json }, `${chemin}: the stand-in says what the real book says`).toEqual(reel);
  }
  for (const chemin of ['/claims?part=open', '/claims?part=closed&limit=20', '/fund']) {
    const url = new URL(chemin, BASE);
    const reel = await livre.get(chemin, 'test-une-autre-cle');
    const joue = substitut.repondre(url.pathname, url.searchParams.toString(), 'Bearer test-une-autre-cle');
    expect(reel.status, `${chemin}: the real door refuses a wrong key`).toBe(401);
    expect({ status: joue!.status, json: joue!.json }, `${chemin} with a wrong key`).toEqual(reel);
  }
  return chemins.length;
}

for (const [slot, mode] of [[NOUVEAU, 'pages'], [ANCIEN, 'ancien']] as const) {
  describe.skipIf(slot.raisonSaut !== null)(slot.titre(`the fund stand-in in « ${mode} » mode answers as the real book does`), () => {
    it('an empty book: the open claims, the first closed page and the figures', async () => {
      slot.exigerAJour();
      const livre = livreReel(slot.bundle);
      const substitut = livreFondsSubstitut({ cle: OPS, claims: [], mode });
      await comparer(livre, substitut, ['/claims', '/claims?part=open', '/claims?part=closed&limit=20', '/fund']);
      await livre.dispose();
    }, 60_000);

    it('a book of 2 open and 23 closed claims: every read the console makes, every page to the end, every refusal', async () => {
      slot.exigerAJour();
      const livre = livreReel(slot.bundle);
      await semer(livre);
      const complet = (await livre.get('/claims')).json['claims'] as ReclamationStockee[];
      expect(complet.length, 'the real book holds what was seeded').toBe(25);
      const substitut = livreFondsSubstitut({ cle: OPS, claims: complet, mode });

      // The reading this build gives is the one this slot certifies.
      const premiere = await livre.get('/claims?part=closed&limit=20');
      if (mode === 'pages') {
        expect(premiere.status).toBe(200);
        expect((premiere.json['claims'] as unknown[]).length, 'a real page of 20').toBe(20);
        expect(premiere.json['nextBefore'], 'older claims remain').toBe(4);
        const ouvertes = (await livre.get('/claims?part=open')).json['claims'] as ReclamationStockee[];
        expect(ouvertes.map((c) => c.claim.orderId), 'the open claims, whole').toEqual([OUVERTE, EXAMEN]);
      } else {
        expect(premiere.json, 'this build ignores the page and answers the full list').toEqual({ claims: complet });
        expect('nextBefore' in premiere.json).toBe(false);
      }

      const chemins = [...BORNES, ...(await pagesFermees(livre, 20)), ...(await pagesFermees(livre, 3))];
      const n = await comparer(livre, substitut, chemins);
      // 23 closed: 2 pages of 20 and 8 pages of 3 on the paged book; one
      // full answer each on the other.
      expect(n, 'reads compared').toBe(BORNES.length + (mode === 'pages' ? 2 + 8 : 1 + 1));
      await livre.dispose();
    }, 60_000);

    it('the claim builder the walks use writes what the real book stores, field for field', async () => {
      slot.exigerAJour();
      const livre = livreReel(slot.bundle);
      await semer(livre);
      const complet = (await livre.get('/claims')).json['claims'] as ReclamationStockee[];
      for (const reel of complet) {
        const etapes = reel.advanced;
        const construite = reclamation({
          orderId: reel.claim.orderId,
          faute: reel.claim.faultClass,
          etat: reel.claim.state,
          ouverteLe: reel.openedAt,
          montantFcfa: reel.claim.amount,
          ...(etapes[0]?.to === 'under_review' ? { examineeLe: etapes[0].at } : {}),
          ...(etapes.length > 0 && etapes[etapes.length - 1]!.to !== 'under_review' ? { fermeeLe: etapes[etapes.length - 1]!.at } : {}),
        });
        expect(construite, `${reel.claim.orderId} (${reel.claim.faultClass}, ${reel.claim.state})`).toEqual(reel);
      }
      await livre.dispose();
    }, 60_000);

    it('the real « Fonds » zone, pressed against this book: each claim it holds shows once, and the older ones are reachable', async () => {
      slot.exigerAJour();
      const livre = livreReel(slot.bundle);
      await semer(livre);
      const complet = ((await livre.get('/claims')).json['claims'] as ReclamationStockee[]).map((c) => c.claim.orderId);
      wiredEnv();
      process.env['EXPO_PUBLIC_PROTECTION_BASE'] = BASE;
      storage({ 'boutik.fonds.cle': OPS });
      const lus = livre.brancher();
      const screen = await mountEcran(React.createElement(SZoneFonds));
      await attendre(screen, () => screen.shows(OUVERTE), 'the first view');
      const fois = (x: string): number => screen.texts().filter((t) => t === x).length;

      expect([...lus].sort(), 'the desk asks for the figures, the open claims and one closed page').toEqual(
        ['/claims?part=closed&limit=20', '/claims?part=open', '/fund'].sort(),
      );
      if (mode === 'pages') {
        expect(fois(OUVERTE) + fois(EXAMEN), 'both open claims on the first view').toBe(2);
        // The 3 first closed (c01, c02, c03) wait on the older page.
        for (const x of ['ord-c01', 'ord-c02', 'ord-c03']) expect(fois(x), x).toBe(0);
        expect(complet.filter((x) => fois(x) === 1).length, 'the first view: 2 open + 20 closed').toBe(22);
        await screen.press('Voir les réclamations plus anciennes');
        await attendre(screen, () => screen.shows('ord-c01'), 'the older page');
        expect(lus.filter((l) => l.includes('before=')), 'the next page, from the real nextBefore').toEqual(['/claims?part=closed&limit=20&before=4']);
      }
      for (const x of complet) expect(fois(x), `${x}, held by the book, shows once`).toBe(1);
      expect(screen.shows('Voir les réclamations plus anciennes'), 'no button left that leads nowhere').toBe(false);
      expect(lus.includes('/claims'), 'the whole book was never asked for').toBe(false);
      screen.unmount();
      await livre.dispose();
    }, 60_000);
  });
}
