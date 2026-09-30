import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SOperations } from '../src/operations/screen';

/**
 * ═══ RENDU-RÉEL — the founder's Revendeuses zone, driven (AUDIT-B+2 F-71,
 * F-73, F-74, F-75; F-81 « the reseller cards ») ═══
 *
 * · F-71 — the board counted a commission §6.5 holds as a sale and a net, and
 *   ranked her up for it. Shop+ now counts it apart (`misesDeCote`), her book's
 *   own rule; the board says it on her row and the ranking ignores it.
 * · F-75 — « Couper l'accès » also closes her boutique, and the board hid who
 *   was paused. The roster says it; the board marks her « Accès coupé ».
 * · F-74 — « Donner son code » on a row whose code was already given killed
 *   that code in one tap. It is now « Donner un nouveau code », and it asks.
 * · F-73 — the old codes desk is RETIRED with the codes themselves (founder
 *   ruling 2026-09-30): the menu no longer offers it, and nothing reads them.
 * · F-81 — the reseller cards had no walk: « Couper l'accès » is pressed here,
 *   and the roster and the board are read again after it.
 *
 * ⚠ Every answer below is one Shop+'s own suite recorded (the harness fails a
 * walk whose stand-in says anything else).
 */

const OPS = 'cle-ops';
const CLE_C = 'cle-c-e2e';

const compte = (accountId: string, name: string, state: string, pending = false) => ({
  accessCodePending: pending,
  accessCodeRevelable: pending,
  accountId,
  createdAt: '2026-09-20T08:00:00.000Z',
  email: `${accountId}@exemple.bf`,
  name,
  phone: '+22670000000',
  state,
});
const AWA = compte('rs-0001', 'Awa', 'active');
const FATI = compte('rs-0002', 'Fati', 'pending_access', true);
const MARIAM = compte('rs-0003', 'Mariam', 'paused');

/** One book: the roster and the board move together, as Shop+'s do. */
function livre(o: { fatiActiveApresPause?: boolean; awaIncomplete?: boolean } = {}): { routes: Route[] } {
  const etat = { awa: 'active', fati: FATI as Record<string, unknown> };
  const autour: Route[] = [
    (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
    (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
    (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
  ];
  const cle = (h: Record<string, string>): boolean => h['authorization'] === `Bearer ${CLE_C}`;
  return {
    routes: [
      ...autour,
      (path, _b, _s, h) =>
        path === '/reseller/accounts'
          ? cle(h)
            ? { status: 200, json: { ok: true, accounts: [{ ...AWA, state: etat.awa }, etat.fati, MARIAM] } }
            : { status: 401, json: { error: 'unauthorized' } }
          : null,
      (path, _b, _s, h) =>
        path === '/reseller/suivi'
          ? cle(h)
            ? {
                status: 200,
                json: {
                  ok: true,
                  total: 3,
                  lignes: [
                    // Awa: one clean sale and one HELD — the held one is apart.
                    { accountId: 'rs-0001', incomplet: o.awaIncomplete === true, name: 'Awa', netFcfa: 2_500, misesDeCote: { n: 1, netFcfa: 2_500 }, state: 'active', ventes: 1 },
                    { accountId: 'rs-0003', incomplet: false, name: 'Mariam', netFcfa: 3_000, state: 'paused', ventes: 2 },
                    { accountId: 'rs-0002', incomplet: false, name: 'Fati', netFcfa: 0, state: 'pending_access', ventes: 0 },
                  ],
                },
              }
            : { status: 401, json: { error: 'unauthorized' } }
          : null,
      (path, body, _s, h) => {
        if (path !== '/reseller/accounts/access-code') return null;
        if (!cle(h)) return { status: 401, json: { error: 'unauthorized' } };
        if (body?.['accountId'] !== 'rs-0002') return { status: 404, json: { ok: false, reason: 'not_found' } };
        return { status: 200, json: { ok: true, accountId: 'rs-0002', code: 'SPA-NOUV-EAUC-ODE1' } };
      },
      (path, body, _s, h) => {
        if (path !== '/reseller/accounts/pause') return null;
        if (!cle(h)) return { status: 401, json: { error: 'unauthorized' } };
        if (body?.['accountId'] !== 'rs-0001') return { status: 409, json: { ok: false, reason: 'wrong_state', state: 'pending_access' } };
        etat.awa = 'paused';
        // She typed her code on her phone meanwhile: the roster moves under him.
        if (o.fatiActiveApresPause === true) etat.fati = { ...FATI, state: 'active', accessCodePending: false, accessCodeRevelable: false };
        return { status: 200, json: { ok: true, accountId: 'rs-0001', state: 'paused' } };
      },
    ],
  };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  storage({ 'boutik.operateur.cle': OPS, 'boutik.livraisons.cle': CLE_C });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

async function vers(section: string) {
  const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
  await screen.settle();
  await screen.press('Revendeuses');
  await screen.settle();
  // The old desk's sentence names « Revendeuses Shop+ » too (it points there):
  // the roster's own card is the first one carrying the words.
  await screen.press(section, 0);
  await screen.settle();
  return screen;
}

describe('F-71 · F-75 — the board says what her own book says', () => {
  it('a held commission is on her row APART from her sales, said once, and does not rank her up', async () => {
    wire(livre().routes);
    const screen = await vers('Suivi des revendeuses');
    const tx = screen.texts();
    expect(screen.shows('+ 1 commission mise de côté'), 'the held part is said on her row').toBe(true);
    expect(screen.shows("Une commission mise de côté n'est pas comptée"), 'what « mise de côté » means is said').toBe(true);
    // Mariam (2 sales) ranks above Awa (1 sale + 1 held): the held one is no sale.
    const i = (n: string): number => tx.findIndex((x) => x === n);
    expect(i('Mariam') >= 0 && i('Awa') >= 0).toBe(true);
    expect(i('Mariam') < i('Awa'), `the held sale must not rank her up: ${JSON.stringify(tx)}`).toBe(true);
    screen.unmount();
  });

  it('a paused reseller is marked « Accès coupé » on the board', async () => {
    wire(livre().routes);
    const screen = await vers('Suivi des revendeuses');
    expect(screen.shows('Accès coupé'), 'Mariam is paused: her row must say so').toBe(true);
    screen.unmount();
  });

  it('the roster says « Couper l’accès » also closes her boutique', async () => {
    wire(livre().routes);
    const screen = await vers('Revendeuses Shop+');
    expect(screen.shows('Couper l\'accès ferme aussi sa boutique')).toBe(true);
    screen.unmount();
  });
});

describe('F-81 — the reseller cards, pressed', () => {
  it('« Couper l’accès » sends her id on key C, then the roster AND the board are read again', async () => {
    const w = wire(livre().routes);
    const screen = await vers('Revendeuses Shop+');
    const lu = (p: string): number => w.calls.filter((c) => c.path === p).length;
    const [comptesAvant, suiviAvant] = [lu('/reseller/accounts'), lu('/reseller/suivi')];
    await screen.press('Couper l\'accès');
    const pause = w.calls.filter((c) => c.path === '/reseller/accounts/pause');
    expect(pause.length, 'the tap reached the door').toBe(1);
    expect(pause[0]!.body).toEqual({ accountId: 'rs-0001' });
    expect(pause[0]!.headers['authorization']).toBe(`Bearer ${CLE_C}`);
    expect(lu('/reseller/accounts'), 'the roster is read again').toBeGreaterThan(comptesAvant);
    expect(lu('/reseller/suivi'), 'the board is read again').toBeGreaterThan(suiviAvant);
    expect(screen.canPress('Rouvrir l\'accès'), 'the next act is his: her row now offers to reopen').toBe(true);
    screen.unmount();
  });
});

describe('F-74 — a code already given is never killed in one tap', () => {
  it('« Donner un nouveau code » asks first; « Annuler » sends nothing; « Oui » mints for HER', async () => {
    const w = wire(livre().routes);
    const screen = await vers('Revendeuses Shop+');
    expect(screen.canPress('Donner son code'), 'her code was given: the old label hid what the tap does').toBe(false);
    await screen.press('Donner un nouveau code');
    const mints = (): number => w.calls.filter((c) => c.path === '/reseller/accounts/access-code').length;
    expect(mints(), 'the first tap only asks').toBe(0);
    expect(screen.shows("l'ancien ne marchera plus"), 'the cost is said before the tap').toBe(true);
    await screen.press('Annuler');
    expect(screen.shows("l'ancien ne marchera plus")).toBe(false);
    expect(mints()).toBe(0);
    await screen.press('Donner un nouveau code');
    await screen.press('Oui, un nouveau code');
    const sent = w.calls.filter((c) => c.path === '/reseller/accounts/access-code');
    expect(sent.length).toBe(1);
    expect(sent[0]!.body).toEqual({ accountId: 'rs-0002' });
    expect(screen.shows('SPA-NOUV-EAUC-ODE1'), 'he reaches the next step: the new code, to give her').toBe(true);
    screen.unmount();
  });
});

describe('CODES-RETIRES-1 — the old codes desk is gone (founder ruling 2026-09-30, « Retire them »)', () => {
  it('the Revendeuses menu offers no « Anciens codes des ventes », and the console never asks Shop+ for old codes', async () => {
    const w = wire(livre().routes);
    const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
    await screen.settle();
    await screen.press('Revendeuses');
    await screen.settle();
    expect(screen.shows('Anciens codes des ventes'), JSON.stringify(screen.texts())).toBe(false);
    expect(screen.canPress('Revendeuses Shop+'), 'the account roster is still the way to give access').toBe(true);
    expect(w.calls.filter((c) => c.path.startsWith('/reseller/code')).length, 'no read of the retired codes').toBe(0);
    screen.unmount();
  });
});

describe('slice 10 verifier — the reseller cards stay true when the roster moves', () => {
  it('F-74 — armed, then her code is used: the question folds away and can never fire another act', async () => {
    const w = wire(livre({ fatiActiveApresPause: true }).routes);
    const screen = await vers('Revendeuses Shop+');
    await screen.press('Donner un nouveau code');
    expect(screen.shows("l'ancien ne marchera plus")).toBe(true);
    // Another act on the tab reads the roster again: Fati is active now.
    await screen.press('Couper l\'accès');
    expect(screen.shows("l'ancien ne marchera plus"), 'the question belonged to a code that is no longer waiting').toBe(false);
    expect(screen.canPress('Oui, un nouveau code'), 'a confirm left over would cut HER access').toBe(false);
    expect(w.calls.filter((c) => c.path === '/reseller/accounts/pause').map((c) => c.body)).toEqual([{ accountId: 'rs-0001' }]);
    expect(w.calls.filter((c) => c.path === '/reseller/accounts/access-code').length).toBe(0);
    screen.unmount();
  });

  it('F-71 — on a row read only in part, the held count says « au moins » and shows no amount', async () => {
    wire(livre({ awaIncomplete: true }).routes);
    const screen = await vers('Suivi des revendeuses');
    expect(screen.shows('au moins 1 commission mise de côté'), JSON.stringify(screen.texts())).toBe(true);
    expect(screen.shows('commission mise de côté :'), 'an amount nobody finished reading is never shown as whole').toBe(false);
    screen.unmount();
  });
});
