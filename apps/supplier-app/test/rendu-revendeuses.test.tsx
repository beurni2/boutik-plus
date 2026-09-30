import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SOperations } from '../src/operations/screen';

/**
 * ═══ RENDU-RÉEL — the founder's Revendeuses zone, driven (AUDIT-B+2 F-71,
 * F-73, F-74, F-75; F-81 « the reseller cards ») ═══
 *
 * · F-71 — the board counted a commission §6.5 holds as a sale and a net, and
 *   ranked her up for it. Shop+ now counts it apart (`retenues`), her book's
 *   own rule; the board says it on her row and the ranking ignores it.
 * · F-75 — « Couper l'accès » also closes her boutique, and the board hid who
 *   was paused. The roster says it; the board marks her « Accès coupé ».
 * · F-74 — « Donner son code » on a row whose code was already given killed
 *   that code in one tap. It is now « Donner un nouveau code », and it asks.
 * · F-73 — the old desk promised entry its codes cannot give, and minted for
 *   any id. Renamed, true, and an id no reseller holds never reaches the door.
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
function livre(): { routes: Route[] } {
  const etat = { awa: 'active' };
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
            ? { status: 200, json: { ok: true, accounts: [{ ...AWA, state: etat.awa }, FATI, MARIAM] } }
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
                    { accountId: 'rs-0001', incomplet: false, name: 'Awa', netFcfa: 2_500, retenues: { n: 1, netFcfa: 2_500 }, state: 'active', ventes: 1 },
                    { accountId: 'rs-0003', incomplet: false, name: 'Mariam', netFcfa: 3_000, state: 'paused', ventes: 2 },
                    { accountId: 'rs-0002', incomplet: false, name: 'Fati', netFcfa: 0, state: 'pending_access', ventes: 0 },
                  ],
                },
              }
            : { status: 401, json: { error: 'unauthorized' } }
          : null,
      (path) => (path === '/reseller/codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
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
        return { status: 200, json: { ok: true, accountId: 'rs-0001', state: 'paused' } };
      },
      (path, body, _s, h) => {
        if (path !== '/reseller/code') return null;
        if (!cle(h)) return { status: 401, json: { error: 'unauthorized' } };
        if (typeof body?.['resellerId'] !== 'string') return { status: 400, json: { ok: false, reason: 'malformed' } };
        return { status: 200, json: { ok: true, code: 'SP-ANCI-ENCO-DE01', mintedAt: '2026-09-30T09:00:00.000Z', resellerId: body['resellerId'] } };
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
    expect(screen.shows('+ 1 commission retenue'), 'the held part is said on her row').toBe(true);
    expect(screen.shows("Une commission retenue n'est pas comptée"), 'what « retenue » means is said').toBe(true);
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

describe('F-73 — the old desk says what it is, and mints for nobody', () => {
  it('its name and its sentence are true, and it points to where access is given', async () => {
    wire(livre().routes);
    const screen = await vers('Anciens codes des ventes');
    expect(screen.shows('Ils ne servent plus à entrer dans Shop+')).toBe(true);
    expect(screen.shows('Donner son code')).toBe(true);
    expect(screen.shows('Elle le tape une fois pour entrer dans Shop+'), 'the old promise is gone').toBe(false);
    screen.unmount();
  });

  it('an id no reseller holds never reaches the door; a real one does', async () => {
    const w = wire(livre().routes);
    const screen = await vers('Anciens codes des ventes');
    await screen.type('rs-9999');
    await screen.press('Créer le code');
    expect(w.calls.filter((c) => c.path === '/reseller/code').length, 'a code for nobody is never minted').toBe(0);
    expect(screen.shows('Ce code ne va à personne')).toBe(true);
    await screen.type('rs-0001');
    expect(screen.shows('Ce code ne va à personne'), 'typing again clears the refusal').toBe(false);
    await screen.press('Créer le code');
    const sent = w.calls.filter((c) => c.path === '/reseller/code');
    expect(sent.length).toBe(1);
    expect(sent[0]!.body).toEqual({ resellerId: 'rs-0001' });
    screen.unmount();
  });
});
