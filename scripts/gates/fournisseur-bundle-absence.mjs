#!/usr/bin/env node
// CI gate (READINESS-WIRE-1b-ii) — THE FOUNDER'S CAPABILITY RULING, MEASURED.
//
// Ruling (2026-08-02, verbatim in JOURNAL): « i do not want other suppliers
// boutik+ webapp be able to list new products, only my webapp have that
// capability ». The fournisseur export must therefore not CARRY the offers
// client — not hide it, not leave it unmounted: the artifact must not contain
// it. The entry fold (index.ts, three lazy requires behind the inlined
// EXPO_PUBLIC_ROOT) is the mechanism; THIS gate is the proof, on the real
// exported artifact, same doctrine as bundle-absence.mjs beside it: a
// MEASUREMENT, never an argument about what Metro should have done.
//
// FINGERPRINTS (ASCII data literals — the bundle-absence header explains why):
//   · FORBIDDEN primary: the OFFERS client's own route literals. NOT the
//     'X-Write-Key' header name — measured lesson: the MEDIA wire shares that
//     header name (media-wire.ts), and media upload is a capability the
//     ruling GRANTS (« upload photo prove of readiness »), so the header
//     string legitimately rides every fournisseur bundle. The routes
//     '/offers/assets' and '/offers/delete' exist in exactly one module:
//     the authoring client.
//   · REQUIRED controls: the fournisseur's OWN data literals — the code
//     storage key and the /mine route — so a scan that sees nothing can never
//     pass vacuously.
//
// THE NEGATIVE FIXTURE IS THE OTHER ROOT: run with `--root v2` the same scan
// must FAIL (the founder's own export legitimately carries X-Write-Key), with
// v2's controls swapped in so the failure is the FORBIDDEN hit, never a
// vacuous control miss. A gate whose negative cannot fire is not a gate.
//
// Exit 1 = violation. Exit 2 = unusable input (never a vacuous pass).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(root, 'apps', 'supplier-app');

const rootArg = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : 'fournisseur';

// '/offers' bare: the authoring client cannot ride unfingerprinted
// (verifier N1) — WITH ONE NAMED, GRANTED EXCEPTION since LISTER-POUR-1c
// (founder order 2026-08-02: suppliers SEE the products listed for them):
// the READ route '/offers/mine' legitimately rides the fournisseur bundle.
// It is masked before the bare-'/offers' scan and PRINTED as an excusal on
// every run, and it is a REQUIRED control below — so the exception can
// neither hide a write route ('/offers/assets', '/offers/delete' and bare
// '/offers' all still fire) nor silently outlive the code it excuses.
// '/media/revoke' + 'revokeImage': the verifier's M1 — the revoke client is
// a destructive capability the ruling never granted; upload-only is the law
// of this artifact.
const GRANTED_READ = '/offers/mine';
const FORBIDDEN = ['/offers/assets', '/offers/delete', '/offers', '/media/revoke', 'revokeImage'];
const SECONDARY = ['HttpSupplyService', 'DemoSupplyService'];
const REQUIRED =
  rootArg === 'fournisseur'
    ? ['boutik.fournisseur.code', '/fulfillment/mine', '/fulfillment/ramassage/verify', GRANTED_READ]
    : ['supplier-founder-001', 'Ce produit part sans photo'];

const out = mkdtempSync(join(tmpdir(), `fournisseur-bundle-${rootArg}-`));
let artifacts = [];
try {
  // THE EXPORT ENV MIRRORS EACH ROOT'S REAL DEPLOY — measured necessity, not
  // ceremony: with no EXPO_PUBLIC_OFFER_BASE the inliner folds the resolver
  // to null and dead-code-eliminates the WHOLE http client, route strings and
  // all (verified on a real export: '/fulfillment/mine' vanished). A gate
  // exporting with the wrong env shape scans a bundle nobody ships —
  // controls fail vacuously, or worse, the forbidden marker is DCE'd out of
  // the v2 negative and the gate loses its teeth.
  const env = {
    ...process.env,
    CI: '1',
    EXPO_PUBLIC_ROOT: rootArg,
    EXPO_PUBLIC_OFFER_BASE: 'https://offer.gate.invalid',
    EXPO_PUBLIC_MEDIA_BASE: 'https://media.gate.invalid',
    EXPO_PUBLIC_MEDIA_WRITE_KEY: 'gate-media-key',
  };
  if (rootArg === 'fournisseur') {
    // The fournisseur build NEVER receives the offers write key — mirroring
    // the deploy workflow, which simply does not pass it.
    delete env.EXPO_PUBLIC_OFFER_WRITE_KEY;
  } else {
    // The v2 negative must carry it, as the founder's real deploy does — or
    // the authoring client is eliminated and the negative cannot fire.
    env.EXPO_PUBLIC_OFFER_WRITE_KEY = 'gate-offer-key';
  }
  execFileSync(
    'npx',
    // COLD, ALWAYS (--clear): Metro's transform cache is not keyed on
    // EXPO_PUBLIC_* values — measured: two exports with different env produced
    // BYTE-IDENTICAL bundles until cleared. A warm gate measures a stale world.
    ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out],
    { cwd: APP, stdio: 'pipe', encoding: 'utf8', env },
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
  console.error('fournisseur-bundle-absence: `expo export` failed — cannot measure, refusing to pass');
  console.error(String(err.stderr ?? err.message ?? err).slice(0, 4000));
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

if (artifacts.length === 0) {
  console.error(`fournisseur-bundle-absence: no bundle under ${out} — refusing to pass vacuously`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

const blobs = artifacts.map((p) => ({ path: p, text: readFileSync(p, 'latin1') }));
const anyHas = (needle) => blobs.filter((b) => b.text.includes(needle)).map((b) => b.path);

const missingControls = REQUIRED.filter((s) => anyHas(s).length === 0);
if (missingControls.length > 0) {
  console.error(`fournisseur-bundle-absence(root=${rootArg}): POSITIVE CONTROL FAILED — the scan cannot see, not a pass.`);
  for (const s of missingControls) console.error(`  - expected but not found: ${JSON.stringify(s)}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}
for (const s of REQUIRED) console.log(`  ✔ [CONTROL] ${JSON.stringify(s)} present — the scan can see`);

let failed = false;
console.log(`  ◦ [EXCUSAL, printed each run] ${JSON.stringify(GRANTED_READ)} is a GRANTED read (LISTER-POUR-1c) — masked before the bare '/offers' scan`);
const anyHasMasked = (needle) =>
  blobs.filter((b) => b.text.split(GRANTED_READ).join('').includes(needle)).map((b) => b.path);
for (const needle of FORBIDDEN) {
  const hits = needle === '/offers' ? anyHasMasked(needle) : anyHas(needle);
  if (hits.length > 0) {
    failed = true;
    console.error(`  ✘ [LOAD-BEARING] ${JSON.stringify(needle)} FOUND in ${hits.map((p) => p.replace(out, '')).join(', ')}`);
  } else {
    console.log(`  ✔ [LOAD-BEARING] ${JSON.stringify(needle)} absent`);
  }
}
for (const needle of SECONDARY) {
  const hits = anyHas(needle);
  if (hits.length > 0) console.error(`  ⚠ [secondary] ${JSON.stringify(needle)} present (reported, not sole basis): ${hits.length} artifact(s)`);
  else console.log(`  ✔ [secondary] ${JSON.stringify(needle)} absent`);
}

rmSync(out, { recursive: true, force: true });
if (failed) {
  console.error(`fournisseur-bundle-absence(root=${rootArg}): the artifact CARRIES the offers client — the capability ruling is broken.`);
  process.exit(1);
}
console.log(`fournisseur-bundle-absence(root=${rootArg}): OK — the authoring client is absent from the artifact, not merely unmounted.`);
