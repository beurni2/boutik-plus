/**
 * WO-4.2C · B1.2 ENTRY POINTS — deterministic normalization HOOKS ONLY.
 * The Building Plan row (quoted): "Conservative WB/exposure (no clip);
 * safe-box crop; derivatives; EXIF strip; pHash; before/after +
 * use-original-colours; faithfulness tests." This slice ships the
 * DETERMINISTIC SEAMS and the two elements the order names (derivatives +
 * EXIF strip at capture); the WB/exposure, safe-box crop and pHash hooks
 * are DECLARED identity seams — no cleanup pipeline, no moderation queue
 * (B1.3/B2.2, FORBIDDEN here). Everything in this module is pure and
 * deterministic: same input → same output, no inference anywhere
 * (imaging gate: "no segmentation/generative/classification/inference").
 */

/** The canonical derivative spec (v1) — the ONE transform both the preview
 * and the stored derivative come from (WYSIWYG by construction). */
export const DERIVATIVE_SPEC_V1 = {
  /** Longest edge of the price-free derivative, px. */
  maxEdgePx: 1280,
  /** Guidance metrics run on a small frame ("on-device metrics on
   * downscaled frames" — B1.1). */
  metricsEdgePx: 96,
  /** JPEG quality for derivatives (0..1, expo-image-manipulator scale). */
  compress: 0.8,
  format: 'jpeg',
} as const;

/** One action shape (mirrors expo-image-manipulator's Action for resize —
 * typed locally so this module stays pure and node-testable). */
export interface ResizeAction {
  resize: { width?: number; height?: number };
}

/**
 * The deterministic derivative action list. ONLY resize belongs here at
 * this slice — the whitelist is a tested law (no enhancement, no filters,
 * no generative anything).
 */
export function derivativeActions(sourceWidth: number, sourceHeight: number): ResizeAction[] {
  const longest = Math.max(sourceWidth, sourceHeight);
  if (longest <= DERIVATIVE_SPEC_V1.maxEdgePx) return [];
  return sourceWidth >= sourceHeight
    ? [{ resize: { width: DERIVATIVE_SPEC_V1.maxEdgePx } }]
    : [{ resize: { height: DERIVATIVE_SPEC_V1.maxEdgePx } }];
}

/** The metrics frame action — a tiny downscale for the guidance engine. */
export function metricsActions(): ResizeAction[] {
  return [{ resize: { width: DERIVATIVE_SPEC_V1.metricsEdgePx } }];
}

/**
 * B1.2 SEAMS — declared, identity, tested as such. Later slices implement
 * them; nothing here may change bytes today.
 */
export const NORMALIZATION_HOOKS_V1 = {
  /** Conservative WB/exposure (no clip) — identity until its slice. */
  whiteBalance: 'identity',
  /** Safe-box crop — identity until its slice. */
  safeBoxCrop: 'identity',
  /** pHash for dedupe/faithfulness — absent until its slice. */
  perceptualHash: 'absent',
} as const;

/**
 * EXIF guard — the capture-path law (imaging gate: "EXIF stripped"),
 * enforced AT CAPTURE on the actual output bytes, not only by a repo scan.
 * Pure JS: scans the JPEG byte stream for an APP1 segment carrying the
 * "Exif\0\0" identifier. expo-image-manipulator re-encodes and emits no
 * EXIF; this guard PROVES it on every capture (and throws if a future
 * library change ever reintroduces metadata).
 */
export class ExifLeakError extends Error {
  override readonly name = 'ExifLeakError';
  /** WO-4.2D — the machine-readable failure code the preview-only
   * diagnostic line surfaces (« détail : <code> »). */
  constructor(
    message: string,
    readonly detail: 'exif_leak' | 'decode_failed' = 'exif_leak',
  ) {
    super(message);
  }
}

/**
 * WO-4.2D — deterministic failure classification for the capture path's
 * designed failure state. No inference: the guard's own errors carry their
 * code; permission-shaped native rejections are named; everything else is
 * the capture itself. Rendered ONLY in preview builds (babel-inlined out of
 * any future production profile, same law as the banner).
 */
export type CaptureFailureDetail = 'capture_failed' | 'decode_failed' | 'exif_leak' | 'permission';

export function failureDetailOf(error: unknown): CaptureFailureDetail {
  if (error instanceof ExifLeakError) return error.detail;
  const message = error instanceof Error ? error.message : String(error);
  // Space/underscore/case-insensitive (verifier NB②: 'NotAuthorized' shapes).
  const normalized = message.toLowerCase().replace(/[\s_-]+/g, '');
  if (/permission|denied|unauthorized|notauthorized/.test(normalized)) return 'permission';
  return 'capture_failed';
}

export function jpegCarriesExif(bytes: Uint8Array): boolean {
  // JPEG: SOI (FFD8) then segments FF <marker> <len_hi> <len_lo> <payload…>
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1]!;
    if (marker === 0xda || marker === 0xd9) break; // start-of-scan / EOI: header segments over
    const len = ((bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    if (marker === 0xe1 && i + 10 <= bytes.length) {
      // APP1: "Exif\0\0" identifier?
      if (
        bytes[i + 4] === 0x45 && // E
        bytes[i + 5] === 0x78 && // x
        bytes[i + 6] === 0x69 && // i
        bytes[i + 7] === 0x66 && // f
        bytes[i + 8] === 0x00 &&
        bytes[i + 9] === 0x00
      ) {
        return true;
      }
    }
    i += 2 + len;
  }
  return false;
}

export function assertExifFree(bytes: Uint8Array): void {
  if (jpegCarriesExif(bytes)) {
    throw new ExifLeakError('capture derivative carries EXIF — the capture path must strip it');
  }
}

/** RFC 4648 decode table — 'A'..'Z' 'a'..'z' '0'..'9' '+' '/' → 0..63. */
const B64_LOOKUP = (() => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;
  return lookup;
})();

/**
 * base64 → bytes, PURE JS (WO-4.2D — the founder-device incident).
 * WO-4.2C leaned on the `atob` global ("Hermes provides atob") — a claim
 * the verifier flagged as UNVERIFIABLE in-sandbox, and the founder's
 * iPhone/Expo Go failure chip pointed here. The assumption is now REMOVED
 * BY CONSTRUCTION: this decoder depends on no runtime global, only the
 * RFC 4648 table above. FAIL-CLOSED is retained where it belongs — empty
 * input, an illegal length, or a character outside the alphabet is an
 * error (detail: decode_failed), never a vacuous green light.
 */
export function base64ToBytes(b64: string): Uint8Array {
  if (b64.length === 0) {
    throw new ExifLeakError(
      'empty derivative bytes — the EXIF guard cannot run, refusing the capture',
      'decode_failed',
    );
  }
  // Forgiving-base64 step 1 (WHATWG): strip ASCII whitespace — native
  // encoders may wrap lines (verifier NB①: Android Base64.DEFAULT, MIME);
  // the OLD atob path forgave whitespace and a stricter decoder would
  // re-refuse captures the founder's device used to make.
  const compact = b64.replace(/[\t\n\f\r ]+/g, '');
  let end = compact.length;
  while (end > 0 && compact.charCodeAt(end - 1) === 0x3d) end--; // trailing '='
  if (end === 0) {
    // Verifier blocker ①: padding-only (or whitespace-only) input MUST NOT
    // become a 0-byte vacuous pass through the EXIF guard.
    throw new ExifLeakError(
      'padding-only base64 — no derivative bytes, refusing the capture',
      'decode_failed',
    );
  }
  if (end % 4 === 1) {
    throw new ExifLeakError('invalid base64 length — refusing the capture', 'decode_failed');
  }
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < end; i++) {
    const code = compact.charCodeAt(i);
    const value = code < 128 ? B64_LOOKUP[code]! : -1;
    if (value < 0) {
      throw new ExifLeakError(
        `invalid base64 character at ${i} — refusing the capture`,
        'decode_failed',
      );
    }
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}
