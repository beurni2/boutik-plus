import { makeHealthFetch } from '@boutik/observability';
import { isOpaqueMediaKey, MEDIA_KEY_PREFIX } from '../src/media-key.js';
import { resolveMediaStore, type R2BucketLike } from '../src/media-store.js';
import { ProductMediaService } from '../src/media.js';
import { rejectUnauthorizedWrite, type MediaWriteAuthEnv } from './auth.js';

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
 * named because it is the obvious way for this to rot unnoticed. The revoke
 * route below derives the origin from `request.url`, which IS the serving
 * origin — the one place that cannot drift from it.
 *
 * WIRED SINCE MEDIA-REVOKE-1 (2026-07-27): `handleMediaRevoke` constructs the
 * service WITH this hook, exactly as the previous version of this comment said
 * the write-path slice must. (History: this comment once said "NOT WIRED TO A
 * DEPLOYED ROUTE YET" — true when written, before the upload route existed.)
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

/** The upload route's path. A bare collection path — it can never carry a key. */
export const UPLOAD_PATH = '/media';

/**
 * MEDIA-UPLOAD-ROUTE-1 — `POST /media`, the ONLY way a byte enters the bucket.
 *
 * Before this route the service could read from a bucket nothing could write to;
 * the upload/validate/store path existed in `src/` but was never wired to the
 * Worker's fetch handler.
 *
 * THE BODY IS THE IMAGE. Raw bytes, nothing else — no multipart, no JSON wrapper,
 * no filename field. The request's declared `Content-Type` is IGNORED: the
 * magic-byte sniff in `ProductMediaService.upload` decides the real format, and
 * the stored content type is DERIVED from the bytes, never from what the caller
 * claimed.
 *
 * NO CALLER INPUT REACHES THE KEY (founder ruling). This handler passes the
 * service exactly two things — the bytes and the clock — and `mintMediaKey()` is
 * arity-zero by design, so there is no parameter through which a filename, a
 * caller-supplied key, a productVersionId or a counter could shape the object
 * name. A name in the request would be metadata; this route does not read one at
 * all, which is the strongest form of that guarantee.
 *
 * THE RESPONSE IS THE REF AND ITS FACTS — the opaque `media/{token}` that goes
 * into an offer's `ProductAssets`, plus the dimensions and content type the
 * validator actually measured. Nothing about the bucket: no bucket name, no
 * storage URL, no account detail. The readable URL is the ref appended to this
 * service's own origin.
 *
 * CORS EXISTS NOW, AND THE OLD COMMENT'S PREMISE IS WHY (BOUTIK-WEB-W4). This
 * route once said, verbatim: *"NO CORS, deliberately: this is called by the
 * supplier app, not a browser."* The founder's web ruling (Boutik-Plus-Web
 * North Star, 2026-07-26) overturned exactly that premise — the supplier app
 * IS a browser now, and a browser preflights a POST carrying `X-Write-Key`.
 * The decision updates WITH its premise, on the record: same treatment as
 * offer-service's entry, same `*`-is-safe argument (no cookie or ambient
 * credential exists on this worker; the explicit key header gates every
 * write), same tripwire — the moment a cookie or session enters this worker,
 * `*` stops being safe and this comment is the review flag.
 */
export async function handleMediaUpload(request: Request, env: MediaWorkerEnv, now = new Date().toISOString()): Promise<Response> {
  const store = resolveMediaStore(env);
  const service = new ProductMediaService(store);
  const bytes = new Uint8Array(await request.arrayBuffer());
  const outcome = await service.upload(bytes, now);
  if (!outcome.ok) {
    // The validator's TYPED reason, surfaced verbatim — the caller can read WHY
    // (empty · unsupported_type · too_large · bad_dimensions), never a bare 400.
    return Response.json({ error: 'rejected', reason: outcome.reason }, { status: 400 });
  }
  const { key, contentType, width, height, byteLength } = outcome.image;
  return Response.json({ ref: key, contentType, width, height, byteLength }, { status: 201 });
}

/** The revoke route's path. Not a key read: `revoke` can never match the opaque
 * key shape, and the method differs anyway. */
export const REVOKE_PATH = '/media/revoke';

/**
 * MEDIA-REVOKE-1 — `POST /media/revoke`, the founder's byte cleanup after a
 * product delete (*"continue the cleaning of the bytes after the delete"*,
 * 2026-07-27). Body `{ ref }`; behind the SAME write gate as the upload.
 *
 * WHAT IT PROMISES — BOUNDED-LATENCY REVOCATION, NEVER INSTANT TAKEDOWN (the
 * standing 2026-07-24 wording): the origin object dies now, the serving colo is
 * best-effort purged, and every other cache holds for AT MOST its TTL (browser
 * 5 min · edge 1 h).
 *
 * IDEMPOTENT BY NATURE: deleting an absent object is a no-op at every store, so
 * a replay answers the same 200 `revoked` — "the origin object is gone now" is
 * true both times, and the route deliberately does not distinguish (R2's delete
 * reports nothing, and inventing an `existed` here would be a claim the store
 * cannot back).
 *
 * SHAPE GATE FIRST, same law as the read route: a ref that is not exactly the
 * opaque minted shape is a 400 before any storage touch — no traversal, no
 * probe outside the minted namespace. The 400 names the param; it is not an
 * existence oracle because existence never enters the answer at all.
 */
export async function handleMediaRevoke(request: Request, env: MediaWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { ref?: unknown } | null;
  const ref = body?.ref;
  if (typeof ref !== 'string' || !isOpaqueMediaKey(ref)) {
    return Response.json({ error: 'malformed', param: 'ref' }, { status: 400 });
  }
  // The service's own serving origin — the cache key the read route populated.
  const origin = new URL(request.url).origin;
  const service = new ProductMediaService(resolveMediaStore(env), makeEdgeCachePurge(origin));
  await service.revoke(ref);
  return Response.json({ status: 'revoked', ref });
}

/**
 * The preflight answers before the write gate ON PURPOSE (mirrors offer-service):
 * browsers strip custom headers from OPTIONS, so it can never carry the key;
 * it grants nothing by itself, and must succeed for the authed POST behind it
 * to even be attempted. The edge cache stores UNSTAMPED responses (the `put`
 * happens inside `handleMediaRead`); every exit — hit or miss — passes through
 * `withCors`, so the stamp is uniform without poisoning the cache with it.
 */
const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Write-Key',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request: Request, env: MediaWorkerEnv & MediaWriteAuthEnv, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    return withCors(await handle(request, env, ctx));
  },
};

async function handle(request: Request, env: MediaWorkerEnv & MediaWriteAuthEnv, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    // THE WRITE GATE, at the one deployed entry, BEFORE any dispatch or storage
    // touch — so a rejected upload never reaches R2 and the 401 is never an
    // existence oracle. Reads (GET) short-circuit through untouched: the media
    // read route is open by design.
    const denied = await rejectUnauthorizedWrite(request, env);
    if (denied) return denied;

    const { pathname } = new URL(request.url);
    if (request.method === 'POST' && pathname === UPLOAD_PATH) {
      return handleMediaUpload(request, env);
    }
    if (request.method === 'POST' && pathname === REVOKE_PATH) {
      return handleMediaRevoke(request, env);
    }
    if (request.method === 'GET' && pathname.startsWith(`/${MEDIA_KEY_PREFIX}`)) {
      // strip the leading slash — the key is `media/{token}`, the path is `/media/{token}`
      return handleMediaRead(request, decodeURIComponent(pathname.slice(1)), env, ctx);
    }
    return health(request);
}
