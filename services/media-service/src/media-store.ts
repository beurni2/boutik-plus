/**
 * BOUTIK-MEDIA-1 — the MediaStore adapter (the R2 boundary).
 *
 * THROUGH-A-SERVICE (never direct-to-bucket): the phone uploads to this service;
 * the service validates the bytes and writes them with a SERVER-SIDE binding. The
 * app never holds a bucket credential and never touches R2. One swappable
 * interface, so every test and CI run exercises the in-memory fake — never real
 * R2, never a credential. The mock-gate is enforced BY CONSTRUCTION (the binding
 * is simply absent in CI), not by discipline.
 *
 * PORTED PLUMBING, NOT POLICY. The port + env-gated resolver + R2 write are
 * shop-plus's proven media boundary. Deliberately NOT ported: its moderation
 * state machine, its audio path, and above all its object-key shape — which is
 * namespaced by the shop's own id and would put a supplier identity in every ref
 * here (see `media-key.ts`).
 */

/** A stored object — the opaque key and the service-relative URL that serves it. */
export interface StoredObject {
  readonly key: string;
  readonly url: string;
}

/**
 * The one media-persistence port. `put` writes bytes at a key; `remove` deletes
 * the object — REVOCATION is a first-class operation here (founder requirement),
 * because the read route carries no moderation check.
 *
 * SCOPE OF `remove`, stated precisely: it destroys the ORIGIN object and nothing
 * else. It does not purge the edge cache or expire a browser copy, so a revoked
 * image can still be served from cache (see `media.ts` `revoke` and the read
 * route). Do not treat `remove` as a takedown until the caching policy is settled.
 */
export interface MediaStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  /**
   * THUMB-PRODUIT-1 — METADATA ONLY: does an object exist here, and WHEN was it
   * written? Three questions in the vignette path turn on this and nothing else:
   * does the PARENT photograph exist (a vignette for nothing is a write to
   * nowhere), is the vignette slot still EMPTY (write-once), and is the parent
   * still FRESH — which is what makes the whole derived-key write safe (see
   * `putThumb`) and what decides the read route's fallback TTL.
   *
   * IT NEVER ANSWERS THE BYTES, so it can never become a back door around the
   * read route's shape gate.
   */
  stat(key: string): Promise<{ readonly uploadedAt: Date } | null>;
}

export class MediaStoreError extends Error {
  override readonly name = 'MediaStoreError';
}

/**
 * The FAKE store — CI, tests, and any environment without an R2 binding. Keeps
 * bytes in memory keyed by object key and returns a deterministic URL. It stores
 * the exact bytes it was given, so a test can assert the full
 * upload → store → URL → revoke path without a real bucket. It never reaches the
 * network.
 */
export class InMemoryMediaStore implements MediaStore {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string; uploadedAt: Date }>();
  /** THUMB-PRODUIT-1 — an INJECTABLE clock, because the freshness window that
   *  guards the vignette door is a time decision and a test must be able to age
   *  an object without sleeping. Defaults to the real one. */
  constructor(private readonly base = 'https://media.boutik.test', private readonly now: () => Date = () => new Date()) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { bytes, contentType, uploadedAt: this.now() });
    return { key, url: `${this.base}/${key}` };
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async stat(key: string): Promise<{ readonly uploadedAt: Date } | null> {
    const o = this.objects.get(key);
    return o === undefined ? null : { uploadedAt: o.uploadedAt };
  }
}

/**
 * The R2 binding, as the MINIMAL structural shape this module uses — so `src/`
 * stays free of `@cloudflare/workers-types` (the same boundary trick the offer
 * service's DO fetcher uses). `env.BUCKET` in workerd is a native binding: no
 * credential, no token minting, no SDK in the lockfile.
 */
export interface R2ObjectBodyLike {
  /** The object bytes as a stream — handed straight to a `Response` on read (never buffered). */
  readonly body: ReadableStream | null;
  readonly httpMetadata?: { readonly contentType?: string };
}
export interface R2BucketLike {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
  /** R2's metadata-only probe, carrying the object's `uploaded` time. OPTIONAL
   *  in this structural type on purpose: it is what `stat` prefers (no body, no
   *  egress), but a binding without it must still answer the question rather
   *  than crash — see `R2MediaStore.stat`. */
  head?(key: string): Promise<{ uploaded?: Date } | null>;
}

/**
 * The REAL store on Cloudflare R2. Writes the native binding —
 * `env.BUCKET.put(key, bytes, { httpMetadata })` — no credential, no network
 * client. The returned URL is THIS SERVICE's own read route `GET /media/{key}`:
 * the bucket is PRIVATE and is never exposed as a public custom domain, so the
 * only way to bytes is through the service. Exercised only when `env.BUCKET` is
 * bound; the fake stands in everywhere else.
 */
export class R2MediaStore implements MediaStore {
  constructor(private readonly bucket: R2BucketLike, private readonly publicBase = '') {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    await this.bucket.put(key, bytes, { httpMetadata: { contentType } });
    // THROUGH-A-SERVICE for reads too: the URL points at the Worker route, never
    // at the bucket. Relative when no base is configured (same origin).
    return { key, url: `${this.publicBase}/${key}` };
  }

  async remove(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  /**
   * `head` when the binding has it (metadata only — no body, no egress), else
   * `get`. The fallback is not a nicety: a metadata question answered by a crash
   * would make the vignette door refuse every write on a binding that is
   * otherwise perfectly good.
   *
   * THE FALLBACK CANCELS THE BODY IT DID NOT WANT (verifier MINOR): a `get`
   * whose stream is simply abandoned keeps that egress open. It is cancelled
   * explicitly so the fallback costs a request, not a photograph.
   *
   * NO `uploaded` ⇒ THE EPOCH, WHICH READS AS « OLD » EVERYWHERE THIS IS USED —
   * and that is the safe direction: an object whose age cannot be established
   * is past the vignette door's freshness window (the write is refused, never
   * silently allowed) and gets the full cache TTL (never a shortened one).
   */
  async stat(key: string): Promise<{ readonly uploadedAt: Date } | null> {
    if (typeof this.bucket.head === 'function') {
      const meta = await this.bucket.head(key);
      return meta === null ? null : { uploadedAt: meta.uploaded ?? new Date(0) };
    }
    const object = await this.bucket.get(key);
    if (object === null) return null;
    await object.body?.cancel().catch(() => undefined); // never leave egress open
    return { uploadedAt: new Date(0) };
  }
}

/** The environment the store resolves from (injected in workerd, else process.env). */
export interface MediaEnv {
  /** The R2 binding (native, no credential) — the only production backing. */
  readonly BUCKET?: R2BucketLike;
  /** The service's own origin, so read URLs are absolute (`{base}/media/{token}`). */
  readonly MEDIA_PUBLIC_BASE?: string;
}

/**
 * Pick the store from the environment: R2 iff the native `BUCKET` binding is
 * present, else the in-memory fake. CI and tests bind nothing, so they can never
 * reach real storage.
 */
export function resolveMediaStore(env?: MediaEnv): MediaStore {
  // `globalThis.process` (not a bare `process` identifier) so this typechecks
  // under both the Node src config and a workerd worker config (no @types/node).
  const proc = (globalThis as { process?: { env?: unknown } }).process;
  const e: MediaEnv = env ?? ((proc?.env as MediaEnv | undefined) ?? {});
  if (e.BUCKET && typeof e.BUCKET.put === 'function') {
    return new R2MediaStore(e.BUCKET, e.MEDIA_PUBLIC_BASE ?? '');
  }
  return new InMemoryMediaStore();
}
