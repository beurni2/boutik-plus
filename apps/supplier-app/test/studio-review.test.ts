import { describe, expect, it } from 'vitest';
import {
  keptAfter,
  reviewGuides,
  reviewPaneSize,
  roleTitleKey,
  secondaryActionKey,
} from '../src/studio/review';
import { fullWidthPreviewSize } from '../src/studio/viewfinder';
import { t } from '../src/i18n';
import { C39, C39G } from '../src/ui/v2/styles';
import type { StudioRole } from '../src/studio/pick';

/**
 * STUDIO-REVIEW-1 — the pure decisions.
 *
 * **THE HEADLINE PROPERTY IS THE DERIVATION, NOT A NUMBER** (founder ruling):
 * *"A test pinning 480 would pass on a screen that scrolls; a test asserting the
 * pane never exceeds remaining-chrome space, across footer heights and sensor
 * aspects, is the one that catches the defect."* So the pane is swept over both
 * axes at once and never checked against a constant.
 */

const D17 = { width: 360, height: 800 };

/** Sensor aspects a phone can hand back, portrait and landscape, incl. the awkward ones. */
const ASPECTS: number[] = [];
for (let a = 0.5; a <= 2.0001; a += 0.05) ASPECTS.push(Math.round(a * 10000) / 10000);

/** The chrome around the pane, at footer wraps from two lines to five. */
const CHROME_WITHOUT_FOOTER = 16 + 40 + 14 + 24 + 13 + 12 + 54 + 10 + 46 + 14 + 16;
const FOOTER_HEIGHTS = [2, 3, 4, 5].map((lines) => lines * 12.5 * 1.55);

describe('THE PANE IS DERIVED FROM WHAT IS LEFT — swept over footer heights AND sensor aspects', () => {
  it('NEVER exceeds the remaining space, at any aspect, at any footer height', () => {
    for (const footer of FOOTER_HEIGHTS) {
      const available = D17.height - (CHROME_WITHOUT_FOOTER + footer);
      for (const a of ASPECTS) {
        const master = { width: 1000, height: Math.round(1000 * a) };
        const pane = reviewPaneSize(master, D17.width, available);
        expect(pane.height).toBeLessThanOrEqual(available + 1e-9);
        expect(pane.width).toBeLessThanOrEqual(D17.width + 1e-9);
      }
    }
  });

  it('SO THE SCREEN NEVER SCROLLS — chrome plus pane fits the window in every swept case', () => {
    for (const footer of FOOTER_HEIGHTS) {
      const chrome = CHROME_WITHOUT_FOOTER + footer;
      const available = D17.height - chrome;
      for (const a of ASPECTS) {
        const master = { width: 1000, height: Math.round(1000 * a) };
        expect(chrome + reviewPaneSize(master, D17.width, available).height)
          .toBeLessThanOrEqual(D17.height + 1e-9);
      }
    }
  });

  it('a FOURTH footer line costs PANE, not a scroll — the whole point of the mechanism', () => {
    const master = { width: 3000, height: 4000 }; // 4:3 portrait, the tight case
    const three = D17.height - (CHROME_WITHOUT_FOOTER + FOOTER_HEIGHTS[1]!);
    const four = D17.height - (CHROME_WITHOUT_FOOTER + FOOTER_HEIGHTS[2]!);
    const paneThree = reviewPaneSize(master, D17.width, three);
    const paneFour = reviewPaneSize(master, D17.width, four);
    expect(paneFour.height).toBeLessThan(paneThree.height); // it gave up pixels
    expect(paneFour.height).toBeLessThanOrEqual(four); // and stayed inside the window
  });

  it('THE ASPECT IS PRESERVED in both branches — contained or not, never stretched', () => {
    for (const available of [200, 489, 900]) {
      for (const a of ASPECTS) {
        const master = { width: 1000, height: Math.round(1000 * a) };
        const pane = reviewPaneSize(master, D17.width, available);
        expect(pane.width / pane.height).toBeCloseTo(master.width / master.height, 6);
      }
    }
  });

  it('THE CAP HOLDS: spare room does NOT stretch a landscape image beyond its natural full width', () => {
    const landscape = { width: 4000, height: 3000 };
    const roomy = reviewPaneSize(landscape, D17.width, 700);
    expect(roomy).toEqual(fullWidthPreviewSize(landscape, D17.width)); // 360x270, not 360x700
    expect(roomy.height).toBeCloseTo(270, 6);
  });

  it('when the natural size FITS, the pane IS the natural size — the fill-the-width ruling, unchanged', () => {
    for (const a of ASPECTS) {
      const master = { width: 1000, height: Math.round(1000 * a) };
      const natural = fullWidthPreviewSize(master, D17.width);
      const pane = reviewPaneSize(master, D17.width, natural.height + 50);
      expect(pane.width).toBeCloseTo(natural.width, 6);
      expect(pane.height).toBeCloseTo(natural.height, 6);
    }
  });

  it('the 16:9-portrait case CONTAINS rather than overflowing — from the same code path, no branch of its own', () => {
    const tall = { width: 1080, height: 1920 };
    const pane = reviewPaneSize(tall, D17.width, 489);
    expect(pane.height).toBeCloseTo(489, 6);
    expect(pane.width).toBeCloseTo(275.06, 1); // inset ~42 each side
    expect(pane.width).toBeLessThan(D17.width);
  });

  it('degenerate inputs yield a zero pane rather than a crash or a NaN', () => {
    for (const bad of [
      [{ width: 0, height: 0 }, 360, 489],
      [{ width: 100, height: 100 }, 0, 489],
      [{ width: 100, height: 100 }, 360, 0],
    ] as const) {
      const out = reviewPaneSize(bad[0], bad[1], bad[2]);
      expect(out).toEqual({ width: 0, height: 0 });
    }
  });
});

describe('NO GUIDE CAN OVERHANG — a consequence of whole-image visibility, not a defended property', () => {
  it('both hero guides land inside the pane at EVERY swept aspect, contained or not', () => {
    for (const available of [200, 489, 900]) {
      for (const a of ASPECTS) {
        const master = { width: 1000, height: Math.round(1000 * a) };
        const pane = reviewPaneSize(master, D17.width, available);
        const guides = reviewGuides('hero', master, pane);
        expect(guides).toHaveLength(2);
        for (const g of guides) {
          expect(g.rect.fitsInPreview).toBe(true);
          expect(g.rect.originX).toBeGreaterThanOrEqual(-0.5);
          expect(g.rect.originY).toBeGreaterThanOrEqual(-0.5);
          expect(g.rect.originX + g.rect.width).toBeLessThanOrEqual(pane.width + 0.5);
          expect(g.rect.originY + g.rect.height).toBeLessThanOrEqual(pane.height + 0.5);
        }
      }
    }
  });

  it('the two guides NEST CONCENTRICALLY — same centre, one never beside the other', () => {
    for (const a of ASPECTS) {
      const master = { width: 1000, height: Math.round(1000 * a) };
      const pane = reviewPaneSize(master, D17.width, 489);
      const guides = reviewGuides('hero', master, pane);
      const square = guides[0]!;
      const vertical = guides[1]!;
      const centre = (r: { originX: number; width: number }) => r.originX + r.width / 2;
      const middle = (r: { originY: number; height: number }) => r.originY + r.height / 2;
      expect(centre(square.rect)).toBeCloseTo(centre(vertical.rect), 4);
      expect(middle(square.rect)).toBeCloseTo(middle(vertical.rect), 4);
    }
  });

  it('the guides are NAMED, so the screen picks its weight from a value and not an array index', () => {
    const master = { width: 3000, height: 4000 };
    const pane = reviewPaneSize(master, D17.width, 489);
    expect(reviewGuides('hero', master, pane).map((g) => g.kind)).toEqual(['square', 'vertical']);
  });
});

describe('GUIDES ON THE HERO ONLY — proof and detail are uploaded WHOLE', () => {
  it('the proof review draws NO guide — a guide there would claim a crop that never happens', () => {
    const master = { width: 3000, height: 4000 };
    const pane = reviewPaneSize(master, D17.width, 489);
    expect(reviewGuides('preuve', master, pane)).toEqual([]);
  });

  it('the detail review draws NO guide either', () => {
    const master = { width: 4000, height: 3000 };
    const pane = reviewPaneSize(master, D17.width, 489);
    expect(reviewGuides('detail', master, pane)).toEqual([]);
  });

  it('and the HERO still does — the distinction is real, not an accidental empty', () => {
    const master = { width: 3000, height: 4000 };
    const pane = reviewPaneSize(master, D17.width, 489);
    expect(reviewGuides('hero', master, pane).length).toBe(2);
  });
});

describe('THE STRINGS — every role and every source resolves to real catalog copy', () => {
  it('each role has a title key, and each key is IN the catalog', () => {
    for (const role of ['hero', 'preuve', 'detail'] as StudioRole[]) {
      const key = roleTitleKey(role);
      expect(() => t(key)).not.toThrow();
      expect(t(key).length).toBeGreaterThan(0);
    }
  });

  it('the three role titles are DISTINCT — a copy edit that collapses two would be caught here', () => {
    const titles = (['hero', 'preuve', 'detail'] as StudioRole[]).map((r) => t(roleTitleKey(r)));
    expect(new Set(titles).size).toBe(3);
  });

  it('the secondary action is worded for the SOURCE, and the two differ', () => {
    expect(secondaryActionKey('camera')).toBe('studio.reprendre');
    expect(secondaryActionKey('gallery')).toBe('studio.choisir_autre');
    expect(t(secondaryActionKey('camera'))).not.toBe(t(secondaryActionKey('gallery')));
  });

  it('the gallery label does NOT say « reprendre » — he never took the photo he picked', () => {
    expect(t(secondaryActionKey('gallery')).toLowerCase()).not.toContain('reprend');
  });

  it('the reused strings this screen depends on are all present', () => {
    for (const key of ['studio.apercu', 'studio.confirmer', 'studio.honnete_original', 'studio.honnete_ia']) {
      expect(() => t(key)).not.toThrow();
    }
  });

  it('the footer states BOTH truths — access rather than authenticity, and the original kept', () => {
    const footer = t('studio.honnete_original');
    expect(footer).toContain("l'accès au produit");
    expect(footer).toContain("pas l'authenticité");
    expect(footer).toContain('jamais remplacée');
  });
});

describe('THE GUIDE STYLES — the composed sibling is DERIVED from the planche one, not retyped', () => {
  it('the SQUARE guide is planche 446 verbatim — same border as C39.inset, only the rect changes', () => {
    expect(C39G.square.borderWidth).toBe(C39.inset.borderWidth);
    expect(C39G.square.borderColor).toBe(C39.inset.borderColor);
    expect(C39G.square.borderStyle).toBe(C39.inset.borderStyle);
    expect(C39G.square.borderRadius).toBe(C39.inset.borderRadius);
  });

  it('the VERTICAL guide (divergence D-1) shares the cream and the radius BY REFERENCE — a hand-copied value would drift', () => {
    expect(C39G.vertical.borderColor).toBe(C39.inset.borderColor);
    expect(C39G.vertical.borderRadius).toBe(C39.inset.borderRadius);
  });

  it('and differs ONLY in weight and style, so the pair reads as primary + secondary', () => {
    expect(C39G.vertical.borderWidth).toBeLessThan(C39G.square.borderWidth);
    expect(C39G.square.borderStyle).toBe('dashed');
    expect(C39G.vertical.borderStyle).toBe('solid');
  });
});

describe('BANKING A KEPT PHOTOGRAPH — what survives « choisir une autre », and what an abandon leaves', () => {
  it('keeps accumulate in role order', () => {
    let kept: readonly string[] = [];
    kept = keptAfter(kept, 0, 'hero');
    kept = keptAfter(kept, 1, 'preuve');
    kept = keptAfter(kept, 2, 'detail');
    expect(kept).toEqual(['hero', 'preuve', 'detail']);
  });

  it('« choisir une autre » at slot 2 does NOT lose slots 0 and 1 — the whole point of banking on keep', () => {
    const kept = keptAfter(keptAfter(keptAfter([], 0, 'hero'), 1, 'preuve'), 2, 'detail-A');
    expect(keptAfter(kept, 2, 'detail-B')).toEqual(['hero', 'preuve', 'detail-B']);
  });

  it('re-keeping an EARLIER slot truncates the suffix — never leaves a stale photograph behind it', () => {
    const kept = ['hero-A', 'preuve', 'detail'];
    expect(keptAfter(kept, 0, 'hero-B')).toEqual(['hero-B']);
  });

  it('it never mutates the array it was given — the ref is replaced, not edited under React', () => {
    const kept = ['hero'];
    keptAfter(kept, 1, 'preuve');
    expect(kept).toEqual(['hero']);
  });

  it('ABANDONING MID-SEQUENCE BANKS A SHORT LIST, and a short list is never a capture set', () => {
    // two reviewed and kept, the third never taken
    const kept = keptAfter(keptAfter([], 0, 'hero'), 1, 'preuve');
    expect(kept).toHaveLength(2);
    // the flow only builds a CaptureSet from three; two cannot fill hero+proof+detail
    expect(kept.length).toBeLessThan(3);
  });
});
