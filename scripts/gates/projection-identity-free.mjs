#!/usr/bin/env node
// CI gate (B4.2): the supply projection is the PINNED contract shape —
// strict, eight fields (canon v3.0.0: five economics + productName + assetRefs
// + category), NO supplier identity/contact/precise-pickup. A leaking fixture
// FAILS. Exit 1 = violation. Exit 2 = unusable input.
//
// ── WHAT THIS GATE PROVES, AND WHAT IT DOES NOT (AUDIT-B+1 F7) ──────────────
// It validates a HAND-WRITTEN FIXTURE, not the producer. The audit added
// `supplierPhone` to the literal `buildSupplyProjection` emits and this gate
// still exited 0, because it re-read the unchanged JSON beside it. So the name
// promises more than the mechanism delivers, and that is now on the record here
// rather than in an audit nobody re-reads.
//
// The law itself IS defended, and NOT by this file:
//   · the runtime out-guard — supply-endpoint.ts:69-80, strict schema → key
//     sweep → value-side ref check;
//   · producer tests, which killed all three identity-leak mutations
//     (M-PROJ-01/02/03).
// So this is a gate proving less than its name suggests, not an open leak.
//
// DELIBERATELY NOT "FIXED" BY GENERATING THE FIXTURE FROM THE PRODUCER. That
// would build a second enforcement system to cover a law two others already
// hold, which is exactly the trap that cost this project a session's work
// (the reverted persisted-state gate — see JOURNAL 2026-08-06). If this gate
// ever becomes the ONLY thing standing between the producer and the wire, that
// is when it earns the rewrite. Until then it is a fixture check, named as one.
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
