#!/usr/bin/env node
// CI gate: the canon this repo DECLARES it consumes is the canon that actually
// RESOLVED. Exit 1 = violation. Exit 2 = unusable input.
//
// WHY THIS EXISTS (CATEGORY-WIRE-1 r2, verifier finding): the drift-check's
// version comparison is a tautology in THIS repo — `drift-check` defaults its
// manifest to the installed package's own `docs.manifest.json`, so version and
// manifest are two reads of one immutable tarball and can never disagree. Its
// doc-HASH half is real and still runs; its version half proves nothing.
//
// The failure that leaves is the one this slice already hit: `package.json`
// repinned while `pnpm-workspace.yaml`'s `overrides:` — the resolution that
// actually wins — stayed a MAJOR behind. Types came from one canon, the runtime
// schema from another, and 21 tests failed with « Unrecognized key ».
//
// The operand a machine cannot derive is INTENT, so it is declared by hand in
// `run-gates.sh` and passed in here. Because this check sits DOWNSTREAM of
// resolution it catches every route to divergence — stale override, stale
// lockfile, stale node_modules, wrong tarball — not only the one a
// pin-consistency sweep would see. (A sweep comparing the override sha against
// the package.json shas would have been GREEN through this slice's other bug,
// where a blanket find-and-replace moved every pin site in agreement.)
//
// Version-granular, not sha-granular: two canon commits both reporting 3.0.0
// are indistinguishable here. Accepted — canon's own export-maps and
// shape-freeze gates fail an unversioned shape change in canon's CI first.
import { createRequire } from 'node:module';

const expected = process.argv[2];
if (!expected) {
  console.error('usage: canon-pin-declared.mjs <expected-canon-version>');
  process.exit(2);
}

let installed;
try {
  installed = createRequire(import.meta.url)('@platform/contracts/package.json').version;
} catch (e) {
  console.error(`unresolvable @platform/contracts: ${e.message}`);
  process.exit(2);
}

if (installed !== expected) {
  console.error(`canon-pin-declared: VIOLATION — this repo declares canon ${expected} but resolves ${installed}.`);
  console.error('A repin is not complete until pnpm-workspace.yaml\'s overrides move too (that override wins over every package.json).');
  console.error('Fix the pin, or bump EXPECTED_CANON in scripts/run-gates.sh in the same commit.');
  process.exit(1);
}
console.log(`canon-pin-declared: OK — declared ${expected} === resolved ${installed}`);
