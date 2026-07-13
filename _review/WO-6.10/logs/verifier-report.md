# VERIFIER REPORT — WO-6.10 "ADOPT THE MINT RULE" (boutik-plus @ 194eb5e)

Fresh-context verifier, dispatched with only the canon quotes, the diff scope, and the DoD
(no memory of the build). Every claim below is grounded in a tool result from its session.

### A. Math.random is gone from the mint graph — CONFIRMED
`apps/supplier-app/src/offline/commandId.ts` contains **zero `Math.random(` calls**. The only 5 occurrences (lines 7, 10, 16, 26, 47) are inside comments stating the prohibition; the gate strips comments before scanning, and my stripped-code check returned `Math.random( in stripped code: false`. The seam delegates to canon: line 49-51 `mintCommandId()` returns `canonMintCommandId()`. The expo-crypto side-effect (lines 28-40) installs **no** `Math.random` fallback in any branch — it wires `Crypto.randomUUID` into `globalThis.crypto.randomUUID` only when a real CSPRNG exists; otherwise the global stays absent and canon throws. Imports are `expo-crypto` + `@platform/contracts` only — **no node `crypto` builtin** import (grep of `src/offline/` returned none).

### B. Honesty contract holds — CONFIRMED
`App.tsx confirmReady` (lines 231-263): the mint is wrapped `try { commandId = mintCommandId(); } catch { setB7Phase('queue_error'); return; }` (App.tsx:246-251) — on throw it sets `queue_error` and **early-returns before any enqueue**, so no `queued`/`pending` is claimed. The `queue_error` copy is honest: *"Cette confirmation n'a pas pu être enregistrée. Réessayez."* (catalog.json:844) — **not** « en attente ». The « en attente du réseau » wording lives only on `ready.queued_offline` (catalog.json:808), reached solely after `enqueue()` resolves non-collision. No path surfaces « en attente » on a failed/absent mint. The online-path `pending` state is unreachable from a mint throw (mint runs only on the offline branch).

### C. Gate is non-vacuous — CONFIRMED
Positive: `node scripts/gates/check-mint-path-entropy.mjs` → exit 0, "1 mint path(s) draw from the OS CSPRNG; zero Math.random". Negative fixture: `show-mint-path-entropy-negative.sh` → exit 1, "planted Math.random in commandId.ts CAUGHT (exit 1; output names Math.random)". **My own independent tamper** (copied the file, appended a real `Math.random()` call, re-rooted the gate via sed at a temp tree) → exit 1, offender named. Non-vacuity token is real: boutik's file genuinely contains `randomUUID` in non-comment code (`Crypto.randomUUID()`), and the gate's token `\b(randomUUID|getRandomValues)\b` is byte-identical to canon's — not weakened.

### D. WO-6.5 tests unchanged AND non-vacuous — CONFIRMED
`git diff bd69281..194eb5e -- apps/supplier-app/test/offline-queue.test.ts` is **empty**. The 8 tests assert real invariants: cold-boot survival in order (L63-71), delivered-not-re-sent (L88-96), collision REFUSED with original retained (L130-138), poison→named `failed` with honest reason (L141-162), retry-to-maxAttempts (L164-179), queued-never-shows-success (L182-200). Ran directly: **8/8 pass**.

### E. Re-pin complete — CONFIRMED
No `fa2ff246`/`539dbc8` in any live pin — `git grep` excluding JOURNAL.md/_review/design-reference returned exit 1 (no hits); surviving hits are only history/frozen-evidence/reference files (all excluded per DoD). Lockfile: **57× new sha `2153661…`, 0× stale sha, 0× `git@github` ssh URL**. Workspace overrides carry the new sha. Drift-check passes at **packageVersion 0.9.5** (11 canonical docs match).

### F. grand-teint allowlist edit — CONFIRMED acceptable
It is a manifest guard: it records the WO-directed dep `expo-crypto: ~15.0.9` (present in package.json:19 and node_modules) and keeps the exact-set assertion `added.sort()).toEqual([...])`. A hypothetical unapproved new dep would break that equality → test fails. No behaviour invariant weakened.

### G. Full runs — CONFIRMED green
- `pnpm typecheck` → exit 0 (11/11); forced no-cache supplier-app `tsc --noEmit` → exit 0.
- `pnpm test` → exit 0 (19/19); forced supplier-app `vitest run` → **121/121 pass** (offline-queue 8, grand-teint 8).
- `bash scripts/run-gates.sh` → exit 0, final line **"ALL GATES GREEN (positives passed; every negative fixture failed as required)"**. Mint-path positive+negative and drift-check@0.9.5 all behaved.

### H. Smell check — clean
No empty catch (the catch sets `queue_error` + returns). No node `crypto` import. No « Ma Boutique »/« Mon Shop » in added lines. Canon entry `dist/index.js:21` `export * from './command-id.js'` confirms `mintCommandId`/`CommandId` resolve. Installed canon throws `'mintCommandId: no OS CSPRNG…'` when the global is absent and returns `CommandIdSchema.parse(webCrypto.randomUUID())` — matches the code's comments exactly (no claim unmatched by code).

### Observation (not a blocker)
The offline-queue tests use hardcoded command_ids, so `mintCommandId()` and the expo-crypto side-effect are not exercised at app-runtime by any test in this repo. Their correctness rests on canon's own unit tests plus the static entropy gate. Given the seam design and the DoD (which mandates those 8 tests stay byte-unchanged), this is acceptable — noting it only for completeness.

---

**VERDICT: PASS**
**BLOCKERS: 0**
