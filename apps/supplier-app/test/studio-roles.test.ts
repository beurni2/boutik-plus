import { describe, expect, it } from 'vitest';
import {
  defaultRoles,
  publishOrder,
  PHOTOS_MAX,
  PHOTOS_MIN,
  ROLE_ORDER,
  roleChipKey,
  swapToNext,
  type PhotoRole,
} from '../src/studio/roles';
import { catalog } from '../src/i18n';

/**
 * STUDIO-BATCH-1 — role assignment at the verify step (founder 2026-07-27:
 * "choose the hero photo, the preuve and the detail from this screen").
 *
 * THE ONE INVARIANT: the assignment is ALWAYS a permutation of the first N
 * roles — exactly one hero, one preuve, one détail 1 (and one détail 2 at 4).
 * A duplicate hero or a missing proof at publish would be quiet corruption of
 * the product's photo set, so the property is proven under arbitrary tap
 * sequences, not just single taps.
 */

const isPermutation = (roles: readonly PhotoRole[]): boolean => {
  const expected = ROLE_ORDER.slice(0, roles.length);
  return expected.every((r) => roles.filter((x) => x === r).length === 1);
};

describe('the default assignment — pick order IS role order', () => {
  it('3 photos: hero, preuve, détail 1 — the pre-reshape contract, untouched', () => {
    expect(defaultRoles(3)).toEqual(['hero', 'preuve', 'detail1']);
  });

  it("4 photos: the founder's fourth is détail 2", () => {
    expect(defaultRoles(4)).toEqual(['hero', 'preuve', 'detail1', 'detail2']);
  });

  it('bounds are the named constants: 3 to 4', () => {
    expect(PHOTOS_MIN).toBe(3);
    expect(PHOTOS_MAX).toBe(4);
  });
});

describe('swapToNext — one tap advances a photo through the roles, ALWAYS by swap', () => {
  it('one tap: the photo takes the NEXT role, and the photo that held it takes this one’s old role', () => {
    expect(swapToNext(['hero', 'preuve', 'detail1'], 0)).toEqual(['preuve', 'hero', 'detail1']);
    expect(swapToNext(['hero', 'preuve', 'detail1'], 2)).toEqual(['detail1', 'preuve', 'hero']); // detail1 wraps to hero
  });

  it('a full cycle of taps returns the TAPPED photo to its own role — and every step stays a permutation', () => {
    // NOTE the honest claim: the whole assignment does NOT return to start
    // (swaps compose — the other photos move); the tapped photo's role does.
    let roles = defaultRoles(4);
    for (let i = 0; i < 4; i += 1) {
      roles = swapToNext(roles, 2);
      expect(isPermutation(roles)).toBe(true);
    }
    expect(roles[2]).toBe('detail1');
  });

  it('THE PERMUTATION INVARIANT holds under 500 arbitrary taps, at 3 and at 4', () => {
    for (const n of [3, 4]) {
      let roles = defaultRoles(n);
      // deterministic pseudo-random walk — no Math.random in a test that must reproduce
      let seed = 42;
      for (let step = 0; step < 500; step += 1) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        roles = swapToNext(roles, seed % n);
        expect(isPermutation(roles), `n=${n} step=${step} → ${roles.join(',')}`).toBe(true);
      }
    }
  });

  it('an out-of-range index changes nothing', () => {
    expect(swapToNext(defaultRoles(3), 7)).toEqual(defaultRoles(3));
  });
});

describe('publishOrder — the indexes the publish path uploads by', () => {
  it('maps the default: photo 0 hero, photo 1 preuve, details in détail order', () => {
    expect(publishOrder(defaultRoles(4))).toEqual({ hero: 0, preuve: 1, details: [2, 3] });
    expect(publishOrder(defaultRoles(3))).toEqual({ hero: 0, preuve: 1, details: [2] });
  });

  it('follows a swapped assignment — détails stay in détail-1-then-2 order regardless of photo position', () => {
    expect(publishOrder(['detail2', 'hero', 'preuve', 'detail1'])).toEqual({ hero: 1, preuve: 2, details: [3, 0] });
  });

  it('REFUSES a non-permutation — two heroes or a missing proof can never reach the uploads', () => {
    expect(publishOrder(['hero', 'hero', 'detail1'] as PhotoRole[])).toBeNull();
    expect(publishOrder(['hero', 'detail1', 'detail2'] as PhotoRole[])).toBeNull();
    expect(publishOrder([] as PhotoRole[])).toBeNull();
    expect(publishOrder(['hero', 'preuve'] as PhotoRole[])).toBeNull(); // below MIN
  });
});

describe('the chip labels live in the catalog — never sentences assembled in code', () => {
  it('every role maps to an existing key, both ways', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const mapped = ROLE_ORDER.map((r) => roleChipKey(r));
    for (const k of mapped) expect(keys.has(k), k).toBe(true);
    // and no publier.role_* key sits orphaned in the catalog
    const inCatalog = [...keys].filter((k) => k.startsWith('publier.role_'));
    expect(new Set(inCatalog)).toEqual(new Set(mapped));
  });
});
