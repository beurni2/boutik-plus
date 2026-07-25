/**
 * COMBINED SLICE — HERO CROP GEOMETRY, pure. Canon `ProductAssets` needs
 * heroSquare AND heroVertical; his Studio flow takes ONE hero photograph. The
 * gap closes with two centred crops of that one capture — no fourth shot, no
 * new capture screen, his flow untouched.
 *
 * Geometry only — the render (expo-image-manipulator `crop`) happens in
 * capture.ts through the SAME strip → assertExifFree post-condition path as
 * every other derivative; a crop is a derivative like any other and ships only
 * stripped.
 *
 * THE VERTICAL ASPECT IS 4:5 — MY VALUE, NOT A RULED ONE, flagged in the
 * journal: canon says nothing about hero aspect and no spec names one. 4:5 is
 * the portrait product-card standard and is presentation geometry, not money.
 * If Shop+'s vitrine wants a different vertical, this constant is the one
 * place it changes.
 */

export interface CropRect {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export const HERO_VERTICAL_ASPECT = 4 / 5; // width / height — portrait

/** Centred square: side = the shorter edge, offsets split evenly (floored). */
export function heroSquareCrop(width: number, height: number): CropRect {
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

/**
 * Centred 4:5 portrait. From a LANDSCAPE or square master the height is the
 * limit; from a very TALL master the width is. Both dimensions stay inside the
 * source (never upscaled, never out of bounds) — asserted property-style in
 * tests across odd sizes.
 */
export function heroVerticalCrop(width: number, height: number): CropRect {
  let cropWidth = Math.min(width, Math.floor(height * HERO_VERTICAL_ASPECT));
  let cropHeight = Math.floor(cropWidth / HERO_VERTICAL_ASPECT);
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = Math.floor(cropHeight * HERO_VERTICAL_ASPECT);
  }
  // TOTALITY over exact aspect on degenerate sources: a source too small to
  // carve 4:5 from (integer floors reach 0) yields the whole source instead of
  // a zero-dimension rect the manipulator would throw on. Real captures are
  // megapixels; this branch exists so the function has no crashing input.
  if (cropWidth < 1 || cropHeight < 1) {
    return { originX: 0, originY: 0, width, height };
  }
  return {
    originX: Math.floor((width - cropWidth) / 2),
    originY: Math.floor((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}
