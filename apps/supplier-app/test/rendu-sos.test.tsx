import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wire, wiredEnv, type Screen } from './rendu';
import { AppV2 } from '../src/v2/AppV2';

/**
 * ═══ RENDU-RÉEL — the SOS strip's honest states, on the REAL console root ═══
 *
 * A rider's alert must show on every screen of the founder's console. Before
 * any alert can show, the strip has to say plainly why it cannot read them:
 * no Séra key on this browser, no Séra address in this build, or Séra not
 * answering. Never silence that reads as « all clear ».
 *
 * These states need no answer from Séra, so they run everywhere, this repo's
 * CI included. The alerts themselves, and the founder's answer, are walked
 * against the REAL Séra worker in `rendu-sos.e2e.test.tsx`.
 *
 * Bound: nothing here claims how anything LOOKS.
 */

const SERA_BASE = 'http://sera.test';
const CLE_SERA = 'boutik.coursiers.cle';
const SANS_CLE = 'Les alertes SOS des coursiers ont besoin de la clé Séra';
const PAS_RELIE = "Les alertes SOS ne peuvent pas s'afficher";
const ILLISIBLE = "Les alertes SOS n'ont pas pu être lues";
/** Any sentence the strip can say carries one of these. */
const DU_BANDEAU = ['alertes SOS', 'SOS de'];
/** SOS_RELECTURE_MS — pinned in `sos-vue.test.ts`; written here so this walk
 *  imports nothing of the strip and stays red, for its own reason, without it. */
const RELECTURE = 15_000;

/** The founder's browser: `#operateur` opens his door on a fresh device. */
function porteOuverte(): void {
  (globalThis as { window?: unknown }).window = { location: { hash: '#operateur' } };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = SERA_BASE;
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { fetch?: unknown }).fetch;
  delete (globalThis as { window?: unknown }).window;
  delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
});

/** The shell boots on a real ¾ s timer (§4.3 boot 750) before the Dock shows. */
async function demarrer(): Promise<Screen> {
  const screen = await mountEcran(<AppV2 />);
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  await screen.settle();
  return screen;
}

const duBandeau = (screen: Screen): string[] => screen.texts().filter((t) => DU_BANDEAU.some((m) => t.includes(m)));

/**
 * Every screen of the console, each reached and still itself, with `attendu`
 * above it: the five tabs and the new-product wizard.
 */
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
    expect(screen.shows(attendu), `« ${onglet} »: the strip says « ${attendu} »`).toBe(true);
  }
  await screen.press('Accueil');
  await screen.press('Vendre un nouveau produit');
  expect(screen.shows('Nouveau produit'), 'the wizard is reached').toBe(true);
  expect(screen.shows(attendu), `the wizard: the strip says « ${attendu} »`).toBe(true);
  await screen.press('Terminer');
  expect(screen.canPress('Accueil'), 'and he can leave it').toBe(true);
}

describe('the SOS strip says why it cannot read, on every screen, and only to the founder', () => {
  it('a supplier\'s phone (no operator door, no Séra key): the strip says nothing and asks nothing', async () => {
    storage({});
    const w = wire([]);
    const screen = await demarrer();
    expect(screen.canPress('Vendre un nouveau produit')).toBe(true);
    expect(screen.canPress('Opérations'), 'a fresh device shows no operator tab').toBe(false);
    expect(duBandeau(screen), 'no founder sentence on a supplier\'s screen').toEqual([]);
    expect(w.calls, 'nothing is asked of Séra').toEqual([]);
    screen.unmount();
  }, 20_000);

  it('his browser with no Séra key: one plain sentence, on every screen, and nothing asked of Séra', async () => {
    porteOuverte();
    storage({});
    const w = wire([]);
    const screen = await demarrer();
    expect(screen.shows(SANS_CLE), 'the strip says where the key goes').toBe(true);
    expect(duBandeau(screen), 'one sentence, never a list of nothing').toHaveLength(1);
    await partout(screen, SANS_CLE);
    expect(w.calls, 'no key: nothing is asked of Séra').toEqual([]);
    screen.unmount();
  }, 20_000);

  it('a build with no Séra address: it says the console is not connected, never « all clear »', async () => {
    delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
    porteOuverte();
    storage({ [CLE_SERA]: 'cle-sera-du-fondateur' });
    const w = wire([]);
    const screen = await demarrer();
    expect(screen.shows(PAS_RELIE)).toBe(true);
    await partout(screen, PAS_RELIE);
    expect(w.calls).toEqual([]);
    screen.unmount();
  }, 20_000);

  it('Séra not answering before any read: it says the alerts could not be read, keeps every screen usable, and tries again on its clock', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    porteOuverte();
    storage({ [CLE_SERA]: 'cle-sera-du-fondateur' });
    const appels: string[] = [];
    (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
      appels.push(`${init?.method ?? 'GET'} ${String(input)}`);
      throw new TypeError('Failed to fetch');
    };
    const screen = await demarrer();
    for (let i = 0; i < 40 && !screen.shows(ILLISIBLE); i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
      await screen.settle();
    }
    expect(screen.shows(ILLISIBLE), `the strip says it could not read. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().some((t) => t.startsWith('SOS de ')), 'no alert is invented from a read that failed').toBe(false);
    expect(appels, 'only Séra was asked, for the SOS list').toEqual([`GET ${SERA_BASE}/ops/sos`]);
    await partout(screen, ILLISIBLE);

    await act(async () => { vi.advanceTimersByTime(RELECTURE); });
    for (let i = 0; i < 40 && appels.length < 2; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    }
    expect(appels, 'the strip asks again on its own clock').toEqual([`GET ${SERA_BASE}/ops/sos`, `GET ${SERA_BASE}/ops/sos`]);
    screen.unmount();
  }, 20_000);

  it('once the console is closed, the strip asks Séra nothing more', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    porteOuverte();
    storage({ [CLE_SERA]: 'cle-sera-du-fondateur' });
    const appels: string[] = [];
    (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
      appels.push(`${init?.method ?? 'GET'} ${String(input)}`);
      throw new TypeError('Failed to fetch');
    };
    const screen = await demarrer();
    for (let i = 0; i < 40 && appels.length < 1; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    }
    expect(appels, 'the strip read once while the console was open').toEqual([`GET ${SERA_BASE}/ops/sos`]);

    screen.unmount();
    await act(async () => { vi.advanceTimersByTime(RELECTURE * 3); });
    for (let i = 0; i < 10; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    }
    expect(appels, 'its clock stopped with it: no read after the console is gone').toEqual([`GET ${SERA_BASE}/ops/sos`]);
  }, 20_000);
});
