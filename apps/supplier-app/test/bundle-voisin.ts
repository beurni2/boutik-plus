import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ═══ AUDIT-B+2 F-83 — where the seam tests find their outside pieces,
 * stated rather than hard-coded ═══
 *
 * Both seam tests used `/home/user/...` paths, so in CI (checked out under
 * `/home/runner/work/...`) they skipped without a word, and on a laptop they
 * ran against whatever Séra bundle happened to be on disk.
 *
 * · MINIFLARE is this repo's own dependency (through the offer service), so it
 *   is resolved RELATIVE TO THE REPO and its absence FAILS — a broken install
 *   must be loud, never a quiet skip (the vignette seam's rule).
 * · A NEIGHBOUR'S BUNDLE (Séra's logistics, the platform's protection fund)
 *   lives in another repo. It is looked for beside this checkout or where its
 *   env var points. Absent — as in this repo's CI, which checks out one repo —
 *   the tests SKIP, and the reason is written into their titles so a green run
 *   never reads as « proven ». Present but OLDER than its own source, it is
 *   REFUSED: a stale bundle proves a service that no longer exists.
 */

type MiniflareCtor = new (opts: Record<string, unknown>) => {
  dispatchFetch(url: string, init?: unknown): Promise<Response>;
  dispose(): Promise<void>;
};

export function miniflareDuDepot(): MiniflareCtor {
  const req = createRequire(fileURLToPath(new URL('../../../services/offer-service/package.json', import.meta.url)));
  return (req('miniflare') as { Miniflare: MiniflareCtor }).Miniflare;
}

/**
 * One Worker bundle from a NEIGHBOUR repo (Séra's logistics, the platform's
 * protection fund): found beside this checkout or where its env var points,
 * skipped with the reason in the title when absent, refused when older than
 * its own source.
 */
export function voisin(o: { depot: string; env: string; service: string; dist: string; rebuild: string }): {
  bundle: string;
  raisonSaut: string | null;
  exigerAJour: () => void;
  titre: (t: string) => string;
} {
  const brut = process.env[o.env];
  const racine = brut !== undefined && brut.trim() !== '' ? brut.trim() : fileURLToPath(new URL(`../../../../${o.depot}`, import.meta.url));
  const service = join(racine, o.service);
  const bundle = join(service, o.dist);
  const raisonSaut = existsSync(bundle)
    ? null
    : `pas de bundle ${o.depot} à ${bundle} (clone ${o.depot} à côté de ce dépôt ou ${o.env}, puis ${o.rebuild})`;
  return {
    bundle,
    raisonSaut,
    exigerAJour: () => {
      const b = statSync(bundle).mtimeMs;
      const source = Math.max(...['worker', 'src'].map((d) => join(service, d)).filter(existsSync).map(plusRecent));
      if (source > b) {
        throw new Error(`the ${o.depot} bundle at ${bundle} is older than its source — rebuild it (${o.rebuild}) before this seam proves anything`);
      }
    },
    titre: (t) => (raisonSaut === null ? t : `${t} — SAUTÉ : ${raisonSaut}`),
  };
}

function plusRecent(dir: string): number {
  let max = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    max = Math.max(max, e.isDirectory() ? plusRecent(p) : statSync(p).mtimeMs);
  }
  return max;
}

export const SERA = voisin({
  depot: 'sera',
  env: 'SERA_REPO',
  service: 'services/logistics-service',
  dist: 'dist-worker/worker.mjs',
  rebuild: 'pnpm --filter @sera/logistics-service bundle:worker',
});
