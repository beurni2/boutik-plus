import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SOperations } from '../src/operations/screen';

/**
 * ═══ RENDU-RÉEL — « AIDER UNE CLIENTE » (COMPTE-CLIENTE-2), DRIVEN ═══
 *
 * Founder order 2026-09-24, « fix the ones still open »: a Shop+ buyer who
 * forgot her password, or whose number someone else signed up with, gets her
 * account back through a one-time code the founder mints HERE for her NUMBER
 * and gives by calling that number.
 *
 * The four questions: the tree survives the tap · « Créer le code » is
 * present, pressable and wired (the bytes on the wire: the number, key C) ·
 * a refusal leaves the form and says why · he reaches the next screen (the
 * code, big, with what to do with it — and the way back).
 *
 * ⚠ CONTRACT-CERTIFIED to the Shop+ Worker's real answers
 * (services/storefront-service/worker/buyer-accounts-do.ts `/recovery-code`,
 * proven on workerd by comptes-clientes-2.e2e): `{ ok, code, expiresAt }` on a
 * number with an account, `404 { ok:false, reason:'no_account' }` otherwise,
 * `401` on a refused key C. Nothing about her ever rides the answer.
 */

const OPS = 'cle-ops';
const CLE_C = 'cle-c-e2e';
const CODE = 'SPR-ABCD-EFGH-IJKL-MNOP';

/** The rest of the console, answered emptily so the Revendeuses zone renders. */
const autour: Route[] = [
  (path) => (path === '/fulfillment/orders' ? { status: 200, json: { ok: true, orders: [] } } : null),
  (path) => (path === '/fulfillment/supplier-contacts' ? { status: 200, json: { ok: true, contacts: [] } } : null),
  (path) => (path === '/fulfillment/supplier-codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
  (path) => (path === '/checkout/dispatch' ? { status: 200, json: { ok: true, rows: [] } } : null),
  (path) => (path === '/reseller/accounts' ? { status: 200, json: { ok: true, accounts: [] } } : null),
  (path) => (path === '/reseller/suivi' ? { status: 200, json: { ok: true, lignes: [] } } : null),
  (path) => (path === '/reseller/codes' ? { status: 200, json: { ok: true, codes: [] } } : null),
];

/** The Worker's recovery-code door, by its real bounds. */
const livre = (comptes: readonly string[]): Route => (path, body, _search, headers) => {
  if (path !== '/buyer/accounts/recovery-code') return null;
  if (headers['authorization'] !== `Bearer ${CLE_C}`) return { status: 401, json: { error: 'unauthorized' } };
  const phone = String(body?.['phone'] ?? '');
  if (phone.replace(/\D/g, '').length < 8) return { status: 400, json: { ok: false, reason: 'bad_field', field: 'phone' } };
  if (!comptes.includes(phone.replace(/\D/g, '').slice(-8))) return { status: 404, json: { ok: false, reason: 'no_account' } };
  return { status: 200, json: { ok: true, code: CODE, expiresAt: '2026-09-25T08:00:00.000Z' } };
};

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  storage({ 'boutik.operateur.cle': OPS, 'boutik.livraisons.cle': CLE_C });
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

async function versAider() {
  const screen = await mountEcran(<SOperations opsKey={OPS} onKeySaved={() => {}} onKeyCleared={() => {}} />);
  await screen.settle();
  await screen.press('Revendeuses');
  await screen.settle();
  expect(screen.canPress('Aider une cliente Shop+'), 'the fourth door is on the chooser').toBe(true);
  await screen.press('Aider une cliente Shop+');
  await screen.settle();
  return screen;
}

describe('« Aider une cliente » — her way back, from his console', () => {
  it('her number → « Créer le code » → the code, big, with what to do; the wire carries her number on key C, and nothing comes back about her', async () => {
    const w = wire([livre(['70123456']), ...autour]);
    const screen = await versAider();
    expect(screen.shows('créez un code pour qu’elle retrouve son compte')).toBe(true);
    await screen.type('70 12 34 56');
    await screen.press('Créer le code');
    await screen.settle();
    const appel = w.calls.find((c) => c.path === '/buyer/accounts/recovery-code');
    expect(appel?.method).toBe('POST');
    expect(appel?.body).toEqual({ phone: '70 12 34 56' });
    expect(appel?.headers['authorization']).toBe(`Bearer ${CLE_C}`);
    expect(screen.shows(CODE)).toBe(true);
    expect(screen.shows('Code pour le 70 12 34 56')).toBe(true);
    expect(screen.shows('Donnez-le seulement à ce numéro : appelez-le.')).toBe(true);
    // While the code is on screen, the form is gone — one act at a time.
    expect(screen.canPress('Créer le code')).toBe(false);
    await screen.press('C’est fait');
    await screen.settle();
    expect(screen.shows(CODE), 'noted, the code leaves the screen').toBe(false);
    expect(screen.canPress('Créer le code'), 'and the form is back for the next').toBe(true);
    // The way back to the chooser is always there.
    expect(screen.canPress('Retour')).toBe(true);
    screen.unmount();
  });

  it('a number with no account is said plainly — the form stays, nothing is minted', async () => {
    wire([livre([]), ...autour]);
    const screen = await versAider();
    await screen.type('71 00 00 00');
    await screen.press('Créer le code');
    await screen.settle();
    expect(screen.shows('Aucun compte avec ce numéro.')).toBe(true);
    expect(screen.shows(CODE)).toBe(false);
    expect(screen.canPress('Créer le code')).toBe(true);
    screen.unmount();
  });

  it('an unreachable service says « Réessayez » and the button presses again', async () => {
    wire(autour);
    const screen = await versAider();
    await screen.type('70 12 34 56');
    await screen.press('Créer le code');
    await screen.settle();
    expect(screen.shows('Le code n’a pas pu être créé. Réessayez.')).toBe(true);
    expect(screen.canPress('Créer le code')).toBe(true);
    screen.unmount();
  });
});
