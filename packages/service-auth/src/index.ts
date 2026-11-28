/**
 * SERVICE-WRITE-AUTH — THE shared-secret write gate for boutik Workers. ONE
 * implementation, extracted verbatim from offer-service's gate (MEDIA-UPLOAD-ROUTE-1,
 * founder ruling: "reuse the auth module rather than writing a second one").
 *
 * WHY EXTRACTED RATHER THAN COPIED: a second copy of a security primitive is a
 * second thing to get wrong, and the two copies drift silently — one gets a fix
 * the other does not. Each service keeps a THIN adapter that binds these
 * functions to its OWN secret env var (`MEDIA_WRITE_SECRET`,
 * `MEDIA_REVOKE_SECRET`; offer-service's `OFFER_WRITE_SECRET` was retired by
 * CLE-FONDATEUR-1), so services stay independently revocable — one leaked
 * secret does not open the other service — while the comparison, the fail-closed
 * rule and the 401 exist once.
 *
 * THE PROPERTIES, unchanged from the offer gate:
 *   · FAIL CLOSED — an unset or empty secret refuses every write. A Worker
 *     deployed before its secret is set is shut, not open.
 *   · NO GAP WHEN A KEY CHANGES — each gate also accepts the secret's `_NEXT`
 *     while it is set, on the same doors and nothing more (`matchesKeyOrNext`).
 *   · CONSTANT TIME — the compare leaks neither length nor content through timing.
 *   · ONE IDENTICAL 401 — the same body for a bad key, a missing key and an unset
 *     secret, computed BEFORE any storage touch or existence lookup, so the 401
 *     can never become an existence oracle.
 *
 * ═══ CORRECTION (SUPPLY-READ-AUTH, founder ruling 2026-07-24) ═══
 * This header used to end with: "READS ARE NEVER GATED — GET/HEAD/OPTIONS carry
 * no credential. The supply wire's consumer holds no key and must never need
 * one." **That is now false and is corrected rather than left to mislead.** The
 * *write* gate below still ignores safe methods — unchanged — but the supply READ
 * is now gated separately by `rejectUnauthorizedBearer`, because the projection
 * carries `basePrice` and `resellerCommission` and product version ids are
 * guessable: an open route hands a supplier's cost structure to anyone who
 * guesses one.
 *
 * TWO GATES, TWO CREDENTIALS, DELIBERATELY NOT ONE:
 *   · the WRITE key (`X-Write-Key`) ships INSIDE AN APP BUNDLE — readable by
 *     anyone who downloads it. It stops scanners, not attackers, and is not a
 *     real credential.
 *   · the READ secret (`Authorization: Bearer`) NEVER LEAVES TWO WORKERS, so it
 *     is one. They must never be conflated or reused.
 *
 * WHAT IT IS NOT: per-author identity. The secret is shared, so it stops scanners
 * and casual abuse but does not identify who wrote. Real per-supplier identity is
 * a HARD GATE before any supplier other than the founder authors.
 */

/** Methods that only ever read. Everything else is a write and needs the key. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The header the write caller presents the shared write key in. */
export const WRITE_KEY_HEADER = 'X-Write-Key';

/** A write is any request whose method is not a safe read method. */
export function isWrite(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Constant-time equality that leaks neither length nor content through timing:
 * both inputs are HMAC-SHA-256'd under a fresh per-call random key, then the two
 * fixed 32-byte digests are compared with a branch-free XOR fold. WebCrypto is
 * present in both workerd (prod / Miniflare) and Node 20+.
 *
 * Exported for MEDIA-PORTE-1 (F-41): the media vignette door compares a
 * one-time token with this same primitive rather than a second one.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [da, db] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= (va[i] as number) ^ (vb[i] as number);
  return diff === 0;
}

/**
 * A KEY CHANGES WITH NO GAP (Execution Contract §11, « overlapping windows »).
 * Every gate checks its key `X` and, while it is set, `X_NEXT` — the change is:
 * set X_NEXT beside X · move the sender · put the new value in X · delete
 * X_NEXT. True iff (X non-empty AND equal) OR (X_NEXT non-empty AND equal).
 *
 * BOTH compares run on every call, one after the other, whatever the first
 * found — so timing says neither which value matched nor whether a next value
 * is set. Each length guard keeps an unset or empty value from ever matching
 * (an empty presented key equals an empty secret). Nothing here says, logs or
 * answers which of the two matched.
 */
async function matchesKeyOrNext(provided: string, secret: string | undefined, next: string | undefined): Promise<boolean> {
  const configured = secret ?? '';
  const suivante = next ?? '';
  const matchCurrent = await timingSafeEqual(provided, configured);
  const matchNext = await timingSafeEqual(provided, suivante);
  return (configured.length > 0 && matchCurrent) || (suivante.length > 0 && matchNext);
}

/**
 * The shared key check, FAIL CLOSED. True iff the request's `X-Write-Key` matches
 * a non-empty configured secret or a non-empty next value (constant-time, both
 * compared every time — see `matchesKeyOrNext`). A Worker with neither set is
 * shut. `next` is required so that no caller can forget to name its `_NEXT`.
 */
export async function keyAuthorizedAgainst(
  request: Request,
  secret: string | undefined,
  next: string | undefined,
): Promise<boolean> {
  return matchesKeyOrNext(request.headers.get(WRITE_KEY_HEADER) ?? '', secret, next);
}

/** The one 401 — IDENTICAL for every rejection, so it can never leak. */
export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * WRITE gate. Resolves to `null` iff authorised; else a 401, computed BEFORE any
 * target lookup so it can never be an existence oracle. A Worker with no secret
 * set refuses every write. Reads (safe methods) short-circuit to `null`.
 */
export async function rejectUnauthorizedWriteAgainst(
  request: Request,
  secret: string | undefined,
  next: string | undefined,
): Promise<Response | null> {
  if (!isWrite(request.method)) return null;
  return (await keyAuthorizedAgainst(request, secret, next)) ? null : unauthorized();
}

// ─── SERVICE-TO-SERVICE READ AUTH (SUPPLY-READ-AUTH) ─────────────────────────

/**
 * The scheme the calling Worker presents its read secret under. Read from the
 * CALLER's own source rather than agreed in prose — shop-plus
 * `services/storefront-service/src/supply-source.ts` builds exactly
 * `{ Authorization: \`Bearer ${this.readSecret}\` }`. Both halves of a wire in
 * this project have been built to different specs once already; this constant is
 * asserted in a test so a rename on either side fails loudly instead of 401'ing
 * every product into silence.
 */
export const BEARER_HEADER = 'Authorization';
export const BEARER_PREFIX = 'Bearer ';

/**
 * Extract the presented bearer token, or `''` when the header is absent or not
 * Bearer-shaped. Returning `''` rather than `null` keeps the caller's compare
 * UNCONDITIONAL — a missing header takes the same path, and the same time, as a
 * wrong one.
 *
 * The scheme match is case-insensitive per RFC 7235 (`Bearer`/`bearer` are the
 * same credential); the TOKEN itself is compared byte-exactly.
 */
export function bearerTokenFrom(request: Request): string {
  const raw = request.headers.get(BEARER_HEADER) ?? '';
  const prefix = raw.slice(0, BEARER_PREFIX.length);
  if (prefix.toLowerCase() !== BEARER_PREFIX.toLowerCase()) return '';
  return raw.slice(BEARER_PREFIX.length);
}

/**
 * Fail-closed bearer check. True iff the request's bearer token matches a
 * non-empty configured secret or a non-empty next value (constant-time, via the
 * SAME `matchesKeyOrNext` the write gate uses — one rule, not two).
 *
 * Both compares run unconditionally, even with nothing configured, so timing
 * never reveals whether a secret or a next value exists; the length guards keep
 * it fail-closed.
 */
export async function bearerAuthorizedAgainst(
  request: Request,
  secret: string | undefined,
  next: string | undefined,
): Promise<boolean> {
  return matchesKeyOrNext(bearerTokenFrom(request), secret, next);
}

/**
 * READ gate for a service-to-service route. Resolves to `null` iff authorised,
 * else the ONE identical 401 — which the caller MUST return before any store
 * lookup, so it can never become an existence oracle for product version ids.
 *
 * Unlike the write gate this does NOT exempt safe methods: the whole point is
 * that a GET is what needs gating here.
 */
export async function rejectUnauthorizedBearer(
  request: Request,
  secret: string | undefined,
  next: string | undefined,
): Promise<Response | null> {
  return (await bearerAuthorizedAgainst(request, secret, next)) ? null : unauthorized();
}
