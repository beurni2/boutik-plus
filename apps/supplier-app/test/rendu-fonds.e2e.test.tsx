import React from 'react';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wiredEnv, type Screen } from './rendu';
import { RAISON_MESSAGE, SZoneFonds } from '../src/fonds/zone';
import { t } from '../src/i18n';
import { resolveFondsService } from '../src/fonds/service';
import { miniflareDuDepot, voisin } from './bundle-voisin';

/**
 * ═══ RENDU-RÉEL + SEAM — « Fonds de protection », driven against the REAL
 * Fund book (AUDIT-B+2 F-81) ═══
 *
 * The Fonds zone writes to an append-only money book and had view tests only:
 * no port test, no walk. This walk mounts the REAL zone and routes its fetch
 * into the platform repo's OWN protection-service bundle on workerd — no app
 * code stubbed, no stand-in to be kinder than the door — and after each act
 * it ASKS THE BOOK, not the screen.
 *
 * The four questions: the tree survives each act · the key door, « Déclarer
 * le solde », « Nouvelle réclamation » and « Passer en examen » are pressable
 * and wired (the book changed) · a refused key returns him to the door ·
 * each act leads to the next.
 *
 * ⚠ The bundle lives in the platform repo: skipped, with the reason in the
 * title, where no clone sits beside this one (this repo's CI).
 */

const PLATFORM = voisin({
  depot: 'platform',
  env: 'PLATFORM_REPO',
  service: 'services/protection-service',
  dist: 'dist/worker/worker.mjs',
  rebuild: 'pnpm --filter @platform/protection-service bundle:worker',
});
const Miniflare = miniflareDuDepot();
const OPS = 'test-protection-ops-fonds';
const BASE = 'http://protection.test';
const CLE_SLOT = 'boutik.fonds.cle';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function livre(): { mf: InstanceType<typeof Miniflare>; demander: (path: string) => Promise<Record<string, unknown>>; appels: string[] } {
  PLATFORM.exigerAJour();
  const dir = mkdtempSync(join(tmpdir(), 'fonds-walk-'));
  dirs.push(dir);
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'protection.mjs', contents: readFileSync(PLATFORM.bundle, 'utf8') }],
    compatibilityDate: '2025-07-05',
    durableObjects: { FONDS: 'FondsDO' },
    durableObjectsPersist: dir,
    bindings: { PROTECTION_OPS_SECRET: OPS },
  });
  const appels: string[] = [];
  // ONLY globalThis.fetch is replaced: the zone's own port calls it.
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (!url.startsWith(BASE)) throw new Error(`unexpected call ${url}`);
    appels.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
    return mf.dispatchFetch(url, init as never) as unknown as Response;
  };
  const demander = async (path: string): Promise<Record<string, unknown>> =>
    (await (await mf.dispatchFetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${OPS}` } })).json()) as Record<string, unknown>;
  return { mf, demander, appels };
}

/** Real I/O runs outside React's microtasks: wait, inside act, until it lands. */
async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 200 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_PROTECTION_BASE'] = BASE;
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_PROTECTION_BASE'];
});

const ZERO = "Une réclamation s'ouvre seulement pour un montant dû";

// Runs everywhere, CI included: the form refuses a 0 before the book can, so
// the service's own zero refusal never reaches this screen in a walk — its
// words are pinned here instead.
describe('the words for each refusal of the book', () => {
  it('a 0-franc refusal is said as one, and only an unanswered book is called unreachable', () => {
    expect(RAISON_MESSAGE.zero_amount).toBe('fonds.montant_zero');
    expect(t(RAISON_MESSAGE.zero_amount)).toContain(ZERO);
    const injoignable = Object.entries(RAISON_MESSAGE).filter(([, cle]) => cle === 'fonds.injoignable').map(([raison]) => raison);
    expect(injoignable, 'no named refusal may borrow « ne répond pas »').toEqual(['unreachable']);
  });
});

describe.skipIf(PLATFORM.raisonSaut !== null)(PLATFORM.titre('F-81 — the Fonds zone, pressed against the real Fund book'), () => {
  it('key → declare the balance → open a claim → under review: each act reaches the BOOK, and the screen follows it', async () => {
    const { mf, demander, appels } = livre();
    const stored = storage({});
    const screen = await mountEcran(<SZoneFonds />);
    await screen.settle();

    // The door: his key, typed, kept on his device only.
    await screen.type(OPS);
    await screen.press('Ouvrir le registre');
    await attendre(screen, () => screen.shows('Pas encore déclaré'), 'the book read after the key');
    expect(stored.get(CLE_SLOT)).toBe(OPS);
    expect(appels).toContain('GET /claims');
    expect(appels).toContain('GET /fund');
    expect(screen.shows('Pas encore déclaré'), 'an undeclared fund is said as undeclared').toBe(true);
    expect(screen.shows("Aucune réclamation"), 'the empty book is a designed state').toBe(true);

    // Declare the balance.
    await screen.press('Déclarer le solde');
    await screen.type('500000', 'Solde du compte en francs');
    await screen.press('Enregistrer le solde daté');
    // The zone re-reads the book after the save, and its loading line has no
    // « Pas encore déclaré » either: wait for the re-read to land, not for that
    // line to go.
    await attendre(screen, () => !screen.shows('Pas encore déclaré') && screen.canPress('Nouvelle réclamation'), 'the declared balance on screen');
    const fund = (await demander('/fund')) as { declaration?: { balanceFcfa?: number } };
    expect(fund.declaration?.balanceFcfa, 'ASK THE BOOK: the declaration landed').toBe(500_000);
    expect(screen.shows('Pas encore déclaré'), 'the screen read the book again').toBe(false);

    // Open a claim.
    await screen.press('Nouvelle réclamation');
    await screen.type('ord-fonds-walk', 'Commande concernée');
    await screen.type('11000', 'Montant en francs');
    await screen.type('Refus à la porte — mauvaise taille', "Ce qui s'est passé");
    await screen.type('evb-walk-1', 'Référence de la preuve');
    await screen.press('Enregistrer la réclamation');
    await attendre(screen, () => screen.shows('ord-fonds-walk'), 'the new claim on screen');
    const apres = (await demander('/claims')) as { claims?: { orderId?: string; state?: string; claim?: { orderId?: string } }[] };
    const ligne = JSON.stringify(apres.claims ?? []);
    expect(ligne, 'ASK THE BOOK: the claim exists').toContain('ord-fonds-walk');
    expect(screen.shows('ord-fonds-walk'), 'the screen lists the claim the book holds').toBe(true);

    // Move it under review.
    await screen.press('Passer en examen');
    await attendre(screen, () => !screen.canPress('Passer en examen'), 'the claim leaving « opened »');
    const examen = JSON.stringify(((await demander('/claims')) as { claims?: unknown[] }).claims ?? []);
    expect(examen, 'ASK THE BOOK: the claim moved').toContain('under_review');
    expect(screen.canPress('Passer en examen'), 'the act it was is done; the next ones are offered').toBe(false);
    screen.unmount();
    await mf.dispose();
  }, 60_000);

  it('a claim of 0 francs is refused on screen, in plain words, and never reaches the book', async () => {
    const { mf, demander, appels } = livre();
    storage({ [CLE_SLOT]: OPS });
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.canPress('Nouvelle réclamation'), 'the book read with the stored key');

    await screen.press('Nouvelle réclamation');
    await screen.type('ord-fonds-zero', 'Commande concernée');
    await screen.type('0', 'Montant en francs');
    await screen.type('Rien à payer', "Ce qui s'est passé");
    await screen.type('evb-zero-1', 'Référence de la preuve');
    await screen.press('Enregistrer la réclamation');
    await screen.settle();
    await attendre(screen, () => screen.shows(ZERO), 'the zero refusal on screen');

    expect(screen.shows('ne répond pas'), 'the book did answer: never say it did not').toBe(false);
    expect(appels, 'nothing is sent for a 0-franc claim').not.toContain('POST /claims');
    const montant = screen.tree.root.findAll((n) => n.props.label === 'Montant en francs' && typeof n.props.value === 'string');
    expect(montant.length, 'the amount field is still on screen').toBeGreaterThan(0);
    expect(montant[0]?.props.value, 'his typing is kept so he can fix it').toBe('0');
    expect(screen.canPress('Enregistrer la réclamation'), 'the form stays open: he can fix the amount and go on').toBe(true);
    const avant = ((await demander('/claims')) as { claims?: unknown }).claims;
    expect(Array.isArray(avant), 'ASK THE BOOK: the claims were read').toBe(true);
    expect(JSON.stringify(avant), 'ASK THE BOOK: no claim was opened').not.toContain('ord-fonds-zero');

    // He fixes the amount and goes on: the same form, his other fields kept.
    await screen.type('5000', 'Montant en francs');
    await screen.press('Enregistrer la réclamation');
    await attendre(screen, () => screen.shows('ord-fonds-zero'), 'the claim on screen after the fixed amount');
    const apres = ((await demander('/claims')) as { claims?: unknown }).claims;
    expect(Array.isArray(apres), 'ASK THE BOOK: the claims were read').toBe(true);
    expect(JSON.stringify(apres), 'ASK THE BOOK: the fixed claim exists').toContain('ord-fonds-zero');
    expect(screen.shows(ZERO), 'the refusal is gone once the claim is open').toBe(false);
    screen.unmount();
    await mf.dispose();
  }, 60_000);

  it('the port names the service refusal of a 0-franc claim instead of calling the book unreachable', async () => {
    const { mf, demander, appels } = livre();
    const port = resolveFondsService();
    expect(port, 'the port is configured').not.toBeNull();
    const r = await port!.ouvrir(OPS, {
      orderId: 'ord-fonds-zero-port',
      motif: 'Rien à payer',
      faute: 'seller',
      montantFcfa: 0,
      preuve: 'evb-zero-2',
    });
    expect(appels, 'the port really called the book').toContain('POST /claims');
    expect(r).toEqual({ ok: false, reason: 'zero_amount' });
    if (r.ok) throw new Error('the refusal was asserted above');
    expect(t(RAISON_MESSAGE[r.reason]), 'the words the desk shows for this answer').toContain(ZERO);
    const claims = ((await demander('/claims')) as { claims?: unknown }).claims;
    expect(Array.isArray(claims), 'ASK THE BOOK: the claims were read').toBe(true);
    expect(JSON.stringify(claims), 'ASK THE BOOK: no claim was opened').not.toContain('ord-fonds-zero-port');
    await mf.dispose();
  }, 60_000);

  it('a REFUSED key returns him to the door and is forgotten on this device', async () => {
    const { mf, appels } = livre();
    const stored = storage({ [CLE_SLOT]: 'test-une-autre-cle' });
    const screen = await mountEcran(<SZoneFonds />);
    await attendre(screen, () => screen.canPress('Ouvrir le registre'), 'the door after a refused key');
    expect(appels.length, 'the stored key was tried against the book').toBeGreaterThan(0);
    expect(screen.canPress('Ouvrir le registre'), 'the way back is the door').toBe(true);
    expect(stored.get(CLE_SLOT), 'a refused key is not kept').toBeUndefined();
    screen.unmount();
    await mf.dispose();
  }, 60_000);
});
