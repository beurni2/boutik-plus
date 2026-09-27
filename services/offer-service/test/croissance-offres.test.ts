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

describe('the premise — the whole walk breaks past the ceiling', () => {
  it(`an unpaged supplier list over ${N} offers needs ${N + 1} calls and dies at the 51st`, async () => {
    await expect(mesurer(() => appel('/offers?supplierId=supplier-coupe'))).rejects.toThrow(/subrequest 51 past the ceiling/);
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
