#!/usr/bin/env node
import { readFileSync } from 'node:fs';

/**
 * WO-6.7-adjacent (🟢, CTO-assigned) — the LOCKFILE-URL gate. The committed
 * pnpm-lock.yaml must carry ZERO ssh-form git URLs (`git@github.com:`). This is
 * the shop-plus defect made a standing gate: an ssh-form lockfile URL cannot
 * install in CI (no ssh key / no agent), it silently defeats the https-form
 * override, and it only surfaces as a clean-store install failure. GUARD 0
 * checked this once at merge time; this gate checks it on every run.
 *
 * Lockfiles are regenerated, never hand-edited — so a stray ssh URL means the
 * generating environment's gitconfig rewrote https→ssh (`insteadOf`), which
 * would follow the lockfile into CI. Fail closed; the fix is to regenerate the
 * lockfile in an environment without the rewrite.
 */
const file = process.argv[2] ?? 'pnpm-lock.yaml';
const src = readFileSync(file, 'utf8');
const hits = [...src.matchAll(/git@github\.com:/g)];
if (hits.length > 0) {
  console.error(`no-ssh-lockfile FAILED — ${hits.length} ssh-form git URL(s) in ${file} (must be 0; https-form only)`);
  process.exit(1);
}
console.log(`no-ssh-lockfile OK — ${file} carries no ssh-form git URL`);
