import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CameraView } from 'expo-camera';
import {
  DERIVATIVE_SPEC_V1,
  assertExifFree,
  base64ToBytes,
  derivativeActions,
  metricsActions,
} from './normalization';
import { guidanceFor, type FrameMetrics, type GuidanceVerdict } from './guidance';

/**
 * WO-4.2C · B1.1 — the capture path. ONE transform produces the derivative
 * the seller previews AND the derivative that is stored: WYSIWYG is a
 * property of the code path, not a promise (the ui-studio test pins the
 * single call site and the shared result object). The private master
 * (original capture) is RETAINED untouched and kept distinct from the
 * derivative (imaging gates: "master≠derivative; original retained").
 * EXIF is stripped AT CAPTURE: the derivative is a re-encode via
 * expo-image-manipulator, and `assertExifFree` PROVES the output bytes
 * carry no APP1/Exif segment on every capture — a runtime guard on the
 * path itself, not only a repo scan.
 */

export interface CaptureResult {
  /** Private master — the untouched original (never published, never previewed). */
  masterUri: string;
  /** The ONE derivative — previewed AND stored, same object. */
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

  // THE derivative — one transform, one output, previewed and stored alike.
  const derivative = await renderDerivative(photo.uri, photo.width, photo.height);
  const bytes = base64ToBytes(derivative.base64 ?? '');
  assertExifFree(bytes); // EXIF stripped AT CAPTURE — proven on the output bytes.

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
    derivative: { uri: derivative.uri, width: derivative.width, height: derivative.height },
    guidance: guidanceFor(metrics),
  };
}
