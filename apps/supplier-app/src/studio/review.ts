import { heroSquareCrop, heroVerticalCrop } from './crops';
import { guideForCrop, type GuideRect, type Size } from './viewfinder';
import type { StudioRole } from './pick';

/**
 * STUDIO-REVIEW-1 — THE PURE DECISIONS BEHIND THE REVIEW SCREEN (founder
 * rulings 2026-07-25). Every one of them returns a VALUE, per the standing
 * precedent: *a decision that renders differently should be a function that
 * returns a value, not a shape a test can only describe.*
 *
 * The screen shows ONE image at a time — the one he just picked or shot — with
 * the crop guides drawn on it, and asks: keep it, or choose another.
 */

/** Where the image came from. Decides the SECONDARY action's wording, nothing else. */
export type ShotSource = 'camera' | 'gallery';

/**
 * THE PANE IS DERIVED FROM THE SPACE THAT IS LEFT, NOT FROM A NUMBER
 * (founder ruling, verbatim): *"DERIVE THE PANE FROM THE REMAINING SPACE AFTER
 * CHROME, CAPPED AT THE IMAGE'S NATURAL SIZE, CONTAINED FOR TALL SENSORS."*
 *
 * ONE MECHANISM CLOSES TWO PROBLEMS:
 *   · a footer that wraps to a fourth line costs a few pixels of pane instead of
 *     tipping a static screen into a scroll;
 *   · a 16:9-portrait image contains instead of overflowing, out of the same
 *     code path rather than a branch of its own.
 *
 * **THE NO-OVERHANG GUARANTEE SURVIVES BOTH, AND IT IS A CONSEQUENCE RATHER
 * THAN A SEPARATE PROPERTY** (founder): the scale is uniform in both dimensions
 * in every branch, so the WHOLE image is visible, so any crop inside the image
 * maps inside the pane — trivially, at every aspect. Nothing here defends the
 * guarantee; it cannot be lost without breaking the uniform scale first.
 *
 * THE CAP is what stops a landscape image stretching to fill spare room: a 4:3
 * landscape master takes 360×270 on a 360-wide screen even when 480 are free.
 * Full width at its own aspect is as large as it honestly gets.
 */
export function reviewPaneSize(master: Size, screenWidth: number, availableHeight: number): Size {
  if (master.width <= 0 || master.height <= 0 || screenWidth <= 0 || availableHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const naturalHeight = (screenWidth * master.height) / master.width;
  if (naturalHeight <= availableHeight) return { width: screenWidth, height: naturalHeight };
  // Too tall to fill the width: CONTAIN — height binds, width follows the aspect.
  return { width: (availableHeight * master.width) / master.height, height: availableHeight };
}

/** One guide to draw, named — so the screen picks its weight from a VALUE, not an index. */
export interface ReviewGuide {
  readonly kind: 'square' | 'vertical';
  readonly rect: GuideRect;
}

/**
 * WHICH GUIDES THIS ROLE GETS — and for two of the three roles the answer is
 * NONE. **This corrects a founder ruling against canon, and the correction is
 * the point of the function.**
 *
 * Canon `ProductAssets` carries `heroSquare`, `heroVertical`, `proof` and
 * `detail[]`; only the HERO master is cropped (`studio-real.tsx`, two
 * `renderCropDerivative` calls on the hero alone). The proof and detail images
 * upload WHOLE. **A guide drawn on a proof would claim a cropping that does not
 * happen** — the exact lie this body of work exists to remove.
 *
 * Both hero guides nest concentrically at every aspect, and both always fit,
 * because the pane above always shows the whole image at uniform scale.
 */
export function reviewGuides(role: StudioRole, master: Size, pane: Size): readonly ReviewGuide[] {
  if (role !== 'hero') return [];
  return [
    { kind: 'square', rect: guideForCrop(heroSquareCrop(master.width, master.height), master, pane) },
    { kind: 'vertical', rect: guideForCrop(heroVerticalCrop(master.width, master.height), master, pane) },
  ];
}

/** The role's title. A catalog KEY, never a sentence assembled here. */
export function roleTitleKey(role: StudioRole): string {
  switch (role) {
    case 'hero':
      return 'studio.role_hero';
    case 'preuve':
      return 'studio.role_preuve';
    case 'detail':
      return 'studio.role_detail';
  }
}

/**
 * THE SECONDARY ACTION, WORDED FOR THE SOURCE — both labels are kept on
 * purpose. « Reprendre » on a library photograph asks him to re-take something
 * he never took; « Choisir une autre » on a fresh capture points at a library
 * he is not standing in.
 */
export function secondaryActionKey(source: ShotSource): string {
  return source === 'camera' ? 'studio.reprendre' : 'studio.choisir_autre';
}

/**
 * BANK ONE KEPT PHOTOGRAPH, in role order.
 *
 * The prefix up to this slot, plus this one — so **« choisir une autre » at
 * slot 2 never loses slots 0 and 1**, and re-keeping an earlier slot truncates
 * the suffix rather than leaving a stale photograph behind it. Extracted as a
 * value because the alternative is a test that can only describe the array
 * surgery inside a component.
 *
 * **NOTHING IS BANKED BEFORE HE KEEPS IT.** A photograph he is still looking at
 * lives in the phase, not here; abandoning mid-sequence therefore hands the
 * publish path nothing at all, which is the honest empty (`assetRefs: []`)
 * rather than a partial set.
 */
export function keptAfter<T>(kept: readonly T[], slot: number, shot: T): readonly T[] {
  return [...kept.slice(0, slot), shot];
}
