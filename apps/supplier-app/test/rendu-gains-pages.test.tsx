import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { SGainsReel } from '../src/gains/screen';
import { PAGES_MAX } from '../src/operations/dispatch-service';

/**
 * ═══ RENDU-RÉEL — DISPATCH-PAGES-1: the founder's GAINS screen over the
 * paged Worker, driven ═══
 *
 * The Shop+ Worker now answers `/checkout/gains` in pages with a `next`
 * cursor (the whole-list fan-out 500'd its subrequest budget at ≈49 lifetime
 * orders — his money screen went dark for good at that count). The port
 * follows the cursor; what THIS walk proves is that the loop feeds the REAL
 * screen: cards from BOTH pages render on one mount, the complete sweep shows
 * no partial note, and a sweep the page cap ends is DECLARED with « Lecture
 * partielle » over cards that still render. Only `globalThis.fetch` and
 * `localStorage` are doubled — no app code is stubbed.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — the harness bound (test/rendu.tsx).
 */

const CLE_C_SLOT = 'boutik.livraisons.cle';

const SPLIT = {
  sellerBasePrice: 10_000, sellerFundedCommission: 1_000, resellerMarkup: 1_500, deliveryFee: 1_000,
  productSubtotal: 11_500, buyerTotal: 12_500, sellerPlatformFee: 0, sellerNet: 9_000,
  resellerPlatformFee: 0, resellerNet: 2_500,
};
/** The confirmed order's own gains answer, passed through whole by the door. */
const gain = (orderId: string, jour: string) => ({
  ok: true, exists: true, orderId, state: 'confirmed', createdAt: `2026-09-0${jour}T08:00:00.000Z`,
  productVersionId: 'pv-1', zoneTo: 'Gounghin', split: SPLIT, livree: false, obligations: [],
});

/** Pages served IN SEQUENCE per request. The wire records the PATH only, so
 *  this route keeps the query strings itself — the cursor is the fact. */
function pagesDeGains(reponses: { gains: unknown[]; next?: string }[]): { route: Route; requetes: string[] } {
  const requetes: string[] = [];
  let n = -1;
  const route: Route = (path, _body, search) => {
    if (path !== '/checkout/gains') return null;
    requetes.push(search.toString());
    n = Math.min(n + 1, reponses.length - 1);
    const r = reponses[n]!;
    return { status: 200, json: { ok: true, gains: r.gains as never, ...(r.next !== undefined ? { next: r.next } : {}) } };
  };
  return { route, requetes };
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  storage({ [CLE_C_SLOT]: 'cle-c-test' });
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
});

describe('the gains screen over pages', () => {
  it('cards from BOTH pages render on one mount — the sweep is whole — and no partial sentence shows', async () => {
    const { route, requetes } = pagesDeGains([
      { gains: [gain('ord-page1-a', '3'), gain('ord-page1-b', '2')], next: 'c1' },
      { gains: [gain('ord-page2-a', '1')] },
    ]);
    wire([route]);
    const screen = await mountEcran(<SGainsReel />);
    await screen.settle();

    // the loop actually ASKED twice, carrying the cursor back
    expect(requetes).toEqual(['limit=40', 'limit=40&cursor=c1']);
    // …and the SCREEN holds cards from both pages — the aggregation reached his eyes
    for (const id of ['ord-page1-a', 'ord-page1-b', 'ord-page2-a']) {
      expect(screen.shows(id), `${id}; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    }
    expect(screen.shows('Lecture partielle'), 'a whole sweep is never declared partial').toBe(false);
    screen.unmount();
  });

  it('a sweep the cap ends is DECLARED: « Lecture partielle » over cards that still render', async () => {
    // distinct ids per page — the real Worker provably never repeats a row
    // (dispatch-pages.e2e), and the fake stays inside those certified bounds
    let page = 0;
    const requetes: string[] = [];
    const route: Route = (path, _b, search) => {
      if (path !== '/checkout/gains') return null;
      requetes.push(search.toString());
      page += 1;
      return { status: 200, json: { ok: true, gains: [gain(`ord-p${page}`, '3')] as never, next: `c${page}` } };
    };
    wire([route]);
    const screen = await mountEcran(<SGainsReel />);
    await screen.settle();

    expect(requetes).toHaveLength(PAGES_MAX);
    expect(screen.shows('Lecture partielle'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // the cards behind the declaration are real — the note never hides them
    expect(screen.shows('ord-p1')).toBe(true);
    expect(screen.shows(`ord-p${PAGES_MAX}`)).toBe(true);
    screen.unmount();
  });

  it('a capped sweep with ZERO rows is NOT « pas encore de vente » — the declaration stands, the empty sentence does not', async () => {
    // verifier MAJOR: the empty arm rendered gains.vide over a partial sweep —
    // « no gains » claimed about a read the cap cut short (the B3 law)
    const { route, requetes } = pagesDeGains([{ gains: [], next: 'encore' }]);
    wire([route]);
    const screen = await mountEcran(<SGainsReel />);
    await screen.settle();

    expect(requetes).toHaveLength(PAGES_MAX);
    expect(screen.shows('Lecture partielle'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Pas encore de vente payée'), 'the empty sentence is a claim a partial sweep cannot make').toBe(false);
    screen.unmount();
  });

  it('an older Worker (no next) is one round trip and a whole screen — byte-compatible', async () => {
    const { route, requetes } = pagesDeGains([{ gains: [gain('ord-vieux', '2')] }]);
    wire([route]);
    const screen = await mountEcran(<SGainsReel />);
    await screen.settle();
    expect(requetes).toHaveLength(1);
    expect(screen.shows('ord-vieux')).toBe(true);
    expect(screen.shows('Lecture partielle')).toBe(false);
    screen.unmount();
  });
});

/**
 * STOCK-VRAI-1 (AUDIT-B+2 F-54) — an order quoted BEFORE FRAIS-ZERO (2026-08-25)
 * still carries its fees in its frozen quote. The card used to drop every fee
 * line, so its parts fell 1 000 F short of « La cliente a payé ». A fee line
 * now shows exactly when its amount is not zero — and a current order shows none.
 */
describe('STOCK-VRAI-1 (F-54) — a card adds up to the franc, fees and all', () => {
  const AVANT_FRAIS_ZERO = {
    sellerBasePrice: 10_000, sellerFundedCommission: 1_000, resellerMarkup: 1_500, deliveryFee: 1_000,
    productSubtotal: 11_500, buyerTotal: 12_500, sellerPlatformFee: 500, sellerNet: 8_500,
    resellerPlatformFee: 500, resellerNet: 2_000,
  };

  it('the older order shows both fee lines, and its parts meet « La cliente a payé »; the current one shows none', async () => {
    const ancienne = { ...gain('ord-avant', '1'), split: AVANT_FRAIS_ZERO };
    const { route } = pagesDeGains([{ gains: [gain('ord-apres', '3'), ancienne] }]);
    wire([route]);
    const screen = await mountEcran(<SGainsReel />);
    await screen.settle();
    const textes = screen.texts();
    // one card each; the fee lines appear once — on the older card alone
    expect(textes.filter((t) => t === 'Frais côté fournisseur'), `on screen: ${JSON.stringify(textes)}`).toHaveLength(1);
    expect(textes.filter((t) => t === 'Frais côté revendeuse')).toHaveLength(1);
    // the older card's lines, read in order after its own id, add up to the franc
    const debut = textes.indexOf('ord-avant');
    const carte = textes.slice(debut);
    const montant = (nom: string): number => Number((carte[carte.indexOf(nom) + 1] ?? '').replace(/\D/g, ''));
    const parts = ['Part du fournisseur', 'Part de la revendeuse', 'Frais côté fournisseur', 'Frais côté revendeuse', 'Livraison'].map(montant);
    expect(parts).toEqual([8_500, 2_000, 500, 500, 1_000]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(AVANT_FRAIS_ZERO.buyerTotal);
    screen.unmount();
  });
});
