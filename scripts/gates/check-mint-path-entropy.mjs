#!/usr/bin/env node
// WO-6.10 — the MINT-PATH ENTROPY gate, INHERITED from canon (WO-5.9, founder
// ruling Beurni 2026-07-13; "every repo inherits"). No command_id mint path may
// draw its idempotency key from `Math.random` — only the OS CSPRNG. `Math.random()`
// carries only its SEED's entropy (unproven on a cold-booted Android-Go device), so
// two commands can collide into one idempotency key — a double-charge or a lost
// action. This gate scans every mint-path source file and fails the build on any
// `Math.random`, and requires each to actually draw from a CSPRNG
// (randomUUID/getRandomValues) so an empty file cannot pass vacuously.
//
// SCOPE WIDENED (BOUTIK-MEDIA-1, founder ruling 2026-07-24): originally
// `command-id*`/`commandId*` only. `media-key*`/`mediaKey*` is now scanned too —
// BOUTIK-MEDIA-1 mints media object keys from `crypto.randomUUID`, and with no
// image moderation and no read-route moderation check that token's entropy is the
// ONLY thing between an uploaded image and someone enumerating URLs. A
// `Math.random` key there is the same class of defect as a colliding command_id,
// so it belongs under the same gate. Widening a scan's scope is not weakening the
// gate: the Math.random check and the CSPRNG non-vacuity token are unchanged.
//
// Adapted from canon UNCHANGED in logic; the ONLY change is the scan root. Canon's
// mint path lives under `packages/`; boutik's lives at its isolated offline seam
// (`apps/supplier-app/src/offline/commandId.ts`). So this walks boutik's workspace
// source roots (apps/, packages/, services/) instead of just packages/. The
// Math.random check and the CSPRNG non-vacuity token are byte-for-byte canon's — a
// consumer that wires expo-crypto's `randomUUID` satisfies it honestly (no weakening).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Collect mint-path files under a source root, skipping node_modules/dist/test. */
function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'test') continue;
      walk(p, acc);
    } else if (/(command-id|commandId|media-key|mediaKey)[^/\\]*\.(ts|mjs|js)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}
const files = ['apps', 'packages', 'services'].reduce((acc, d) => walk(join(root, d), acc), []);

if (files.length === 0) {
  console.log('mint-path-entropy OK: no command-id mint path present in this repo');
  process.exit(0);
}

// Scan CODE, not prose: a comment that says "Math.random is forbidden" is the rule
// being documented, not a violation. Strip block + line comments before scanning.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const problems = [];
for (const f of files) {
  const code = stripComments(readFileSync(f, 'utf8'));
  const rel = f.slice(root.length + 1);
  // A CALL — `Math.random(` — is the violation; a throw/message string that names
  // it (no call paren) is the rule being stated, not drawn from.
  if (/Math\s*\.\s*random\s*\(/.test(code)) {
    problems.push(`${rel}: calls Math.random( — FORBIDDEN as an idempotency-key source (mint from the OS CSPRNG)`);
  }
  if (!/\b(randomUUID|getRandomValues)\b/.test(code)) {
    problems.push(`${rel}: no OS CSPRNG draw (randomUUID/getRandomValues) — a mint path must not pass vacuously`);
  }
}

if (problems.length) {
  console.error('mint-path-entropy FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`mint-path-entropy OK: ${files.length} mint path(s) draw from the OS CSPRNG; zero Math.random`);
