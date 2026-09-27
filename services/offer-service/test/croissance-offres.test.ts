import { beforeEach, describe, expect, it } from 'vitest';
import offerRouter, { OfferDO } from '../worker/offer-do.js';
import { founderOneCreateCommand } from '../src/supply-endpoint.js';
import { EspaceOffres, type StockageCompteur } from './doubles/stockage-compteur.js';

/**
 * CATALOGUE-PAGES-1 (AUDIT-B+2 F-05) — NO WALK OUTGROWS ONE REQUEST.
 *
 * Every walk over the catalogue made one index call plus one Durable Object
 * call per offer, all inside one request, and the platform bounds how many
 * calls one request may make (50 on the Free plan, the repo's own model). The
 * audit's verifier proved it with the real router over a namespace that throws
 * on the 51st call: his « Mes produits » failed at 49 offers, the inventory
 * with it, the access cut stopped at the same place on every replay, and the
 * erase lost the photographs of what it had already deleted.
 *
 * This drives the REAL router and REAL `OfferDO` instances (the counting
 * namespace's bounds are written at the top of the double) with 120 offers and
 * the same 50-call ceiling, and asserts every PAGE stays under it while the
 * pages, followed to the end, give the same answer the whole walk gave.
 * The reseller collection (`/supply-entries`) is NOT paged here: that wire is
 * the founder's order (JOURNAL 2026-07-25) and waits on his word.
 */

const PLAFOND = 50;
const N = 120;
const T0 = '2026-09-20T08:00:00.000Z';
let espace: EspaceOffres;
let env: { OFFER: EspaceOffres };

function creer(i: number, supplierId: string) {
  const base = founderOneCreateCommand(T0);
  const pv = `pv-${String(i).padStart(4, '0')}`;
  return {
    ...base,
    commandId: `cmd-${i}`,
    offerId: `offer-${String(i).padStart(4, '0')}`,
    product: { ...base.product, id: pv, supplierId, name: `Produit ${i}` },
    draft: { ...base.draft, productVersionId: pv },
  };
}

async function appel(path: string, init?: RequestInit): Promise<Response> {
  return offerRouter.fetch(new Request(`https://do${path}`, init), env as never);
}
const poster = (path: string, body: unknown) =>
  appel(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Run one request and return what it cost in calls, the ceiling armed. */
async function mesurer<T>(run: () => Promise<T>): Promise<{ appels: number; valeur: T }> {
  espace.appels = 0;
  espace.plafond = PLAFOND;
  try {
    const valeur = await run();
    return { appels: espace.appels, valeur };
  } finally {
    espace.plafond = Number.POSITIVE_INFINITY;
  }
}

beforeEach(async () => {
  espace = new EspaceOffres((etat) => new OfferDO(etat as unknown as DurableObjectState, {}));
  env = { OFFER: espace };
  // one in three is the supplier being cut; the rest are a neighbour's
  for (let i = 0; i < N; i += 1) {
    const r = await poster('/offers', creer(i, i % 3 === 0 ? 'supplier-coupe' : 'supplier-voisin'));
    expect(r.status).toBe(200);
  }
});

/** The index object's own storage (the real `OfferDO`'s, reached the way the erase tests reach an offer's). */
const indexStockage = (): StockageCompteur =>
  (espace.instances.get('index') as unknown as { state: { storage: StockageCompteur } }).state.storage;
type Ligne = { offerId: string; productVersionId: string; supplierId?: string };
const lignes = (): Ligne[] => indexStockage().data.get('index-list') as Ligne[];
/** The index as it was written before ETIQUETTE-FOURNISSEUR-1: no supplier on any row. */
function sansEtiquettes(): void {
  indexStockage().data.set('index-list', lignes().map(({ offerId, productVersionId }) => ({ offerId, productVersionId })));
}
const etiquetees = (): number => lignes().filter((r) => r.supplierId !== undefined).length;

describe('the premise — the whole walk breaks past the ceiling', () => {
  it(`rows written before the labels: an unpaged supplier list over ${N} offers needs ${N + 1} calls and dies at the 51st`, async () => {
    sansEtiquettes();
    await expect(mesurer(() => appel('/offers?supplierId=supplier-coupe'))).rejects.toThrow(/subrequest 51 past the ceiling/);
  });
});

describe('ETIQUETTE-FOURNISSEUR-1 · a walk for one supplier reads his products, never everyone\'s', () => {
  it('a product is born labelled: his whole unpaged list is the index + his 40 — 41 calls, not 121', async () => {
    expect(etiquetees()).toBe(N);
    const { appels, valeur } = await mesurer(() => appel('/offers?supplierId=supplier-coupe'));
    expect(appels).toBe(1 + N / 3);
    expect(((await valeur.json()) as { items: unknown[] }).items).toHaveLength(N / 3);
  });

  it('a new supplier with nothing to restore: the re-mint walk ends in its first request — one call, no next', async () => {
    const { appels, valeur } = await mesurer(() =>
      poster('/offers/restauration-acces', { supplierId: 'supplier-neuf', at: T0, limit: 20 }),
    );
    expect(appels).toBe(1);
    expect(await valeur.json()).toEqual({ ok: true, supplierId: 'supplier-neuf', changed: 0 });
  });

  it('the whole cut of a supplier with 40 of 120: one index read per page, 40 reads and 40 writes — the neighbour\'s 80 never touched', async () => {
    let cursor: string | undefined;
    let pages = 0;
    let appelsTotal = 0;
    let retires = 0;
    for (let tour = 0; tour < 20; tour += 1) {
      const { appels, valeur } = await mesurer(() =>
        poster('/offers/retrait-acces', { supplierId: 'supplier-coupe', at: T0, limit: 20, ...(cursor !== undefined ? { cursor } : {}) }),
      );
      pages += 1;
      appelsTotal += appels;
      const body = (await valeur.json()) as { changed: number; next?: string };
      retires += body.changed;
      if (body.next === undefined) break;
      cursor = body.next;
    }
    expect(retires).toBe(N / 3);
    expect(pages).toBe(2);
    expect(appelsTotal).toBe(pages + 2 * (N / 3));
  });

  it('rows from before the labels: his own walk labels every row it reads, in one more call', async () => {
    sansEtiquettes();
    const { appels } = await mesurer(() =>
      poster('/offers/retrait-acces', { supplierId: 'supplier-coupe', at: T0, limit: 20 }),
    );
    // the index + 20 reads + his 7 writes (rows 0, 3, … 18) + the one label call
    expect(appels).toBe(1 + 20 + 7 + 1);
    expect(lignes().slice(0, 20).every((r) => r.supplierId === (Number(r.offerId.slice(-4)) % 3 === 0 ? 'supplier-coupe' : 'supplier-voisin'))).toBe(true);
    expect(etiquetees()).toBe(20);
  });

  it('rows from before the labels: the founder\'s Produits labels the whole index a page at a time, and then his list reads his only', async () => {
    sansEtiquettes();
    let cursor: string | undefined;
    let pire = 0;
    for (let tour = 0; tour < 20; tour += 1) {
      const { appels, valeur } = await mesurer(() =>
        appel(`/offers/inventaire?limit=40${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`),
      );
      pire = Math.max(pire, appels);
      const body = (await valeur.json()) as { next?: string };
      if (body.next === undefined) break;
      cursor = body.next;
    }
    expect(pire).toBeLessThanOrEqual(42); // the index + 40 reads + the one label call
    expect(etiquetees()).toBe(N);
    const { appels } = await mesurer(() => appel('/offers?supplierId=supplier-coupe'));
    expect(appels).toBe(1 + N / 3);
  });

  it('a cut over rows from before the labels still pages to the end: the cursor row it just learnt is someone else\'s still marks its place', async () => {
    sansEtiquettes();
    let cursor: string | undefined;
    let retires = 0;
    for (let tour = 0; tour < 20; tour += 1) {
      const res = await poster('/offers/retrait-acces', { supplierId: 'supplier-coupe', at: T0, limit: 20, ...(cursor !== undefined ? { cursor } : {}) });
      expect(res.status, await res.clone().text()).toBe(200);
      const body = (await res.json()) as { changed: number; next?: string };
      retires += body.changed;
      if (body.next === undefined) break;
      cursor = body.next;
    }
    expect(retires).toBe(N / 3);
    expect(etiquetees()).toBe(N);
  });

  it('verifier MINOR 1 — the old one-request erase labels the rows that stay', async () => {
    sansEtiquettes();
    const res = await poster('/offers/purge-fournisseur', { supplierId: 'supplier-coupe' });
    expect(res.status).toBe(200);
    expect(lignes()).toHaveLength(N - N / 3);
    expect(lignes().every((r) => r.supplierId === 'supplier-voisin')).toBe(true);
  });

  it('an old create replayed labels the row it repairs', async () => {
    sansEtiquettes();
    expect((await poster('/offers', creer(0, 'supplier-coupe'))).status).toBe(200); // same commandId: idempotent
    expect(lignes().find((r) => r.offerId === 'offer-0000')?.supplierId).toBe('supplier-coupe');
    expect(etiquetees()).toBe(1);
  });

  it('a label once written is never replaced — an offer\'s supplier does not change', async () => {
    const index = espace.get(espace.idFromName('index'));
    const res = await index.fetch(new Request('https://do/index/etiqueter', {
      method: 'PUT',
      body: JSON.stringify({ etiquettes: [{ offerId: 'offer-0000', supplierId: 'supplier-voisin' }] }),
    }));
    expect(res.status).toBe(200);
    expect(lignes().find((r) => r.offerId === 'offer-0000')?.supplierId).toBe('supplier-coupe');
  });
});

describe('F-05 · every page stays under the ceiling, and the pages add up to the whole', () => {
  async function suivre(base: string): Promise<{ items: { offerId: string }[]; pire: number }> {
    const items: { offerId: string }[] = [];
    let pire = 0;
    let cursor: string | undefined;
    for (let tour = 0; tour < 20; tour += 1) {
      const url = `${base}${base.includes('?') ? '&' : '?'}limit=40${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const { appels, valeur } = await mesurer(() => appel(url));
      pire = Math.max(pire, appels);
      const body = (await valeur.json()) as { items: { offerId: string }[]; next?: string };
      items.push(...body.items);
      if (body.next === undefined) return { items, pire };
      cursor = body.next;
    }
    throw new Error('the pages never ended');
  }

  it('his list: every page ≤ 41 calls, and the pages are his whole list in the same order', async () => {
    const { items, pire } = await suivre('/offers?supplierId=supplier-coupe');
    expect(pire).toBeLessThanOrEqual(41);
    const whole = (await (await appel('/offers?supplierId=supplier-coupe')).json()) as { items: { offerId: string }[] };
    expect(items.map((i) => i.offerId)).toEqual(whole.items.map((i) => i.offerId));
    expect(items).toHaveLength(N / 3);
  });

  it('the founder inventory: every page ≤ 41 calls, every offer once, in the index order', async () => {
    const { items, pire } = await suivre('/offers/inventaire');
    expect(pire).toBeLessThanOrEqual(41);
    expect(items.map((i) => i.offerId)).toEqual(Array.from({ length: N }, (_, i) => `offer-${String(i).padStart(4, '0')}`));
  });

  it('a cursor whose row is gone answers 409 curseur_perdu — never a guessed position', async () => {
    const r = await appel('/offers/inventaire?limit=40&cursor=offer-inexistante');
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'curseur_perdu' });
  });

  it('no limit is the old answer: the whole list and no next', async () => {
    espace.plafond = Number.POSITIVE_INFINITY;
    const body = (await (await appel('/offers/inventaire')).json()) as { items: unknown[]; next?: unknown };
    expect(body.items).toHaveLength(N);
    expect(body.next).toBeUndefined();
  });
});

describe('F-05 · the access cut finishes, page by page, and never re-writes what is already cut', () => {
  it('every page ≤ 41 calls; the pages retire every one of his offers and none of the neighbour', async () => {
    let cursor: string | undefined;
    let total = 0;
    let pire = 0;
    for (let tour = 0; tour < 20; tour += 1) {
      const { appels, valeur } = await mesurer(() =>
        poster('/offers/retrait-acces', { supplierId: 'supplier-coupe', at: T0, limit: 20, ...(cursor !== undefined ? { cursor } : {}) }),
      );
      pire = Math.max(pire, appels);
      const body = (await valeur.json()) as { changed: number; next?: string };
      total += body.changed;
      if (body.next === undefined) break;
      cursor = body.next;
    }
    expect(pire).toBeLessThanOrEqual(41);
    expect(total).toBe(N / 3);
    const inv = (await (await appel('/offers/inventaire')).json()) as { items: { supplierId: string }[] };
    expect(inv.items.every((i) => i.supplierId === 'supplier-voisin')).toBe(true); // his are off his screens
    expect(inv.items).toHaveLength(N - N / 3);
  });

  it('a replay of a finished cut spends one read per row and writes nothing', async () => {
    await poster('/offers/retrait-acces', { supplierId: 'supplier-coupe', at: T0 });
    const { appels, valeur } = await mesurer(() => poster('/offers/retrait-acces', { supplierId: 'supplier-coupe', at: T0, limit: 20 }));
    expect(((await valeur.json()) as { changed: number }).changed).toBe(0);
    expect(appels).toBe(21); // the index + 20 reads, no write call
  });
});

describe('F-05 · the erase finishes page by page and hands back EVERY photograph', () => {
  function avecPhotos(): void {
    for (const [nom, inst] of espace.instances) {
      if (!nom.startsWith('offer-')) continue;
      const storage = (inst as unknown as { state: { storage: StockageCompteur } }).state.storage;
      const e = storage.data.get('offer-entry') as Record<string, unknown> | undefined;
      if (e === undefined) continue;
      const hex = nom.slice(-4).padStart(12, '0');
      const ref = (k: string) => ({ ref: `media/${k}0000000-0000-4000-8000-${hex}`, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });
      storage.data.set('offer-entry', {
        ...e,
        assets: { masterRef: { ...ref('0'), ref: 'private/master/x' }, heroSquare: ref('1'), heroVertical: ref('2'), proof: ref('3'), detail: [], hashes: ['a'.repeat(64)], processingVersion: 'premium-frame.v1' },
      });
    }
  }

  it('verify then erase: every page ≤ 41 calls, all his offers gone, every ref returned, the neighbour intact', async () => {
    avecPhotos();
    // the read-only pass first (F-33: read everything, remove nothing)
    let cursor: string | undefined;
    let pire = 0;
    for (let tour = 0; tour < 20; tour += 1) {
      const { appels, valeur } = await mesurer(() =>
        poster('/offers/purge-fournisseur', { supplierId: 'supplier-coupe', limit: 40, verifier: true, ...(cursor !== undefined ? { cursor } : {}) }),
      );
      pire = Math.max(pire, appels);
      const body = (await valeur.json()) as { verifie: boolean; next?: string };
      expect(body.verifie).toBe(true);
      if (body.next === undefined) break;
      cursor = body.next;
    }
    // then the erase itself
    cursor = undefined;
    const refs: string[] = [];
    let supprimes = 0;
    for (let tour = 0; tour < 40; tour += 1) {
      const { appels, valeur } = await mesurer(() =>
        poster('/offers/purge-fournisseur', { supplierId: 'supplier-coupe', limit: 8, ...(cursor !== undefined ? { cursor } : {}) }),
      );
      pire = Math.max(pire, appels);
      const body = (await valeur.json()) as { supprimes: number; refs: string[]; fini: boolean; cursor?: string };
      supprimes += body.supprimes;
      refs.push(...body.refs);
      if (body.fini) break;
      cursor = body.cursor;
    }
    expect(pire).toBeLessThanOrEqual(41);
    expect(supprimes).toBe(N / 3);
    expect(new Set(refs).size).toBe(3 * (N / 3)); // hero, vertical, proof of each — the master never
    expect(refs.some((r) => r.startsWith('private/'))).toBe(false);
    const inv = (await (await appel('/offers/inventaire')).json()) as { items: { supplierId: string }[] };
    expect(inv.items).toHaveLength(N - N / 3);
    expect(inv.items.every((i) => i.supplierId === 'supplier-voisin')).toBe(true);
  });

  it('a page that fails half-way still hands back the refs of what it already erased', async () => {
    avecPhotos();
    // index + 8 entry reads, then four erase calls per offer (pointer read,
    // pointer delete, index row, record): the first completes; the second
    // dies on its record, AFTER its index row went — unreachable from now on
    espace.appels = 0;
    espace.plafond = 1 + 8 + 4 + 3;
    let res: Response;
    try {
      res = await poster('/offers/purge-fournisseur', { supplierId: 'supplier-coupe', limit: 8 });
    } finally {
      espace.plafond = Number.POSITIVE_INFINITY;
    }
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; supprimes: number; refs: string[] };
    expect(body.error).toBe('purge_partielle');
    expect(body.supprimes).toBe(1);
    // BOTH offers' photographs: the second's record survives, but nothing can
    // ever reach it again, so its refs are handed back now or never
    expect(body.refs).toHaveLength(6);
  });

  it('a buyer holding one of his units stops the read-only pass BEFORE anything is removed', async () => {
    const r = await poster('/supply-hold/pv-0003', { reservationId: 'res-1', orderId: 'ord-1', qty: 1 });
    expect(r.status).toBe(200);
    const v = await poster('/offers/purge-fournisseur', { supplierId: 'supplier-coupe', limit: 40, verifier: true });
    expect(v.status).toBe(409);
    const inv = (await (await appel('/offers/inventaire')).json()) as { items: unknown[] };
    expect(inv.items).toHaveLength(N);
  });
});
