#!/usr/bin/env node
// CI gate (CLE-FONDATEUR-1, AUDIT-B+2 F-01 + F-86) — THE FOUNDER'S KEYS ARE
// NOT IN HIS PAGE, MEASURED.
//
// Before this slice the console's own code carried two credentials: the offer
// WRITE key and the photo REVOKE key. Both now come from what the founder types
// on his device. This
// gate proves it on the REAL exported artifact, the same doctrine as
// bundle-absence.mjs: a measurement, never an argument about Metro.
//
// HOW: export the v2 root for WEB (what web-deploy ships) with the two RETIRED
// env names set to planted sentinel values — exactly the state of a repo whose
// old secrets were never deleted — and require that neither sentinel appears.
//
// WHY THE ABSENCE CAN BE TRUSTED: the positive control is a sentinel planted in
// an env value the app DOES inline (the offer base). If the scan could not see
// inlined env strings, the control would be missing and the gate refuses
// (exit 2) instead of passing vacuously.
//
// THE NEGATIVE (`--negatif`): the same scan with the offer base set to the
// forbidden sentinel itself. The sentinel then genuinely rides the bundle, and
// the gate MUST exit 1 — proof its failure branch can fire.
//
// ALSO MEASURED HERE (F-86): `public/_headers` reaches the export root, carrying
// the enforced anti-framing and no-sniff headers both Pages projects read.
// And a SOURCE check: no app file and no workflow line (comments aside) names
// either retired env var, so nothing can quietly wire one back in.
//
// Exit 1 = violation. Exit 2 = unusable input (never a vacuous pass).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(root, 'apps', 'supplier-app');
const negatif = process.argv.includes('--negatif');

/** ASCII only — Hermes/minifiers keep ASCII literals byte-greppable (see bundle-absence.mjs). */
const OFFER_KEY_SENTINEL = 'GATE-OFFER-WRITE-KEY-MUST-NOT-SHIP-7Q2K';
const REVOKE_KEY_SENTINEL = 'GATE-MEDIA-REVOKE-KEY-MUST-NOT-SHIP-3M8P';
const BASE_SENTINEL = 'offer-gate-base-inlined-9f4t';
const RETIRED = ['EXPO_PUBLIC_OFFER_WRITE_KEY', 'EXPO_PUBLIC_MEDIA_REVOKE_KEY'];

const REQUIRED = [
  negatif ? OFFER_KEY_SENTINEL : BASE_SENTINEL, // an inlined env value IS visible
  'boutik.operateur.cle', // the typed operator key's own storage slot
  'boutik.photos.cle', // the typed photo key's own storage slot
];
const FORBIDDEN = [OFFER_KEY_SENTINEL, REVOKE_KEY_SENTINEL];
const HEADERS_REQUIRED = ['X-Frame-Options: DENY', "frame-ancestors 'none'", 'X-Content-Type-Options: nosniff'];

let failed = false;

// ── the SOURCE half: nothing names the retired env vars ──────────────────────
const walkFiles = (dir, keep, acc = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, keep, acc);
    else if (keep(name)) acc.push(p);
  }
  return acc;
};
const sources = walkFiles(join(APP, 'src'), (n) => /\.(ts|tsx|js|mjs)$/.test(n));
const workflows = walkFiles(join(root, '.github', 'workflows'), (n) => /\.ya?ml$/.test(n));
if (sources.length === 0 || workflows.length === 0) {
  console.error('founder-keys-absent: no app sources or no workflows found — refusing to pass vacuously');
  process.exit(2);
}
for (const p of sources) {
  const text = readFileSync(p, 'utf8');
  for (const name of RETIRED) {
    if (text.includes(name)) {
      failed = true;
      console.error(`  ✘ [SOURCE] ${name} named in ${p.replace(root, '')} — the app must never read a bundled founder key`);
    }
  }
}
for (const p of workflows) {
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (line.trim().startsWith('#')) return;
    for (const name of RETIRED) {
      if (line.includes(name)) {
        failed = true;
        console.error(`  ✘ [WORKFLOW] ${name} passed at ${p.replace(root, '')}:${i + 1} — no deploy may carry a founder key`);
      }
    }
  });
}
if (!failed) console.log(`  ✔ [SOURCE] neither ${RETIRED.join(' nor ')} is named in ${sources.length} app files or ${workflows.length} workflows`);

// ── the ARTIFACT half: export as a deploy would, with the old secrets still set ──
const out = mkdtempSync(join(tmpdir(), `founder-keys-${negatif ? 'negatif' : 'positif'}-`));
let artifacts = [];
try {
  const env = {
    ...process.env,
    CI: '1',
    EXPO_PUBLIC_ROOT: 'v2',
    EXPO_PUBLIC_OFFER_BASE: `https://${negatif ? OFFER_KEY_SENTINEL : BASE_SENTINEL}.invalid`,
    EXPO_PUBLIC_MEDIA_BASE: 'https://media.gate.invalid',
    EXPO_PUBLIC_MEDIA_WRITE_KEY: 'gate-media-key',
    // The retired names, still set — as in a repo whose old secrets linger.
    EXPO_PUBLIC_OFFER_WRITE_KEY: OFFER_KEY_SENTINEL,
    EXPO_PUBLIC_MEDIA_REVOKE_KEY: REVOKE_KEY_SENTINEL,
  };
  // COLD, ALWAYS (--clear): Metro's transform cache is not keyed on
  // EXPO_PUBLIC_* values (measured, fournisseur-bundle-absence.mjs).
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out], {
    cwd: APP,
    stdio: 'pipe',
    encoding: 'utf8',
    env,
  });
  const walk = (dir, acc = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, acc);
      else if (/\.(js|html|map)$/.test(name)) acc.push(p);
    }
    return acc;
  };
  artifacts = walk(out);
} catch (err) {
  console.error('founder-keys-absent: `expo export` failed — cannot measure, refusing to pass');
  console.error(String(err.stderr ?? err.message ?? err).slice(0, 4000));
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}
if (artifacts.length === 0) {
  console.error(`founder-keys-absent: no bundle under ${out} — refusing to pass vacuously`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

const blobs = artifacts.map((p) => ({ path: p, text: readFileSync(p, 'latin1') }));
const anyHas = (needle) => blobs.filter((b) => b.text.includes(needle)).map((b) => b.path.replace(out, ''));

const missing = REQUIRED.filter((s) => anyHas(s).length === 0);
if (missing.length > 0) {
  console.error('founder-keys-absent: POSITIVE CONTROL FAILED — the scan cannot see into the artifact, not a pass.');
  for (const s of missing) console.error(`  - expected but not found: ${JSON.stringify(s)}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}
for (const s of REQUIRED) console.log(`  ✔ [CONTROL] ${JSON.stringify(s)} present — the scan can see`);

for (const needle of FORBIDDEN) {
  const hits = anyHas(needle);
  if (hits.length > 0) {
    failed = true;
    console.error(`  ✘ [LOAD-BEARING] ${JSON.stringify(needle)} FOUND in ${hits.join(', ')}`);
  } else {
    console.log(`  ✔ [LOAD-BEARING] ${JSON.stringify(needle)} absent — a lingering secret of that name cannot reach the page`);
  }
}

const headersPath = join(out, '_headers');
if (!existsSync(headersPath)) {
  failed = true;
  console.error('  ✘ [HEADERS] _headers is not at the export root — public/_headers did not ride the export');
} else {
  const h = readFileSync(headersPath, 'utf8');
  for (const want of HEADERS_REQUIRED) {
    if (h.includes(want)) console.log(`  ✔ [HEADERS] ${JSON.stringify(want)} present`);
    else {
      failed = true;
      console.error(`  ✘ [HEADERS] ${JSON.stringify(want)} missing from the exported _headers`);
    }
  }
}

rmSync(out, { recursive: true, force: true });
if (failed) {
  console.error(`founder-keys-absent${negatif ? ' (negatif)' : ''}: VIOLATION — see the ✘ lines above.`);
  process.exit(1);
}
console.log('founder-keys-absent: OK — no founder key in the page, the retired names are wired nowhere, and the headers ride the export.');
