/**
 * SERVICE-WRITE-AUTH — THE shared-secret write gate for boutik Workers. ONE
 * implementation, extracted verbatim from offer-service's gate (MEDIA-UPLOAD-ROUTE-1,
 * founder ruling: "reuse the auth module rather than writing a second one").
 *
 * WHY EXTRACTED RATHER THAN COPIED: a second copy of a security primitive is a
 * second thing to get wrong, and the two copies drift silently — one gets a fix
 * the other does not. Each service keeps a THIN adapter that binds these
 * functions to its OWN secret env var (`OFFER_WRITE_SECRET`,
 * `MEDIA_WRITE_SECRET`), so services stay independently revocable — one leaked
 * secret does not open the other service — while the comparison, the fail-closed
 * rule and the 401 exist once.
 *
 * THE PROPERTIES, unchanged from the offer gate:
 *   · FAIL CLOSED — an unset or empty secret refuses every write. A Worker
 *     deployed before its secret is set is shut, not open.
 *   · CONSTANT TIME — the compare leaks neither length nor content through timing.
 *   · ONE IDENTICAL 401 — the same body for a bad key, a missing key and an unset
 *     secret, computed BEFORE any storage touch or existence lookup, so the 401
 *     can never become an existence oracle.
 *   · READS ARE NEVER GATED — GET/HEAD/OPTIONS carry no credential. The supply
 *     wire's consumer holds no key and must never need one.
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
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
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
 * The shared key check, FAIL CLOSED. True iff a non-empty secret is configured AND
 * the request's `X-Write-Key` matches it (constant-time). The compare runs
 * unconditionally (even with no secret configured) so timing does not reveal
 * whether a secret exists; the length guard keeps it fail-closed — an unset/empty
 * secret can never match a non-empty presented key.
 */
export async function keyAuthorizedAgainst(request: Request, secret: string | undefined): Promise<boolean> {
  const configured = secret ?? '';
  const provided = request.headers.get(WRITE_KEY_HEADER) ?? '';
  const match = await timingSafeEqual(provided, configured);
  return configured.length > 0 && match;
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
): Promise<Response | null> {
  if (!isWrite(request.method)) return null;
  return (await keyAuthorizedAgainst(request, secret)) ? null : unauthorized();
}
