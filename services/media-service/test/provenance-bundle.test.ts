import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * SERVICE-PROVENANCE-1 — THE PROOF THAT MATTERS: the esbuild `--define` plumbing
 * genuinely stamps the REAL shipping artifact.
 *
 * A fallback-only test would pass even if the define were misspelt, mis-quoted,
 * or dropped from the bundle script — and the stamp would then ship reading `dev`
 * forever, silently useless. That is the same shape as the defect this slice
 * exists to close (a thing believed live that was never actually running), so it
 * is asserted against the artifact, not against the source.
 *
 * This runs the REAL `bundle:worker` script — not a hand-copied esbuild command —
 * so a change to the script's flags is caught here. It rewrites
 * `dist/worker/worker.mjs`, which is harmless: `pretest` regenerates it and no
 * other test imports the bundle (they import `worker/index.ts` directly).
 */

const CWD = new URL('..', import.meta.url).pathname;
const BUNDLE = `${CWD}dist/worker/worker.mjs`;

function bundleWith(env: Record<string, string>): string {
  execSync('pnpm bundle:worker', { cwd: CWD, env: { ...process.env, ...env }, stdio: 'pipe' });
  return readFileSync(BUNDLE, 'utf8');
}

describe('the deploy stamp reaches the real bundle', () => {
  it('injects BOTH values the deploy workflow supplies, verbatim', () => {
    const out = bundleWith({ BOUTIK_RELEASE: 'deadbeefcafe1234', BOUTIK_CANON: '2.0.0' });
    expect(out).toContain('deadbeefcafe1234'); // the git sha — WHICH BUILD
    expect(out).toContain('2.0.0'); // the pinned contracts version — WHICH WIRE SHAPE
  });

  it('the injected values REPLACE the identifiers — the stamp is baked in, not read at runtime', () => {
    const out = bundleWith({ BOUTIK_RELEASE: 'aaaaaaaaaaaa1111', BOUTIK_CANON: '9.9.9' });
    // the placeholders must be GONE: if they survive, --define did not substitute
    // and the deployed Worker would answer `dev` forever.
    expect(out).not.toContain('__BOUTIK_RELEASE__');
    expect(out).not.toContain('__BOUTIK_CANON__');
  });

  it('an UNSTAMPED bundle falls back to `dev` — never a stale value from a previous build', () => {
    const out = bundleWith({ BOUTIK_RELEASE: '', BOUTIK_CANON: '' });
    expect(out).not.toContain('aaaaaaaaaaaa1111'); // the prior run's sha did not leak through
    expect(out).toContain('"dev"');
  });
});
