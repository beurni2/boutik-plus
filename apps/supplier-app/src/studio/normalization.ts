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
 * THUMB-PRODUIT-1 (founder order 2026-08-11 — « fix the full size photograph »).
 * The VIGNETTE's long edge, and it lives here beside the derivative spec because
 * it is the same kind of thing: one deterministic resize, no enhancement, no
 * inference. 320 px because his « À traiter » rows paint 54 px squares — 162 px
 * at 3× — and the headroom costs about 25 KB instead of about 300 KB.
 *
 * MUST STAY ≤ the service's own `THUMB_MAX_DIM` (media-service `src/media.ts`),
 * which refuses anything larger. Two constants, one bound: the service is the
 * wall, this is what the device aims at.
 */
export const THUMB_EDGE_PX = 320;

/**
 * The vignette action list — bounded by the LONG edge, exactly as
 * `derivativeActions` is. Aiming `width` at a portrait image would leave its
 * height at 400 px and the service would refuse it; getting that backwards is
 * the one way this function can be wrong, so it is written the same way its
 * neighbour is rather than in a shorter way that looks equivalent.
 *
 * An image ALREADY within the box yields `[]` — no RESIZE. It is still decoded
 * and re-encoded by the renderer, so the result is NOT byte-identical to its
 * source; saying otherwise would be a claim about bytes that nothing produces.
 */
export function thumbActions(sourceWidth: number, sourceHeight: number): ResizeAction[] {
  const longest = Math.max(sourceWidth, sourceHeight);
  if (longest <= THUMB_EDGE_PX) return [];
  return sourceWidth >= sourceHeight ? [{ resize: { width: THUMB_EDGE_PX } }] : [{ resize: { height: THUMB_EDGE_PX } }];
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
    readonly detail: 'exif_leak' | 'decode_failed' | 'strip_failed' = 'exif_leak',
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
export type CaptureFailureDetail =
  | 'capture_failed'
  | 'decode_failed'
  | 'exif_leak'
  | 'strip_failed'
  | 'permission';

export function failureDetailOf(error: unknown): CaptureFailureDetail {
  if (error instanceof ExifLeakError) return error.detail;
  const message = error instanceof Error ? error.message : String(error);
  // Space/underscore/case-insensitive (verifier NB②: 'NotAuthorized' shapes).
  const normalized = message.toLowerCase().replace(/[\s_-]+/g, '');
  if (/permission|denied|unauthorized|notauthorized/.test(normalized)) return 'permission';
  return 'capture_failed';
}

/**
 * THE POST-CONDITION MUST COVER WHAT THE STRIP REMOVES (founder ruling
 * 2026-07-25, from a gap I found while reporting on gallery upload).
 *
 * `stripJpegMetadata` is an ALLOW-LIST — it drops every APPn by default. This
 * detector used to match ONLY `APP1` carrying the literal `Exif\0\0`
 * identifier, so it proved strictly LESS than the strip removed:
 *   · **XMP is APP1 with a DIFFERENT identifier** (`http://ns.adobe.com/xap/1.0/\0`)
 *     — and XMP carries GPS. Phone gallery apps rewrite it routinely.
 *   · **IPTC is APP13** (`Photoshop 3.0\0`) — captions, locations, credits.
 * Mostly theoretical for camera output. **Not theoretical for a gallery image**,
 * which is why the widening landed with the gallery path rather than after it.
 *
 * NOW: ANY `APP1` and ANY `APP13` counts as metadata. That is deliberately
 * broader than "EXIF" — the name is kept because the ERROR is the same fact
 * (the shipped bytes carry a metadata segment they must not), and every caller
 * treats it identically: fail closed, the derivative does not exist.
 *
 * Everything else the strip drops (APP0/JFIF, APP2/ICC, APP14, post-EOI
 * payloads) is NOT asserted here, and that is stated rather than implied:
 * those carry no user-identifying data, so their absence is a cleanliness
 * property, not a privacy one. The strip still removes them.
 */
export function jpegCarriesExif(bytes: Uint8Array): boolean {
  // JPEG: SOI (FFD8) then segments FF <marker> <len_hi> <len_lo> <payload…>
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1]!;
    if (marker === 0xda || marker === 0xd9) break; // start-of-scan / EOI: header segments over
    const len = ((bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    if (len < 2) break; // a malformed length cannot be walked; the strip refuses it separately
    // APP1 (EXIF **and** XMP) or APP13 (IPTC) — identifier-independent, so a
    // vendor writing its own APP1 flavour cannot slip past on the identifier.
    if (marker === 0xe1 || marker === 0xed) return true;
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

/**
 * WO-6.5 · B1.3 — STRIP BY ALLOW-LIST (the hostile-encoder threat model).
 * The WO-4.2E stripper was a DROP-LIST accepted for the BENIGN-leak threat
 * only: it copied every segment except APP1/APP13/COM, kept APP0/APP2/APP14,
 * and at SOS copied the rest of the stream VERBATIM — so a hostile APPn
 * (APP2/ICC, APP15…), a post-SOS or post-EOI payload (polyglot), or
 * ICC-borne data survived. The ruling (WO-4.2E NB①): move to an ALLOW-LIST —
 * copy ONLY the segments a shipped product photo needs (SOI · DQT · SOF ·
 * DHT · SOS + entropy · EOI); EVERYTHING else is discarded BY DEFAULT, the
 * entropy stream is bounded to its REAL EOI (nothing after EOI ships), and
 * SOF dimensions are checked against a ceiling (decompression-bomb /
 * overflow). Malformed or oversize → fail-closed ('strip_failed') — never a
 * crash, never a best-effort copy. Deterministic, zero deps.
 *
 * Deliberate stricture vs WO-4.2E: APP0/JFIF and APP2/ICC are now DROPPED.
 * A baseline JPEG decodes without JFIF (SOF carries the frame); the shipped
 * derivative is already sRGB from the encoder, so a dropped ICC profile is
 * assumed sRGB — a chosen trade of a colour-profile carrier for the security
 * of dropping every non-image segment by default.
 */

/** Security ceiling on declared JPEG dimensions. A shipped derivative is
 * <= DERIVATIVE_SPEC_V1.maxEdgePx (1280) on its longest edge; a hostile SOF
 * beyond this would make a downstream decoder allocate W*H*components bytes.
 * A bound, not a design token. */
export const MAX_JPEG_EDGE_PX = 8192;

/** SOF0..SOF15 (0xC0..0xCF) excluding DHT(0xC4), JPGn(0xC8), DAC(0xCC). */
function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * The allow-list: the ONLY header segments copied into the shipped JPEG.
 *
 * **DRI (0xDD) IS HERE BECAUSE DROPPING IT CORRUPTED REAL PHOTOGRAPHS** (device
 * incident 2026-07-26 — the founder's capture rendered as a strip of image over
 * flat grey, the signature of a decode that stops part-way).
 *
 * DRI declares the RESTART INTERVAL. When an encoder uses restart markers it
 * writes `RSTn` bytes into the entropy stream every N MCUs, and a decoder can
 * only interpret them if DRI told it N. **This stripper already walks PAST
 * `RST0`–`RST7` in `nextEntropyMarker` — it knew the markers were there — while
 * the allow-list deleted the one segment that explains them.** The stream then
 * decodes until the first restart and stops: real rows at the top, nothing
 * below. Every fixture in the test suite had a hand-built entropy stream with no
 * restart interval, so nothing caught it.
 *
 * DRI carries a single 2-byte count. It is rendering structure, exactly like
 * DQT/DHT/SOF, and holds no user-identifying data — so admitting it costs the
 * privacy allow-list nothing.
 */
function isAllowedHeaderSegment(marker: number): boolean {
  return (
    marker === 0xdb /* DQT */ ||
    marker === 0xc4 /* DHT */ ||
    marker === 0xdd /* DRI — restart interval; see above */ ||
    isSofMarker(marker)
  );
}

/** Refuse a SOF whose declared dimensions are zero or beyond the ceiling
 * (decompression-bomb / dimension-overflow guard). */
function assertSofDimensionsSane(bytes: Uint8Array, i: number, len: number): void {
  // SOF payload: precision(1) height(2) width(2) components(1) …
  if (len < 8 || i + 9 > bytes.length) {
    throw new ExifLeakError('SOF too short to carry dimensions — refusing the capture', 'strip_failed');
  }
  const height = ((bytes[i + 5]! << 8) | bytes[i + 6]!) >>> 0;
  const width = ((bytes[i + 7]! << 8) | bytes[i + 8]!) >>> 0;
  if (width === 0 || height === 0) {
    throw new ExifLeakError('SOF declares a zero dimension — refusing the capture', 'strip_failed');
  }
  if (width > MAX_JPEG_EDGE_PX || height > MAX_JPEG_EDGE_PX) {
    throw new ExifLeakError(
      `SOF declares ${width}x${height}, beyond the ${MAX_JPEG_EDGE_PX}px ceiling — refusing the capture`,
      'strip_failed',
    );
  }
}

/** The index of the next REAL JPEG marker in an entropy stream from `from`:
 * a 0xFF NOT followed by 0x00 (byte-stuffing) nor a restart marker
 * (0xD0..0xD7). Returns bytes.length if the stream ends without one — the
 * caller then fails closed (no EOI). */
function nextEntropyMarker(bytes: Uint8Array, from: number): number {
  let i = from;
  while (i + 1 < bytes.length) {
    if (bytes[i] === 0xff) {
      const next = bytes[i + 1]!;
      if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) return i;
    }
    i++;
  }
  return bytes.length;
}

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new ExifLeakError('not a JPEG stream — refusing the capture', 'strip_failed');
  }
  const out = new Uint8Array(bytes.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  let o = 2;
  let i = 2;
  while (i + 2 <= bytes.length) {
    if (bytes[i] !== 0xff) {
      throw new ExifLeakError('malformed JPEG marker stream — refusing the capture', 'strip_failed');
    }
    const marker = bytes[i + 1]!;
    // Fill bytes: any run of 0xFF may precede a real marker — consume one and
    // retry (they carry nothing; they are not copied).
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // TEM (standalone, no length) carries nothing the header needs → dropped.
    if (marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      // EOI — terminal. Append and STOP; anything after EOI never ships
      // (this is what discards a post-EOI polyglot payload).
      out[o++] = 0xff;
      out[o++] = 0xd9;
      return out.subarray(0, o);
    }
    if (marker === 0xda) {
      // SOS: copy the scan header, then the entropy stream bounded to its
      // real terminator; continue the walk there so any segment injected
      // between the scan and EOI is dropped, not copied.
      if (i + 4 > bytes.length) {
        throw new ExifLeakError('truncated SOS header — refusing the capture', 'strip_failed');
      }
      const len = ((bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
      if (len < 2 || i + 2 + len > bytes.length) {
        throw new ExifLeakError('SOS header length overruns the stream — refusing the capture', 'strip_failed');
      }
      const entropyEnd = nextEntropyMarker(bytes, i + 2 + len);
      out.set(bytes.subarray(i, entropyEnd), o);
      o += entropyEnd - i;
      i = entropyEnd;
      continue;
    }
    if (i + 4 > bytes.length) {
      throw new ExifLeakError('truncated JPEG marker header — refusing the capture', 'strip_failed');
    }
    const len = ((bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    if (len < 2 || i + 2 + len > bytes.length) {
      throw new ExifLeakError('JPEG block length overruns the stream — refusing the capture', 'strip_failed');
    }
    if (isAllowedHeaderSegment(marker)) {
      if (isSofMarker(marker)) assertSofDimensionsSane(bytes, i, len);
      out.set(bytes.subarray(i, i + 2 + len), o);
      o += 2 + len;
    }
    // else: DROPPED by default — APPn (incl. APP0/JFIF, APP2/ICC, APP14),
    // COM, DNL, and every reserved marker leave no bytes in the output.
    i += 2 + len;
  }
  throw new ExifLeakError('JPEG stream ended before EOI — refusing the capture', 'strip_failed');
}

/** bytes → base64, PURE JS (the decoder's sibling): the stripped artifact
 * becomes a data URI so the PREVIEWED image and the STORED image are the
 * SHIPPED bytes, literally — WYSIWYG by construction, now to the byte. */
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      B64_ALPHABET[(n >> 18) & 63]! +
      B64_ALPHABET[(n >> 12) & 63]! +
      B64_ALPHABET[(n >> 6) & 63]! +
      B64_ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64_ALPHABET[(n >> 18) & 63]! + B64_ALPHABET[(n >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64_ALPHABET[(n >> 18) & 63]! + B64_ALPHABET[(n >> 12) & 63]! + B64_ALPHABET[(n >> 6) & 63]! + '=';
  }
  return out;
}
