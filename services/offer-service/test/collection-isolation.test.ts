import { describe, expect, it } from 'vitest';
import { ProductAssetsSchema, type ProductAssets } from '@platform/contracts';
import { InMemoryOfferStore } from '../src/offer-store.js';
import {
  SupplyLeakError,
  assertAssetRefsIdentityFree,
  founderOneCreateCommand,
  makeSupplyFetch,
  serveProjection,
  serveProjections,
  SERVICE_NAME,
} from '../src/supply-endpoint.js';
import type { CreateOfferCommand, OfferEntry } from '../src/offer-core.js';

/**
 * CATALOGUE-PAGES-1 (AUDIT-B+2 F-32) — ONE PRODUCT MUST NOT BLANK THE WHOLE
 * RESELLER COLLECTION.
 *
 * Before: the leak guard tested `ref.includes(supplierId)`. A short supplier id
 * (`ed`, `dia`, `12` — the founder types them freely at mint) matches a random
 * `media/<uuid>` by chance, the guard threw, and the throw escaped the
 * collection loop: every reseller's « Opportunités » went 500 over one photo
 * that carried no identity at all.
 *
 * Now, two independent teeth, each proven on its own:
 *   · STRUCTURAL — a ref that is exactly `media/<uuid v4>` was minted from the
 *     CSPRNG with no argument (media-key.ts); a chance substring in random hex
 *     is not identity, so it is not refused. Any OTHER ref keeps the substring
 *     check, so a ref that really spells the supplier is still refused.
 *   · ISOLATED — whatever still throws for one entry OMITS THAT ENTRY; its
 *     neighbours are served. The function's own contract: « a refused entry is
 *     omitted, not reported ».
 */

const T0 = '2026-07-15T08:00:00.000Z';
const NOW = '2026-07-15T09:00:00.000Z';
const SHORT_ID = 'ed';
/** A real v4 uuid that happens to contain `ed` — the audit's own shape. */
const CHANCE_REF = 'media/97378ff4-5ed1-4c2a-9bed-0a1b2c3d4e5f';
const ref = (r: string) => ({ ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });

function assets(hero: string): ProductAssets {
  return ProductAssetsSchema.parse({
    masterRef: ref('private/master/capture-1'),
    heroSquare: ref(hero),
    heroVertical: ref('media/22222222-2222-4222-8222-222222222222'),
    proof: ref('media/33333333-3333-4333-8333-333333333333'),
    detail: [],
    hashes: ['a'.repeat(64)],
    processingVersion: 'premium-frame.v1',
  });
}

function cmd(offerId: string, pv: string, supplierId: string): CreateOfferCommand {
  const base = founderOneCreateCommand(T0);
  return {
    ...base,
    commandId: `cmd-${offerId}`,
    offerId,
    product: { ...base.product, id: pv, supplierId },
    draft: { ...base.draft, productVersionId: pv },
  };
}

async function entries(...specs: [string, string, string, string][]): Promise<OfferEntry[]> {
  const store = new InMemoryOfferStore();
  for (const [offerId, pv, supplierId] of specs) await store.create(cmd(offerId, pv, supplierId));
  const all = await store.listEntries();
  return all.map((e) => ({ ...e, assets: assets(specs.find((s) => s[0] === e.offerId)![3]) }));
}

describe('F-32 · the structural tooth — random bytes are not identity', () => {
  it('a media/<uuid v4> ref that happens to contain a short supplier id is NOT refused', () => {
    expect(CHANCE_REF.includes(SHORT_ID)).toBe(true); // the premise: a chance match exists
    expect(() => assertAssetRefsIdentityFree([CHANCE_REF], SHORT_ID)).not.toThrow();
  });

  it('a ref that is NOT the opaque shape still meets the substring tooth', () => {
    expect(() => assertAssetRefsIdentityFree(['media/ed-photo.jpg'], SHORT_ID)).toThrow(SupplyLeakError);
    expect(() => assertAssetRefsIdentityFree(['media/supplier-9/x.jpg'], 'supplier-9')).toThrow(SupplyLeakError);
    // a uuid with a suffix is not the minted shape either
    expect(() => assertAssetRefsIdentityFree([`${CHANCE_REF}-ed`], SHORT_ID)).toThrow(SupplyLeakError);
  });

  it('the supplier whose short id matched by chance is SERVED on the single read', async () => {
    const [e] = await entries(['o-ed', 'pv-ed', SHORT_ID, CHANCE_REF]);
    const outcome = serveProjection(SERVICE_NAME, e, NOW);
    expect(outcome.ok).toBe(true);
  });
});

describe('F-32 · the isolation tooth — one refused entry is omitted, never the whole list', () => {
  it('an entry whose ref really spells its supplier is OMITTED; every neighbour is still served', async () => {
    const list = await entries(
      ['o-a', 'pv-a', 'supplier-a', 'media/11111111-1111-4111-8111-111111111111'],
      ['o-leak', 'pv-leak', 'supplier-leak', 'media/supplier-leak/hero.jpg'],
      ['o-b', 'pv-b', 'supplier-b', 'media/44444444-4444-4444-8444-444444444444'],
    );
    const served = serveProjections(SERVICE_NAME, list, NOW);
    expect(served.items.map((i) => i.value.productVersionId)).toEqual(['pv-a', 'pv-b']);
    // the refused entry leaves no trace: no id, no ref, no reason
    const raw = JSON.stringify(served);
    expect(raw).not.toContain('pv-leak');
    expect(raw).not.toContain('supplier-leak');
  });

  it('the single read of that same entry still refuses loudly (the guard itself is not weakened)', async () => {
    const [e] = await entries(['o-leak', 'pv-leak', 'supplier-leak', 'media/supplier-leak/hero.jpg']);
    expect(() => serveProjection(SERVICE_NAME, e, NOW)).toThrow(SupplyLeakError);
  });

  it('over the real route: the collection answers 200 with the neighbours', async () => {
    const list = await entries(
      ['o-a', 'pv-a', 'supplier-a', 'media/11111111-1111-4111-8111-111111111111'],
      ['o-leak', 'pv-leak', 'supplier-leak', 'media/supplier-leak/hero.jpg'],
    );
    const store = { ...new InMemoryOfferStore(), listEntries: async () => list } as unknown as InMemoryOfferStore;
    const res = await makeSupplyFetch(store, () => NOW)(new Request('http://o/supply-projections'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { value: { productVersionId: string } }[] };
    expect(body.items.map((i) => i.value.productVersionId)).toEqual(['pv-a']);
  });
});
