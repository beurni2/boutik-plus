import { PRODUCT_VIDEO_MAX_SEC } from '@platform/contracts';
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

/* ---------------------------------------------------------------- video -- */

/**
 * VIDEO-PRODUIT-1b (founder order 2026-08-02, « Go video » 2026-08-03) — the
 * service accepts ONE kind of moving image: a short MP4, the founder's 6-second
 * bound MEASURED HERE from the container's own `mvhd` box, never trusted from a
 * caller's claim. Same doctrine as the image path: magic bytes decide the type,
 * pure JS reads the header, deterministic only (loi 5 — recorded media, stored
 * and played, like the voice notes).
 *
 * MP4 ONLY, deliberately: phones emit MP4, and the duration bound must be REAL
 * — a container we cannot read the duration of is a container we do not accept,
 * because accepting it would turn the founder's bound into a suggestion.
 */

/** Engineering ceiling, like IMAGE_MAX_BYTES: ~2 MB/s of 6 s footage covers a
 *  phone's 720p H.264 comfortably; the capture UI says to film short and close.
 *  The CLIENTE's data cost is governed by playback (`preload="metadata"`, plays
 *  only in view), not by this bound. */
export const VIDEO_MAX_BYTES = 12 * 1024 * 1024;

/** The founder's bound (canon `PRODUCT_VIDEO_MAX_SEC`) + encoder jitter: a
 *  camera's « 6 second » clip routinely measures 6.02–6.05 s. Anything past
 *  this is a longer video, refused by name. */
export const VIDEO_MAX_SECONDS = PRODUCT_VIDEO_MAX_SEC + 0.05;

/** Magic sniff: an MP4-family container opens with a `ftyp` box at offset 4. */
export function sniffMp4(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4);
}

/**
 * The container's OWN duration — a pure top-level box walk to `moov`, then its
 * children to `mvhd` (v0 and v1 layouts), `duration / timescale`. `null` on any
 * malformation, and null is a REFUSAL upstream: the bound stays real.
 */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  const walk = (from: number, to: number, want: string): { at: number; header: number; size: number } | null => {
    let i = from;
    while (i + 8 <= to) {
      let size = be32(bytes, i);
      const type = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
      let header = 8;
      if (size === 1) {
        if (i + 16 > to) return null;
        size = be32(bytes, i + 8) * 2 ** 32 + be32(bytes, i + 12); // 64-bit largesize
        header = 16;
      } else if (size === 0) {
        size = to - i; // "to end of file"
      }
      // A negative or undersized box is a malformed container, never a loop.
      if (size < header) return null;
      if (type === want) return { at: i, header, size };
      i += size;
    }
    return null;
  };
  const moov = walk(0, bytes.length, 'moov');
  if (moov === null) return null;
  const moovEnd = Math.min(moov.at + moov.size, bytes.length);
  const mvhd = walk(moov.at + moov.header, moovEnd, 'mvhd');
  if (mvhd === null) return null;
  const p = mvhd.at + mvhd.header;
  if (p >= moovEnd) return null;
  const version = bytes[p]!;
  if (version === 0) {
    // version(1) flags(3) creation(4) modification(4) timescale(4) duration(4)
    if (p + 20 > moovEnd) return null;
    const timescale = be32(bytes, p + 12);
    const duration = be32(bytes, p + 16);
    return timescale > 0 ? duration / timescale : null;
  }
  if (version === 1) {
    // version(1) flags(3) creation(8) modification(8) timescale(4) duration(8)
    if (p + 32 > moovEnd) return null;
    const timescale = be32(bytes, p + 20);
    const duration = be32(bytes, p + 24) * 2 ** 32 + be32(bytes, p + 28);
    return timescale > 0 ? duration / timescale : null;
  }
  return null;
}

export type VideoRejectReason = 'empty' | 'too_large' | 'unsupported_type' | 'unreadable_duration' | 'too_long';

export interface StoredVideo {
  /** The OPAQUE object key — this is what travels as `ProductAssets.video.ref`. */
  readonly key: string;
  readonly url: string;
  readonly contentType: string;
  /** The MEASURED duration (fractional seconds) — the caller derives canon's
   *  integer `durationSec` from this, never from its own clock. */
  readonly durationSeconds: number;
  readonly byteLength: number;
  readonly uploadedAt: string;
}

export type VideoUploadOutcome =
  | { readonly ok: true; readonly video: StoredVideo }
  | { readonly ok: false; readonly reason: VideoRejectReason };

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
   * VIDEO-PRODUIT-1b — validate + store ONE short MP4. The founder's 6-second
   * bound is measured from the container's own `mvhd`, never from a claim; an
   * unreadable duration is a refusal, because accepting it would turn the
   * bound into a suggestion. Same key law as images: fresh opaque key, no
   * caller input, an upload never overwrites.
   */
  async uploadVideo(bytes: Uint8Array, at: string): Promise<VideoUploadOutcome> {
    if (bytes.length === 0) return { ok: false, reason: 'empty' };
    if (bytes.length > VIDEO_MAX_BYTES) return { ok: false, reason: 'too_large' };
    if (!sniffMp4(bytes)) return { ok: false, reason: 'unsupported_type' };
    const durationSeconds = mp4DurationSeconds(bytes);
    if (durationSeconds === null || durationSeconds <= 0) return { ok: false, reason: 'unreadable_duration' };
    if (durationSeconds > VIDEO_MAX_SECONDS) return { ok: false, reason: 'too_long' };

    const contentType = 'video/mp4';
    const key = mintMediaKey(); // fresh CSPRNG token — never derived, never sequential
    const stored: StoredObject = await this.store.put(key, bytes, contentType); // SERVER-SIDE write
    return {
      ok: true,
      video: {
        key: stored.key,
        url: stored.url,
        contentType,
        durationSeconds,
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
