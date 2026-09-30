import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mesurerWeb } from './web-size.mjs';

/**
 * The checks every REAL web export gets, on the very files a deploy would
 * upload — called by founder-keys-absent (the console, root v2) and
 * fournisseur-bundle-absence (the supplier page) on the export each already
 * builds, so no extra export is paid for:
 *
 *   · DEMO-TRACE-1 (AUDIT-B+2 F-88) — nothing that must never ship is in the
 *     page: the demo supply adapter's sentinel, and the fabricated demo data
 *     only the retired E1 root carries (ASCII data literals, measured absent
 *     from both pages and present in an E1 export on 2026-09-26).
 *   · POIDS-WEB-1 (F-85) — the first-load size, measured and printed; enforced
 *     only once a ceiling is signed (web-size.mjs explains why).
 *   · COQUILLE-WEB-1 (F-85) — the offline shell can be written for this
 *     export: the generator the deploys run must succeed on today's real
 *     output and precache the page's own entry script — AND the page itself
 *     calls `navigator.serviceWorker.register('/sw.js')`. A worker that is
 *     written but never registered is a shell nobody opens: the CALL SITE is
 *     asserted in the shipped script, not the presence of the helper.
 *
 * Run directly — `web-artifact-checks.mjs <distDir> <surface>` — by both web
 * deploy workflows on the exact dist they upload; that run also leaves the
 * page's sw.js in place. Exit 0 · 1 a check failed · 2 could not measure.
 */
export const NEVER_IN_A_WEB_PAGE = [
  'BOUTIK_DEMO_SUPPLY_ADAPTER_MUST_NOT_SHIP', // the demo supply adapter
  'correction_en_cours', // E1's demo store (src/demo/store.ts)
  'correctionMinLeft', // E1's demo store
  // LISTER-VRAI-1 — the V2 demo board and its seed, removed on the founder's
  // « make room » (2026-09-30). This is the ABSENCE PROOF PRODUITS-READ-1 left
  // owed « when Commandes converts off the seed ». Each was measured IN the
  // console page built from b1efbae and absent after the removal.
  'CMD-2417', // the seed's first order code
  'Wendkuni', // the seed shop, the sign-up walkthrough, its closing toast
  'Compte provisoire', // the sign-up walkthrough (S34–S39)
  'Rood Woko', // the demo header's market line
  'Issa (S', // the demo « Produit prêt » toast's rider
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function verifierPageWeb(out, surface) {
  const lines = [];
  let failed = false;
  let errored = false;

  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const scripts = walk(out).filter((p) => /\.(js|html)$/.test(p) && !p.endsWith('sw.js'));
  const text = scripts.map((p) => readFileSync(p, 'latin1')).join('\n');
  for (const needle of NEVER_IN_A_WEB_PAGE) {
    if (text.includes(needle)) {
      failed = true;
      lines.push(`  ✘ [NEVER SHIPS] ${JSON.stringify(needle)} FOUND in the ${surface} page`);
    } else {
      lines.push(`  ✔ [NEVER SHIPS] ${JSON.stringify(needle)} absent from the ${surface} page`);
    }
  }

  // Minifiers keep the property chain and the string; either quote style.
  if (/serviceWorker\.register\(\s*["']\/sw\.js["']/.test(text)) {
    lines.push(`  ✔ [OFFLINE SHELL] the ${surface} page registers /sw.js`);
  } else {
    failed = true;
    lines.push(`  ✘ [OFFLINE SHELL] the ${surface} page never registers /sw.js — the shell would be written and never used`);
  }

  const size = mesurerWeb(out, surface, join(root, 'gates', 'web-budgets.json'));
  lines.push(...size.lines);
  if (size.code === 1) failed = true;
  if (size.code === 2) errored = true;

  try {
    const said = execFileSync('node', [join(root, 'scripts', 'web-offline-shell.mjs'), out], { encoding: 'utf8' });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    const entry = html.match(/src="\/?(_expo\/static\/js\/web\/[^"]+\.js)"/)?.[1];
    const sw = existsSync(join(out, 'sw.js')) ? readFileSync(join(out, 'sw.js'), 'utf8') : '';
    if (entry === undefined || !sw.includes(JSON.stringify(entry))) {
      failed = true;
      lines.push(`  ✘ [OFFLINE SHELL] sw.js does not precache the page's entry script (${entry ?? 'none found'})`);
    } else {
      lines.push(`  ✔ [OFFLINE SHELL] ${said.trim().replace(out, '<export>')}`);
    }
  } catch (err) {
    failed = true;
    lines.push(`  ✘ [OFFLINE SHELL] the generator refused this export: ${String(err.stderr ?? err.message ?? err).trim()}`);
  }
  return { failed, errored, lines };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [out, surface] = process.argv.slice(2);
  if (!out || !surface || !existsSync(join(out, 'index.html'))) {
    console.error('usage: web-artifact-checks.mjs <distDir> <surface> — and the dist must hold an index.html');
    process.exit(2);
  }
  const page = verifierPageWeb(out, surface);
  for (const l of page.lines) (l.includes('✘') ? console.error : console.log)(l);
  process.exit(page.errored ? 2 : page.failed ? 1 : 0);
}
