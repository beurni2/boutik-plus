#!/usr/bin/env node
// CI gate (SUPPLIER-AUTHORING-1): the DEMO supply adapter must be ABSENT from the
// app's module graph — not merely unselected.
//
// THE FAILURE THIS CLOSES (shop-plus's scar, its JOURNAL): a demo/seed path that
// ships inside the bundle and fills gaps is a fabrication waiting for a code path.
// Two of them sat masked there — a hardcoded trust block on any real store, and a
// gap-filler drawing from the entire demo catalogue — harmless while the store was
// empty, live the moment it was not. An unset env resolving to something POPULATED
// is how fabricated data reaches a real surface.
//
// SO THE RULE IS CONSTRUCTION, NOT CONFIGURATION: `resolveSupplyService()` has no
// demo branch (unset ⇒ null ⇒ an honest « non configuré » state), and this gate
// proves no app-reachable file imports the demo module. Test files may import it
// freely — they are not in the app graph.
//
// Exit 1 = violation. Exit 2 = unusable input.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_SRC = join(root, 'apps', 'supplier-app');
const DEMO_MODULE = /['"][./\w-]*\/demo(\.js)?['"]/;
const SENTINEL = 'BOUTIK_DEMO_SUPPLY_ADAPTER_MUST_NOT_SHIP';

/** Files the APP can reach: everything under the app except test/ and the demo module itself. */
function appSources(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'test' || name === '.expo') continue;
      appSources(p, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

const files = appSources(APP_SRC);
if (files.length === 0) {
  console.error('no-demo-in-app-graph: found no app sources to scan — refusing to pass vacuously');
  process.exit(2);
}

const demoModulePath = join(APP_SRC, 'src', 'supply', 'demo.ts');
if (!existsSync(demoModulePath)) {
  console.error(`no-demo-in-app-graph: the demo module is missing (${relative(root, demoModulePath)}) — the gate would pass vacuously`);
  process.exit(2);
}

const problems = [];
for (const f of files) {
  if (f === demoModulePath) continue; // the module itself, obviously, carries the sentinel
  const src = readFileSync(f, 'utf8');
  const rel = relative(root, f);
  // 1 — no app file may IMPORT the supply demo module.
  for (const line of src.split('\n')) {
    if (/^\s*(import|export)\b/.test(line) && /supply\/demo/.test(line)) {
      problems.push(`${rel}: imports the demo supply adapter — it must stay out of the app graph`);
    }
  }
  // 2 — the sentinel may not appear anywhere in app source (it would mean the
  //     module was inlined or copied rather than kept absent).
  if (src.includes(SENTINEL)) {
    problems.push(`${rel}: carries the demo sentinel — the demo adapter has leaked into app source`);
  }
  // 3 — the resolver must never fall back to a demo adapter.
  if (/resolveSupplyService/.test(src) && /return\s+new\s+DemoSupplyService/.test(src)) {
    problems.push(`${rel}: resolveSupplyService falls back to DemoSupplyService — unset must resolve to null, never to fabricated data`);
  }
}

if (problems.length) {
  console.error('no-demo-in-app-graph FAILED — the demo adapter is reachable from the app:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`no-demo-in-app-graph OK: ${files.length} app source(s) scanned; the demo supply adapter is absent from the app graph`);
