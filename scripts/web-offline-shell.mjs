#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

/**
 * COQUILLE-WEB-1 (AUDIT-B+2 F-85) — writes <dist>/sw.js from
 * apps/supplier-app/sw.template.js after a web export (both deploy workflows
 * run it between the export and the upload).
 *
 *   · PRECACHE = index.html + the scripts/styles index.html references + the
 *     font files: what the page needs to open with no network.
 *   · VERSION  = sha-256 over every file the worker may serve (path + bytes),
 *     so any changed byte is a new worker and a fresh cache.
 *
 * It refuses (exit 1, nothing written) a template whose placeholders do not
 * appear exactly once, a reference index.html makes to a missing file, or a
 * result that does not compile as a script. Exit 2 = no dist to work on.
 *
 * Usage: web-offline-shell.mjs <distDir> [--template <file>]
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2];
const at = process.argv.indexOf('--template');
const templatePath = at === -1 ? join(root, 'apps', 'supplier-app', 'sw.template.js') : process.argv[at + 1];

if (!dist || !existsSync(join(dist, 'index.html'))) {
  console.error(`web-offline-shell ERROR — no index.html in ${dist ?? '(no dist given)'}`);
  process.exit(2);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [relative(dist, p).split('\\').join('/')];
  });
const NOT_SERVED_BY_THE_WORKER = new Set(['sw.js', '_headers', 'metadata.json']);
const served = walk(dist).filter((f) => !NOT_SERVED_BY_THE_WORKER.has(f)).sort();

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:src|href)="\/?([^"?#]+\.(?:js|css))"/g)].map((m) => m[1]);
const missing = referenced.filter((f) => !served.includes(f));
if (referenced.length === 0 || missing.length > 0) {
  console.error(`web-offline-shell FAILED — index.html references ${referenced.length === 0 ? 'no script' : `missing file(s): ${missing.join(', ')}`}`);
  process.exit(1);
}
const fonts = served.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f));
const precache = ['index.html', ...referenced, ...fonts];

const hash = createHash('sha256');
for (const f of served) {
  hash.update(f);
  hash.update('\0');
  hash.update(readFileSync(join(dist, f)));
  hash.update('\0');
}
const version = hash.digest('hex').slice(0, 16);

const template = readFileSync(templatePath, 'utf8');
for (const ph of ['__VERSION__', '__PRECACHE__']) {
  const n = template.split(ph).length - 1;
  if (n !== 1) {
    console.error(`web-offline-shell FAILED — the template names ${ph} ${n} time(s), not exactly once`);
    process.exit(1);
  }
}
const sw = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache));
try {
  new Script(sw, { filename: 'sw.js' });
} catch (err) {
  console.error(`web-offline-shell FAILED — the filled worker does not compile: ${String(err)}`);
  process.exit(1);
}
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`web-offline-shell OK — ${join(dist, 'sw.js')} version ${version}, ${precache.length} file(s) precached: ${precache.join(', ')}`);
