import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFournisseurService, type ProduitRow } from '../src/fournisseur/service';
import { produitEtatKey, produitsVue } from '../src/fournisseur/view';
import { catalog } from '../src/i18n';

/**
 * LISTER-POUR-1c — « Mes produits »: the founder lists, the supplier WATCHES.
 *
 * The properties that matter: every state is a NAMED honest state (« we could
 * not read » and « nothing yet » are different sentences); every wire reason
 * keeps its own French sentence; a malformed row is dropped WHOLE rather than
 * rendered wrong; and the surface is read-only STRUCTURALLY — the port has no
 * offer write, and the source scan below keeps it that way.
 */

const keys = new Set(catalog.map((e) => e.key));

function prod(offerId: string, name: string, over: Partial<ProduitRow> = {}): ProduitRow {
  return {
    offerId, productVersionId: `pv-${offerId}`, name, category: 'fashion_bags_fabrics',
    basePrice: 8_000, available: 3, assetRefs: [], ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('every wire reason keeps its own sentence — pinned one by one', () => {
  it('absent → en ligne · retired/inactive → retiré · unapproved → en attente · not yet effective → pas encore', () => {
    expect(produitEtatKey(undefined)).toBe('fournisseur.produit_en_ligne');
    expect(produitEtatKey('product_not_active')).toBe('fournisseur.produit_retire');
    expect(produitEtatKey('offer_not_active')).toBe('fournisseur.produit_retire');
    expect(produitEtatKey('product_not_approved')).toBe('fournisseur.produit_en_attente');
    expect(produitEtatKey('offer_not_effective')).toBe('fournisseur.produit_pas_encore');
  });
});

describe('every state is a NAMED honest state, and its key exists in the catalog', () => {
  it('loading, not_configured, bad_code, failed and empty each carry a real catalog key', () => {
    for (const [read, kind] of [
      [{ kind: 'loading' }, 'loading'],
      [{ kind: 'not_configured' }, 'not_configured'],
      [{ kind: 'bad_code' }, 'bad_code'],
      [{ kind: 'failed' }, 'failed'],
      [{ kind: 'ok', rows: [] }, 'empty'],
    ] as const) {
      const vue = produitsVue(read);
      expect(vue.kind).toBe(kind);
      if ('message' in vue) expect(keys.has(vue.message), `missing key: ${vue.message}`).toBe(true);
    }
  });

  it('« could not read » and « nothing yet » are DIFFERENT sentences', () => {
    const failed = produitsVue({ kind: 'failed' });
    const empty = produitsVue({ kind: 'ok', rows: [] });
    if (!('message' in failed) || !('message' in empty)) throw new Error('expected message states');
    expect(failed.message).not.toBe(empty.message);
  });

  it('every key the LISTE can emit exists too — the per-row status included', () => {
    const vue = produitsVue({
      kind: 'ok',
      rows: [prod('a', 'Bogolan'), prod('b', 'Panier', { hiddenReason: 'product_not_approved' })],
    });
    if (vue.kind !== 'liste') throw new Error('expected liste');
    for (const p of vue.produits) expect(keys.has(p.etatKey), p.etatKey).toBe(true);
    for (const k of [
      'fournisseur.produits_titre', 'fournisseur.produits_intro', 'fournisseur.produits_en_ligne',
      'fournisseur.produits_actualiser', 'fournisseur.produit_stock',
      'fournisseur.onglet_commandes', 'fournisseur.onglet_produits',
    ]) {
      expect(keys.has(k), `missing key: ${k}`).toBe(true);
    }
  });
});

describe('the list is ordered for HIS eyes: live first, each marked one still shown WITH its reason', () => {
  it('live products lead, marked ones follow, alphabetical inside each — and enLigne counts only the live', () => {
    const vue = produitsVue({
      kind: 'ok',
      rows: [
        prod('m1', 'Zébu sculpté', { hiddenReason: 'offer_not_effective' }),
        prod('v2', 'Panier tressé'),
        prod('m2', 'Awalé bois', { hiddenReason: 'product_not_approved' }),
        prod('v1', 'Bogolan teint'),
      ],
    });
    if (vue.kind !== 'liste') throw new Error('expected liste');
    expect(vue.produits.map((p) => p.name)).toEqual(['Bogolan teint', 'Panier tressé', 'Awalé bois', 'Zébu sculpté']);
    expect(vue.enLigne).toBe(2);
    // « SHOW THEM, MARKED » — the marked ones are IN the list, not filtered.
    expect(vue.produits.filter((p) => p.hiddenReason !== undefined).length).toBe(2);
  });
});

describe('listProduits — the read side of the derived-scope door', () => {
  const service = () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const svc = resolveFournisseurService();
    if (svc === null) throw new Error('service should resolve with a base');
    return svc;
  };

  it('a 401 is the DOOR refusing — bad_code, back to the door, never « failed »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false,"reason":"unauthorized"}', { status: 401 })));
    expect(await service().listProduits('BF-XXXX')).toEqual({ ok: false, reason: 'bad_code' });
  });

  it('a malformed row is dropped WHOLE — a product with an unreadable price never renders a wrong one', async () => {
    const body = {
      asOf: '2026-08-02T08:00:00.000Z',
      items: [
        { offerId: 'ok-1', productVersionId: 'pv-1', name: 'Bogolan', category: 'c', basePrice: 8_000, available: 3, assetRefs: [] },
        { offerId: 'bad-1', productVersionId: 'pv-2', name: 'Cassé', category: 'c', basePrice: 'huit mille', available: 1, assetRefs: [] },
        { offerId: 'bad-2' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
    const res = await service().listProduits('BF-XXXX');
    if (!res.ok) throw new Error('expected ok');
    expect(res.produits.map((p) => p.offerId)).toEqual(['ok-1']);
  });

  it('the request rides the personal code as Bearer on /offers/mine — and names NO supplier', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get('Authorization') });
      return Response.json({ asOf: 't', items: [] });
    }));
    await service().listProduits('BF-ABCD-EFGH');
    expect(seen[0]!.url).toBe('https://offer.example/offers/mine');
    expect(seen[0]!.auth).toBe('Bearer BF-ABCD-EFGH');
    expect(seen[0]!.url.includes('supplierId')).toBe(false);
  });
});

describe('read-only STRUCTURALLY — the source scan that keeps it true', () => {
  it('the fournisseur service touches /offers ONLY as the GET /offers/mine read', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'fournisseur', 'service.ts'), 'utf8');
    const offerRoutes = src.match(/\/offers[a-z/]*(?=`)/g) ?? [];
    expect(offerRoutes.length).toBeGreaterThan(0); // the scan saw the route — never vacuous
    for (const route of offerRoutes) expect(route).toBe('/offers/mine');
    // and no POST anywhere near it: the port's writes are the three
    // fulfillment acts, nothing else.
    expect(src.includes("post('/offers")).toBe(false);
  });
});
