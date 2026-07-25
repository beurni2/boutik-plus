import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSupplierOfferList, type SupplierOfferRow } from '../src/supply/service';
import { produitsView, type ProduitsRead } from '../src/supply/produits-view';
import { catalog } from '../src/i18n';

/**
 * PRODUITS-READ-1 — Produits reads the service (founder rulings 2026-07-25).
 *
 * WHAT EACH KIND OF ASSERTION HERE IS, stated so the weaker instrument cannot be
 * mistaken for the stronger one later (standing rule, JOURNAL 2026-07-25):
 *   · the boundary reader is tested BY VALUE — real inputs, real outputs.
 *   · the screen-level properties are SOURCE-TEXT CAPABILITY CHECKS. This repo
 *     has no RN renderer, so there is no test here that renders Produits and
 *     reads a tile. Each is labelled `[source-text check]`.
 */

const appDir = join(import.meta.dirname, '..');
const screens1 = readFileSync(join(appDir, 'src/v2/screens1.tsx'), 'utf8');
const produits = readFileSync(join(appDir, 'src/v2/produits-real.tsx'), 'utf8');
const shell = readFileSync(join(appDir, 'src/v2/AppV2.tsx'), 'utf8');
const keys = new Set(catalog.map((e) => e.key));

const row = (over: Record<string, unknown> = {}) => ({
  offerId: 'o-1', productVersionId: 'pv-1', name: 'Bazin', category: 'textile',
  basePrice: 10_000, resellerCommission: 750, available: 10, assetRefs: [], ...over,
});

describe('THE BOUNDARY READER — validated, never cast (money and stock cross here)', () => {
  it('accepts the real envelope and preserves every field, including the honest empties', () => {
    const out = readSupplierOfferList({ asOf: '2026-07-25T08:00:00.000Z', items: [row()] });
    expect(out?.asOf).toBe('2026-07-25T08:00:00.000Z');
    expect(out?.items).toHaveLength(1);
    expect(out?.items[0]?.basePrice).toBe(10_000);
    expect(out?.items[0]?.assetRefs).toEqual([]);
    expect('variantsNote' in (out!.items[0] as object)).toBe(false);
    expect('hiddenReason' in (out!.items[0] as object)).toBe(false);
  });

  it('carries variantsNote and hiddenReason through VERBATIM when present', () => {
    const out = readSupplierOfferList({
      asOf: '2026-07-25T08:00:00.000Z',
      items: [row({ variantsNote: 'S, M, L', hiddenReason: 'offer_not_effective', assetRefs: ['media/a'] })],
    });
    expect(out?.items[0]?.variantsNote).toBe('S, M, L'); // NOT reformatted to 'S · M · L'
    expect(out?.items[0]?.hiddenReason).toBe('offer_not_effective');
    expect(out?.items[0]?.assetRefs).toEqual(['media/a']);
  });

  it('REFUSES everything that is not a list — a 2xx of the wrong shape is a read FAILURE, not an empty shop', () => {
    for (const bad of [
      null, undefined, 'ok', [], 42,
      { items: [] },                                   // no asOf
      { asOf: 'not-a-date', items: [] },               // unparseable clock
      { asOf: '2026-07-25T08:00:00.000Z' },            // no items
      { asOf: '2026-07-25T08:00:00.000Z', items: {} }, // items not an array
    ]) {
      expect(readSupplierOfferList(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('ONE malformed item fails the WHOLE read — never a silently short list', () => {
    // a short list is indistinguishable from "you have fewer products", which is
    // the same class of lie as an empty shop on a failed read
    for (const bad of [
      { ...row(), basePrice: 'dix mille' },
      { ...row(), basePrice: undefined },
      { ...row(), available: NaN },
      { ...row(), name: '' },
      { ...row(), assetRefs: 'media/a' },
      { ...row(), assetRefs: [1, 2] },
      null,
    ]) {
      const out = readSupplierOfferList({ asOf: '2026-07-25T08:00:00.000Z', items: [row(), bad] });
      expect(out, JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('THE TWO EMPTY-LOOKING FACTS ARE NEVER THE SAME SENTENCE — BY VALUE (founder condition)', () => {
  /**
   * REWRITTEN. The first version asserted the ORDER of branches in the source,
   * and a planted fall-through defect walked straight past it — structure, not
   * substance, one slice after the standing rule. The decision is now pure
   * (`supply/produits-view.ts`) and this puts a state IN and reads the sentence
   * OUT.
   */
  const rows = [row()] as unknown as SupplierOfferRow[];

  it('A FAILED READ NEVER SAYS « vous n’avez pas encore de produit » — cached or not', () => {
    for (const cached of [null, rows]) {
      const v = produitsView({ kind: 'failed' }, cached);
      expect(v.kind).toBe('failed');
      if (v.kind !== 'failed') throw new Error('expected failed');
      expect(v.message).toBe('produits.lecture_echec');
      expect(JSON.stringify(v)).not.toContain('produits.vide');
    }
  });

  it('ONLY a successful read with zero rows says the shop is empty', () => {
    const v = produitsView({ kind: 'ok', rows: [] }, null);
    expect(v).toEqual({ kind: 'empty', message: 'produits.vide' });
    // and a successful read with rows says neither sentence
    const list = produitsView({ kind: 'ok', rows }, null);
    expect(list.kind).toBe('list');
    expect(JSON.stringify(list)).not.toContain('produits.vide');
    expect(JSON.stringify(list)).not.toContain('produits.lecture_echec');
  });

  it('EVERY state maps to exactly ONE message, and no two states share one', () => {
    const states: ProduitsRead[] = [
      { kind: 'loading' }, { kind: 'not_configured' }, { kind: 'failed' }, { kind: 'ok', rows: [] },
    ];
    const msgs = states.map((st) => (produitsView(st, null) as { message?: string }).message);
    expect(msgs).toEqual([
      'produits.chargement', 'produits.non_configure', 'produits.lecture_echec', 'produits.vide',
    ]);
    expect(new Set(msgs).size).toBe(msgs.length); // no sentence does double duty
  });

  it('A STALE LIST NEVER TRAVELS WITHOUT ITS LABEL — the two are one decision', () => {
    const withCache = produitsView({ kind: 'failed' }, rows);
    if (withCache.kind !== 'failed') throw new Error('expected failed');
    expect(withCache.staleRows).toEqual(rows);
    expect(withCache.staleMessage).toBe('produits.lecture_echec_cache'); // never null when rows exist
    const noCache = produitsView({ kind: 'failed' }, null);
    if (noCache.kind !== 'failed') throw new Error('expected failed');
    expect(noCache.staleRows).toBeNull();
    expect(noCache.staleMessage).toBeNull(); // and never a label with nothing to label
  });

  it('a successful read NEVER shows the stale list — success replaces, it does not append', () => {
    const v = produitsView({ kind: 'ok', rows: [] }, rows);
    expect(v).toEqual({ kind: 'empty', message: 'produits.vide' }); // the cache is not consulted
  });

  it('every message key it can emit resolves in the catalog', () => {
    for (const k of ['produits.chargement', 'produits.non_configure', 'produits.lecture_echec', 'produits.vide', 'produits.lecture_echec_cache']) {
      expect(keys.has(k), k).toBe(true);
    }
  });
});

describe('OPTION (b) — Produits holds NO BINDING to seed data [source-text CAPABILITY check, not an absence proof]', () => {
  /**
   * NAMED AS THE WEAKER INSTRUMENT ON PURPOSE (founder condition). This proves
   * the SCREEN cannot reach a mock. It does NOT prove the seed is absent from
   * the shipped bundle — the seed strings must REMAIN, because Commandes still
   * renders from them. THE ABSENCE PROOF IS OWED and comes due when Commandes
   * converts off the seed. See JOURNAL.md.
   */
  it('S03Produits reads neither st.products nor st.porder', () => {
    const start = screens1.indexOf('export function S03Produits');
    const end = screens1.indexOf('export function S07Commandes');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = screens1.slice(start, end);
    expect(body).not.toContain('st.products');
    expect(body).not.toContain('st.porder');
    expect(body).not.toContain('SEED_PRODUCTS');
    // it renders from the rows it is HANDED
    expect(body).toMatch(/rows: readonly SupplierOfferRow\[\]/);
  });

  it('the shell routes Produits to the REAL wrapper, not the demo screen', () => {
    expect(shell).toMatch(/st\.tab === 'produits' \?[\s\S]{0,600}<SProduitsReal/);
    expect(shell).not.toMatch(/<S03Produits st=/);
  });

  it('Commandes STILL uses the seed — this slice did not silently convert it', () => {
    const start = screens1.indexOf('export function S07Commandes');
    expect(screens1.slice(start, start + 2000)).toContain('st.products');
  });
});

describe('THE TILE DROPPED EVERY FIELD WITH NO REAL SOURCE [source-text check]', () => {
  it('OfferTile takes no glyph, no gradient, no paused — and ProductTile still does, untouched', () => {
    const components = readFileSync(join(appDir, 'src/v2/components.tsx'), 'utf8');
    const start = components.indexOf('export function OfferTile');
    const body = components.slice(start, components.indexOf('export function', start + 10));
    expect(body.length, 'the sliced body must contain the whole component').toBeGreaterThan(500);
    for (const dead of ['glyph', 'bg:', 'paused', 'mod']) {
      expect(body, `OfferTile must not take ${dead}`).not.toContain(dead);
    }
    // the demo tile is left exactly as it was
    expect(components).toMatch(/export function ProductTile\(\{ bg, glyph, name, priceF, stock, paused, mod, onPress, style \}/);
  });

  it('a photograph-less offer says « Sans photo » — never a decorative glyph', () => {
    const components = readFileSync(join(appDir, 'src/v2/components.tsx'), 'utf8');
    const start = components.indexOf('export function OfferTile');
    const body = components.slice(start, components.indexOf('export function', start + 10));
    expect(body.length, 'the sliced body must contain the whole component').toBeGreaterThan(500);
    expect(body).toContain("tr('produits.sans_photo')");
    expect(body).toMatch(/photoUri !== null \?/);
  });

  it('the lapsed sentence PROMISES NOTHING — there is no renewal path to promise', () => {
    const expiree = catalog.find((e) => e.key === 'produits.expiree');
    expect(expiree).toBeDefined();
    expect(expiree!.fr).toBe('Cette offre a dépassé sa date. Les revendeuses ne la voient plus.');
    // no remedy verb: he cannot extend the window from the app (decideCreateOffer
    // answers `collision`), so offering one would be a promise the platform
    // cannot keep.
    expect(expiree!.fr).not.toMatch(/renouvel|prolong|réactiv|relanc/i);
  });
});

describe('THE CACHE IS IN MEMORY ONLY [source-text check]', () => {
  it('the shell holds it in a ref, and nothing writes it to storage', () => {
    expect(shell).toMatch(/useRef<ProduitsCache>\(\{ rows: null, asOf: null \}\)/);
    for (const persist of ['AsyncStorage', 'SecureStore', 'expoDocumentStore', 'DurableQueue', 'writeAsStringAsync']) {
      expect(produits, `the cache must not be persisted via ${persist}`).not.toContain(persist);
    }
  });
});
