import type { CropRect } from './crops';

/**
 * STUDIO-VIEWFINDER-1 — WHERE THE CROP GUIDE GOES ON A FULL-BLEED PREVIEW
 * (founder rulings 2026-07-25, items 5 and 6).
 *
 * THE DEFECT THIS EXISTS TO PREVENT is the crop-space defect wearing a new hat.
 * Crops are computed in MASTER space — `heroSquareCrop(master.width,
 * master.height)` — because that was the fix for the last one. A guide drawn
 * from the PREVIEW's own rect describes a different region, because the preview
 * and the master do not share an aspect ratio: `takePictureAsync` returns the
 * SENSOR image (typically 4:3), while a full-bleed preview is whatever the
 * window is (9:19.5 on a modern phone, 360×800 on D17).
 *
 * So the mapping below is the whole point: master-space rect IN, preview-space
 * rect OUT, through the same cover transform the preview itself uses.
 *
 * THE COVER TRANSFORM. A full-bleed preview fills the window and crops the
 * overflow — it never letterboxes. So the preview shows a CENTRED SUB-REGION of
 * the sensor, scaled by `max(pw/mw, ph/mh)`.
 *
 * **AND THAT SUB-REGION CAN BE MUCH SMALLER THAN THE SENSOR.** On D17 (360×800)
 * with a 4:3 sensor the preview shows about a THIRD of the sensor's width. The
 * square hero crop is the full sensor height — which maps to roughly 800
 * preview-pixels wide on a 360-wide screen. **The hero square therefore contains
 * a great deal he never saw, and the guide for it does not fit on the screen.**
 * `guideFits` reports that rather than hiding it; the screen is expected to say
 * so in words rather than draw a rectangle that lies by being clipped.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A guide rectangle in PREVIEW (screen) coordinates. May extend off-screen. */
export interface GuideRect {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  /**
   * FALSE when the mapped rect extends beyond the preview — i.e. the crop keeps
   * pixels the viewfinder never showed him. Not a rendering hint: a TRUTH the
   * screen must state, because a clipped guide silently claims the crop stops
   * where the screen does.
   */
  readonly fitsInPreview: boolean;
}

/**
 * The scale the preview applies to the master to FILL the window (cover).
 * Exported because the guide and any future overlay must share one transform —
 * two derivations of the same number is how the spaces drift apart again.
 */
export function coverScale(master: Size, preview: Size): number {
  if (master.width <= 0 || master.height <= 0) return 0;
  return Math.max(preview.width / master.width, preview.height / master.height);
}

/** The sub-region of the master the full-bleed preview actually shows, in MASTER pixels. */
export function visibleMasterRegion(master: Size, preview: Size): CropRect {
  const scale = coverScale(master, preview);
  if (scale <= 0) return { originX: 0, originY: 0, width: 0, height: 0 };
  const visibleW = Math.min(master.width, preview.width / scale);
  const visibleH = Math.min(master.height, preview.height / scale);
  return {
    originX: (master.width - visibleW) / 2,
    originY: (master.height - visibleH) / 2,
    width: visibleW,
    height: visibleH,
  };
}

/**
 * MAP A MASTER-SPACE CROP INTO PREVIEW SPACE. The one function the guide is
 * allowed to come from.
 *
 * Returns the rect in screen coordinates plus `fitsInPreview`. The caller does
 * NOT clamp silently: an off-screen guide means the crop reaches past the
 * viewfinder, and that is the fact worth telling him.
 */
export function guideForCrop(crop: CropRect, master: Size, preview: Size): GuideRect {
  const scale = coverScale(master, preview);
  if (scale <= 0) return { originX: 0, originY: 0, width: 0, height: 0, fitsInPreview: false };
  const visible = visibleMasterRegion(master, preview);
  const originX = (crop.originX - visible.originX) * scale;
  const originY = (crop.originY - visible.originY) * scale;
  const width = crop.width * scale;
  const height = crop.height * scale;
  // Half-pixel tolerance: a rect that lands exactly on the edge fits.
  const E = 0.5;
  const fitsInPreview =
    originX >= -E && originY >= -E &&
    originX + width <= preview.width + E &&
    originY + height <= preview.height + E;
  return { originX, originY, width, height, fitsInPreview };
}
