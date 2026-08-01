import { describe, expect, it } from 'vitest';
import { attestedTier, parseAttestedSuppliers } from '../src/attested-suppliers.js';
import { serveProjection, founderOneCreateCommand, FOUNDER_001_SUPPLIER_ID, FOUNDER_001_PRODUCT_VERSION_ID } from '../src/supply-endpoint.js';
import { InMemoryOfferStore } from '../src/offer-store.js';

/**
 * SELLER-TIER-WIRE-1 — the founder's attestation, and the fail-closed contract
 * around it. §6.1's first condition is « seller tier ≥ verified »; this repo can
 * only otherwise produce `provisional`, and « verification tiers evidence +
 * progression thresholds » is an OPEN ⏳ Decision. So these tests police one
 * thing above all: **nothing but an exact, explicitly-configured id may ever
 * produce `verified`.**
 */

const NOW = '2026-08-01T12:00:00.000Z';

describe('attestedTier — only an EXACT configured id is verified', () => {
  it('an attested supplier is verified; everyone else is provisional', () => {
    const env = { VERIFIED_SUPPLIERS: FOUNDER_001_SUPPLIER_ID };
    expect(attestedTier(FOUNDER_001_SUPPLIER_ID, env)).toBe('verified');
    expect(attestedTier('supplier-someone-else', env)).toBe('provisional');
  });

  it('FAILS CLOSED on every shape of absent configuration', () => {
    // Each of these is a real deployment state: binding never set, set empty,
    // set to whitespace, or the env object itself missing.
    for (const env of [undefined, {}, { VERIFIED_SUPPLIERS: '' }, { VERIFIED_SUPPLIERS: '   ' }, { VERIFIED_SUPPLIERS: ' , , ' }]) {
      expect(attestedTier(FOUNDER_001_SUPPLIER_ID, env), JSON.stringify(env)).toBe('provisional');
    }
  });

  it('NEVER matches on a prefix, suffix, substring or different case', () => {
    const env = { VERIFIED_SUPPLIERS: FOUNDER_001_SUPPLIER_ID };
    // The one that would actually happen: a later supplier whose id extends an
    // attested one. `includes()` on the raw string would promote it.
    expect(attestedTier(`${FOUNDER_001_SUPPLIER_ID}1`, env)).toBe('provisional');
    expect(attestedTier(FOUNDER_001_SUPPLIER_ID.slice(0, -1), env)).toBe('provisional');
    expect(attestedTier(FOUNDER_001_SUPPLIER_ID.toUpperCase(), env)).toBe('provisional');
    expect(attestedTier(` ${FOUNDER_001_SUPPLIER_ID}`, env)).toBe('provisional');
    expect(attestedTier('', env)).toBe('provisional');
  });

  it('`trusted` is UNREACHABLE — this attests the §6.1 minimum and nothing beyond it', () => {
    // Even if someone writes a tier name into the list, the only values this
    // function can return are verified (exact match) or provisional.
    for (const raw of ['trusted', `${FOUNDER_001_SUPPLIER_ID},trusted`]) {
      expect(attestedTier(FOUNDER_001_SUPPLIER_ID, { VERIFIED_SUPPLIERS: raw })).not.toBe('trusted');
    }
    expect(attestedTier('trusted', { VERIFIED_SUPPLIERS: 'trusted' })).toBe('verified'); // it is just an id, not a tier
  });

  it('parses commas and whitespace, dropping blanks', () => {
    expect(parseAttestedSuppliers('a,b c,,  d ')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseAttestedSuppliers(undefined)).toEqual([]);
  });
});

describe('the served projection carries the attested tier — or omits it', () => {
  const served = async (env: { VERIFIED_SUPPLIERS?: string } | undefined) => {
    const store = new InMemoryOfferStore();
    await store.create(founderOneCreateCommand(NOW));
    const entry = await store.getEntryByProductVersion(FOUNDER_001_PRODUCT_VERSION_ID);
    const out = serveProjection('offer-service', entry, NOW, env);
    if (!out.ok) throw new Error(`served refused: ${JSON.stringify(out.body)}`);
    return out.body.value as { sellerTier?: string };
  };

  it('ATTESTED ⇒ the wire says verified, so §6.1 can finally pass on server truth', async () => {
    expect((await served({ VERIFIED_SUPPLIERS: FOUNDER_001_SUPPLIER_ID })).sellerTier).toBe('verified');
  });

  it('NOT ATTESTED ⇒ the wire says provisional — the TRUE tier this repo holds', async () => {
    // This is the honest default and it means Option B is refused. That is the
    // designed behaviour until the ⏳ Decision closes, not a bug.
    expect((await served(undefined)).sellerTier).toBe('provisional');
    expect((await served({ VERIFIED_SUPPLIERS: 'supplier-someone-else' })).sellerTier).toBe('provisional');
  });

  it('the tier rides through the strict canon out-guard — it is a declared field, not a smuggled one', async () => {
    // assertServableValue parses against canon v3.1.0 inside serveProjection;
    // reaching this line at all proves the field is contract-shaped.
    const value = await served({ VERIFIED_SUPPLIERS: FOUNDER_001_SUPPLIER_ID });
    expect(Object.keys(value).sort()).toEqual(
      ['assetRefs', 'available', 'basePrice', 'category', 'offerVersion', 'productName', 'productVersionId', 'resellerCommission', 'sellerTier'].sort(),
    );
  });
});
