#!/usr/bin/env node
// CI gate (SUPPLIER-AUTHORING-1, cross-lane relay from OZ1) — the demo supply
// adapter must be ABSENT from the REAL shipped bundle. A MEASUREMENT, not an
// argument about Metro reachability.
//
// WHAT CHANGED AND WHY IT MATTERS: `no-demo-in-app-graph.mjs` reasons over
// SOURCE — it proves no app-reachable file imports the demo module. That is an
// inference about what Metro would do. This gate runs `expo export`, which
// writes the actual Metro/Hermes artifact to disk, and greps THAT. Same class of
// evidence as grepping a Worker bundle. The two gates stay side by side: the
// source gate is fast and names the offending file, this one is the measurement.
//
// THE FINGERPRINT CHOICE (the reasoning is the part that transfers):
//   · PRIMARY is a STRING LITERAL — data. A minifier may rename any class it
//     likes, but it cannot delete a string the program still holds. The gate must
//     fail on PRESENCE, not on naming fashion.
//   · The sentinel is reachable FROM the adapter class (`DemoSupplyService.sentinel`),
//     not a free-floating export, so it cannot be dropped as an unused binding
//     while the adapter is still in the graph.
//   · SECONDARY is the class name, reported but never the sole basis for failing.
//   · FINGERPRINTS MUST BE ASCII. Measured, not assumed: Hermes stores non-ASCII
//     literals as UTF-16 in its string table, so a byte-grep for « relié » misses
//     a string that IS present. `Ce produit part sans photo` was found in the
//     artifact and `Pas encore relié au service` was not — same bundle, same run.
//     An accented fingerprint would make this gate pass vacuously forever.
//
// THE POSITIVE CONTROL is the reason this gate can be trusted green. It asserts
// that a known ASCII literal from real app code IS present in the artifact. If a
// future Hermes/Metro/minifier change made literals unreadable, or the export
// silently produced the wrong thing, the absence check would start passing for
// the wrong reason — the control turns that into a hard failure instead.
//
// HONEST LIMIT, stated rather than closed: `expo export` proves ONE platform's
// artifact, built from the same Metro graph and entry as the EAS build — not the
// EAS artifact itself. The service can prove what shipped; the app can prove what
// SHOULD ship. This narrows that gap a long way without erasing it.
//
// Exit 1 = violation. Exit 2 = unusable input (never a vacuous pass).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(root, 'apps', 'supplier-app');

/** Data fingerprints — ASCII only (see header). Presence of ANY fails the gate. */
const FORBIDDEN = [
  'BOUTIK_DEMO_SUPPLY_ADAPTER_MUST_NOT_SHIP', // primary: the demo adapter's sentinel
];
/** Reported when found, never the sole basis for failure — a minifier may rename it. */
const SECONDARY = ['DemoSupplyService'];
/**
 * Must be PRESENT, or the grep is not seeing into the artifact and every absence
 * above is meaningless. ASCII, and from code that is unquestionably shipped: the
 * authoring screen's supplier id and one of its catalog strings.
 */
const REQUIRED = ['supplier-founder-001', 'Ce produit part sans photo'];

const out = mkdtempSync(join(tmpdir(), 'boutik-bundle-'));
let artifacts = [];
try {
  execFileSync(
    'npx',
    ['expo', 'export', '--platform', 'android', '--output-dir', out],
    { cwd: APP, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, CI: '1' } },
  );

  const walk = (dir, acc = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, acc);
      else if (/\.(hbc|js|bundle)$/.test(name)) acc.push(p);
    }
    return acc;
  };
  artifacts = walk(out);
} catch (err) {
  console.error('bundle-absence: `expo export` failed — cannot measure, refusing to pass');
  console.error(String(err.stderr ?? err.message ?? err).slice(0, 4000));
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

if (artifacts.length === 0) {
  console.error(`bundle-absence: the export produced no bundle under ${out} — refusing to pass vacuously`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

// Read as latin1 so byte-oriented matching works on Hermes bytecode.
const blobs = artifacts.map((p) => ({ path: p, text: readFileSync(p, 'latin1') }));
const anyHas = (needle) => blobs.filter((b) => b.text.includes(needle)).map((b) => b.path);

const missingControls = REQUIRED.filter((s) => anyHas(s).length === 0);
if (missingControls.length > 0) {
  console.error('bundle-absence: POSITIVE CONTROL FAILED — the gate cannot see into the artifact,');
  console.error('so every absence it reports would be meaningless. Not a pass.');
  for (const s of missingControls) console.error(`  - expected but not found: ${JSON.stringify(s)}`);
  console.error(`  artifacts scanned: ${artifacts.map((p) => p.replace(out, '')).join(', ')}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

const hits = [];
for (const needle of FORBIDDEN) {
  for (const p of anyHas(needle)) hits.push({ needle, p, kind: 'primary' });
}
for (const needle of SECONDARY) {
  for (const p of anyHas(needle)) hits.push({ needle, p, kind: 'secondary' });
}

const bytes = blobs.reduce((n, b) => n + b.text.length, 0);
rmSync(out, { recursive: true, force: true });

if (hits.some((h) => h.kind === 'primary')) {
  console.error('bundle-absence FAILED — the demo supply adapter is IN the shipped bundle:');
  for (const h of hits) console.error(`  - [${h.kind}] ${JSON.stringify(h.needle)} in ${h.p.split('/').pop()}`);
  console.error('The resolver must have no demo branch: unset config resolves to null, never to demo.');
  process.exit(1);
}

if (hits.length > 0) {
  // Secondary-only: report loudly, do not fail — the name could be a coincidence.
  console.error('bundle-absence: secondary signal present without the data fingerprint — investigate:');
  for (const h of hits) console.error(`  - [${h.kind}] ${JSON.stringify(h.needle)} in ${h.p.split('/').pop()}`);
}

console.log(
  `bundle-absence OK: ${artifacts.length} artifact(s), ${(bytes / 1048576).toFixed(2)} MB measured; ` +
  `${REQUIRED.length} positive control(s) found; the demo supply adapter is absent`,
);
