#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * CI gate: dependency-audit (Execution Contract E0 exit — « dependency +
 * secret scanning in CI »; AUDIT-B+2 F-18; ported from Shop+ CHAINE-DEPLOI-1). Only the secret half existed
 * (`no-expo-token-leak`). This runs `pnpm audit --prod --audit-level=high
 * --json` over the workspace and refuses any high/critical advisory whose
 * dependency PATH is not under a founder-ruled allow-list prefix.
 *
 * THE ALLOW-LIST NAMES BUILD TOOLING ONLY, with its reason, printed on every
 * run: `expo` is a production dependency of the supplier app (React Native
 * needs it), so its CLI, config-plugin and metro-config trees ride the
 * `--prod` graph although nothing in them reaches a published bundle
 * (traced by the audit: sharp/undici via miniflare, brace-expansion/js-yaml/
 * xmldom via Expo tooling, nanoid/postcss via vite — none a runtime
 * dependency of a deployed artifact). A high advisory on a RUNTIME path —
 * the offer Worker's zod, the web pages' entry graph, commerce-core — fails here by
 * name.
 *
 * WHAT RED MEANS: a dependency bump is owed (a new advisory can turn main red
 * with no commit — that is the scan doing its job, as service-canon-drift's
 * red means a deploy is owed), or a new build-tooling path needs a ruling
 * added below. Exit 2 — « could not run » — when the registry did not answer
 * or the output is not an audit report: never a pass on silence.
 *
 * ITS LIMIT, SO GREEN IS NEVER READ AS MORE: `--prod` skips devDependencies,
 * and esbuild bundles whatever a Worker imports whether the manifest calls it
 * a dependency or not — offer-service's zod is a devDependency that ships
 * inside the offer Worker. An advisory on such a package is invisible here.
 *
 * `--fixture <audit.json>` reads a saved report instead of running pnpm (the
 * negative fixtures and the could-not-run contract).
 */
const ALLOW = [
  { prefix: 'apps__supplier-app>expo>@expo/cli>', ruling: 'Expo CLI — dev/build tooling of the supplier app, never in the published bundle' },
  { prefix: 'apps__supplier-app>expo>@expo/config-plugins>', ruling: 'Expo config plugins — native-project generation at build time, never in the published bundle' },
  { prefix: 'apps__supplier-app>expo>@expo/metro-config>', ruling: 'Expo Metro config — the bundler’s own configuration, never in the published bundle' },
];

const args = process.argv.slice(2);
let raw;
let source;
const fixtureAt = args.indexOf('--fixture');
if (fixtureAt !== -1) {
  source = args[fixtureAt + 1];
  if (!source) {
    console.error('usage: dependency-audit.mjs [--fixture <audit.json>]');
    process.exit(2);
  }
  try {
    raw = readFileSync(source, 'utf8');
  } catch (err) {
    console.error(`dependency-audit: cannot read fixture ${source}: ${String(err)}`);
    process.exit(2);
  }
} else {
  source = 'pnpm audit --prod --audit-level=high --json';
  // pnpm exits 1 when it FOUND something; the report is the truth, not the code.
  const run = spawnSync('pnpm', ['audit', '--prod', '--audit-level=high', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error) {
    console.error(`dependency-audit ERROR — could not run pnpm audit: ${String(run.error)}`);
    process.exit(2);
  }
  raw = run.stdout;
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error(`dependency-audit ERROR — ${source} did not produce an audit report (registry unreachable?); refusing to pass on silence`);
  process.exit(2);
}
if (report === null || typeof report !== 'object' || typeof report.metadata !== 'object' || report.metadata === null || typeof report.advisories !== 'object') {
  console.error(`dependency-audit ERROR — ${source} is not an audit report (no metadata/advisories); refusing to pass on silence`);
  process.exit(2);
}

const advisories = Object.values(report.advisories ?? {});
const allowedCounts = new Map(ALLOW.map((a) => [a.prefix, 0]));
const refused = [];
for (const adv of advisories) {
  const severity = String(adv.severity ?? '');
  if (severity !== 'high' && severity !== 'critical') continue;
  const paths = (adv.findings ?? []).flatMap((f) => f.paths ?? []);
  if (paths.length === 0) paths.push(`(no path) ${adv.module_name ?? '?'}`);
  for (const path of paths) {
    const entry = ALLOW.find((a) => path.startsWith(a.prefix));
    if (entry !== undefined) {
      allowedCounts.set(entry.prefix, allowedCounts.get(entry.prefix) + 1);
    } else {
      refused.push(`${severity} ${adv.module_name ?? '?'} (${adv.title ?? adv.url ?? 'advisory'}) at ${path}`);
    }
  }
}
for (const { prefix, ruling } of ALLOW) {
  const n = allowedCounts.get(prefix);
  if (n > 0) console.log(`dependency-audit allowed — ${n} path(s) under ${prefix} (${ruling})`);
}
const v = report.metadata.vulnerabilities ?? {};
const total = `critical ${v.critical ?? 0} · high ${v.high ?? 0} · moderate ${v.moderate ?? 0} · low ${v.low ?? 0}`;
if (refused.length === 0) {
  console.log(`dependency-audit OK — no high/critical advisory on a runtime path (${total}; allow-listed build tooling printed above)`);
  process.exit(0);
}
console.error(`dependency-audit FAILED — ${refused.length} high/critical advisory path(s) outside the build-tooling allow-list (${total}):`);
for (const r of refused) console.error(`  - ${r}`);
process.exit(1);
