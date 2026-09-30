import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ═══ AUDIT-B+2 F-83 — where the console-to-Séra seam tests find their two
 * outside pieces, stated rather than hard-coded ═══
 *
 * Both seam tests used `/home/user/...` paths, so in CI (checked out under
 * `/home/runner/work/...`) they skipped without a word, and on a laptop they
 * ran against whatever Séra bundle happened to be on disk.
 *
 * · MINIFLARE is this repo's own dependency (through the offer service), so it
 *   is resolved RELATIVE TO THE REPO and its absence FAILS — a broken install
 *   must be loud, never a quiet skip (the vignette seam's rule).
 * · THE SÉRA BUNDLE lives in another repo. It is looked for beside this
 *   checkout (`../sera`) or where `SERA_REPO` points. Absent — as in this
 *   repo's CI, which checks out one repo — the tests SKIP, and the reason is
 *   written into their titles so a green run never reads as « proven ».
 *   Present but OLDER than Séra's own logistics source, it is REFUSED: a stale
 *   bundle proves a Séra that no longer exists.
 */

type MiniflareCtor = new (opts: Record<string, unknown>) => {
  dispatchFetch(url: string, init?: unknown): Promise<Response>;
  dispose(): Promise<void>;
};

export function miniflareDuDepot(): MiniflareCtor {
  const req = createRequire(fileURLToPath(new URL('../../../services/offer-service/package.json', import.meta.url)));
  return (req('miniflare') as { Miniflare: MiniflareCtor }).Miniflare;
}

const SERA_RACINE =
  process.env['SERA_REPO'] !== undefined && process.env['SERA_REPO'].trim() !== ''
    ? process.env['SERA_REPO'].trim()
    : fileURLToPath(new URL('../../../../sera', import.meta.url));
const LOGISTIQUE = join(SERA_RACINE, 'services', 'logistics-service');
export const SERA_BUNDLE = join(LOGISTIQUE, 'dist-worker', 'worker.mjs');

function plusRecent(dir: string): number {
  let max = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    max = Math.max(max, e.isDirectory() ? plusRecent(p) : statSync(p).mtimeMs);
  }
  return max;
}

/** Null when the bundle is usable; otherwise why the seam tests skip. */
export const RAISON_SAUT: string | null = existsSync(SERA_BUNDLE)
  ? null
  : `pas de bundle Séra à ${SERA_BUNDLE} (clone sera à côté de ce dépôt ou SERA_REPO, puis pnpm --filter @sera/logistics-service bundle:worker)`;

/** Throws when the bundle on disk is older than the Séra source it came from. */
export function exigerBundleAJour(): void {
  const bundle = statSync(SERA_BUNDLE).mtimeMs;
  const source = Math.max(plusRecent(join(LOGISTIQUE, 'worker')), plusRecent(join(LOGISTIQUE, 'src')));
  if (source > bundle) {
    throw new Error(
      `the Séra bundle at ${SERA_BUNDLE} is older than its source — rebuild it (pnpm --filter @sera/logistics-service bundle:worker) before this seam proves anything`,
    );
  }
}

export function titreSeam(titre: string): string {
  return RAISON_SAUT === null ? titre : `${titre} — SAUTÉ : ${RAISON_SAUT}`;
}
