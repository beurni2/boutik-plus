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
 * TWO CACHE LAYERS, and they do different jobs (both in scope — a private-bucket
 * read means every miss is a Worker invocation PLUS an R2 GET, and every buyer
 * viewing a vitrine pulls product photos):
 *   1. `Cache-Control: public, max-age=31536000, immutable` — the BROWSER layer.
 *      Truthful only because keys are write-once: a fresh token per upload means
 *      the object at a key never changes (see `media-key.ts`).
 *   2. `caches.default` — the EDGE layer, which is what actually protects the
 *      origin under fan-out. Without it, N buyers = N Worker invocations + N R2
 *      GETs for the same bytes; with it, the colo serves repeats and only the
 *      first miss reaches R2.
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
 * REVOCATION DOES NOT REACH THIS ROUTE (verifier finding 2026-07-24, reproduced —
 * a revoked image still answers 200 here). Deleting the R2 object leaves both
 * cache layers intact: the edge copy is served at step 2 below without ever
 * consulting the bucket, and `immutable` tells browsers never to revalidate for a
 * year. There is no purge on revoke. The deferral above was justified on the
 * strength of revocability, so this hole is load-bearing and is the founder's to
 * rule on (purge on revoke · split browser `max-age` from edge `s-maxage` · or an
 * explicit accepted-risk with a stated propagation bound).
 */

export interface MediaWorkerEnv {
  BUCKET?: R2BucketLike;
}

/** The edge cache, read defensively — absent in plain Node, present in workerd. */
const edgeCache = (): Cache | undefined =>
  (globalThis as { caches?: { default?: Cache } }).caches?.default;

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
      // truthful ONLY because keys are write-once (a new upload = a new token)
      'Cache-Control': 'public, max-age=31536000, immutable',
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
