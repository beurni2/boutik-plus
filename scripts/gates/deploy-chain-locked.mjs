#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CI gate: deploy-chain-locked (DEPLOI-VERROU-1 — AUDIT-B+2 F-17, F-84).
 *
 * The deploy token used to be handed to a `npx --yes wrangler@4` fetched from
 * the registry at deploy time, next to actions pinned only by moving tags, in
 * workflows with no permissions block, and any branch could be deployed. The
 * slice fixed each of those by hand; this gate is what stops them coming back
 * one edit at a time. Over every workflow file it refuses:
 *
 *   1. a `uses:` that is not pinned to a full 40-hex commit SHA;
 *   2. any `npx` call — every tool the workflows run comes from the lockfile
 *      (wrangler, eas-cli, expo) through `pnpm exec` or its lockfile binary;
 *   3. a workflow with no top-level `permissions:` block;
 *   4. a `${{ secrets.… }}` written inside a `run:` script — a secret reaches
 *      a shell only through that step's `env:`, never pasted into its text;
 *   5. a DEPLOY workflow (one that holds CLOUDFLARE_API_TOKEN) whose first
 *      `run:` step is not `bash scripts/deploy-only-main.sh`: only main's
 *      newest commit, green in ci, may go live.
 *
 * And over the workspace manifests it refuses a wrangler or eas-cli version
 * that is a range instead of one exact version, or two packages that pin
 * wrangler differently.
 *
 * Usage: deploy-chain-locked.mjs [workflowsDir]   (default .github/workflows)
 */
const dir = process.argv[2] ?? '.github/workflows';
let files;
try {
  files = statSync(dir).isDirectory()
    ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(dir, f))
    : [dir];
} catch (err) {
  console.error(`deploy-chain-locked ERROR — cannot read ${dir}: ${String(err)}`);
  process.exit(2);
}
if (files.length === 0) {
  console.error(`deploy-chain-locked ERROR — no workflow file under ${dir}; refusing to pass on silence`);
  process.exit(2);
}

const refused = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let hasPermissions = false;
  let runIndent = -1; // >= 0 while inside a `run: |` block
  let firstRun = null;
  let holdsDeployToken = false;
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    const code = line.replace(/(^|\s)#.*$/, '');
    if (runIndent >= 0) {
      const indent = line.search(/\S/);
      if (line.trim() === '' || indent > runIndent) {
        if (/\$\{\{\s*secrets\./.test(line)) refused.push(`${at} a secret is pasted into a run: script (pass it through env:)`);
        if (/(^|[\s;|&(])npx\s/.test(code)) refused.push(`${at} npx in a run: script (use the lockfile's tool)`);
        return;
      }
      runIndent = -1;
    }
    if (/^permissions:/.test(line)) hasPermissions = true;
    if (/CLOUDFLARE_API_TOKEN/.test(code)) holdsDeployToken = true;
    const uses = code.match(/^\s*(?:-\s+)?uses:\s*(\S+)/);
    if (uses && !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(uses[1])) {
      refused.push(`${at} action not pinned to a commit SHA: ${uses[1]}`);
    }
    const run = code.match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (run) {
      const value = run[2].trim();
      if (/^[|>][-+]?$/.test(value)) {
        runIndent = run[1].length;
        if (firstRun === null) firstRun = lines.slice(i + 1).find((l) => l.trim() !== '')?.trim() ?? '';
      } else {
        if (firstRun === null) firstRun = value;
        if (/\$\{\{\s*secrets\./.test(value)) refused.push(`${at} a secret is pasted into a run: script (pass it through env:)`);
        if (/(^|[\s;|&(])npx\s/.test(value)) refused.push(`${at} npx in a run: script (use the lockfile's tool)`);
      }
    }
  });
  if (!hasPermissions) refused.push(`${file} has no top-level permissions: block`);
  if (holdsDeployToken && firstRun !== 'bash scripts/deploy-only-main.sh') {
    refused.push(`${file} deploys but its first run: step is not \`bash scripts/deploy-only-main.sh\` (found: ${firstRun ?? 'none'})`);
  }
}

const exact = /^\d+\.\d+\.\d+$/;
const pins = [
  ['services/offer-service/package.json', 'wrangler'],
  ['services/media-service/package.json', 'wrangler'],
  ['apps/supplier-app/package.json', 'eas-cli'],
];
const wranglers = new Set();
for (const [manifest, name] of pins) {
  let spec;
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    spec = pkg.devDependencies?.[name] ?? pkg.dependencies?.[name];
  } catch (err) {
    console.error(`deploy-chain-locked ERROR — cannot read ${manifest}: ${String(err)}`);
    process.exit(2);
  }
  if (spec === undefined) refused.push(`${manifest} does not pin ${name} (the workflows call it from the lockfile)`);
  else if (!exact.test(spec)) refused.push(`${manifest} pins ${name} to a range (${spec}), not one exact version`);
  if (name === 'wrangler' && spec !== undefined) wranglers.add(spec);
}
if (wranglers.size > 1) refused.push(`wrangler is pinned to ${wranglers.size} different versions: ${[...wranglers].join(', ')}`);

if (refused.length > 0) {
  console.error(`deploy-chain-locked FAILED — ${refused.length} violation(s):`);
  for (const r of refused) console.error(`  - ${r}`);
  process.exit(1);
}
console.log(`deploy-chain-locked OK — ${files.length} workflow(s): actions SHA-pinned, no npx, permissions declared, no secret in a script, every deploy starts with the main-only check; wrangler ${[...wranglers][0]} and eas-cli pinned exactly`);
