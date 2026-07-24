import { assertOpaqueMediaKey, mintMediaKey } from './media-key.js';
import type { MediaStore, StoredObject } from './media-store.js';

/**
 * BOUTIK-MEDIA-1 — the through-a-service image pipeline: receive → VALIDATE →
 * store (via {@link MediaStore}) → hand back an OPAQUE ref.
 *
 * WHAT IS PORTED (shop-plus plumbing, proven): the magic-byte sniff, the pure-JS
 * PNG-IHDR / JPEG-SOF dimension read, and the size/dimension bounds. All pure, no
 * image library, no inference — deterministic only (loi 5).
 *
 * WHAT IS DELIBERATELY NOT PORTED (shop-plus policy):
 *   · NO `pending_review` / `approve` / `reject` machine. Founder ruling
 *     2026-07-24: product images carry no separate review state. An image belongs
 *     to a product, the product carries `ProductVersion.moderationState`, and
 *     `buildSupplyProjection` (offer-service `projection.ts`) is the ONLY gate —
 *     an unapproved product never projects its refs. Building a media-moderation
 *     machine here would duplicate a gate that already exists. (shop-plus's
 *     `approve()` has no production caller — its held media is invisible with no
 *     path to live. That trap is not reproduced here.)
 *   · NO audio path (voice notes are a shop-plus surface).
 *   · NO identity-namespaced object keys — see `media-key.ts`.
 *
 * MEDIA KINDS — the adaptation, and a consequence of the opaque-key ruling worth
 * stating plainly: boutik's product-image taxonomy (hero / proof / detail) is
 * carried by the STRUCTURE of canon `ProductAssets`, NOT by the object key and
 * NOT by a field here. The key must be opaque, so it cannot describe a role; every
 * product image validates identically. The role is the slot the ref occupies in
 * `ProductAssets`, which is what the wire mapping reads.
 *
 * NO DURABLE INDEX HERE. This service keeps no registry of key→product: that link
 * IS the offer entry's `ProductAssets` in the offer DO. Stated so nobody later
 * looks for a media registry that was never built.
 */

/* --------------------------------------------------------------- bounds -- */

/** The stored image must already be within this box (the app resizes on device). */
export const IMAGE_STANDARD_MAX_DIM = 2048;
export const IMAGE_MIN_DIM = 200;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/* ----------------------------------------------------------- validation -- */

export type ImageFormat = 'jpeg' | 'png';

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean =>
  sig.every((byte, i) => b[at + i] === byte);

/** Magic-byte image sniff — NEVER trust a declared content-type. jpeg/png only (what the capture emits). */
export function sniffImage(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  return null;
}

const be16 = (b: Uint8Array, at: number): number => (b[at]! << 8) | b[at + 1]!;
const be32 = (b: Uint8Array, at: number): number => (b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!;

/** Read intrinsic dimensions from the header — pure JS, no image library. */
export function imageDimensions(bytes: Uint8Array, fmt: ImageFormat): { width: number; height: number } | null {
  if (fmt === 'png') {
    // 8-byte signature · 4-byte length · "IHDR" · width(4 BE) · height(4 BE)
    if (bytes.length < 24 || !startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)) return null;
    return { width: be32(bytes, 16), height: be32(bytes, 20) };
  }
  // JPEG — scan segments for a Start-Of-Frame marker (SOF0..SOF15, excluding DHT/DAC/RST).
  let i = 2; // skip SOI (FF D8)
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1]!;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: be16(bytes, i + 5), width: be16(bytes, i + 7) };
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // no length
    i += 2 + be16(bytes, i + 2); // skip this segment by its length
  }
  return null;
}

/* --------------------------------------------------------------- upload -- */

export type RejectReason = 'empty' | 'unsupported_type' | 'too_large' | 'bad_dimensions';

export interface StoredImage {
  /** The OPAQUE object key — this is what travels as an assetRef. */
  readonly key: string;
  readonly url: string;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly uploadedAt: string;
}

export type UploadOutcome =
  | { readonly ok: true; readonly image: StoredImage }
  | { readonly ok: false; readonly reason: RejectReason };

/**
 * A best-effort cache purge for a revoked key. The Worker supplies
 * `makeEdgeCachePurge(origin)`; anything without a cache (CI, Node) supplies
 * nothing. It is BEST-EFFORT BY NATURE — a colo-local delete — so revocation's
 * real guarantee comes from the bounded TTLs, never from this hook firing.
 */
export type MediaCachePurge = (key: string) => Promise<void>;

/**
 * The media service. Validates then stores then returns the opaque ref. There is
 * no hold, no review, and no registry — by ruling, not by omission.
 */
export class ProductMediaService {
  constructor(private readonly store: MediaStore, private readonly purge?: MediaCachePurge) {}

  /** Validate + store. A fresh opaque key every time — an upload NEVER overwrites. */
  async upload(bytes: Uint8Array, at: string): Promise<UploadOutcome> {
    if (bytes.length === 0) return { ok: false, reason: 'empty' };
    if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: 'too_large' };
    const fmt = sniffImage(bytes);
    if (fmt === null) return { ok: false, reason: 'unsupported_type' };
    const dims = imageDimensions(bytes, fmt);
    if (dims === null) return { ok: false, reason: 'bad_dimensions' };
    if (dims.width > IMAGE_STANDARD_MAX_DIM || dims.height > IMAGE_STANDARD_MAX_DIM) {
      return { ok: false, reason: 'bad_dimensions' };
    }
    if (dims.width < IMAGE_MIN_DIM || dims.height < IMAGE_MIN_DIM) {
      return { ok: false, reason: 'bad_dimensions' };
    }

    const contentType = fmt === 'png' ? 'image/png' : 'image/jpeg';
    const key = mintMediaKey(); // fresh CSPRNG token — never derived, never sequential
    const stored: StoredObject = await this.store.put(key, bytes, contentType); // SERVER-SIDE write
    return {
      ok: true,
      image: {
        key: stored.key,
        url: stored.url,
        contentType,
        width: dims.width,
        height: dims.height,
        byteLength: bytes.length,
        uploadedAt: at,
      },
    };
  }

  /**
   * REVOCATION — destroys the origin object, then best-effort purges the serving
   * colo.
   *
   * THE PROPERTY IS "BOUNDED-LATENCY REVOCATION", NOT "INSTANT TAKEDOWN". Say it
   * that way (founder ruling 2026-07-24). The origin copy dies immediately and the
   * colo that served it is purged, but other colos and already-served browsers
   * keep answering from cache until their TTL expires — so a leaked ref keeps
   * resolving for UP TO the edge TTL (1 h; see the read route's `CACHE_CONTROL`).
   * That is bounded and stated, where before it was unbounded (a year of
   * `immutable`, with nothing able to close it).
   *
   * The caller drops the ref from `ProductAssets` in the same move; this service
   * holds no index that could do it for them.
   */
  async revoke(key: string): Promise<void> {
    await this.store.remove(assertOpaqueMediaKey(key));
    await this.purge?.(key); // best-effort, colo-local; the TTL is the real bound
  }

  /**
   * REPLACE = mint new + delete old, in that order. The new object exists before
   * the old one is destroyed, so a crash between the two leaves an orphan (costs
   * storage) rather than a hole (breaks a live product image). If validation
   * refuses, the OLD object is left untouched — a bad replacement never revokes a
   * good image.
   */
  async replace(oldKey: string, bytes: Uint8Array, at: string): Promise<UploadOutcome> {
    assertOpaqueMediaKey(oldKey);
    const outcome = await this.upload(bytes, at);
    if (!outcome.ok) return outcome; // refused → old image survives
    await this.store.remove(oldKey);
    await this.purge?.(oldKey); // same bounded-latency property as revoke
    return outcome;
  }
}
