/**
 * PREUVE-PRETE-1 (AUDIT-B+2 F-27) — EVERY CALL ENDS.
 *
 * A socket that stalls is not a throw, so a caller's try/catch cannot save it:
 * the screen stayed on « Envoi en cours… » or « On vérifie le code… » while
 * the coursier waited, its `inFlight` held, and every refresh was skipped.
 * Journal law BC-1c r2: « a screen may not enter a waiting state it has no
 * mechanism to leave ». So each call carries a ceiling sized to the reference
 * network, and on it the call THROWS — every call site already turns a throw
 * into its typed network failure, whose sentence says « réessayez ».
 *
 * THE REPLY IS READ INSIDE THE CEILING: a stall halfway through the body is
 * the same stall, so the body is buffered before the clock stops and the
 * caller reads it from memory.
 */

/** A read or a small act on one of our own Workers. */
export const LECTURE_MS = 12_000;
/** A photo (the capture's derivative, a few hundred KB). */
export const PHOTO_MS = 30_000;
/** A product clip, up to the media Worker's 12 MB. */
export const CLIP_MS = 120_000;
/** A code the Worker checks with Séra while he waits — two hops, not one. */
export const RELAIS_MS = 25_000;

/** Statuses whose Response may carry no body at all. */
const SANS_CORPS = [204, 205, 304];

export async function fetchBorne(
  url: string,
  init: RequestInit,
  ms: number,
  fetchFn: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchFn(url, { ...init, signal: ctl.signal });
    const corps = await res.arrayBuffer();
    return new Response(SANS_CORPS.includes(res.status) ? null : corps, { status: res.status, headers: res.headers });
  } finally {
    clearTimeout(timer);
  }
}
