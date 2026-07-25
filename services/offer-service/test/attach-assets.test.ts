import { describe, expect, it } from 'vitest';
import { ProductAssetsSchema, ProductVersionSchema, type ProductAssets } from '@platform/contracts';
import {
  decideAttachAssets,
  decideCreateOffer,
  type AttachAssetsCommand,
  type CreateOfferCommand,
  type OfferEntry,
} from '../src/offer-core.js';
import { ASSET_REFS_MAX } from '../src/projection.js';
import { InMemoryOfferStore } from '../src/offer-store.js';
import { makeSupplyFetch, SERVICE_NAME } from '../src/supply-endpoint.js';

/**
 * THE COMPLETION PATH (combined slice) — "the product saves with what got
 * through; a later upload adds the photographs without republishing" (founder
 * ruling). And the variants NOTE — his typed text preserved as text, never
 * parsed into ids pointing at records that do not exist.
 */

const NOW = '2026-07-25T08:00:00.000Z';

const ref = (r: string) => ({ ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });
const assetsWith = (detailCount: number): ProductAssets =>
  ProductAssetsSchema.parse({
    masterRef: ref('private/master/capture-1'),
    heroSquare: ref('media/11111111-1111-4111-8111-111111111111'),
    heroVertical: ref('media/22222222-2222-4222-8222-222222222222'),
    proof: ref('media/33333333-3333-4333-8333-333333333333'),
    detail: Array.from({ length: detailCount }, (_, i) => ref(`media/detail-${i}`)),
    hashes: ['a'.repeat(64)],
    processingVersion: 'premium-frame.v1',
  });

const product = ProductVersionSchema.parse({
  id: 'pv-1', supplierId: 'supplier-founder-001', version: 1, name: 'Pagne tissé', productCode: 'PAG-01',
  facts: {}, category: 'textile', zone: 'Gounghin', moderationState: 'approved',
  status: 'active', supplyMode: 'SELLER_HELD',
});

function createCmd(over: Partial<CreateOfferCommand> = {}): CreateOfferCommand {
  return {
    commandId: 'cmd-create-1', offerId: 'offer-1', product,
    draft: {
      productVersionId: 'pv-1', basePrice: 10_000, resellerCommission: 1_000,
      eligibleVariants: [], zones: [],
      effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 5, asOf: NOW,
    ...over,
  };
}

function entryWithoutAssets(): OfferEntry {
  const { decision } = decideCreateOffer(undefined, createCmd());
  if (decision.status !== 'created') throw new Error('fixture create failed');
  return decision.entry;
}

const attach = (over: Partial<AttachAssetsCommand> = {}): AttachAssetsCommand => ({
  commandId: 'cmd-attach-1', offerId: 'offer-1', assets: assetsWith(1), ...over,
});

describe('ATTACH — one-shot, absent → present', () => {
  it('attaches to an offer created without assets, and the entry now carries them', () => {
    const { decision, next } = decideAttachAssets(entryWithoutAssets(), attach());
    expect(decision.status).toBe('attached');
    expect(next?.assets).toBeDefined();
    expect(next?.attachCommandId).toBe('cmd-attach-1');
    // the offer itself is untouched: ids, economics, availability all identical
    const before = entryWithoutAssets();
    expect(next?.offerId).toBe(before.offerId);
    expect(next?.offer).toEqual(before.offer);
    expect(next?.available).toBe(before.available);
  });

  it('a RETRY with the same commandId is idempotent — a lost response cannot double-attach', () => {
    const first = decideAttachAssets(entryWithoutAssets(), attach());
    expect(first.decision.status).toBe('attached');
    const retry = decideAttachAssets(first.next, attach());
    expect(retry.decision.status).toBe('idempotent');
    expect(retry.next).toBeUndefined(); // nothing written twice
  });

  it('an unknown offer is an honest not_found, never a create-by-side-door', () => {
    expect(decideAttachAssets(undefined, attach()).decision.status).toBe('not_found');
  });

  it('COMPLETION IS NOT REPLACEMENT: assets already present (from create OR a prior attach) is refused, typed', () => {
    // present from create:
    const { decision: created } = decideCreateOffer(undefined, createCmd({ assets: assetsWith(0) }));
    if (created.status !== 'created') throw new Error('fixture');
    const viaCreate = decideAttachAssets(created.entry, attach());
    expect(viaCreate.decision).toEqual({ status: 'refused', reason: 'assets_already_present' });
    // present from a prior attach, DIFFERENT command id (not the idempotent case):
    const attached = decideAttachAssets(entryWithoutAssets(), attach());
    const second = decideAttachAssets(attached.next, attach({ commandId: 'cmd-attach-2' }));
    expect(second.decision).toEqual({ status: 'refused', reason: 'assets_already_present' });
  });

  it('the SAME cap as create — 4 details = 7 wire refs is refused with both numbers, never truncated', () => {
    const { decision } = decideAttachAssets(entryWithoutAssets(), attach({ assets: assetsWith(4) }));
    expect(decision).toEqual({ status: 'refused', reason: 'too_many_asset_refs', max: ASSET_REFS_MAX, presented: 7 });
  });

  it('a malformed assets shape THROWS at the boundary (the DO route maps it to 400) — never a partial store', () => {
    const bad = { ...assetsWith(0), heroSquare: { ref: 'media/x', sha256: 'not-hex', mimeType: 'image/jpeg' } };
    expect(() => decideAttachAssets(entryWithoutAssets(), attach({ assets: bad as ProductAssets }))).toThrow();
  });

  it('after an attach, the WIRE serves the photographs — the point of the whole path', async () => {
    const store = new InMemoryOfferStore();
    await store.create(createCmd());
    // simulate the durable write the DO route performs on `next`
    const entry = await store.getEntryByProductVersion('pv-1');
    const { next } = decideAttachAssets(entry, attach());
    // in-memory store has no attach op (the DO owns it in prod); write through create-shape access:
    expect(next).toBeDefined();
    const read = makeSupplyFetch(
      { create: store.create.bind(store), getEntryByProductVersion: async () => next, listEntries: async () => [next!] },
      () => NOW,
    );
    const res = await read(new Request('https://o/supply-projection/pv-1'));
    const body = (await res.json()) as { value: { assetRefs: string[] } };
    expect(body.value.assetRefs).toHaveLength(4); // heroSquare, heroVertical, proof, 1 detail
    expect(body.value.assetRefs[0]).toBe('media/11111111-1111-4111-8111-111111111111'); // hero first
    expect(body.value.assetRefs).not.toContain('private/master/capture-1'); // master never travels
    expect(SERVICE_NAME).toBe('offer-service');
  });
});

describe('THE VARIANTS NOTE — his words, a note, never a claim', () => {
  it('is carried verbatim (trimmed) onto the entry and NEVER into canon eligibleVariants', () => {
    const { decision } = decideCreateOffer(undefined, createCmd({ variantsNote: '  S, M, L ' }));
    if (decision.status !== 'created') throw new Error('fixture');
    expect(decision.entry.variantsNote).toBe('S, M, L');
    // the canon field stays EMPTY — no ids minted toward Variant records that do not exist
    expect(decision.entry.offer.eligibleVariants).toEqual([]);
  });

  it('an empty or whitespace note is stored as ABSENT, and a non-string is refused by absence', () => {
    for (const bad of ['', '   ', 42 as unknown as string, null as unknown as string]) {
      const { decision } = decideCreateOffer(undefined, createCmd({ variantsNote: bad }));
      if (decision.status !== 'created') throw new Error('fixture');
      expect('variantsNote' in decision.entry).toBe(false);
    }
  });

  it('never reaches the wire — the projection has no variants field and the strict schema would refuse one', async () => {
    const store = new InMemoryOfferStore();
    await store.create(createCmd({ variantsNote: 'S, M, L' }));
    const res = await makeSupplyFetch(store, () => NOW)(new Request('https://o/supply-projection/pv-1'));
    expect(JSON.stringify(await res.json())).not.toMatch(/variantsNote|S, M, L/);
  });
});
