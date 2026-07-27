/**
 * STUDIO-BATCH-1 — ROLE ASSIGNMENT AT THE VERIFY STEP (founder reshape
 * 2026-07-27, two sentences: *"i wan to be able to select the photo from the
 * gallery ... and upload at the same time instead just doing it one by one"*
 * and *"make so that i can choose the hero photo, the preuve and the detail
 * from this screen"* — the 5/5 verify screen).
 *
 * WHAT THIS SUPERSEDES, on the record: the 2026-07-25 flow bound a role to
 * each photograph AT INTAKE (hero → preuve → détail, one guided slot each).
 * Under this reshape the Studio only COLLECTS photographs; which one is the
 * hero, the proof, or a detail is decided HERE — on the verify step, by
 * tapping the role under a photo.
 *
 * EVERY DECISION IS A VALUE (standing precedent): the assignment is an array
 * of roles, index-aligned with the photos in pick order. The one invariant
 * that must never break: **the assignment is always a permutation of the
 * first N roles** — every role appears exactly once, so the publish path can
 * never receive two heroes or a product with no proof. `swapToNext` preserves
 * it by construction: advancing one photo's role SWAPS with the photo that
 * held it, never duplicates.
 */

/** The four roles a photograph can play, in canonical display order. */
export type PhotoRole = 'hero' | 'preuve' | 'detail1' | 'detail2';

export const ROLE_ORDER: readonly PhotoRole[] = ['hero', 'preuve', 'detail1', 'detail2'];

/** How many photographs the Studio accepts. The MIN matches what assembly
 * REQUIRES (hero + proof + one detail — the pre-reshape contract); the MAX is
 * the founder's "make it 4" (a second detail; the wire cap of 6 refs already
 * accommodates it: 2 hero crops + proof + 2 details = 5). */
export const PHOTOS_MIN = 3;
export const PHOTOS_MAX = 4;

/** The default assignment: pick order IS role order. Photo 1 = hero,
 * photo 2 = preuve, photo 3 = détail 1, photo 4 = détail 2. */
export function defaultRoles(count: number): readonly PhotoRole[] {
  return ROLE_ORDER.slice(0, Math.max(0, Math.min(count, ROLE_ORDER.length)));
}

/**
 * ONE TAP on photo `index`: advance it to the NEXT role in the cycle, and the
 * photo currently holding that role takes this one's old role — a SWAP, so
 * the permutation invariant holds by construction. Tapping repeatedly walks
 * the photo through every role and back.
 */
export function swapToNext(roles: readonly PhotoRole[], index: number): readonly PhotoRole[] {
  const current = roles[index];
  if (current === undefined) return roles;
  const cycle = ROLE_ORDER.slice(0, roles.length);
  const nextRole = cycle[(cycle.indexOf(current) + 1) % cycle.length]!;
  const holder = roles.indexOf(nextRole);
  const next = [...roles];
  next[index] = nextRole;
  if (holder >= 0) next[holder] = current;
  return next;
}

/** The catalog key for a role's chip label — never a sentence assembled here. */
export function roleChipKey(r: PhotoRole): string {
  switch (r) {
    case 'hero':
      return 'publier.role_hero';
    case 'preuve':
      return 'publier.role_preuve';
    case 'detail1':
      return 'publier.role_detail1';
    case 'detail2':
      return 'publier.role_detail2';
  }
}

/** Which photo (by index) plays each role at publish. `details` is ordered
 * détail 1 then détail 2. Returns `null` when the assignment is not a
 * permutation of the first N roles — unreachable through `swapToNext`, but
 * the publish path must refuse rather than upload a two-hero product. */
export function publishOrder(
  roles: readonly PhotoRole[],
): { readonly hero: number; readonly preuve: number; readonly details: readonly number[] } | null {
  const expected = ROLE_ORDER.slice(0, roles.length);
  if (roles.length < PHOTOS_MIN || roles.length > PHOTOS_MAX) return null;
  for (const r of expected) if (roles.indexOf(r) < 0) return null;
  const details = [roles.indexOf('detail1')];
  const d2 = roles.indexOf('detail2');
  if (d2 >= 0) details.push(d2);
  return { hero: roles.indexOf('hero'), preuve: roles.indexOf('preuve'), details };
}
