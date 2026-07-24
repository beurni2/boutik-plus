/**
 * SUPPLIER-AUTHORING-1 part 2 — the PRODUCT CODE, derived, visible and editable
 * (founder ruling, option (a)).
 *
 * WHY DERIVING IS NOT FABRICATION HERE, and the justification is the founder's,
 * firmer than the one I had: `productCode` is an INTERNAL IDENTIFIER that seeds
 * variant SKUs — `catalog-service/src/product.ts:108` builds
 * `stableSku: `${draft.productCode}-${counter}``. It is NOT buyer-facing:
 * `stableSku` lives on `VariantSchema` and appears nowhere on the supply
 * projection or the buyer view (grep-verified). An identifier is not a claim
 * about the world, so a derived one is not the same class as a fabricated trust
 * count.
 *
 * REVISIT THIS RULING IF EITHER CHANGES: if `productCode`/`stableSku` ever becomes
 * buyer-facing, or is used to MATCH products across systems, a derived value
 * becomes a claim and deriving it silently would be fabrication.
 *
 * VISIBLE AND EDITABLE is what makes him the author rather than the system
 * claiming something on his behalf — so this returns a SUGGESTION the form shows
 * in an editable field, never a hidden value stamped on his product.
 *
 * UNIQUENESS — THE DISAMBIGUATION, and why this one (founder asked for the
 * proposal, not an assumption that names are distinctive; they are not — he sells
 * pagne). Two products deriving the same stem would collide their variant SKUs the
 * day variants exist. Three candidates:
 *   · A COUNTER — needs durable cross-product state that resets on reinstall and
 *     diverges across devices; two phones would mint `PAGNE-1` twice. Rejected.
 *   · A FORM-LEVEL UNIQUENESS CHECK — needs the network at authoring time, which
 *     breaks offline-first (law 7: authoring must work on a 3G edge). Rejected.
 *   · A SHORT RANDOM SUFFIX from the OS CSPRNG — stateless, works offline, no
 *     coordination, and collision-resistant far beyond his scale. **CHOSEN.**
 * The suffix is passed IN rather than drawn here, so this stays pure and testable
 * and reuses the app's proven entropy path (`src/offline/commandId.ts` wires
 * expo-crypto's `randomUUID` into the Web Crypto shape). No `Math.random`.
 */

/** The alphabet of the random suffix — digits + uppercase, minus the pairs that
 * misread on a cracked screen in sunlight (0/O, 1/I). He reads these aloud. */
const SUFFIX_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SUFFIX_LENGTH = 4;

/** Stem: the name's ASCII letters, accents folded (é→E), capped. « Pagne tissé » → PAGNE. */
export function productCodeStem(name: string): string {
  const letters = name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 10);
  return letters.length >= 2 ? letters : 'ARTICLE';
}

/**
 * Turn CSPRNG bytes into the suffix. Takes bytes so the caller supplies real
 * entropy (`crypto.getRandomValues`) and tests supply fixed bytes — deterministic
 * where it must be, random where it matters.
 */
export function suffixFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    out += SUFFIX_ALPHABET[(bytes[i] ?? 0) % SUFFIX_ALPHABET.length];
  }
  return out;
}

/**
 * The suggested code: `STEM-SUFFIX`. Shown in an editable field — he can replace
 * it entirely, and whatever the field holds at publish is what is sent.
 */
export function suggestProductCode(name: string, bytes: Uint8Array): string {
  return `${productCodeStem(name)}-${suffixFromBytes(bytes)}`;
}

/** Draw the suffix bytes from the OS CSPRNG (the app wires expo-crypto into this shape). */
export function randomSuffixBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH));
}
