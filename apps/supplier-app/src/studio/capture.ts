import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CameraView } from 'expo-camera';
import {
  DERIVATIVE_SPEC_V1,
  assertExifFree,
  base64ToBytes,
  bytesToBase64,
  derivativeActions,
  metricsActions,
  stripJpegMetadata,
} from './normalization';
import { guidanceFor, type FrameMetrics, type GuidanceVerdict } from './guidance';

/**
 * WO-4.2C · B1.1 — the capture path; WO-4.2E — STRIP, DON'T TRUST.
 * The founder's iOS encoder preserved EXIF through saveAsync's re-encode
 * (device evidence: « détail : exif_leak » — the fail-closed guard
 * correctly refused). The path is now decode → STRIP (our own pure-JS
 * segment rewriter) → assertExifFree as a TRUE POST-CONDITION on the
 * stripped bytes → and the STRIPPED artifact — a data URI built from
 * those exact bytes — is what is stored AND previewed. WYSIWYG now shows
 * the shipped bytes literally: any rotation or color defect the strip or
 * re-encode could introduce is founder-visible by construction. The
 * private master (original capture) is RETAINED untouched and distinct
 * (imaging gates: "master≠derivative; original retained").
 */

export interface CaptureResult {
  /** Private master — the untouched original (never published, never previewed). */
  masterUri: string;
  /** The ONE derivative — the STRIPPED bytes as a data URI, previewed AND stored. */
  derivative: { uri: string; width: number; height: number };
  /** Guidance from the downscaled metrics frame. */
  guidance: { verdict: GuidanceVerdict; key: string };
}

/** The single transform seam — exactly one manipulator render for the
 * derivative; a second tiny render for the metrics frame only. */
async function renderDerivative(masterUri: string, width: number, height: number) {
  const ctx = ImageManipulator.manipulate(masterUri);
  for (const action of derivativeActions(width, height)) ctx.resize(action.resize);
  const image = await ctx.renderAsync();
  return image.saveAsync({ compress: DERIVATIVE_SPEC_V1.compress, format: SaveFormat.JPEG, base64: true });
}

async function renderMetricsFrame(masterUri: string) {
  const ctx = ImageManipulator.manipulate(masterUri);
  for (const action of metricsActions()) ctx.resize(action.resize);
  const image = await ctx.renderAsync();
  return image.saveAsync({ compress: DERIVATIVE_SPEC_V1.compress, format: SaveFormat.JPEG, base64: true });
}

export async function captureShot(camera: CameraView): Promise<CaptureResult> {
  // The master: full-resolution original, retained as-is (private).
  const photo = await camera.takePictureAsync({ quality: 1 });

  // THE derivative — one transform, one output.
  const derivative = await renderDerivative(photo.uri, photo.width, photo.height);
  // FAIL-CLOSED: no bytes = no capture (base64ToBytes throws on empty/undecodable).
  const bytes = base64ToBytes(derivative.base64 ?? '');
  // WO-4.2E: strip the metadata OURSELVES — never trust the encoder.
  const stripped = stripJpegMetadata(bytes);
  assertExifFree(stripped); // the guard is now a POST-CONDITION on the shipped bytes

  // Metrics on the downscaled frame (B1.1: "on-device metrics on
  // downscaled frames") — bytes-per-pixel of a tiny re-encode.
  const metricsFrame = await renderMetricsFrame(photo.uri);
  const metrics: FrameMetrics = {
    byteLength: base64ToBytes(metricsFrame.base64 ?? '').byteLength,
    width: metricsFrame.width,
    height: metricsFrame.height,
  };

  return {
    masterUri: photo.uri,
    // The data URI IS the stripped artifact: previewed and stored alike —
    // the file at derivative.uri (which the founder's device proved can
    // carry EXIF) never ships.
    derivative: {
      uri: `data:image/jpeg;base64,${bytesToBase64(stripped)}`,
      width: derivative.width,
      height: derivative.height,
    },
    guidance: guidanceFor(metrics),
  };
}

// ─── COMBINED SLICE — the hero's TWO CROPS (square + vertical) ───────────────

/** One stripped, upload-ready derivative: the exact bytes AND their preview URI. */
export interface StrippedDerivative {
  readonly bytes: Uint8Array;
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Render one crop of a master through the SAME honesty pipeline as every other
 * derivative: crop → bounded resize → STRIP (our own segment rewriter) →
 * `assertExifFree` as a post-condition on the exact bytes that ship. A crop is
 * a derivative like any other — there is no second, laxer path for it.
 */
export async function renderCropDerivative(
  masterUri: string,
  rect: { originX: number; originY: number; width: number; height: number },
): Promise<StrippedDerivative> {
  const ctx = ImageManipulator.manipulate(masterUri);
  ctx.crop(rect);
  for (const action of derivativeActions(rect.width, rect.height)) ctx.resize(action.resize);
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: DERIVATIVE_SPEC_V1.compress, format: SaveFormat.JPEG, base64: true });
  const stripped = stripJpegMetadata(base64ToBytes(saved.base64 ?? ''));
  assertExifFree(stripped); // fail-closed — a crop that cannot be proven clean does not exist
  return {
    bytes: stripped,
    uri: `data:image/jpeg;base64,${bytesToBase64(stripped)}`,
    width: saved.width,
    height: saved.height,
  };
}

/**
 * The upload-ready bytes of an already-captured shot: `captureShot` previews a
 * data URI built from the stripped bytes, and THIS decodes that same URI back —
 * so what uploads is byte-identical to what the founder SAW. No re-render, no
 * second encode, no window for divergence between preview and upload.
 */
export function derivativeBytesFromUri(dataUri: string): Uint8Array {
  const comma = dataUri.indexOf(',');
  if (!dataUri.startsWith('data:image/jpeg;base64,') || comma < 0) {
    throw new Error('derivative URI is not the stripped data URI this app produces');
  }
  const bytes = base64ToBytes(dataUri.slice(comma + 1));
  assertExifFree(bytes); // the post-condition holds on the decode too — belt and braces
  return bytes;
}
