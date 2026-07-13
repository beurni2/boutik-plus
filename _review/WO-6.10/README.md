# WO-6.10 · ADOPT THE MINT RULE — evidence packet (🟠 AMBER · DO NOT MERGE)

**Branch:** `e6/wo-6.10` · **HEAD:** `194eb5e` (see `logs/head-sha.txt`, `logs/branch-log.txt`)
**Base:** `bd69281` (main, WO-6.8) · **Diff:** `logs/full.diff` (`logs/diffstat.txt`)

## What this slice does
Adopts canon's `command_id` mint rule (canon WO-5.9, v0.9.5) at the app's offline seam,
killing `Math.random` as the idempotency-key source, and inherits canon's mint-path
entropy gate.

1. **Re-pin canon v0.9.0 → v0.9.5 (`2153661`)** across every package.json + `pnpm.overrides`
   + `pnpm-workspace.yaml` overrides; lockfile regenerated (0 stale sha, 0 ssh-form URL).
   Two drifted canon docs re-synced byte-exact (Execution Contract §3.1 tiering; Master
   Reference `return`/`platform` renames); drift-check bumped to 0.9.5.
2. **`src/offline/commandId.ts`** deletes the local Math.random v4 helper and delegates to
   `@platform/contracts` `mintCommandId` (branded UUIDv4 from `globalThis.crypto.randomUUID`).
   `expo-crypto ~15.0.9` surfaces the OS CSPRNG under that shape on RN — with **no
   Math.random shim**: no CSPRNG ⇒ the mint THROWS.
3. **`App.tsx` `confirmReady`** wraps the mint in try/catch → `queue_error` (never enqueues,
   never fakes « en attente »). Same honesty contract as the queue's id-collision path.
4. **Inherited gate** `scripts/gates/check-mint-path-entropy.mjs` (+ planted-negative
   `show-mint-path-entropy-negative.sh`), wired into `run-gates.sh`. Scan root adapted
   `packages/` → `apps//packages//services/`; Math.random check + CSPRNG non-vacuity token
   are canon's, unweakened. **Closes the Math.random NAMED DEBT (0663c9c).**

## The WO-6.5 offline-queue behaviour tests are UNCHANGED
`git diff bd69281..194eb5e -- apps/supplier-app/test/offline-queue.test.ts` = 0 lines. All 8
pass. The STOP-AND-FLAG clause (scoped to those tests) did not trigger.

## Flags for founder review (AMBER — your veto)
- **① One test edit:** `test/grand-teint.test.ts` dep-allowlist now records the WO-directed
  `expo-crypto`. Manifest guard, not a behaviour test; the guard still fails any *other* new
  dep. Cited to WO-6.10 in-line.
- **② Stale-comment correction:** `pnpm-workspace.yaml`'s overrides comment cited
  `539dbc8a / v0.6.0` (a lie post-re-pin) → corrected to `2153661 / v0.9.5` + real transitive
  versions. Override VALUES were already correct; only the comment moved.

## Evidence (`logs/`)
- `run-gates.txt` — full `run-gates.sh`: typecheck 0 · full test suite · **ALL GATES GREEN**
  (every positive passed, every negative fixture failed as required; mint-path-entropy
  positive+planted-negative + drift-check@0.9.5 included).
- `coldproof.log` — **CLEAN-STORE COLD PROOF**: fresh HOME (auth line shown = the transparent
  HTTPS→proxy `insteadOf`, NOT ssh) + fresh empty pnpm store + `--frozen-lockfile` + fresh
  clone of `194eb5e`. contracts 0.9.5 + expo-crypto 15.0.9 present; no-ssh-lockfile green on
  the cold-cloned lockfile; **cold both-platform export android 832 / ios 834, both exit 0** —
  byte-matching the warm export.
- `head-sha.txt` · `branch-log.txt` · `full.diff` · `diffstat.txt` — atomic, one HEAD.
- `verifier-report.md` — fresh-context AMBER verifier verdict on the final bytes.

## Warm proof
Both-platform export from the working tree: android **832** / ios **834** modules (was
828/830; +expo-crypto graph), Hermes `.hbc` emitted, exit 0.
