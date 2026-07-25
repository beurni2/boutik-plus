import { describe, expect, it } from 'vitest';
import { coverScale, fullWidthPreviewSize, guideForCrop, verticalCropSpansWidth, visibleMasterRegion } from '../src/studio/viewfinder';
import { heroSquareCrop, heroVerticalCrop } from '../src/studio/crops';

/**
 * STUDIO-VIEWFINDER-1 — the crop guide, asserted BY VALUE across sensor and
 * screen aspect pairs (founder ruling item 6, and the standing rule: a proof
 * about call structure cannot catch a defect about arguments).
 *
 * The defect under guard: a guide derived from the PREVIEW's own rect instead
 * of from the master's crop mapped through the cover transform. That is the
 * crop-space defect in a new coordinate space, and it is invisible whenever the
 * two aspects happen to match — which is why every case below uses aspects that
 * DO NOT match.
 */

const D17 = { width: 360, height: 800 };      // the reference device (PERF-BUDGETS)
const SENSOR_43 = { width: 4000, height: 3000 };  // landscape 4:3, the common camera master
const SENSOR_34 = { width: 3000, height: 4000 };  // portrait 3:4

describe('the cover transform — what a full-bleed preview actually shows', () => {
  it('D17 with a 4:3 sensor shows only about a THIRD of the sensor width', () => {
    const scale = coverScale(SENSOR_43, D17);
    expect(scale).toBeCloseTo(800 / 3000, 6); // height-bound: 0.2667
    const visible = visibleMasterRegion(SENSOR_43, D17);
    expect(visible.height).toBeCloseTo(3000, 6);      // the full sensor height
    expect(visible.width).toBeCloseTo(1350, 6);       // but only 1350 of 4000 px wide
    expect(visible.width / SENSOR_43.width).toBeLessThan(0.35);
    // and it is CENTRED — equal margins discarded left and right
    expect(visible.originX).toBeCloseTo((4000 - 1350) / 2, 6);
    expect(visible.originY).toBeCloseTo(0, 6);
  });

  it('the visible region never claims more than the master has', () => {
    for (const master of [SENSOR_43, SENSOR_34, { width: 100, height: 100 }, { width: 4032, height: 3024 }]) {
      const v = visibleMasterRegion(master, D17);
      expect(v.width).toBeLessThanOrEqual(master.width + 1e-9);
      expect(v.height).toBeLessThanOrEqual(master.height + 1e-9);
      expect(v.originX).toBeGreaterThanOrEqual(-1e-9);
      expect(v.originY).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('a degenerate master yields a zero transform rather than NaN or Infinity', () => {
    expect(coverScale({ width: 0, height: 0 }, D17)).toBe(0);
    const g = guideForCrop({ originX: 0, originY: 0, width: 10, height: 10 }, { width: 0, height: 0 }, D17);
    expect(Number.isFinite(g.width)).toBe(true);
    expect(g.fitsInPreview).toBe(false); // never claim a guide we cannot compute
  });
});

describe('THE GUIDE IS THE CROP, MAPPED — not the preview’s own rect', () => {
  it('D17 + 4:3 sensor: the SQUARE hero does NOT fit on screen, and that is reported, not hidden', () => {
    const crop = heroSquareCrop(SENSOR_43.width, SENSOR_43.height); // 3000×3000 centred
    const g = guideForCrop(crop, SENSOR_43, D17);
    // 3000 master px × 0.2667 = 800 preview px, on a 360-wide screen
    expect(g.width).toBeCloseTo(800, 6);
    expect(g.height).toBeCloseTo(800, 6);
    expect(g.fitsInPreview).toBe(false);
    // it overhangs EQUALLY on both sides — the crop is centred, the preview is centred
    expect(g.originX).toBeCloseTo((360 - 800) / 2, 6); // -220
    expect(g.originX + g.width).toBeCloseTo(360 + 220, 6);
    // THE CONSEQUENCE, asserted: the square keeps master pixels the preview never showed
    const visible = visibleMasterRegion(SENSOR_43, D17);
    expect(crop.width).toBeGreaterThan(visible.width);
  });

  it('D17 + 4:3 sensor: the 4:5 VERTICAL hero also overhangs — 640 preview px wide on a 360 screen', () => {
    const crop = heroVerticalCrop(SENSOR_43.width, SENSOR_43.height); // 2400×3000
    const g = guideForCrop(crop, SENSOR_43, D17);
    expect(g.width).toBeCloseTo(2400 * (800 / 3000), 6); // 640
    expect(g.height).toBeCloseTo(800, 6);
    expect(g.fitsInPreview).toBe(false);
  });

  it('A PORTRAIT SENSOR DOES NOT RESCUE IT — 600 preview px on a 360 screen, still overhanging', () => {
    // I expected this one to fit and it does not; the measured numbers are the
    // finding, not my estimate of them. 3:4 master, 9:20 screen → scale 0.2,
    // the preview shows 1800 of 3000 master px wide, and the 4:5 crop is the
    // full 3000 wide.
    const crop = heroVerticalCrop(SENSOR_34.width, SENSOR_34.height); // 3000×3750
    const g = guideForCrop(crop, SENSOR_34, D17);
    expect(g.width).toBeCloseTo(600, 6);
    expect(g.fitsInPreview).toBe(false);
    // BOTH crops overhang on BOTH sensor orientations at 360×800. A full-bleed
    // viewfinder on this device cannot show the whole hero region at all.
    const sq = guideForCrop(heroSquareCrop(SENSOR_34.width, SENSOR_34.height), SENSOR_34, D17);
    expect(sq.width).toBeCloseTo(600, 6);
    expect(sq.fitsInPreview).toBe(false);
  });

  it('THE SAME CROP MAPS DIFFERENTLY FOR DIFFERENT SENSORS — the guide cannot be a constant', () => {
    const rect = { originX: 100, originY: 100, width: 1000, height: 1000 };
    const a = guideForCrop(rect, SENSOR_43, D17);
    const b = guideForCrop(rect, SENSOR_34, D17);
    expect(a.width).not.toBeCloseTo(b.width, 3);
    expect(a.originX).not.toBeCloseTo(b.originX, 3);
    // a fixed decorative inset (what C39 draws today) would be identical for both
  });

  it('WHEN THE ASPECTS MATCH the mapping is the identity scale — the case that hides the defect', () => {
    // a 9:20 "sensor" on a 9:20 screen: nothing is cropped by the preview
    const matched = { width: 1080, height: 2400 };
    const visible = visibleMasterRegion(matched, D17);
    expect(visible.width).toBeCloseTo(1080, 6);
    expect(visible.height).toBeCloseTo(2400, 6);
    // and THIS is the only shape that fits: a sensor whose aspect already
    // matches the screen. The real hero crops of it land exactly on 360.
    const g = guideForCrop(heroVerticalCrop(matched.width, matched.height), matched, D17);
    expect(g.originX).toBeCloseTo(0, 6);
    expect(g.width).toBeCloseTo(360, 6);
    expect(g.fitsInPreview).toBe(true);
    // NAMED so nobody later "simplifies" the mapping on the strength of this case
  });

  it('property: across many sensor/screen pairs the guide is finite, and fitsInPreview agrees with the numbers', () => {
    const masters = [SENSOR_43, SENSOR_34, { width: 4032, height: 3024 }, { width: 1920, height: 1080 }, { width: 2000, height: 2000 }];
    const screens = [D17, { width: 402, height: 874 }, { width: 320, height: 640 }, { width: 411, height: 914 }];
    for (const m of masters) {
      for (const s of screens) {
        for (const crop of [heroSquareCrop(m.width, m.height), heroVerticalCrop(m.width, m.height)]) {
          const g = guideForCrop(crop, m, s);
          const label = `${m.width}x${m.height} → ${s.width}x${s.height}`;
          expect(Number.isFinite(g.originX), label).toBe(true);
          expect(Number.isFinite(g.width), label).toBe(true);
          expect(g.width, label).toBeGreaterThan(0);
          // the flag must MATCH the geometry, not be set independently
          const E = 0.5;
          const reallyFits =
            g.originX >= -E && g.originY >= -E &&
            g.originX + g.width <= s.width + E && g.originY + g.height <= s.height + E;
          expect(g.fitsInPreview, label).toBe(reallyFits);
        }
      }
    }
  });
});

describe('FILL THE WIDTH — asserted as PROPERTIES over a range of aspects, not a device table', () => {
  /**
   * Founder ruling + founder instruction: « A property that holds for every
   * portrait sensor is worth more than three passing rows, and it tells the next
   * reader why rather than that. »
   *
   * The aspects below are swept, not enumerated from devices we own: 1.00 (square)
   * through 2.00 (tall 18:9), in steps, so the 5:4 boundary is crossed from both
   * sides by cases nobody chose by hand.
   */
  const SCREEN_W = 360;
  const ASPECTS: number[] = [];
  for (let a = 1.0; a <= 2.0001; a += 0.02) ASPECTS.push(Number(a.toFixed(4)));
  const sensorAt = (aspect: number) => ({ width: 3000, height: Math.round(3000 * aspect) });

  it('PROPERTY — the preview shows the ENTIRE sensor: the scale is uniform in both dimensions', () => {
    for (const a of ASPECTS) {
      const m = sensorAt(a);
      const p = fullWidthPreviewSize(m, SCREEN_W);
      // both candidate scales agree, so `cover` crops nothing
      expect(p.width / m.width, `aspect ${a}`).toBeCloseTo(p.height / m.height, 9);
      expect(coverScale(m, p), `aspect ${a}`).toBeCloseTo(SCREEN_W / m.width, 9);
      const visible = visibleMasterRegion(m, p);
      expect(visible.width, `aspect ${a}`).toBeCloseTo(m.width, 6);
      expect(visible.height, `aspect ${a}`).toBeCloseTo(m.height, 6);
      expect(visible.originX, `aspect ${a}`).toBeCloseTo(0, 6);
    }
  });

  it('PROPERTY — the SQUARE hero guide is EXACTLY the screen width, for every portrait sensor', () => {
    // BY CONSTRUCTION, and this is the reason: for a portrait sensor the square
    // crop's side IS the sensor width, so scaling the sensor to the screen width
    // scales the crop to the screen width too. Nothing about 4:3 is involved.
    for (const a of ASPECTS) {
      const m = sensorAt(a);
      const p = fullWidthPreviewSize(m, SCREEN_W);
      const g = guideForCrop(heroSquareCrop(m.width, m.height), m, p);
      expect(g.width, `aspect ${a}`).toBeCloseTo(SCREEN_W, 6);
      expect(g.originX, `aspect ${a}`).toBeCloseTo(0, 6);
      expect(g.fitsInPreview, `aspect ${a}`).toBe(true);
    }
  });

  it('PROPERTY — NOTHING OVERHANGS at any aspect: a crop inside the sensor maps inside the preview', () => {
    // the structural guarantee, and it is stronger than either hero crop:
    // whole sensor visible at uniform scale ⇒ any in-bounds crop is in-bounds.
    for (const a of ASPECTS) {
      const m = sensorAt(a);
      const p = fullWidthPreviewSize(m, SCREEN_W);
      for (const crop of [heroSquareCrop(m.width, m.height), heroVerticalCrop(m.width, m.height)]) {
        expect(guideForCrop(crop, m, p).fitsInPreview, `aspect ${a} crop ${crop.width}x${crop.height}`).toBe(true);
      }
      // and an arbitrary in-bounds rect, not just the two hero crops
      const arbitrary = { originX: 10, originY: 20, width: m.width - 20, height: m.height - 40 };
      expect(guideForCrop(arbitrary, m, p).fitsInPreview, `aspect ${a} arbitrary`).toBe(true);
    }
  });

  it('THE 5:4 BOUNDARY GOVERNS SPANNING, NOT FITTING — corrected from the order, with the numbers', () => {
    for (const a of ASPECTS) {
      const m = sensorAt(a);
      const p = fullWidthPreviewSize(m, SCREEN_W);
      const g = guideForCrop(heroVerticalCrop(m.width, m.height), m, p);
      const spans = verticalCropSpansWidth(m);
      expect(spans, `aspect ${a}`).toBe(a >= 1.25 - 1e-9);
      // it ALWAYS fits …
      expect(g.fitsInPreview, `aspect ${a}`).toBe(true);
      // … and SPANS only at or above 5:4. Below it the guide is inset, never off-edge.
      if (spans) expect(g.width, `aspect ${a}`).toBeCloseTo(SCREEN_W, 0);
      else expect(g.width, `aspect ${a}`).toBeLessThan(SCREEN_W);
    }
  });

  it('the measured inset below the boundary — the state the screen must design for', () => {
    const cases: [number, number][] = [[1.0, 288], [1.0667, 307.2], [1.2, 345.6]];
    for (const [aspect, expected] of cases) {
      const m = { width: 3000, height: Math.round(3000 * aspect) };
      const p = fullWidthPreviewSize(m, SCREEN_W);
      const g = guideForCrop(heroVerticalCrop(m.width, m.height), m, p);
      expect(g.width, `aspect ${aspect}`).toBeCloseTo(expected, 0);
      expect(g.originX, `aspect ${aspect}`).toBeGreaterThan(0); // centred, inset both sides
    }
  });

  it('D17 + 4:3 — the ruled configuration, stated as the numbers he will see', () => {
    const m = { width: 3000, height: 4000 }; // 4:3 portrait
    const p = fullWidthPreviewSize(m, SCREEN_W);
    expect(p).toEqual({ width: 360, height: 480 });          // the ruled preview
    const sq = guideForCrop(heroSquareCrop(m.width, m.height), m, p);
    const vt = guideForCrop(heroVerticalCrop(m.width, m.height), m, p);
    expect([sq.width, sq.height]).toEqual([360, 360]);
    expect([vt.width, vt.height]).toEqual([360, 450]);
    expect(sq.fitsInPreview && vt.fitsInPreview).toBe(true);
    // and it more than doubles the old card: C21.viseur.h was 230
    expect(p.height).toBeGreaterThan(230 * 2);
  });
});
