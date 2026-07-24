import { describe, expect, it } from 'vitest';
import {
  MEDIA_KEY_PREFIX,
  MediaKeyError,
  assertOpaqueMediaKey,
  isOpaqueMediaKey,
  mintMediaKey,
} from '../src/media-key.js';

/**
 * BOUTIK-MEDIA-1 — THE KEY IS THE ONLY WALL. Product images carry no separate
 * moderation state and the read route has no live-check, so these assertions are
 * the security property of the slice, not hygiene.
 */

describe('opaque media keys — unguessable, identity-free, servable, all at once', () => {
  it('is `media/{uuid-v4}` and NOTHING else — no namespace that could describe an identity', () => {
    const key = mintMediaKey();
    expect(key.startsWith(MEDIA_KEY_PREFIX)).toBe(true);
    expect(key).toMatch(/^media\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(key.split('/')).toHaveLength(2); // exactly one segment after the prefix
  });

  it('mints a FRESH key every call — an upload NEVER overwrites (what makes `immutable` truthful and revocation meaningful)', () => {
    const keys = new Set(Array.from({ length: 500 }, () => mintMediaKey()));
    expect(keys.size).toBe(500); // zero collisions, zero reuse
  });

  it('carries NO identity and NO productVersionId — the guard offer-service applies to every ref would accept these', () => {
    // the identities that must never appear in a ref (offer-service's
    // assertAssetRefsIdentityFree rejects any ref containing the supplierId)
    const supplierId = 'supplier-founder-001';
    const productVersionId = 'pv-founder-001';
    for (let i = 0; i < 200; i += 1) {
      const key = mintMediaKey();
      expect(key.includes(supplierId)).toBe(false);
      expect(key.includes(productVersionId)).toBe(false);
      expect(key).not.toMatch(/supplier|phone|contact|pickup|adresse|pv-/i);
    }
  });

  it('takes NO arguments — there is no parameter through which a caller could smuggle identity or a counter into the key', () => {
    expect(mintMediaKey).toHaveLength(0); // arity 0, enforced
  });

  it('the productVersionId contributes ZERO entropy: minting is independent of any product', () => {
    // two keys minted in the same tick for "the same product" differ completely —
    // the pv is on the wire, so it must never be derivable back to a key.
    const a = mintMediaKey();
    const b = mintMediaKey();
    expect(a).not.toBe(b);
  });
});

describe('the boundary tooth — only the exact minted shape is servable', () => {
  it('accepts a minted key', () => {
    expect(() => assertOpaqueMediaKey(mintMediaKey())).not.toThrow();
    expect(isOpaqueMediaKey(mintMediaKey())).toBe(true);
  });

  it('REFUSES path traversal, sub-namespaces, sequential ids, and identity-keyed shapes', () => {
    const refused = [
      'media/../private/master/secret',
      'media/supplier-founder-001/hero.jpg', // the shop-plus-style identity key
      'media/1', // the sequential-id enumeration bug
      'media/media-2',
      'private/master/capture-1', // the private original is not servable by this route
      'media/f47ac10b-58cc-4372-a567-0e02b2c3d479/extra',
      'media/not-a-uuid',
      '',
    ];
    for (const key of refused) {
      expect(isOpaqueMediaKey(key), key).toBe(false);
      expect(() => assertOpaqueMediaKey(key), key).toThrow(MediaKeyError);
    }
  });
});
