/**
 * BOUTIK-MEDIA-1 — THE OPAQUE OBJECT KEY (founder ruling, 2026-07-24).
 *
 * `media/{token}`, token = `crypto.randomUUID()`. The product link lives
 * SERVER-SIDE in the durable offer record (the offer entry's `ProductAssets`),
 * never in the URL.
 *
 * WHY OPAQUE, AND WHY THIS IS LOAD-BEARING. Three properties must hold at once,
 * and they sit on INDEPENDENT axes — the wrong instinct, and the one shop-plus
 * fell into, is deriving unguessability from an identity namespace:
 *   · SERVABLE      — the key is the storage handle; `GET /media/{key}` resolves it.
 *   · UNGUESSABLE   — entropy comes from the random token, from a CSPRNG. Nothing
 *                     public contributes: `productVersionId` is ON THE WIRE, so it
 *                     must contribute ZERO entropy, and it does — it is absent.
 *   · IDENTITY-FREE — no supplierId, no productVersionId, no name, no sequence.
 *                     shop-plus keys media under the shop's own id; the naive
 *                     analogue here would embed `supplierId` and would then be
 *                     rejected by offer-service's own `assertAssetRefsIdentityFree`
 *                     out-guard — every ref this service produced would be refused.
 *
 * THE TOKEN IS THE ONLY WALL. Product images carry NO separate moderation state
 * (founder ruling: single supplier, images inherit `ProductVersion.moderationState`),
 * and the read route carries no live-check (deferred to the second-supplier
 * retrofit). Nothing else stands between an uploaded image and anyone enumerating
 * URLs. A sequential or derived key here would be a live enumeration hole — that
 * is exactly the bug shop-plus shipped and caught (`media-${seq}`, enumerable by
 * counting).
 *
 * NEVER OVERWRITE. Every upload mints a FRESH token, so an object at a key never
 * changes. That is what makes the immutable cache header on the read route
 * truthful, and it is what makes revocation meaningful: replace = mint new +
 * delete old (see `MediaStore.remove`).
 */

/** The one key namespace. No sub-namespace: a namespace would have to describe something, and everything describable here is identity. */
export const MEDIA_KEY_PREFIX = 'media/';

/** UUID v4 as minted by `crypto.randomUUID()` — 122 bits of CSPRNG entropy. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPAQUE_KEY = new RegExp(`^${MEDIA_KEY_PREFIX}${UUID_V4.source.slice(1, -1)}$`);

export class MediaKeyError extends Error {
  override readonly name = 'MediaKeyError';
}

/**
 * Mint a fresh opaque key. Takes NO arguments BY DESIGN — there is no parameter
 * through which a caller could smuggle a productVersionId, a supplierId, or a
 * counter into the key. `crypto.randomUUID` is the platform CSPRNG in both
 * workerd and Node; `Math.random` is banned repo-wide by the mint-path gate.
 */
export function mintMediaKey(): string {
  return `${MEDIA_KEY_PREFIX}${crypto.randomUUID()}`;
}

/**
 * The boundary tooth: a key is servable ONLY if it is exactly the opaque shape.
 * Refuses anything else — a path-traversal attempt, a sub-namespace, and above
 * all any key carrying identity material. Applied on the READ route so a
 * hand-crafted key can never address an object outside the minted namespace, and
 * lockable in a test independent of the minting path.
 */
export function assertOpaqueMediaKey(key: string): string {
  if (!OPAQUE_KEY.test(key)) {
    throw new MediaKeyError(`not an opaque media key: ${key}`);
  }
  return key;
}

/** Non-throwing form, for the read route's honest 404. */
export function isOpaqueMediaKey(key: string): boolean {
  return OPAQUE_KEY.test(key);
}
