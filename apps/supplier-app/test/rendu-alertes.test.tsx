import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wire, wiredEnv, type Screen } from './rendu';
import { AppV2 } from '../src/v2/AppV2';

/**
 * ═══ RENDU-RÉEL — Séra's alerts on Opérations, when they cannot be read ═══
 *
 * The section sits first under Opérations' masthead. When it has nothing to
 * show it says why, in one sentence, and every tab of the console stays his:
 * not linked to Séra, no Séra key on this browser, or Séra not answering.
 *
 * Every door at Séra's base meets a network fault here — no recording exists
 * for the alerts door, and an outage is never kinder than the door. The one
 * exception answers the list with an entry the real Worker never sends, one
 * the console cannot read: harsher than the door, never kinder. What the real
 * Worker answers is walked in `rendu-alertes.e2e.test.tsx`. Boutik+'s own
 * services go to the harness's routes, unrouted.
 *
 * Bound: nothing here claims how anything LOOKS.
 */

const SERA_BASE = 'http://sera.test';
const CLE_SERA = 'boutik.coursiers.cle';
const CLE_OPS = 'boutik.operateur.cle';

const PAS_RELIE = "Les alertes Séra ne peuvent pas s'afficher : cette console n'est pas reliée à Séra.";
const SANS_CLE = 'Les alertes Séra ont besoin de la clé Séra. Tapez-la dans « Coursiers ».';
const ILLISIBLE = "Les alertes Séra n'ont pas pu être lues. La console réessaie toute seule.";
const MASTHEAD = 'La page se met à jour toute seule, chaque minute.';
const PERDU = 'Colis perdu en route';
const VU = "J'ai vu";
const TITRE = 'Colis prêt, sans course';

/** Séra's base answers nothing (or, when given, this list on the alerts door); every request to it is kept, with its key. */
function brancher(liste?: unknown[]): { sera: { path: string; auth: string | null }[] } {
  wire([]);
  const viaWire = (globalThis as { fetch: (i: string, init?: RequestInit) => Promise<Response> }).fetch;
  const sera: { path: string; auth: string | null }[] = [];
  (globalThis as { fetch: unknown }).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    if (url.origin === new URL(SERA_BASE).origin) {
      sera.push({ path: url.pathname, auth: new Headers(init?.headers).get('Authorization') });
      if (liste !== undefined && url.pathname === '/ops/alertes') return Response.json({ alertes: liste });
      throw new TypeError('Failed to fetch');
    }
    return viaWire(input, init);
  };
  return { sera };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = SERA_BASE;
  (globalThis as { window?: unknown }).window = { location: { hash: '#operateur' } };
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete (globalThis as { window?: unknown }).window;
  delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
});

async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 80 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

async function ouvrirOperations(): Promise<Screen> {
  const screen = await mountEcran(<AppV2 />);
  // The shell boots on a real ¾ s timer before the Dock shows.
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  await screen.settle();
  await screen.press('Opérations');
  await attendre(screen, () => screen.shows(PERDU), 'Opérations reached');
  return screen;
}

const rang = (screen: Screen, fragment: string): number => screen.texts().findIndex((t) => t.includes(fragment));

/** Every tab of the console, each reached and still itself; back on Opérations at the end. */
async function partout(screen: Screen): Promise<void> {
  const lieux: [string, () => boolean][] = [
    ['Accueil', () => screen.canPress('Vendre un nouveau produit')],
    ['Produits', () => screen.canPress('Lister un produit — gratuit')],
    ['Commandes', () => screen.shows('La liste n’est pas arrivée.')],
    ['Gains', () => screen.shows('Vos gains')],
    ['Opérations', () => screen.shows(PERDU)],
  ];
  for (const [onglet, ici] of lieux) {
    await screen.press(onglet);
    await attendre(screen, ici, `« ${onglet} » reached and itself`);
  }
}

/** The one sentence, first under the masthead and above « Colis perdu en route ». */
function enTete(screen: Screen, phrase: string): void {
  expect(screen.shows(phrase), `On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
  expect(rang(screen, MASTHEAD)).toBeGreaterThanOrEqual(0);
  expect(rang(screen, phrase), 'under the masthead').toBeGreaterThan(rang(screen, MASTHEAD));
  expect(rang(screen, phrase), 'above « Colis perdu en route »').toBeLessThan(rang(screen, PERDU));
  expect(screen.canPress(VU), 'no alert it did not read, so nothing to close').toBe(false);
}

describe('Séra\'s alerts on Opérations: each state it cannot read says so, and leaves every tab usable', () => {
  it('a console not linked to Séra says so, and asks Séra nothing', async () => {
    delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
    storage({ [CLE_OPS]: 'cle-ops-fondateur', [CLE_SERA]: 'cle-sera-du-fondateur' });
    const w = brancher();
    const screen = await ouvrirOperations();
    await partout(screen);
    await attendre(screen, () => screen.shows(PAS_RELIE), 'the « not linked » sentence');
    enTete(screen, PAS_RELIE);
    expect(w.sera).toEqual([]);
    screen.unmount();
  }, 20_000);

  it('no Séra key on this browser: it says where the key goes, and does not ask for the alerts', async () => {
    storage({ [CLE_OPS]: 'cle-ops-fondateur' });
    const w = brancher();
    const screen = await ouvrirOperations();
    await partout(screen);
    await attendre(screen, () => screen.shows(SANS_CLE), 'the « no key » sentence');
    enTete(screen, SANS_CLE);
    expect(w.sera.filter((c) => c.path === '/ops/alertes'), 'no key, no read').toEqual([]);
    screen.unmount();
  }, 20_000);

  it('Séra not answering: it says the alerts could not be read and that it tries again by itself; nothing is invented', async () => {
    storage({ [CLE_OPS]: 'cle-ops-fondateur', [CLE_SERA]: 'cle-sera-du-fondateur' });
    const w = brancher();
    const screen = await ouvrirOperations();
    await partout(screen);
    await attendre(screen, () => screen.shows(ILLISIBLE), 'the « could not be read » sentence');
    enTete(screen, ILLISIBLE);
    const lus = w.sera.filter((c) => c.path === '/ops/alertes');
    expect(lus.length, 'the alerts were asked for').toBeGreaterThan(0);
    expect(lus.every((c) => c.auth === 'Bearer cle-sera-du-fondateur'), 'on his Séra key, in the Authorization header').toBe(true);
    screen.unmount();
  }, 20_000);

  const BON = { id: 'ready_package_no_task:ord-lisible:2026-11-28T13:55:00.000Z', scenario: 'ready_package_no_task', orderId: 'ord-lisible', since: '2026-11-28T13:55:00.000Z' };
  const INCONNU = { id: 'un_probleme_nouveau:ord-9', scenario: 'un_probleme_nouveau', orderId: 'ord-9', since: '2026-11-28T14:00:00.000Z' };

  it('an entry it cannot read beside a good one: the good alert shows, and so does the « could not be read » sentence', async () => {
    storage({ [CLE_OPS]: 'cle-ops-fondateur', [CLE_SERA]: 'cle-sera-du-fondateur' });
    brancher([BON, INCONNU]);
    const screen = await ouvrirOperations();
    await attendre(screen, () => screen.shows(TITRE) && screen.shows(ILLISIBLE), 'the good alert and the sentence');
    expect(screen.shows('Commande ord-lisible')).toBe(true);
    expect(screen.canPress(VU), 'the alert it read can be closed').toBe(true);
    expect(rang(screen, ILLISIBLE), 'the sentence first, above the alert').toBeLessThan(rang(screen, TITRE));
    expect(screen.texts().some((t) => t.includes('un_probleme_nouveau') || t.includes('ord-9')), 'nothing of the unread entry is guessed').toBe(false);
    await partout(screen);
    screen.unmount();
  }, 20_000);

  it('only entries it cannot read: the « could not be read » sentence, never an empty section that looks like nothing open', async () => {
    storage({ [CLE_OPS]: 'cle-ops-fondateur', [CLE_SERA]: 'cle-sera-du-fondateur' });
    brancher([INCONNU]);
    const screen = await ouvrirOperations();
    await partout(screen);
    await attendre(screen, () => screen.shows(ILLISIBLE), 'the « could not be read » sentence');
    enTete(screen, ILLISIBLE);
    screen.unmount();
  }, 20_000);
});
