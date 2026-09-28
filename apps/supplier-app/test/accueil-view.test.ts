import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plusAnciennes, produitsEnLigne, stockBas, ventesPayees } from '../src/accueil/view';
import type { PaidOrderRow } from '../src/operations/service';
import type { SupplierOfferRow } from '../src/supply/service';

/**
 * RB-4 — the real Accueil (founder direction 2026-08-08: « de-mock all of
 * it »). The pure decisions, and the source-level proof that the demo store's
 * LAST route into the shell is gone.
 */

const offre = (offerId: string, available: number): SupplierOfferRow => ({
  offerId,
  productVersionId: `pv-${offerId}`,
  name: `Produit ${offerId}`,
  category: 'mode',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available,
  assetRefs: [],
});

const vente = (orderId: string, paidAt: string): PaidOrderRow => ({
  orderId,
  productVersionId: 'pv-1',
  productName: 'Bazin riche',
  productPhotoRef: '',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt,
  zoneTo: 'Gounghin',
  sellerBasePrice: 10_000,
  supplierId: 'supplier-a',
  supplierResolved: true,
  registeredAt: paidAt,
});

describe('RB-4 — stock bas: real offers only, scarcest first, threshold 4', () => {
  it('keeps ≤ 4, sorts by scarcity then id, and 5 is NOT low', () => {
    const rows = [offre('c', 4), offre('a', 0), offre('b', 5), offre('d', 2), offre('e', 2)];
    expect(stockBas(rows).map((o) => o.offerId)).toEqual(['a', 'd', 'e', 'c']);
  });
  it('no offers, no invented alert', () => {
    expect(stockBas([])).toEqual([]);
  });
});

describe('RB-4 — the head of the waiting queue, oldest first, capped', () => {
  it('sorts by paidAt ascending, ties by id, caps at n, never mutates', () => {
    const rows = [
      vente('ord-b', '2026-08-08T10:00:00.000Z'),
      vente('ord-a', '2026-08-08T10:00:00.000Z'),
      vente('ord-c', '2026-08-07T09:00:00.000Z'),
      vente('ord-d', '2026-08-08T11:00:00.000Z'),
    ];
    const copie = [...rows];
    expect(plusAnciennes(rows, 3).map((r) => r.orderId)).toEqual(['ord-c', 'ord-a', 'ord-b']);
    expect(rows).toEqual(copie);
  });
});

describe('STOCK-VRAI-1 (F-53) — the greeting counts only what resellers see, in a sentence for its number', () => {
  it('frozen, lapsed and cut offers are not « en ligne »; 0, 1 and n each get their own sentence', () => {
    const cachee = (id: string, hiddenReason: NonNullable<SupplierOfferRow['hiddenReason']>): SupplierOfferRow => ({ ...offre(id, 3), hiddenReason });
    expect(produitsEnLigne([])).toEqual({ key: 'accueil.greeting_sub_zero', n: 0 });
    expect(produitsEnLigne([cachee('g', 'stock_unconfirmed'), cachee('l', 'offer_not_effective')])).toEqual({ key: 'accueil.greeting_sub_zero', n: 0 });
    expect(produitsEnLigne([offre('a', 3), cachee('g', 'stock_unconfirmed')])).toEqual({ key: 'accueil.greeting_sub_un', n: 1 });
    expect(produitsEnLigne([offre('a', 3), offre('b', 0), cachee('c', 'offer_not_active')])).toEqual({ key: 'accueil.greeting_sub', n: 2 });
  });
});

describe('STOCK-VRAI-1 (F-53) — « Ventes payées » counts the sales whose money stands', () => {
  it('a refusal or a founder cancel, a refusal at pickup, and a Shop+ refund are not paid sales', () => {
    const t = '2026-09-28T08:00:00.000Z';
    const rows: PaidOrderRow[] = [
      vente('ord-ok', t),
      vente('ord-livree', t),
      { ...vente('ord-refusee', t), fulfillment: { refusedAt: t } },
      { ...vente('ord-annulee', t), fulfillment: { refusedAt: t, refusPar: 'fondateur' } },
      { ...vente('ord-ramassage', t), fulfillment: { handedOverAt: t, pickupRefusedAt: t } },
      vente('ord-remboursee', t),
    ];
    expect(ventesPayees(rows, new Set(['ord-remboursee']))).toBe(2);
    expect(ventesPayees(rows, new Set())).toBe(3);
  });
});

describe('RB-4 — [source-text checks] the demo store has no route into the shell', () => {
  const app = readFileSync(join(import.meta.dirname, '..', 'src/v2/AppV2.tsx'), 'utf8');
  const screen = readFileSync(join(import.meta.dirname, '..', 'src/accueil/screen.tsx'), 'utf8');

  it('home mounts the REAL accueil — and so does the id-miss fallback', () => {
    expect(app.match(/<SAccueilReel d=\{d\} opsKey=\{opsKey\} \/>/g)?.length).toBe(2);
  });

  it('no demo-store screen or seed reaches the shell any more', () => {
    for (const banni of [
      'S02Accueil',
      'S03Produits',
      'S05Fiche',
      'S07Commandes',
      'S11Detail',
      'S17ReadySheet',
      'S19StockSheet',
      'S40Celebration',
      'SEED_DEFAULTS',
      'st.products[',
      'st.orders[',
    ]) {
      expect(app, `${banni} must not appear in AppV2`).not.toContain(banni);
    }
  });

  it('every key the accueil renders exists in the catalog', () => {
    const catalog = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'i18n/catalog.json'), 'utf8'),
    ) as { key: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...screen.matchAll(/t\('((?:accueil|commandes|fp)\.[a-z_.]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(10);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });

  it('the accueil reads REAL ports and never the machine store; counts come from segmenter', () => {
    expect(screen).toContain('resolveSupplyService()');
    expect(screen).toContain('resolveOperationsService()');
    // STOCK-VRAI-1 (F-53) — the road facts the Commandes tab reads ride in too
    expect(screen).toContain('segmenter(r.orders, new Set(), faits.enRoute, faits.livrees, faits.remboursees)');
    expect(screen).toContain('total: ventesPayees(r.orders, faits.remboursees)');
    expect(screen).not.toMatch(/from '\.\.\/v2\/seed|st\.products|st\.orders/);
    // the product count is the offers resellers see now, in a sentence for its number
    expect(screen).toContain("((p) => t(p.key).replace('{n}', String(p.n)))(produitsEnLigne(offres.rows))");
    // no money figure is composed here — the only FCFA surfaces are Gains/Commandes
    expect(screen).not.toContain('formatF');
  });

  it('a refused ops key here shows the honest line and NEVER clears the console’s slot', () => {
    expect(screen).toContain("r.reason === 'bad_key' ? { kind: 'sans_cle' }");
    expect(screen).not.toContain('clearStoredOpsKey');
    // STOCK-VRAI-1 — the keys it now READS for the road facts are never cleared here either
    expect(screen).not.toContain('clearStoredCleC');
    expect(screen).not.toContain('clearStoredCleCoursiers');
  });
});
