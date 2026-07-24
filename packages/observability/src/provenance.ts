/**
 * SERVICE-PROVENANCE-1 — the DEPLOY-FRESHNESS STAMP.
 *
 * WHY THIS EXISTS (a real defect, twice): the workspace-override bump law
 * enforces lockstep ACROSS REPOS AT MERGE TIME. Nothing covered drift between a
 * merged repo and its DEPLOYED ARTIFACT, and the two are independently versioned.
 * The live offer-service was found still emitting the five-field SupplyProjection
 * while canon, this repo and shop-plus's consumer were all at 2.0.0 — caught only
 * by reading the deployed bundle out of the Cloudflare API by hand.
 *
 * WHY BOTH FIELDS, AND WHY `canon` IS THE ONE THAT MATTERS: `release` (the git
 * sha) says WHICH BUILD is running. `canon` (the pinned @platform/contracts
 * version) says WHICH WIRE SHAPE it speaks. **A sha alone would NOT have caught
 * that defect** — it would have shown an unfamiliar hash and told nobody the wire
 * shape was stale. `canon` makes the skew legible without a lookup.
 *
 * HOW THE VALUES ARRIVE: injected at BUNDLE time by esbuild `--define`, from the
 * deploy workflow (`BOUTIK_RELEASE` = the commit sha, `BOUTIK_CANON` = the
 * installed contracts version). Bare identifiers with a `typeof` guard, because
 * that is exactly what `--define` substitutes; anywhere the define did not run
 * (local dev, CI tests, an unbundled import) `typeof` on an undeclared identifier
 * is safe and both fall back to `UNSTAMPED`.
 *
 * HONEST LIMITS — this is a STAMP, NOT A GUARANTEE:
 *   · It reports what the bundle was BUILT FROM. It detects staleness and version
 *     skew; it cannot detect a bundle altered after build.
 *   · It cannot fire on its own. Something — a person or a scheduled check — must
 *     READ it. It closes the "nobody could tell" half of the problem, not the
 *     "nobody looked" half.
 *   · `dev` is not a failure: it is the honest answer for any build the deploy
 *     workflow did not stamp.
 */

// Ambient: substituted by esbuild `--define` at bundle time; absent otherwise.
declare const __BOUTIK_RELEASE__: string | undefined;
declare const __BOUTIK_CANON__: string | undefined;

/** The value both fields carry when the deploy workflow did not stamp the build. */
export const UNSTAMPED = 'dev';

export interface Provenance {
  /** The git commit sha this bundle was built from — WHICH BUILD is running. */
  readonly release: string;
  /** The pinned @platform/contracts version — WHICH WIRE SHAPE it speaks. */
  readonly canon: string;
}

/** Read the build-time stamp, falling back to `dev` when unstamped. */
export function provenance(): Provenance {
  return {
    release: typeof __BOUTIK_RELEASE__ !== 'undefined' ? __BOUTIK_RELEASE__ : UNSTAMPED,
    canon: typeof __BOUTIK_CANON__ !== 'undefined' ? __BOUTIK_CANON__ : UNSTAMPED,
  };
}
