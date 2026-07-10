#!/usr/bin/env node
// WO-1.4 §8 DoD: both in-repo mocks certified 8/8 via the pinned
// @platform/certification suite. The certification tests print each
// formatScorecard; this runner executes exactly those two test files and
// fails unless both pass — its captured output is the scorecard evidence.
import { execSync } from 'node:child_process';

const runs = [
  ['Séra pickup-consumer mock (readiness domain)', 'services/fulfillment-service', 'test/sera-mock-certification.test.ts'],
  ['Shop+ projection-consumer mock (supply-projection domain)', 'services/offer-service', 'test/shop-mock-certification.test.ts'],
];
let failed = false;
for (const [label, dir, file] of runs) {
  console.log(`\n=== ${label} ===`);
  try {
    // vitest exits non-zero on any failing test, which throws below — a
    // successful execSync IS the pass signal (no output grepping: the
    // scorecards legitimately contain the word "failed" in behavior details).
    const out = execSync(`pnpm vitest run ${file} 2>&1`, { cwd: dir, encoding: 'utf8' });
    process.stdout.write(out.split('\n').filter((l) => !/^\s*$/.test(l)).join('\n') + '\n');
  } catch (e) {
    console.error(String(e.stdout ?? e.message));
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
