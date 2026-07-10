#!/usr/bin/env node
// CI gate (B6.2): « Produit prêt » — no pickup task before readiness; a
// readiness payload carrying buyerDropCode is refused by the canonical
// STRICT PackageReadinessConfirmation; an expired challenge is refused.
// Drives the REAL FulfillmentBook (built dist) through the fixture's
// scenario. Exit 1 = violation caught. Exit 2 = unusable input.
import { readFileSync } from 'node:fs';
import { FulfillmentBook, READINESS_CHALLENGE_TTL_MS } from '../../services/fulfillment-service/dist/fulfillment.js';

const path = process.argv[2];
if (!path) { console.error('usage: readiness-gate.mjs <scenario-fixture.json>'); process.exit(2); }

let fixture;
try { fixture = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`unreadable fixture: ${e.message}`); process.exit(2); }

const T = '2026-07-10T09:00:00.000Z';
const book = new FulfillmentBook();
book.accept({ orderId: fixture.orderId, variant: fixture.variant, qty: fixture.qty, sellerNetFcfa: fixture.sellerNetFcfa, deadline: '2026-07-10T18:00:00.000Z' });
const issued = book.issueChallenge(fixture.orderId, T);
if (!issued.ok) { console.error('challenge issue failed'); process.exit(2); }

if (fixture.scenario === 'pickup_before_readiness') {
  // The fixture claims a pickup task with NO readiness confirmed.
  if (fixture.pickupTaskRequested === true && !book.isPickupEligible(fixture.orderId)) {
    console.error(`VIOLATION: fixture requests a pickup task for ${fixture.orderId} with NO confirmed readiness — refused (B6.2: no pickup task before readiness)`);
    process.exit(1);
  }
  console.error('scenario did not exercise the invariant'); process.exit(2);
}

const confirmAt = fixture.scenario === 'expired_challenge'
  ? new Date(Date.parse(T) + READINESS_CHALLENGE_TTL_MS + 60_000).toISOString()
  : T;
const payload = {
  orderId: fixture.orderId,
  photoRef: fixture.photoRef,
  readinessChallenge: issued.challenge,
  qty: fixture.qty,
  variant: fixture.variant,
  availableConfirmed: true,
  at: T,
  ...(fixture.extraPayload ?? {}),
};
const outcome = book.confirmReady(payload, confirmAt);

if (fixture.scenario === 'happy') {
  if (!outcome.ok || !book.isPickupEligible(fixture.orderId)) {
    console.error(`unexpected refusal on the happy path: ${outcome.ok ? '' : outcome.reason}`); process.exit(2);
  }
  console.log(`OK: readiness confirmed with a live challenge — ${fixture.orderId} is pickup-eligible, and only now`);
  process.exit(0);
}
if (outcome.ok || book.isPickupEligible(fixture.orderId)) {
  console.error(`the invariant FAILED to catch scenario '${fixture.scenario}' — readiness accepted`); process.exit(2);
}
console.error(`VIOLATION (caught, refused closed): scenario '${fixture.scenario}' → ${outcome.reason}; no pickup eligibility exists`);
process.exit(1);
