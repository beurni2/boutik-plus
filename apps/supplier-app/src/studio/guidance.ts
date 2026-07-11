/**
 * WO-4.2C · B1.1 — the guidance engine, pure and deterministic.
 * Building Plan row (quoted): "Category-aware Hero+Proof; on-device
 * metrics on downscaled frames; in-app camera; voice notes."
 * — Category-aware: guidance keys vary by category class.
 * — Hero+Proof: the two named shots of the capture walk.
 * — Metrics: computed on the DOWNSCALED capture frame. With the two
 *   authorized deps there is no raw pixel access, so the v1 metric is the
 *   downscaled JPEG's bytes-per-pixel — a real, deterministic
 *   detail/exposure proxy (dark or blurred frames compress far smaller).
 *   Richer luminance metrics are a NAMED seam for the slice that brings
 *   pixel access. Voice notes are named in the row but need an audio
 *   dependency this order does not authorize — deferred, journaled ⚠.
 * All strings are CATALOG KEYS — never inline French. Guidance never
 * scolds; it invites (« Rapprochez-vous » class, per the order).
 */

export const CAPTURE_CATEGORIES = ['mode', 'tissus', 'beaute_scellee', 'maison'] as const;
export type CaptureCategory = (typeof CAPTURE_CATEGORIES)[number];

export const SHOT_KINDS = ['hero', 'preuve'] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

/** Category-aware framing guidance (catalog keys). */
const FRAME_KEY: Record<CaptureCategory, Record<ShotKind, string>> = {
  mode: { hero: 'studio.cadre.mode_hero', preuve: 'studio.cadre.mode_preuve' },
  tissus: { hero: 'studio.cadre.tissus_hero', preuve: 'studio.cadre.tissus_preuve' },
  beaute_scellee: { hero: 'studio.cadre.scelle_hero', preuve: 'studio.cadre.scelle_preuve' },
  maison: { hero: 'studio.cadre.maison_hero', preuve: 'studio.cadre.maison_preuve' },
};

export function frameGuideKey(category: CaptureCategory, shot: ShotKind): string {
  return FRAME_KEY[category][shot];
}

/** The downscaled-frame metric (v1): JPEG bytes per pixel. */
export interface FrameMetrics {
  byteLength: number;
  width: number;
  height: number;
}

export function bytesPerPixel(m: FrameMetrics): number {
  const pixels = m.width * m.height;
  return pixels > 0 ? m.byteLength / pixels : 0;
}

/**
 * Deterministic thresholds (v1, CTO defaults — tuned at E4 telemetry like
 * every device budget). Below `retakeAdvice`, the capture is still the
 * seller's to keep: guidance INVITES a retake, never blocks (retake as
 * cheap as confirm — the order).
 */
export const GUIDANCE_THRESHOLDS_V1 = {
  /** Under this, the frame likely lacks light or detail. */
  adviceBelowBpp: 0.55,
} as const;

export type GuidanceVerdict = 'ok' | 'advice';

export function guidanceFor(m: FrameMetrics): { verdict: GuidanceVerdict; key: string } {
  if (bytesPerPixel(m) < GUIDANCE_THRESHOLDS_V1.adviceBelowBpp) {
    return { verdict: 'advice', key: 'studio.conseil.lumiere' };
  }
  return { verdict: 'ok', key: 'studio.conseil.ok' };
}
