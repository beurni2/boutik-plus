import { makeHealthFetch } from '@boutik/observability';
import { isOpaqueMediaKey, MEDIA_KEY_PREFIX } from '../src/media-key.js';
import type { R2BucketLike } from '../src/media-store.js';

/**
 * BOUTIK-MEDIA-1 — THE MEDIA READ ROUTE, `GET /media/{token}`.
 *
 * Serves the bytes back THROUGH THE SERVICE from the PRIVATE R2 bucket
 * (`env.BUCKET.get(key)`) — the bucket is never a public custom domain, so the
 * only path to an image is this route. The body is STREAMED, never buffered.
 *
 * THE ROOT ERROR THIS ROUTE ONCE MADE (founder ruling 2026-07-24 — do not undo):
 * content-immutability was conflated with authorization-permanence. A new upload
 * mints a new key, so the bytes at a key never change — which made a year-long
 * `immutable` cache look free. But REVOCATION is not the content changing, it is
 * ACCESS BEING REVOKED. Different property; the header was set for the wrong one,
 * and a revoked image kept serving 200.
 *
 * TWO CACHE LAYERS, BOTH BOUNDED (a private-bucket read means every miss is a
 * Worker invocation PLUS an R2 GET, and every buyer viewing a vitrine pulls
 * product photos — but neither layer may outlive a takedown):
 *   1. `max-age=300` — the BROWSER layer. `immutable` is GONE: it explicitly
 *      forbids revalidation, which is exactly why a browser held bytes for a year
 *      with no recourse.
 *   2. `s-maxage=3600` + `caches.default` — the EDGE layer, which protects the
 *      origin under fan-out. Bounded too, because `cache.delete` is COLO-LOCAL: a
 *      revoke purges only the colo that served that request, so every OTHER colo
 *      would keep serving for the full TTL. The TTL — not the purge — is what
 *      bounds worst-case global takedown latency.
 * Numbers are deliberately short for a pre-buyer product: an hour still absorbs
 * the burst that matters (a shared link opened many times in a short window) and
 * caps worst-case takedown at an hour. Raise them only when cost actually bites.
 *
 * KEY VALIDATION FIRST: any key that is not exactly the opaque minted shape is an
 * honest 404 — a hand-crafted or traversal key can never address an object
 * outside the minted namespace, and the 404 is identical for "malformed" and
 * "absent" so the route is never an existence oracle.
 *
 * NO MODERATION CHECK HERE — deferred by founder ruling to the second-supplier
 * retrofit (the retrofit point is `ProductVersion.moderationState`, canon and
 * already wired; do NOT build a parallel media-moderation machine). Today, anyone
 * holding a valid token can fetch that image regardless of the product's
 * moderation state — the token's 122 bits of CSPRNG entropy is the only wall.
 *
 * REVOCATION IS REAL BUT BOUNDED-LATENCY, NOT INSTANT — write it that way, never
 * as plain "revocable". `revoke()` destroys the origin object and best-effort
 * purges the serving colo; other colos and already-served browsers keep answering
 * until their TTL expires. So a leaked ref keeps resolving for UP TO the edge TTL
 * (1 h) — bounded and stated, where it was previously unbounded (a year, with no
 * mechanism able to close it). The second-supplier retrofit of the moderation
 * gate must start from that property, not from an assumption of instant takedown.
 */

export interface MediaWorkerEnv {
  BUCKET?: R2BucketLike;
}

/**
 * THE BOUNDED TTLs (founder ruling 2026-07-24). Browser 5 min · edge 1 h. These
 * are the ceiling on how long a REVOKED image can still be served anywhere, so
 * they are a takedown-latency budget, not a performance knob.
 */
export const BROWSER_MAX_AGE_S = 300;
export const EDGE_MAX_AGE_S = 3600;
export const CACHE_CONTROL = `public, max-age=${BROWSER_MAX_AGE_S}, s-maxage=${EDGE_MAX_AGE_S}`;

/** The edge cache, read defensively — absent in plain Node, present in workerd. */
const edgeCache = (): Cache | undefined =>
  (globalThis as { caches?: { default?: Cache } }).caches?.default;

/**
 * BEST-EFFORT COLO-LOCAL PURGE, wired into `ProductMediaService` as its purge
 * hook. It makes the common case — revoke, then immediately check — instant on
 * the colo that served the image. It is NOT a global takedown: `cache.delete`
 * only touches the colo running this code, which is precisely why the TTLs above
 * are bounded rather than long.
 *
 * `origin` MUST be the same origin the read route is served on, because the cache
 * key is the request URL. A mismatched origin purges nothing and fails SILENTLY —
 * named because it is the obvious way for this to rot unnoticed.
 *
 * NOT WIRED TO A DEPLOYED ROUTE YET, and that is not a claim of coverage: this
 * Worker exposes no revoke/upload route (the supplier-app write path is out of
 * scope this slice), so in production nothing calls this today. It is constructed
 * and exercised by `ProductMediaService` in tests, and the write-path slice must
 * pass it into the service when it adds the route. The bounded TTLs — not this
 * hook — are what make revocation real in the meantime.
 */
export const makeEdgeCachePurge = (origin: string) => async (key: string): Promise<void> => {
  const cache = edgeCache();
  if (!cache) return;
  await cache.delete(new Request(`${origin}/${key}`));
};

const notFound = (): Response =>
  Response.json({ service: 'media-service', status: 'not_found', reason: 'unknown_media_key' }, { status: 404 });

export async function handleMediaRead(
  request: Request,
  key: string,
  env: MediaWorkerEnv,
  ctx?: { waitUntil(p: Promise<unknown>): void },
): Promise<Response> {
  // 1 — shape gate before any storage lookup (never an oracle, never a traversal).
  if (!isOpaqueMediaKey(key)) return notFound();

  // 2 — EDGE CACHE: the repeat-view path never reaches R2.
  const cache = edgeCache();
  const hit = await cache?.match(request);
  if (hit) return hit;

  // 3 — the private bucket. No binding (CI/local) is an honest 404, never a crash.
  const bucket = env.BUCKET;
  if (bucket === undefined || typeof bucket.get !== 'function') return notFound();
  const object = await bucket.get(key);
  if (object === null || object.body === null) return notFound();

  const res = new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // BOUNDED on both layers so neither can outlive a takedown. No `immutable`.
      'Cache-Control': CACHE_CONTROL,
    },
  });
  // 4 — populate the edge for the next reader. `clone()` because the body streams once.
  if (cache) {
    const store = cache.put(request, res.clone());
    if (ctx) ctx.waitUntil(store);
    else await store;
  }
  return res;
}

const health = makeHealthFetch('media-service');

export default {
  async fetch(request: Request, env: MediaWorkerEnv, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname.startsWith(`/${MEDIA_KEY_PREFIX}`)) {
      // strip the leading slash — the key is `media/{token}`, the path is `/media/{token}`
      return handleMediaRead(request, decodeURIComponent(pathname.slice(1)), env, ctx);
    }
    // NO upload route is exposed on this Worker: the supplier-app write path is
    // OUT OF SCOPE this slice. Uploads run through `ProductMediaService` only.
    return health(request);
  },
};
