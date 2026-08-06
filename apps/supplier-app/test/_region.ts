/**
 * AUDIT-B+1 F25 — THE REGION-EXTRACTION CENSUS: 11 of 19 source-text pins were
 * bounded in a way that did not hold.
 *
 * Every one of these tests asks "does THIS function do THIS thing?" by slicing
 * a region out of the source and asserting over it. The assertions are real;
 * the BOUNDS were not, and three failure shapes recurred:
 *
 *   1. `src.slice(src.indexOf(start))` — no end at all. The region runs to
 *      end-of-file, so a string sitting in ANY later helper satisfies the pin
 *      while the function it names does nothing. Measured on
 *      `src/supply/media.ts`: revokeImage to EOF is 3625 chars, but the method
 *      itself is 2759 — 866 chars (24%) were borrowed from below, which is how
 *      « revokeImage sends the revoke credential » stayed green when
 *      revokeImage sent nothing.
 *
 *   2. `src.indexOf(end)` searched from ZERO instead of from the start anchor.
 *      If that string also occurs earlier in the file, `end < start` and the
 *      slice is the EMPTY STRING — every `expect(region).toContain(…)` then
 *      passes vacuously against ''. (The audit caught this live at
 *      authoring-screen.test.ts; it does not reproduce at HEAD because the file
 *      moved, which is precisely why it needs a guard rather than luck.)
 *
 *   3. `src.slice(start, start + 2800)` — a character budget. Code grows; the
 *      budget does not. Measured at 24% unchecked on a money invariant (F6).
 *
 * `bloc` closes all three: the end is searched only AFTER the start, both
 * anchors must exist, and the result must be non-trivial. A pin whose anchors
 * have drifted now FAILS LOUDLY instead of asserting over the wrong text or
 * over nothing at all.
 *
 * The one idiom that makes an unbounded region safe is a COUNT constraint
 * (`expect(region.match(/ok: true/g)).toHaveLength(1)`), proven by the audit
 * side by side. Where a count is what the test means, keep the count — this
 * helper is for the far more common case of "assert something is inside this
 * function".
 */

export function bloc(source: string, debut: string, fin: string, plancher = 40): string {
  const a = source.indexOf(debut);
  if (a < 0) {
    throw new Error(`region: START anchor absent — « ${debut} ». The pin is watching nothing.`);
  }
  // Searched from AFTER the start anchor: an earlier occurrence must never
  // become the end, or the region silently collapses to ''.
  const b = source.indexOf(fin, a + debut.length);
  if (b < 0) {
    throw new Error(
      `region: END anchor « ${fin} » does not occur after « ${debut} ». ` +
        'Without this guard the slice would run to end-of-file and borrow from later helpers.',
    );
  }
  const region = source.slice(a, b);
  if (region.length < plancher) {
    throw new Error(
      `region collapsed to ${region.length} chars (floor ${plancher}) between « ${debut} » and « ${fin} » — ` +
        'every assertion over it would pass vacuously.',
    );
  }
  return region;
}
