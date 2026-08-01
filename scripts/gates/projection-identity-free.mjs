#!/usr/bin/env node
// CI gate (B4.2): the supply projection is the PINNED contract shape —
// strict, eight fields (canon v3.0.0: five economics + productName + assetRefs
// + category), NO supplier identity/contact/precise-pickup. A leaking fixture
// FAILS. Exit 1 = violation. Exit 2 = unusable input.
// (@platform/certification is node tooling — legal in a gate script, banned
// from the app runtime graph.)
import { readFileSync } from 'node:fs';
import { DOMAIN_PAYLOAD_SCHEMAS } from '@platform/certification';

const path = process.argv[2];
if (!path) { console.error('usage: projection-identity-free.mjs <projection-fixture.json>'); process.exit(2); }

let fixture;
try { fixture = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`unreadable fixture: ${e.message}`); process.exit(2); }

const LEAK = /supplier|phone|contact|pickup|adresse|address|whatsapp/i;
let failed = false;
if (!DOMAIN_PAYLOAD_SCHEMAS['supply-projection'].safeParse(fixture).success) {
  console.error('VIOLATION: not the pinned strict supply-projection contract (undeclared or missing fields)');
  failed = true;
}
for (const key of Object.keys(fixture ?? {})) {
  if (LEAK.test(key)) {
    console.error(`VIOLATION: identity/contact/pickup material in projection key '${key}'`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('OK: projection matches the pinned contract Shop+ reads — eight fields, identity-free');
