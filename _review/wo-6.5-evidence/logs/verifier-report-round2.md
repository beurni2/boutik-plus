# WO-6.5 — fresh-context RED re-verifier (round 2, on FINAL bytes) — verbatim
Reviewed git diff main...HEAD on e6/wo-6.5 @ 8a46e7e, AFTER the round-1 PASS was VOIDED (bytes changed).
All attacks performed by the verifier's own hands.

## FINDINGS
1. HOSTILE IMAGE — OK. 18/18 defeated (11 self-crafted, absent from the corpus): APP3/APP12/APP4 carriers,
   post-EOI PE/MZ polyglot, double-EOI decoy, hostile APP4 after the scan, lying-length on an ALLOWED
   segment (DQT), under-length header, bomb SOF2 (progressive 0xC2, 60000×60000), width 8193 (one past the
   8192 ceiling), no-EOI truncation. Every payload dropped or fail-closed (detail 'strip_failed', no raw
   crash); a clean JPEG still survives byte-identical (not over-refused). normalization.ts unchanged since
   8dc25ec (before the CTO commit) — stricter, not weakened.
2. COMMAND_ID REBOOT-SAFETY — OK. (a) id derives ONLY from mintCommandId() (Math.random); no Date.now, no
   confirmSeqRef, no resetting counter in the id path (the only Date.now in offline/ is queue.ts enqueuedAt).
   (b) Execution: minted 99e6db51-…-1372, enqueued, dropped the instance, saw the id LITERALLY in the
   persisted file; cold-boot kept the original id (recomputation impossible); a fresh mint differed; survived
   a 2nd reboot in order; 200,000 mints, ZERO duplicates; v4-shaped. (c) Canon gap GENUINE — contract is only
   command_id: z.string().min(1); grep of @platform/contracts + docs/ finds NO mint/format/idempotency-key
   rule. The flag is honest; non-CSPRNG source appropriate for an idempotency key (not a security token).
3. enqueue DISCRIMINATED RESULT — OK. enqueue X/A then X/B → outcome 'collision', entry retains A (8500),
   B (13725) never written, snapshot length 1; same-id different-name also collides; identical replay →
   'duplicate'. App.tsx confirmReady mints once, .then() checks outcome==='collision' → setB7Phase(
   'queue_error') and returns — never falls through to 'queued'; queue_error renders
   « Cette confirmation n'a pas pu être enregistrée. Réessayez. » with warning icon + retry. 'queued' is set
   only inside the resolved enqueue (after persistence).
4. QUEUE PROPERTIES — OK. 17/17: 4 actions survive kill+reboot still-pending in order then deliver;
   exactly-once across 3 deliver() + reboot; a rejecting send leaves the entry pending (never delivered)
   across a reboot until a resolved send flips it; PoisonError → failed with reason, still in snapshot,
   entries behind it deliver in order; transient retries to maxAttempts then fails (no infinite block).
5. RE-ENCODE GATE — OK (one documented limitation). The source-text test is NOT vacuous: mutating capture.ts
   to feed the master / to stripJpegMetadata(photo…) / to drop the re-encode each fails the relevant
   assertion; the real runtime order in captureShot is correct (renderDerivative → base64ToBytes(
   derivative.base64) → stripJpegMetadata(bytes) → assertExifFree(stripped)). CONCERN: being source-text, it
   pins ordering/data-flow but cannot exercise native expo-image-manipulator to prove the entropy stream is
   actually regenerated at runtime — that native efficacy is untestable in-sandbox. Architecture correct;
   residual risk is the native library, not the diff.

GATES / FORBIDDEN — OK. tsc clean; vitest run test/ = 119 passed (17 files); copy-lint 141/0; no-emoji clean;
hostile-corpus non-vacuity executes + passes (16/16, not skipped); FORBIDDEN diff (demo/store.ts, journey.ts,
ui/kit.tsx) = 0 lines.

MINOR OBSERVATION (not a blocker): App online-flush uses an always-resolving no-op send deliver(async ()=>{}),
so in the demo every queued item flips to delivered on reconnect with no real backend round-trip. Correct for
the E1 walking skeleton and honestly commented; the queue's OWN failure/poison/transient behavior is proven in
its tests. Flagged only so it isn't mistaken for a certified failing mock at the app layer.

## VERDICT: PASS (0 blockers, 1 concern — re-encode gate's native runtime efficacy is untestable in-sandbox).
