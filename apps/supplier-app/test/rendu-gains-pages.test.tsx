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
const gain = (orderId: string, jour: string) => ({
  orderId, createdAt: `2026-09-0${jour}T08:00:00.000Z`, productVersionId: 'pv-1', zoneTo: 'Gounghin', split: SPLIT,
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
    const { route, requetes } = pagesDeGains([{ gains: [gain('ord-sans-fin', '3')], next: 'encore' }]);
    wire([route]);
    const screen = await mountEcran(<SGainsReel />);
    await screen.settle();

    expect(requetes).toHaveLength(PAGES_MAX);
    expect(screen.shows('Lecture partielle'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // the cards behind the declaration are real, not withheld
    expect(screen.shows('ord-sans-fin')).toBe(true);
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
