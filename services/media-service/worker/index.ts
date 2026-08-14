import { makeHealthFetch } from '@boutik/observability';
import { isOpaqueMediaKey, MEDIA_KEY_PREFIX } from '../src/media-key.js';
import { resolveMediaStore, type R2BucketLike, type R2RangeLike } from '../src/media-store.js';
import { ProductMediaService, THUMB_WRITE_WINDOW_MS, thumbKeyFor } from '../src/media.js';
import { rejectUnauthorizedRevoke, rejectUnauthorizedWrite, type MediaWriteAuthEnv } from './auth.js';

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

/**
 * THUMB-PRODUIT-1 — THE SHORT TTL, AND THE NARROW CASE IT IS FOR.
 *
 * A `?v=thumb` read that arrives BEFORE the vignette is stored is answered with
 * the photograph — correct — but caching that answer for an hour would pin the
 * full photograph under the vignette's URL long after the small object existed.
 * The app uploads the photograph and then its vignette, so that window is real.
 *
 * ⚠ IT APPLIES ONLY WHILE A VIGNETTE COULD STILL ARRIVE — i.e. while the parent
 * is inside `THUMB_WRITE_WINDOW_MS`. A verifier caught the first version of this
 * shortening the TTL for EVERY fallback, which would have made the founder's
 * board FIVE TIMES more expensive than before the slice: every photograph he
 * already owns falls back, and each would have been re-fetched every 60 s
 * instead of every 300 s. An old photograph can never gain a vignette (the
 * window is shut), so it gets the full TTL and behaves exactly as it did.
 *
 * Together with `handleThumbUpload`'s colo-local purge, the poisoning window is
 * bounded at five minutes on every other colo and closed immediately on the one
 * that will serve the row.
 */
export const FALLBACK_BROWSER_MAX_AGE_S = 60;
export const FALLBACK_EDGE_MAX_AGE_S = 300;
export const FALLBACK_CACHE_CONTROL = `public, max-age=${FALLBACK_BROWSER_MAX_AGE_S}, s-maxage=${FALLBACK_EDGE_MAX_AGE_S}`;

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

/**
 * Could this photograph still gain a vignette? True only inside
 * `THUMB_WRITE_WINDOW_MS` of its own upload — the same fact `putThumb` gates
 * the write on, so the cache policy and the write policy can never disagree.
 * Any doubt (no metadata, no store) answers FALSE, which is the safe direction:
 * the full TTL, never a shortened one.
 */
async function stillOpen(env: MediaWorkerEnv, key: string): Promise<boolean> {
  try {
    const parent = await resolveMediaStore(env).stat(key);
    if (parent === null) return false;
    return Date.now() - parent.uploadedAt.getTime() <= THUMB_WRITE_WINDOW_MS;
  } catch {
    return false;
  }
}

const notFound = (): Response =>
  Response.json({ service: 'media-service', status: 'not_found', reason: 'unknown_media_key' }, { status: 404 });

/**
 * ═══ PORTÉE-MEDIA — THE iPHONE'S PLAYER ASKS IN RANGES ═══
 *
 * The Séra rider plays the buyer's « repère » voice note from THIS route, and
 * iOS AVPlayer probes any media URL with `Range: bytes=0-1`, REFUSING the whole
 * resource when the answer is 200-full-body with no `Accept-Ranges` — exactly
 * what this route did. The founder heard silence on his iPhone. Same bug, same
 * fix as shop-plus's media read Worker (PORTÉE-MEDIA, 2026-08-13, proven on a
 * real device): parse a SINGLE range to R2's own range shape and let R2 serve
 * the slice NATIVELY — never read the whole body and cut it in the Worker.
 *
 * Semantics MATCH the reference, not innovate: single ranges only (`bytes=a-b`,
 * `bytes=a-`, `bytes=-n`); a multi-range or unparseable header returns null and
 * the caller serves the full 200, which RFC 7233 permits (« MAY ignore the
 * Range header field »). Only `bytes=` with neither bound is genuinely
 * malformed, and it too just falls back to the full body.
 */
function parseRange(header: string | null): R2RangeLike | null {
  if (header === null) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (m === null) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  if (a === '') return { suffix: Number(b) };
  if (b === '') return { offset: Number(a) };
  const offset = Number(a);
  const end = Number(b);
  if (end < offset) return null;
  return { offset, length: end - offset + 1 };
}

/** PORTÉE-MEDIA — the headers every ranged answer shares with the full road. */
const rangedBaseHeaders = (contentType: string | undefined, cacheControl: string): Record<string, string> => ({
  'Content-Type': contentType ?? 'application/octet-stream',
  'Cache-Control': cacheControl,
  'Accept-Ranges': 'bytes',
});

/**
 * PORTÉE-MEDIA — serve ONE object's slice: 206 for a satisfiable range, 416
 * with `bytes *​/total` for an unsatisfiable one, `null` when NO object lives at
 * this key at all (the caller decides — 404 for the photograph, fall-through to
 * the parent for an absent vignette). Same roads as the shop-plus reference.
 */
async function serveRangedObject(
  bucket: R2BucketLike,
  key: string,
  range: R2RangeLike,
  cacheControl: string,
): Promise<Response | null> {
  let object: Awaited<ReturnType<R2BucketLike['get']>> = null;
  let unsatisfiable = false;
  try {
    object = await bucket.get(key, { range });
  } catch {
    // R2 throws on an out-of-bounds range rather than answering — the 416
    // still owes the caller the TOTAL, so the plain object is read for it.
    unsatisfiable = true;
  }
  if (unsatisfiable || object === null) {
    const whole = await bucket.get(key);
    if (whole === null) return null; // no object here at all — the caller's road
    // (A ranged get answering null while the object exists lands here too —
    // treated as unsatisfiable rather than inventing a slice.)
    const total = whole.size;
    return new Response(null, {
      status: 416,
      headers: { ...rangedBaseHeaders(whole.httpMetadata?.contentType, cacheControl), 'Content-Range': `bytes */${total ?? 0}` },
    });
  }
  const total = object.size ?? 0;
  // R2 reports the range it actually served; recompute from the ask only
  // when the binding (or an older shim) omits it — and CLAMP that fallback
  // to the object: a shim echoing an unclamped `bytes=0-999999` ask must not
  // mint a Content-Range wider than the body. Real workerd always reports the
  // clamped range, so this arm is armor for a nonconforming double, never the
  // live road. (Verbatim the reference's armor.)
  const served = object.range ?? range;
  const start = served.offset ?? (served.suffix !== undefined ? Math.max(0, total - served.suffix) : 0);
  const rawLength = served.length ?? (served.suffix !== undefined ? Math.min(served.suffix, total) : total - start);
  const length = total > 0 ? Math.min(rawLength, total - start) : rawLength;
  const end = start + length - 1;
  if (total > 0 && start >= total) {
    return new Response(null, {
      status: 416,
      headers: { ...rangedBaseHeaders(object.httpMetadata?.contentType, cacheControl), 'Content-Range': `bytes */${total}` },
    });
  }
  return new Response(object.body, {
    status: 206,
    headers: {
      ...rangedBaseHeaders(object.httpMetadata?.contentType, cacheControl),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(length),
    },
  });
}

export async function handleMediaRead(
  request: Request,
  key: string,
  env: MediaWorkerEnv,
  ctx?: { waitUntil(p: Promise<unknown>): void },
): Promise<Response> {
  // 1 — shape gate before any storage lookup (never an oracle, never a traversal).
  if (!isOpaqueMediaKey(key)) return notFound();

  // PORTÉE-MEDIA — the ranged ask, parsed BEFORE the edge cache. Unparseable or
  // multi-range ⇒ null ⇒ the full road (RFC 7233 lets a server ignore Range).
  const range = parseRange(request.headers.get('Range'));

  // 2 — EDGE CACHE: the repeat-view path never reaches R2. RANGED ASKS BYPASS
  // BOTH SIDES of it (the reference route has no edge layer, so this is the one
  // adaptation the port needs): the cache key is the bare URL, so a stored 206
  // would answer the NEXT full read with a partial body, and a stored full 200
  // answering a ranged ask 200-full is exactly the AVPlayer refusal returning
  // on the repeat view. R2's native ranged read only pulls the slice, so the
  // bypass costs the slice's egress, never the photograph's.
  const cache = edgeCache();
  if (range === null) {
    const hit = await cache?.match(request);
    if (hit) return hit;
  }

  // 3 — the private bucket. No binding (CI/local) is an honest 404, never a crash.
  const bucket = env.BUCKET;
  if (bucket === undefined || typeof bucket.get !== 'function') return notFound();

  // THUMB-PRODUIT-1 — `?v=thumb` asks for the 320 px vignette of this same
  // photograph. THE MISS IS A FALLBACK, NEVER A 404: every photograph uploaded
  // before this slice has an empty vignette slot and nothing server-side can
  // fill it, so those rows must keep rendering — heavier, but rendering. A 404
  // here would blank the founder's board for exactly the products he already has.
  //
  // The edge entry above is per-URL, so the vignette and the full photograph
  // cache separately by construction — no vary header, no key juggling.
  const wantsThumb = new URL(request.url).searchParams.get('v') === 'thumb';

  // PORTÉE-MEDIA — THE RANGE ROAD. Same object precedence as the full road
  // below (the vignette when it exists, else the photograph — the fallback,
  // never a 404), same Cache-Control decision, and R2 serves the slice
  // NATIVELY. `null` from a key means nothing lives there: for the vignette
  // that is the fall-through to the parent; for the parent it is the honest 404.
  if (range !== null) {
    if (wantsThumb) {
      const fromThumb = await serveRangedObject(bucket, thumbKeyFor(key), range, CACHE_CONTROL);
      if (fromThumb !== null) return fromThumb;
    }
    // Serving the parent under `?v=thumb` is the same fallback as below, so it
    // earns the same short TTL while a vignette could still arrive.
    const cacheControl = wantsThumb && (await stillOpen(env, key)) ? FALLBACK_CACHE_CONTROL : CACHE_CONTROL;
    return (await serveRangedObject(bucket, key, range, cacheControl)) ?? notFound();
  }

  const thumb = wantsThumb ? await bucket.get(thumbKeyFor(key)) : null;
  const served = thumb !== null && thumb.body !== null ? thumb : null;
  const object = served ?? (await bucket.get(key));
  if (object === null || object.body === null) return notFound();
  /**
   * Asked for the vignette, answered with the photograph, AND a vignette could
   * still arrive — the only case that earns the short TTL. An OLD photograph
   * can never gain one (`THUMB_WRITE_WINDOW_MS` has shut), so it keeps the full
   * TTL and costs exactly what it cost before this slice.
   */
  const fellBack = wantsThumb && served === null && (await stillOpen(env, key));

  const res = new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // BOUNDED on both layers so neither can outlive a takedown. No `immutable`.
      'Cache-Control': fellBack ? FALLBACK_CACHE_CONTROL : CACHE_CONTROL,
      // PORTÉE-MEDIA — the full answer SAYS ranges are welcome, which is what
      // lets a player ask for them at all (iOS refuses the media otherwise).
      'Accept-Ranges': 'bytes',
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

/** VIDEO-PRODUIT-1b — the video upload path. Like `/media/revoke`, `video`
 *  can never collide with an opaque key read (keys are `media/{token}` with a
 *  CSPRNG token shape), and the method differs anyway. */
export const VIDEO_UPLOAD_PATH = '/media/video';

/**
 * `POST /media/video` — the ONLY way a MOVING image enters the bucket. Same
 * laws as `POST /media`, restated because each carries weight here too: the
 * body IS the video (raw bytes, no multipart, no filename); the declared
 * Content-Type is IGNORED (the `ftyp` sniff decides, the stored type derives
 * from the bytes); NO caller input reaches the key; and behind the SAME write
 * gate as the image upload — a video is exactly as sensitive as a photo, no
 * more (the revoke split's founder-only secret is about DELETION, not entry).
 * The response adds ONE fact images do not have: `durationSeconds`, MEASURED
 * from the container — the caller derives canon's integer `durationSec` from
 * it, never from its own clock.
 */
export async function handleVideoUpload(request: Request, env: MediaWorkerEnv, now = new Date().toISOString()): Promise<Response> {
  const store = resolveMediaStore(env);
  const service = new ProductMediaService(store);
  const bytes = new Uint8Array(await request.arrayBuffer());
  const outcome = await service.uploadVideo(bytes, now);
  if (!outcome.ok) {
    // The validator's TYPED reason, verbatim — empty · too_large ·
    // unsupported_type · unreadable_duration · too_long — never a bare 400.
    return Response.json({ error: 'rejected', reason: outcome.reason }, { status: 400 });
  }
  const { key, contentType, durationSeconds, byteLength } = outcome.video;
  return Response.json({ ref: key, contentType, durationSeconds, byteLength }, { status: 201 });
}

/** REPERE-AUDIO-REEL — the voice-note upload path. Like `video` and `revoke`,
 *  `audio` can never collide with an opaque key read. */
export const AUDIO_UPLOAD_PATH = '/media/audio';

/**
 * `POST /media/audio` — the ONLY way a VOICE enters the bucket. Same laws as
 * the photo and video doors: the body IS the note (raw bytes, no multipart);
 * the declared Content-Type is IGNORED (the magic sniff decides — WebM, Ogg
 * or the MP4 family, what phones' recorders actually emit); NO caller input
 * reaches the key; behind the SAME write gate. The expected caller is Shop+'s
 * order Worker forwarding a buyer's repère note server-side — the write key
 * never rides in the buyer's public bundle.
 */
export async function handleAudioUpload(request: Request, env: MediaWorkerEnv, now = new Date().toISOString()): Promise<Response> {
  const store = resolveMediaStore(env);
  const service = new ProductMediaService(store);
  const bytes = new Uint8Array(await request.arrayBuffer());
  const outcome = await service.uploadAudio(bytes, now);
  if (!outcome.ok) {
    // The validator's TYPED reason, verbatim — empty · too_large ·
    // unsupported_type · too_long — never a bare 400.
    return Response.json({ error: 'rejected', reason: outcome.reason }, { status: 400 });
  }
  const { key, contentType, durationSeconds, byteLength } = outcome.audio;
  return Response.json({ ref: key, contentType, durationSeconds, byteLength }, { status: 201 });
}

/** THUMB-PRODUIT-1 — the vignette door. `thumb` can never match the opaque key
 *  shape (`media/{uuid}`), and the method differs anyway. */
export const THUMB_UPLOAD_PATH = '/media/thumb';

/**
 * `POST /media/thumb?for=media/{token}` — the 320 px vignette of an existing
 * photograph. Same laws as every other door: the body IS the image (raw bytes,
 * no multipart, no filename), the declared Content-Type is IGNORED (the magic
 * sniff decides), and it sits behind the same write gate as the photo upload.
 *
 * ONE THING IS DIFFERENT, AND IT IS THE POINT: this is the only route in the
 * service that writes at a key it did not mint. What makes that safe is stated
 * at `putThumb` — the parent must be the opaque shape, the parent must EXIST,
 * and the slot must be EMPTY (write-once), so the door can neither address
 * anything outside the minted namespace nor overwrite a vignette that is
 * already there.
 *
 * `already_set` IS A 409, NOT AN ERROR THE APP SHOULD SHOUT ABOUT: a retried
 * publish re-uploading a vignette that already landed is the normal case, and
 * the outcome it wanted is already true.
 */
export async function handleThumbUpload(request: Request, env: MediaWorkerEnv, now = new Date().toISOString()): Promise<Response> {
  const parent = new URL(request.url).searchParams.get('for') ?? '';
  if (!isOpaqueMediaKey(parent)) {
    // Shape gate BEFORE any storage touch, same law as the read and revoke
    // routes — and it is not an existence oracle, because existence never
    // enters this answer at all.
    return Response.json({ error: 'malformed', param: 'for' }, { status: 400 });
  }
  const service = new ProductMediaService(resolveMediaStore(env));
  const bytes = new Uint8Array(await request.arrayBuffer());
  // THE ROUTE MAKES ITS OWN DOC TRUE (verifier MINOR): `putThumb` derives the
  // key and THROWS a MediaKeyError on a non-opaque parent. That is unreachable
  // behind the guard above — but a claim that a throw is "caught by the route"
  // must be backed by a catch, not by an argument about reachability.
  let outcome: Awaited<ReturnType<typeof service.putThumb>>;
  try {
    outcome = await service.putThumb(parent, bytes, now);
  } catch {
    return Response.json({ error: 'malformed', param: 'for' }, { status: 400 });
  }
  if (!outcome.ok) {
    const status =
      outcome.reason === 'already_set' || outcome.reason === 'window_closed'
        ? 409
        : outcome.reason === 'no_parent'
          ? 404
          : 400;
    // The validator's TYPED reason, verbatim — empty · too_large ·
    // unsupported_type · bad_dimensions · no_parent · window_closed · already_set.
    return Response.json({ error: 'rejected', reason: outcome.reason }, { status });
  }
  // THE FALLBACK'S CACHE ENTRY DIES HERE. A read that arrived between the
  // photograph's upload and this call was answered with the photograph and
  // cached under the vignette's URL; without this, the row it was meant to
  // make cheap would keep paying full price until that entry expired. Same
  // property as revoke's purge — colo-local and best-effort, which is why
  // `FALLBACK_CACHE_CONTROL` bounds the rest.
  await makeEdgeCachePurge(new URL(request.url).origin)(`${parent}?v=thumb`);
  return Response.json({ status: 'stored', for: parent, byteLength: outcome.byteLength }, { status: 201 });
}

/** The revoke route's path. Not a key read: `revoke` can never match the opaque
 * key shape, and the method differs anyway. */
export const REVOKE_PATH = '/media/revoke';

/**
 * MEDIA-REVOKE-1 — `POST /media/revoke`, the founder's byte cleanup after a
 * product delete (*"continue the cleaning of the bytes after the delete"*,
 * 2026-07-27). Body `{ ref }`.
 *
 * GATE CORRECTION (MEDIA-KEY-SPLIT, 2026-08-02): this comment once said
 * *"behind the SAME write gate as the upload"* — true when written, and
 * exactly the property the fournisseur verifier's M1 exposed as a hole: the
 * upload key ships inside app bundles, so "same gate" handed every bundle
 * reader a delete credential. Revoke now answers ONLY to the founder's
 * MEDIA_REVOKE_SECRET (see auth.ts / the entry's per-path gate).
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
    const { pathname } = new URL(request.url);

    // MEDIA-KEY-SPLIT — the REVOKE gate first, on its exact path, BEFORE the
    // write gate can ever see the request: revoke answers to the founder-only
    // MEDIA_REVOKE_SECRET, and the upload key (which ships in app bundles)
    // opens nothing here. Gate before any dispatch or storage touch, one
    // identical 401 — the standing laws, per capability now.
    if (request.method === 'POST' && pathname === REVOKE_PATH) {
      const denied = await rejectUnauthorizedRevoke(request, env);
      if (denied) return denied;
      return handleMediaRevoke(request, env);
    }

    // THE WRITE GATE, at the one deployed entry, BEFORE any dispatch or storage
    // touch — so a rejected upload never reaches R2 and the 401 is never an
    // existence oracle. Reads (GET) short-circuit through untouched: the media
    // read route is open by design.
    const denied = await rejectUnauthorizedWrite(request, env);
    if (denied) return denied;

    if (request.method === 'POST' && pathname === UPLOAD_PATH) {
      return handleMediaUpload(request, env);
    }
    // VIDEO-PRODUIT-1b — behind the same write gate above; dispatch only.
    if (request.method === 'POST' && pathname === VIDEO_UPLOAD_PATH) {
      return handleVideoUpload(request, env);
    }
    // REPERE-AUDIO-REEL — behind the same write gate above; dispatch only.
    if (request.method === 'POST' && pathname === AUDIO_UPLOAD_PATH) {
      return handleAudioUpload(request, env);
    }
    // THUMB-PRODUIT-1 — behind the same write gate above; dispatch only.
    if (request.method === 'POST' && pathname === THUMB_UPLOAD_PATH) {
      return handleThumbUpload(request, env);
    }
    if (request.method === 'GET' && pathname.startsWith(`/${MEDIA_KEY_PREFIX}`)) {
      // strip the leading slash — the key is `media/{token}`, the path is `/media/{token}`
      return handleMediaRead(request, decodeURIComponent(pathname.slice(1)), env, ctx);
    }
    return health(request);
}
