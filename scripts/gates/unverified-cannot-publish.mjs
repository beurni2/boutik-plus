#!/usr/bin/env node
// CI gate (B0.2): "unverified cannot publish" — REFUSED CLOSED. Drives the
// REAL SupplierRegistry (built dist): onboard → optional server phone
// confirmation → canPublish. Exit 1 = the invariant caught a violation
// (the fixture claims a publish its supplier cannot have). Exit 2 =
// unusable input (crash ≠ pass).
import { readFileSync } from 'node:fs';
import { SupplierRegistry } from '../../services/supplier-service/dist/onboarding.js';

const path = process.argv[2];
if (!path) { console.error('usage: unverified-cannot-publish.mjs <fixture.json>'); process.exit(2); }

let fixture;
try { fixture = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`unreadable fixture: ${e.message}`); process.exit(2); }
const { supplier, publishAttempt } = fixture;
if (!supplier || publishAttempt !== true) { console.error('fixture must carry supplier + publishAttempt:true'); process.exit(2); }

const registry = new SupplierRegistry();
const onboarded = registry.onboard({ command_id: 'gate', phoneAlias: supplier.phoneAlias, displayName: supplier.displayName ?? 'X' });
if (!onboarded.ok) { console.error('fixture supplier failed to onboard'); process.exit(2); }
if (supplier.phoneVerified === true) registry.confirmPhoneVerified(onboarded.user.id);

if (!registry.canPublish(onboarded.user.id)) {
  console.error(`VIOLATION: fixture publishes as ${supplier.phoneAlias}, whose phone is ${supplier.phoneVerified === true ? 'verified' : 'UNVERIFIED'} — publish REFUSED CLOSED (B0.2)`);
  process.exit(1);
}
console.log(`OK: supplier ${onboarded.user.id} is phone-verified (tier ${onboarded.trust.tier}) — publish allowed`);
