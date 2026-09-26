#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * PROOF of scripts/web-offline-shell.mjs (COQUILLE-WEB-1 — AUDIT-B+2 F-85),
 * on a copy of the committed fixture page (gates/fixtures/web-size-dist):
 *
 *   · it writes sw.js whose precache is EXACTLY index.html + the script
 *     index.html loads + the font — nothing guessed, nothing missing;
 *   · the same bytes give the same version (a redeploy of an unchanged page
 *     re-downloads nothing), and one changed byte gives a new version (a
 *     changed page is never served from an old cache);
 *   · it refuses, writing nothing, a template that names a placeholder twice
 *     and a page whose index.html loads a missing script.
 *
 * What it does NOT claim: how a browser runs the worker. That was walked in a
 * real Chromium (online → offline → reload) and is journalled, not re-run
 * here — this repo carries no browser driver (a new dependency is the
 * founder's call).
 */
const FIXTURE = resolve('gates/fixtures/web-size-dist');
const TEMPLATE = resolve('apps/supplier-app/sw.template.js');
const shell = resolve('scripts/web-offline-shell.mjs');
const work = mkdtempSync(join(tmpdir(), 'offline-shell-proof-'));
const failures = [];
const ok = (m) => console.log(`  ok — ${m}`);

const copy = (name) => {
  const d = join(work, name);
  cpSync(FIXTURE, d, { recursive: true });
  return d;
};
const run = (dist, extra = []) => spawnSync('node', [shell, dist, ...extra], { encoding: 'utf8' });
const read = (dist) => {
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  const version = sw.match(/^const VERSION = '([0-9a-f]+)';$/m)?.[1];
  const precache = JSON.parse(sw.match(/^const PRECACHE = (\[.*\]);$/m)?.[1] ?? 'null');
  return { sw, version, precache };
};

const a = copy('a');
const ra = run(a);
if (ra.status !== 0) failures.push(`the fixture page was refused: ${ra.stderr}`);
else {
  const { sw, version, precache } = read(a);
  const want = ['index.html', '_expo/static/js/web/index-0f1e2d3c.js', 'assets/fonts/Fixture.0a1b2c.ttf'];
  if (JSON.stringify(precache) !== JSON.stringify(want)) failures.push(`precache is ${JSON.stringify(precache)}, want ${JSON.stringify(want)}`);
  else ok('the precache is exactly index.html, its script and the font');
  if (!/^[0-9a-f]{16}$/.test(version ?? '') || sw.includes('__VERSION__') || sw.includes('__PRECACHE__')) failures.push('the placeholders were not filled');
  else ok(`both placeholders filled (version ${version})`);

  const b = copy('b');
  run(b);
  if (read(b).version !== version) failures.push('the same bytes gave a different version');
  else ok('the same bytes give the same version');

  const c = copy('c');
  appendFileSync(join(c, '_expo/static/js/web/index-0f1e2d3c.js'), '\n// one changed byte\n');
  run(c);
  if (read(c).version === version) failures.push('a changed script kept the old version — an old cache would serve it');
  else ok('one changed byte gives a new version');
}

const badTemplate = join(work, 'twice.template.js');
writeFileSync(badTemplate, `${readFileSync(TEMPLATE, 'utf8')}\n// __VERSION__ named twice\n`);
const d = copy('d');
const rd = run(d, ['--template', badTemplate]);
if (rd.status !== 1 || !rd.stderr.includes('not exactly once')) failures.push(`a template naming a placeholder twice was not refused (exit ${rd.status})`);
else ok('a template that names a placeholder twice is refused');

const e = copy('e');
rmSync(join(e, '_expo/static/js/web/index-0f1e2d3c.js'));
const re = run(e);
if (re.status !== 1 || !re.stderr.includes('missing file')) failures.push(`a page loading a missing script was not refused (exit ${re.status})`);
else ok('a page whose index.html loads a missing script is refused');

rmSync(work, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(`web-offline-shell-proof FAILED — ${failures.length} case(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('web-offline-shell-proof OK — the shell precaches exactly the page, versions by its bytes, and refuses what it cannot build');
