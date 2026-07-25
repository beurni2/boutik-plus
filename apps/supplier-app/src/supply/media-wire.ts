/**
 * COMBINED SLICE — the media upload WIRE logic, pure (no expo import, so tests
 * can drive it; `media.ts` is the expo-bound client that composes this). The
 * wire contract is read from the service's own source
 * (`services/media-service/worker/index.ts`), not from memory.
 */

/** Must equal WRITE_KEY_HEADER in packages/service-auth. */
export const MEDIA_WRITE_KEY_HEADER = 'X-Write-Key';

/** What a 201 carries (media worker `handleMediaUpload`), mirrored. */
export interface UploadedImage {
  readonly ref: string;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

/**
 * Boundary-validate the 201 body — a malformed answer is refused, never cast.
 * A ref outside the `media/` namespace never ships: every real key the service
 * mints is `media/{uuid}` (opaque-token ruling), so anything else is not a key
 * this system produced.
 */
export function readUploadResult(body: unknown): UploadedImage | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b['ref'] !== 'string' || !b['ref'].startsWith('media/')) return null;
  if (typeof b['contentType'] !== 'string') return null;
  if (!Number.isFinite(b['width']) || !Number.isFinite(b['height']) || !Number.isFinite(b['byteLength'])) return null;
  return {
    ref: b['ref'],
    contentType: b['contentType'],
    width: b['width'] as number,
    height: b['height'] as number,
    byteLength: b['byteLength'] as number,
  };
}

/** Lowercase-hex a digest buffer — canon's sha256 shape. Pure; the OS digest itself lives in media.ts. */
export function hexOfDigest(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
