import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSupplierOfferList, HIDDEN_REASONS, type SupplierOfferRow } from '../src/supply/service';
import { galleryPhotos, produitsView, hiddenSentence, photoSlot, type ProduitsRead, type HiddenReason } from '../src/supply/produits-view';
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

  it('an UNKNOWN hiddenReason is DROPPED, not rendered as a confident wrong cause', () => {
    for (const bad of ['', 'offer_exploded', 'OFFER_NOT_EFFECTIVE']) {
      const out = readSupplierOfferList({
        asOf: '2026-07-25T08:00:00.000Z', items: [row({ hiddenReason: bad })],
      });
      expect('hiddenReason' in (out!.items[0] as object), bad).toBe(false);
    }
    // the four real ones survive
    for (const good of HIDDEN_REASONS) {
      const out = readSupplierOfferList({
        asOf: '2026-07-25T08:00:00.000Z', items: [row({ hiddenReason: good })],
      });
      expect(out!.items[0]!.hiddenReason, good).toBe(good);
    }
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
    // ProductTile survives untouched but has ZERO call sites — assert THAT,
    // rather than pinning the signature of code nothing calls (verifier finding)
    expect(components).toContain('export function ProductTile(');
    const callers = readFileSync(join(appDir, 'src/v2/screens1.tsx'), 'utf8')
      + readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
    expect(callers).not.toMatch(/<ProductTile\b/);
  });

  it('the tile renders the SLOT it is handed — it decides no photo sentence itself', () => {
    const components = readFileSync(join(appDir, 'src/v2/components.tsx'), 'utf8');
    const start = components.indexOf('export function OfferTile');
    const body = components.slice(start, components.indexOf('export function', start + 10));
    expect(body.length, 'the sliced body must contain the whole component').toBeGreaterThan(500);
    // no hardcoded key: it states `photo.message`, chosen by `photoSlot`
    expect(body).toMatch(/tr\(photo\.kind === 'photo' \? 'produits\.photo_non_configure' : photo\.message\)/);
    expect(body).not.toMatch(/tr\('produits\.sans_photo'\)/);
    // and a broken fetch lands on the designed state, not an empty box
    expect(body).toContain('onError={() => setBroken(true)}');
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

describe('THE HIDDEN SENTENCE — mapped PURELY, and true of every reason it answers', () => {
  /**
   * Verifier finding: nothing asserted this mapping, so swapping the two
   * sentences would have left all 377 tests green — and `t()` THROWS on a
   * missing key, so a typo is a blank screen for a seller whose offer just went
   * dark. Now the mapping is a pure function and every key it can emit is
   * asserted to resolve.
   */
  it('every ladder reason maps to a key that RESOLVES — t() throws on a miss', () => {
    const reasons: HiddenReason[] = [
      'product_not_active', 'product_not_approved', 'offer_not_active', 'offer_not_effective',
    ];
    for (const r of reasons) {
      const key = hiddenSentence(r);
      expect(keys.has(key), `${r} -> ${key}`).toBe(true);
    }
  });

  it('THE WINDOW SENTENCE IS TRUE OF BOTH HALVES — it must not claim the date has PASSED', () => {
    // `projection.ts` gives `offer_not_effective` for `now < effective` TOO —
    // the clock-skew case authoring.ts backdates for. A « dépassé sa date »
    // sentence would be the inverse of the fact for a seller on a fast phone.
    const fr = catalog.find((e) => e.key === hiddenSentence('offer_not_effective'))!.fr;
    expect(fr).toBe('Les revendeuses ne voient pas cette offre en ce moment.');
    expect(fr).not.toMatch(/dépass|expir|périmé/i);       // no false past-tense claim
    expect(fr).not.toMatch(/renouvel|prolong|réactiv/i);  // and still no remedy promised
  });

  it('the three taken-down reasons share ONE sentence, and it promises nothing either', () => {
    for (const r of ['product_not_active', 'product_not_approved', 'offer_not_active'] as HiddenReason[]) {
      expect(hiddenSentence(r)).toBe('produits.retiree');
    }
    const fr = catalog.find((e) => e.key === 'produits.retiree')!.fr;
    expect(fr).toBe("Cette offre n'est plus en ligne.");
    expect(fr).not.toMatch(/renouvel|prolong|réactiv|relanc/i);
  });
});

describe('THE PHOTO SLOT — three facts, three answers (never « Sans photo » for a config failure)', () => {
  it('no refs is an honest absence, WHATEVER the config', () => {
    for (const base of [null, 'https://media.example']) {
      expect(photoSlot([], base)).toEqual({ kind: 'none', message: 'produits.sans_photo' });
      expect(photoSlot([''], base)).toEqual({ kind: 'none', message: 'produits.sans_photo' });
      expect(photoSlot(['   '], base)).toEqual({ kind: 'none', message: 'produits.sans_photo' });
    }
  });

  it('HE HAS PHOTOGRAPHS AND WE CANNOT FETCH THEM is a DIFFERENT sentence', () => {
    const out = photoSlot(['media/hero'], null);
    expect(out).toEqual({ kind: 'unavailable', message: 'produits.photo_non_configure' });
    // the two must never be the same claim
    expect(out.kind).not.toBe('none');
    expect((out as { message: string }).message).not.toBe('produits.sans_photo');
  });

  it('a real ref with a real base builds the URL, with exactly one separator', () => {
    expect(photoSlot(['media/hero'], 'https://media.example')).toEqual({
      kind: 'photo', uri: 'https://media.example/media/hero',
    });
  });

  it('both photo-slot messages resolve in the catalog', () => {
    for (const k of ['produits.sans_photo', 'produits.photo_non_configure']) expect(keys.has(k), k).toBe(true);
  });
});

describe('EVERY KEY THIS SLICE CAN EMIT RESOLVES — t() throws, so a typo is a blank screen', () => {
  it('all of them, enumerated', () => {
    const emitted = [
      'produits.chargement', 'produits.non_configure', 'produits.lecture_echec',
      'produits.lecture_echec_cache', 'produits.vide', 'produits.reessayer',
      'produits.sans_photo', 'produits.photo_non_configure', 'produits.hors_fenetre', 'produits.retiree',
    ];
    for (const k of emitted) expect(keys.has(k), k).toBe(true);
    // and the retired sentence is GONE, not left to be picked up again
    expect(keys.has('produits.expiree')).toBe(false);
  });
});

describe('THE FICHE GALLERY — wire order, labelled by position, master never rendered', () => {
  const REFS = ['media/hero-sq', 'media/hero-vert', 'media/proof', 'media/d1', 'media/d2'];

  it('maps every LISTED ref in wire order — the vertical hero is not one of them', () => {
    // PIN EVOLVED (founder order 2026-08-03: « there is 2 hero cards on photos,
    // Hero and Hero (vertical) remove one »). His Studio takes ONE hero shot;
    // crops.ts renders two crops of it because canon requires heroSquare AND
    // heroVertical. Listing both showed him the same photograph twice.
    const out = galleryPhotos(REFS, 'https://m.example');
    expect(out.map((p) => p.label)).toEqual(['Héro', 'Preuve', 'Détail 1', 'Détail 2']);
    expect(out[0]!.uri).toBe('https://m.example/media/hero-sq');
    // the vertical crop appears NOWHERE in the listing…
    expect(JSON.stringify(out)).not.toContain('hero-vert');
    // …and exactly one card is dropped, so a détail is never swallowed with it
    expect(out).toHaveLength(REFS.length - 1);
  });

  it('THE ASSET STILL EXISTS — this is a listing rule, not a contracts change', () => {
    // What the founder asked for was to stop SEEING two cards. The vertical
    // crop is still captured, uploaded and carried on the wire: canon's
    // ProductAssets requires it and Shop+ may render it. Removing it from the
    // wire would be a `contracts/` change and is not mine to make — so this
    // asserts the boundary: the INPUT still carries the ref, the OUTPUT hides
    // it. If a later edit "cleans up" by dropping the ref upstream, the input
    // side of this test is where that shows.
    const out = galleryPhotos(REFS, 'https://m.example');
    expect(REFS).toContain('media/hero-vert'); // still on the wire, by construction
    expect(out.some((p) => p.uri.includes('hero-vert'))).toBe(false); // just not listed
  });

  it('a SHORT list still labels correctly — hero + proof only, no phantom détail', () => {
    // The index it drops is positional, so the two-ref case is the one that
    // would break first if the wire order ever stopped being guaranteed.
    const out = galleryPhotos(['media/hero-sq', 'media/hero-vert'], 'https://m.example');
    expect(out.map((p) => p.label)).toEqual(['Héro']);
    expect(out.map((p) => p.uri)).toEqual(['https://m.example/media/hero-sq']);
  });

  it('no photographs is an EMPTY gallery — never placeholder tiles', () => {
    expect(galleryPhotos([], 'https://m.example')).toEqual([]);
  });

  it('no configured media base renders NOTHING rather than broken images', () => {
    expect(galleryPhotos(REFS, null)).toEqual([]);
  });

  it('a private/ ref NEVER renders — belt and braces under the wire-order guarantee', () => {
    const out = galleryPhotos(['private/device/abc', 'media/hero-sq'], 'https://m.example');
    expect(out.map((p) => p.uri)).toEqual(['https://m.example/media/hero-sq']);
    expect(JSON.stringify(out)).not.toContain('private/');
  });
});

describe('OFFER-DELETE-1 — the fiche’s confirm walk [source-text checks; house rule: no RN renderer]', () => {
  /**
   * Verifier finding 2026-07-27: the delete surface shipped with zero app-side
   * tests. These are capability checks against the source, the same instrument
   * the rest of this file uses — each asserts a guard EXISTS in the code, not
   * that a renderer walked it.
   */
  it('every supprimer key the fiche cites exists in the catalog — six, both ways', () => {
    const cited = [...screens1.matchAll(/'(produits\.supprimer[a-z_]*)'/g)].map((m) => m[1]!);
    expect(new Set(cited).size).toBe(6);
    for (const k of cited) expect(keys.has(k), k).toBe(true);
    // and no orphan supprimer key sits in the catalog waiting to drift
    const inCatalog = [...keys].filter((k) => k.startsWith('produits.supprimer'));
    expect(new Set(inCatalog)).toEqual(new Set(cited));
  });

  it('NEVER a one-tap destruction: the first press only ARMS the confirm step', () => {
    expect(screens1).toContain("onPress={() => setDel('confirm')}");
    // the destructive call lives only inside runDelete, behind the pending guard
    expect(screens1).toContain("if (onDelete === undefined || del === 'pending') return;");
    const callsOfOnDelete = screens1.match(/await onDelete\(\)/g) ?? [];
    expect(callsOfOnDelete).toHaveLength(1);
  });

  it('« Garder ce produit » is UNREACHABLE while pending — no cancel mid-delete', () => {
    // the cancel button renders only under the not-pending guard
    expect(screens1).toMatch(/del !== 'pending' && \(\s*<BtnGhost label=\{tr\('produits\.supprimer_non'\)\}/);
  });

  it('no service ⇒ NO delete UI: the fiche gates the whole block on onDelete presence', () => {
    expect(screens1).toContain('{onDelete !== undefined && (');
    expect(produits).toContain("{...(service === null ? {} : { onDelete: deleteOpen })}");
  });

  it('success DROPS the cache before the re-read — a deleted row never renders from memory', () => {
    expect(produits).toContain('cache.current = { rows: null, asOf: null };');
    // and the command is minted like every other write, with all three identifiers
    expect(produits).toContain('commandId: mintCommandId(),');
    expect(produits).toContain('offerId: openOffer.offerId,');
    expect(produits).toContain('productVersionId: openOffer.productVersionId,');
  });
});
