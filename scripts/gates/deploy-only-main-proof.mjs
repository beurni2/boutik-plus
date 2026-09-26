#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * PROOF of scripts/deploy-only-main.sh (DEPLOI-VERROU-1 — AUDIT-B+2 F-84).
 *
 * The deploy step itself only ever runs on GitHub. This drives the REAL script
 * against a local git repository standing in for the remote, with a `gh`
 * stand-in on PATH that answers the ci question and records what it was
 * asked. Bounds of the stand-in, stated so nothing more is claimed: it
 * returns a fixed `total_count` (or garbage) and records its argv; it does
 * not model GitHub's API, only the one number the script reads from it.
 *
 * It asserts every way the script must answer:
 *   allowed  — main's newest commit, ci green (and the question asked was
 *              about THIS commit, THIS workflow, successful runs only);
 *   refused  — a branch commit ahead of main; an older commit of main; ci
 *              not green; ci's answer unreadable; main unreadable.
 * Exit 0 when every case answers as it must, 1 otherwise, 2 when the proof
 * could not set itself up.
 */
const script = resolve('scripts/deploy-only-main.sh');
const work = mkdtempSync(join(tmpdir(), 'deploy-only-main-'));
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`deploy-only-main-proof ERROR — git ${args.join(' ')}: ${r.stderr}`);
    rmSync(work, { recursive: true, force: true });
    process.exit(2);
  }
  return r.stdout.trim();
};

const remote = join(work, 'remote');
git(['init', '-q', '-b', 'main', remote]);
const ident = ['-c', 'user.name=proof', '-c', 'user.email=proof@example.invalid'];
git([...ident, 'commit', '-q', '--allow-empty', '-m', 'older'], remote);
const older = git(['rev-parse', 'HEAD'], remote);
git([...ident, 'commit', '-q', '--allow-empty', '-m', 'tip'], remote);
const tip = git(['rev-parse', 'HEAD'], remote);
git(['checkout', '-q', '-b', 'feature'], remote);
git([...ident, 'commit', '-q', '--allow-empty', '-m', 'ahead'], remote);
const ahead = git(['rev-parse', 'HEAD'], remote);
git(['checkout', '-q', 'main'], remote);

const bin = join(work, 'bin');
spawnSync('mkdir', ['-p', bin]);
const argsLog = join(work, 'gh-args');
writeFileSync(
  join(bin, 'gh'),
  `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${argsLog}"\nprintf '%s\\n' "$GH_STUB_ANSWER"\n`,
);
chmodSync(join(bin, 'gh'), 0o755);

const run = (sha, answer, remoteUrl = remote) => {
  rmSync(argsLog, { force: true });
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: process.env.HOME ?? work,
      GITHUB_SHA: sha,
      GITHUB_REPOSITORY: 'beurni2/boutik-plus',
      GH_TOKEN: 'test-token-not-real',
      DEPLOY_REMOTE: remoteUrl,
      GH_STUB_ANSWER: answer,
    },
  });
};

const failures = [];
const expect = (name, r, code, needle) => {
  const out = `${r.stdout}${r.stderr}`;
  if (r.status !== code || !out.includes(needle)) {
    failures.push(`${name}: wanted exit ${code} with « ${needle} », got exit ${r.status}: ${out.trim()}`);
  } else {
    console.log(`  ok — ${name} (exit ${code})`);
  }
};

const allowed = run(tip, '1');
expect("main's newest commit, ci green → allowed", allowed, 0, 'deploy allowed');
const asked = existsSync(argsLog) ? readFileSync(argsLog, 'utf8') : '';
const wantUrl = `repos/beurni2/boutik-plus/actions/workflows/ci.yml/runs?head_sha=${tip}&event=push&branch=main&status=success`;
if (!asked.includes(wantUrl)) failures.push(`the ci question was not about this commit's successful ci runs — gh was asked: ${asked.trim() || '(nothing)'}`);
else console.log("  ok — the ci question names this commit, the ci workflow, main's own push run and successful runs only");

expect('a branch commit ahead of main → refused', run(ahead, '1'), 1, "main's newest commit is");
expect('an older commit of main → refused', run(older, '1'), 1, "main's newest commit is");
expect('ci not green on the tip → refused', run(tip, '0'), 1, 'ci has not passed');
expect("ci's answer unreadable → refused", run(tip, 'not-a-number'), 1, "could not read ci's result");
expect('main unreadable → refused', run(tip, '1', join(work, 'no-such-remote')), 1, "could not read main's newest commit");

rmSync(work, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(`deploy-only-main-proof FAILED — ${failures.length} case(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('deploy-only-main-proof OK — only main\'s newest commit, green in ci, is allowed; every other case is refused');
