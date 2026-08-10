import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { etapeOf, fournisseurVue, type FournisseurRead } from '../src/fournisseur/view';
import { resolveFournisseurService, type CommandeRow } from '../src/fournisseur/service';
import { bloc } from './_region';

/**
 * BOUTIK-SUIVI (founder, 2026-08-09) — « on commandes put the product photos
 * to each commande … add another screen there "en route" for when rider's
 * code is confirmed the product leaves from commandes screen to that en route
 * screen; and add another screen again "livrer et terminer" for when the
 * delivery is completed and the product leaves en route to that screen. »
 *
 * Three facts to keep honest: a row is in EXACTLY ONE zone, each zone moves on
 * a mark this app never invents, and the photos are a best-effort join that
 * can never cost him the list.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

/**
 * `CarteCommande` is the LAST function in the file, so `bloc`'s end-anchor
 * guard cannot help here — the slice is taken from its own header to its own
 * closing brace, and the guard is written by hand: an unterminated region
 * would borrow from nothing, but a MISSING header must still fail loudly
 * rather than silently assert over an empty string.
 */
function carteCommande(src: string): string {
  const start = src.indexOf('function CarteCommande');
  if (start < 0) throw new Error('region: CarteCommande not found');
  const slice = src.slice(start);
  const end = slice.indexOf('\n}\n');
  if (end < 0) throw new Error('region: CarteCommande has no closing brace at column 0');
  return slice.slice(0, end);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const row = (orderId: string, fulfillment?: CommandeRow['fulfillment']): CommandeRow => ({
  orderId,
  productName: 'Bazin',
  productVersionId: 'pv-1',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-08-09T08:00:00.000Z',
  zoneTo: 'Gounghin',
  sellerBasePrice: 8_000,
  ...(fulfillment === undefined ? {} : { fulfillment }),
});

const T = {
  accepte: '2026-08-09T09:00:00.000Z',
  pret: '2026-08-09T10:00:00.000Z',
  remis: '2026-08-09T11:00:00.000Z',
  livre: '2026-08-09T12:00:00.000Z',
};

describe('the road, mark by mark — the LATEST one wins and nothing is inferred', () => {
  it('each mark names its own étape', () => {
    expect(etapeOf(row('o1'))).toBe('a_accepter');
    expect(etapeOf(row('o2', { acceptedAt: T.accepte }))).toBe('a_preparer');
    expect(etapeOf(row('o3', { acceptedAt: T.accepte, readyAt: T.pret }))).toBe('prete');
    expect(etapeOf(row('o4', { acceptedAt: T.accepte, readyAt: T.pret, handedOverAt: T.remis }))).toBe('en_route');
    expect(etapeOf(row('o5', { acceptedAt: T.accepte, readyAt: T.pret, handedOverAt: T.remis, deliveredAt: T.livre }))).toBe('livree');
  });

  it('a delivery with no handover mark is still LIVRÉE — a missing sibling fact never demotes a proven one', () => {
    expect(etapeOf(row('o6', { deliveredAt: T.livre }))).toBe('livree');
  });
});

describe('one row, exactly one screen', () => {
  const rows: readonly CommandeRow[] = [
    row('a-neuve'),
    row('b-acceptee', { acceptedAt: T.accepte }),
    row('c-prete', { acceptedAt: T.accepte, readyAt: T.pret }),
    row('d-route', { acceptedAt: T.accepte, readyAt: T.pret, handedOverAt: T.remis }),
    row('e-livree', { acceptedAt: T.accepte, readyAt: T.pret, handedOverAt: T.remis, deliveredAt: T.livre }),
  ];
  const lu: FournisseurRead = { kind: 'ok', rows };
  const ids = (zone: 'commandes' | 'en_route' | 'livrees'): string[] => {
    const vue = fournisseurVue(lu, zone);
    return vue.kind === 'liste' ? vue.commandes.map((c) => c.orderId) : [];
  };

  it('« Mes commandes » keeps what needs his hands and the colis still waiting for a coursier', () => {
    expect(ids('commandes')).toEqual(['a-neuve', 'b-acceptee', 'c-prete']);
  });

  it('a CONFIRMED ramassage code moves the row to « En route » — and it leaves Commandes', () => {
    expect(ids('en_route')).toEqual(['d-route']);
    expect(ids('commandes')).not.toContain('d-route');
  });

  it('a delivery moves it again to « Livré et terminé » — and it leaves En route', () => {
    expect(ids('livrees')).toEqual(['e-livree']);
    expect(ids('en_route')).not.toContain('e-livree');
  });

  it('the three zones PARTITION the book: every row lands once, none is lost', () => {
    const all = [...ids('commandes'), ...ids('en_route'), ...ids('livrees')].sort();
    expect(all).toEqual(rows.map((r) => r.orderId).sort());
  });

  it('« à traiter » counts only the rows still needing an act — a prête colis is not a task', () => {
    const vue = fournisseurVue(lu, 'commandes');
    expect(vue.kind === 'liste' ? vue.aFaire : -1).toBe(2);
  });

  it('each empty zone says ITS own sentence — « no orders » on a screen whose orders all moved on would be a lie', () => {
    const seulementLivree: FournisseurRead = { kind: 'ok', rows: [rows[4]!] };
    // ⚠ « Aucune commande… dès qu'un client paie » is TRUE only over an empty
    // book. With his orders merely moved to the two new screens it is a lie,
    // and he would think he had lost a sale (verifier, 2026-08-10).
    expect(fournisseurVue(seulementLivree, 'commandes')).toEqual({ kind: 'empty', message: 'fournisseur.vide_a_faire' });
    expect(fournisseurVue({ kind: 'ok', rows: [] }, 'commandes')).toEqual({ kind: 'empty', message: 'fournisseur.vide' });
    expect(fournisseurVue(seulementLivree, 'en_route')).toEqual({ kind: 'empty', message: 'fournisseur.vide_en_route' });
    expect(fournisseurVue(seulementLivree, 'livrees').kind).toBe('liste');
    const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string }[];
    for (const k of ['fournisseur.vide_en_route', 'fournisseur.vide_livrees', 'fournisseur.vide_a_faire', 'fournisseur.etape_en_route', 'fournisseur.etape_livree']) {
      expect(catalog.some((e) => e.key === k), k).toBe(true);
    }
  });
});

describe('the wire’s new marks are read as strictly as the old ones', () => {
  it('a malformed handover or delivery drops the WHOLE row — never a row demoted to an earlier étape', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offers.example.dev');
    const bon = { ...row('ok-1', { acceptedAt: T.accepte, handedOverAt: T.remis, deliveredAt: T.livre }) };
    const casse = { ...row('casse-1'), fulfillment: { acceptedAt: T.accepte, handedOverAt: 'pas-une-date' } };
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ ok: true, orders: [bon, casse] }), { status: 200 }));
    const res = await resolveFournisseurService()!.listMine('BF-AAAA-BBBB-CCCC-DDDD');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    // the good row survives WITH both new marks; the malformed one is gone
    expect(res.orders.map((o) => o.orderId)).toEqual(['ok-1']);
    expect(res.orders[0]?.fulfillment?.handedOverAt).toBe(T.remis);
    expect(res.orders[0]?.fulfillment?.deliveredAt).toBe(T.livre);
  });
});

describe('the screens exist, and the photos ride each commande (call sites)', () => {
  const app = read('src/fournisseur/FournisseurApp.tsx');

  it('the four tabs sit on ONE row, as chips, the way the ops console builds its own (founder 2026-08-10)', () => {
    const barre = bloc(app, 'const onglets:', 'return (');
    for (const k of ['fournisseur.onglet_commandes', 'fournisseur.onglet_en_route', 'fournisseur.onglet_livrees', 'fournisseur.onglet_produits']) {
      expect(barre).toContain(k);
    }
    // ONE horizontally scrolling row of the SAME chip component the ops
    // console uses — never a wrapping grid, and never squeezed labels.
    const rangee = bloc(app, '<ScrollView', '{onglet === \'produits\' ?');
    expect(rangee).toContain('horizontal');
    expect(rangee).toContain('<ChipCategory');
    expect(rangee).toContain('active={onglet === o.cle}');
    expect(rangee).not.toContain('flexWrap');
    // ⚠ AND THE ONE PROPERTY THE LAYOUT TURNS ON (verifier, 2026-08-10):
    // react-native-web gives a horizontal ScrollView `flexGrow: 1`, so
    // without this override the 44 px row EATS the free height of the flex
    // column and starves the list below it. Deleting it used to keep this
    // test green.
    expect(rangee).toContain('flexGrow: 0');
    expect(rangee).toContain('flexShrink: 0');
    // ONE screen serves the three zones — a second reader could drift from it
    expect(app).toContain('<SMesCommandes key={onglet} zone={onglet}');
  });

  it('the zone reaches the pure view — the filter is not re-derived in the screen', () => {
    expect(app).toContain('const vue = fournisseurVue(read, zone);');
  });

  it('each card is HANDED its product’s photos (the prop the whole join turns on)', () => {
    expect(app).toContain('assetRefs={photos.get(c.productVersionId) ?? []}');
    expect(app).toContain('mediaBase={mediaBase}');
    // and renders them through the SAME helpers « Mes produits » uses
    const carte = carteCommande(app);
    expect(carte).toContain('photoSlot(assetRefs, mediaBase)');
    expect(carte).toContain('galleryPhotos(assetRefs, mediaBase)');
  });

  it('the photo read is BEST-EFFORT: a products failure leaves the list and the last thumbnails alone', () => {
    const charge = bloc(app, 'const load = async', 'useEffect(() => {');
    expect(charge).toContain('Promise.all([service.listMine(code), service.listProduits(code)])');
    // the list state is set from listMine ALONE; photos only on their own ok
    expect(charge).toContain('if (prods.ok) {');
    expect(charge).not.toContain('if (res.ok && prods.ok)');
  });

  it('the two archive screens say who holds the colis, from the catalog', () => {
    const carte = carteCommande(app);
    expect(carte).toContain("{commande.etape === 'en_route' && (");
    expect(carte).toContain("{t('fournisseur.etape_en_route')}");
    expect(carte).toContain("{commande.etape === 'livree' && (");
    expect(carte).toContain("{t('fournisseur.etape_livree')}");
  });

  it('the ramassage check stays on the PRÊTE card only — an « en route » colis cannot be handed over twice', () => {
    const carte = carteCommande(app);
    const prete = carte.indexOf("commande.etape === 'prete'");
    const route = carte.indexOf("commande.etape === 'en_route'");
    const check = carte.indexOf('<VerifierRamassage');
    expect(prete).toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(prete);
    // the check belongs to the prête block, and no second one exists
    expect(carte.split('<VerifierRamassage').length - 1).toBe(1);
  });
});
