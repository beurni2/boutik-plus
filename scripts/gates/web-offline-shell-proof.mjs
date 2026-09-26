#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

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
 * And it RUNS the written worker against stand-ins for the browser's cache
 * and network (bounds: an in-memory cache and a scripted fetch — enough to
 * see which URLs the worker asks for and what it stores; nothing about how a
 * browser schedules it):
 *   · the shell is fetched at the ROOT, never as /index.html, and a host
 *     that answers with a redirect still leaves a clean, non-redirected copy
 *     (Cloudflare Pages redirects /index.html → /, and a navigation refuses
 *     a redirected answer — the verifier's BLOCKER on this slice);
 *   · a failed navigation is answered with that copy;
 *   · an HTML page sent back under a hashed script name is never kept.
 *
 * What it does NOT claim: how a real browser runs the worker. That was walked
 * in a real Chromium behind a Pages-style redirect (online → offline →
 * reload → deep path → redeploy) and is journalled, not re-run here — this
 * repo carries no browser driver (a new dependency is the founder's call).
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
async function runTheWorker(sw, failures) {
  const ORIGIN = 'https://boutik.example';
  const listeners = {};
  const store = new Map();
  const keyOf = (k) => (typeof k === 'string' ? k : k.url);
  const caches = {
    open: async (n) => {
      if (!store.has(n)) store.set(n, new Map());
      const m = store.get(n);
      return {
        put: async (k, v) => void m.set(keyOf(k), v),
        match: async (k) => m.get(keyOf(k)),
        keys: async () => [...m.keys()].map((url) => ({ url })),
      };
    },
    match: async (k) => {
      for (const m of store.values()) if (m.has(keyOf(k))) return m.get(keyOf(k));
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (n) => store.delete(n),
  };
  const asked = [];
  let network = async (url) => {
    asked.push(url);
    if (url === `${ORIGIN}/`) {
      // Pages: the root, reached after a redirect — the flag a navigation refuses.
      return { ok: true, redirected: true, status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'text/html' }), blob: async () => new Blob(['<html>coquille</html>']) };
    }
    return new Response('ok', { headers: { 'content-type': url.endsWith('.ttf') ? 'font/ttf' : 'text/javascript' } });
  };
  const self = {
    location: { href: `${ORIGIN}/sw.js` },
    addEventListener: (type, fn) => void (listeners[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  runInNewContext(sw, { self, caches, fetch: (u, o) => network(typeof u === 'string' ? u : u.url, o), Response, Headers, Blob, URL, Promise, JSON, Set, Error });
  let done;
  listeners.install({ waitUntil: (p) => void (done = p) });
  await done;
  if (asked.includes(`${ORIGIN}/index.html`)) failures.push('the worker asked for /index.html — Pages answers that with a redirect');
  else ok('the shell is fetched at the root, never as /index.html');
  const shell = await caches.match(`${ORIGIN}/`);
  if (shell === undefined || shell.redirected !== false || (await shell.clone().text()) !== '<html>coquille</html>') {
    failures.push('the stored shell is missing, or still marked redirected — a navigation would refuse it');
  } else ok('a redirected answer is stored as a clean copy a navigation can use');

  const answer = async (request) => {
    let p;
    listeners.fetch({ request, respondWith: (x) => void (p = x) });
    return p;
  };
  network = async () => {
    throw new TypeError('offline');
  };
  const offline = await answer({ method: 'GET', url: `${ORIGIN}/une/page`, mode: 'navigate' });
  if (offline === undefined || (await offline.clone().text()) !== '<html>coquille</html>') failures.push('an offline navigation did not get the shell');
  else ok('an offline navigation is answered with the shell');

  network = async () => new Response('<html>app</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  const lost = `${ORIGIN}/_expo/static/js/web/index-disparu.js`;
  await answer({ method: 'GET', url: lost, mode: 'no-cors' });
  if ((await caches.match(lost)) !== undefined) failures.push('an HTML page sent under a script name was kept in the cache');
  else ok('an HTML page sent under a hashed script name is never kept');
}

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

  await runTheWorker(sw, failures);

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
