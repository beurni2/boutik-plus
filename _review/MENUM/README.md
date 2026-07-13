# MODERATION ENUM: LOCAL → CANON (🟠 AMBER · DO NOT MERGE)

**Branch:** `moderation-enum-to-canon` · **HEAD:** `c722daa` (see `logs/head-sha.txt`, `logs/branch-log.txt`)
**Base:** `main` (`76c1b60`, Boutik depth complete) · **Diff:** `logs/full.diff` (`logs/diffstat.txt`) — 16 files.
**Gate:** canon WO-5.10 merge `ba6f16d` (v0.9.6) — VERIFIED present on canon `origin/main` by own fetch before start.

## What this slice does (the four steps, one pass)
1. **Re-pin `2153661` (v0.9.5) → `ba6f16d` (v0.9.6)** across every `@platform/*` dep + the workspace
   overrides; lockfile regenerated. GUARD: installed `@platform/contracts` prints **0.9.6** · lockfile
   **0 ssh-form** · new sha present / old sha absent · `drift-check` bumped to **0.9.6** (only the manifest's
   packageVersion moved between v0.9.5 and v0.9.6 — every canonical doc sha256 is unchanged, so no `/docs`
   re-sync was needed).
2. **`catalog-service` adopts canon's `ModerationReasonCodeSchema` + `ModerationDecisionSchema`.** The local
   A1 reason-code enum + decision schema are **deleted**; the sole definition now lives in canon (§5 identity
   by construction). The 6 reason codes byte-match (founder-ratified v1).
3. **`decide()` rewired under the CALLER-BINDING condition (founder).** It accepts a WIRE input carrying **no
   `decided_by`** (discriminates on canon's `decision` field), and STAMPS `decided_by` from `ctx.actor` via
   `{ ...input, decided_by: ctx.actor }` — the single source. A wire-supplied `decided_by` is **overwritten
   (ignored)**; canon's `ops:moderation:*` regex on the stamped field is the **total actor guard**. The
   separate `isModerationOperator` check is **retired** — the stamp makes canon's regex total.
4. **The local enum + local decision schema DIE.** Grep proves **0** local definitions under
   `services/`/`apps/`/`packages/`; the one definition is canon's.

## Caller-binding — the two mandated tests (moderation.test.ts, now 8)
- **③ end-to-end supplier refusal** (stamp → canon parse → refusal): a supplier `ctx.actor` is stamped as
  `decided_by`, canon's regex refuses it, state untouched.
- **⑤ smuggle ignored**: a caller casts past the wire type to inject `decided_by:'ops:moderation:op-3'` while
  `ctx.actor` is a supplier → still refused (the stamp overwrites the smuggle) — `decided_by` has one source.
- Plus every A1 invariant re-asserted against canon's shape: no self-moderation · reasonless
  `changes_requested` unrepresentable (canon schema rejects it) · timeout→pending UNTOUCHED ·
  approved-unlocks-activation.

## Evidence
- `logs/run-gates.txt` — full **warm** `run-gates.sh`: typecheck 0 · tests · **ALL GATES GREEN** (drift-check
  OK @ packageVersion **0.9.6**; every negative fixture fired). Gate SCRIPTS byte-unchanged vs main (only
  `run-gates.sh`'s `--pinned-version` bumped).
- `logs/coldgates.log` — **cold-gates proof showing its own isolation** (WO-7.1 evidence law): fresh HOME
  (auth line = HTTPS→proxy `insteadOf`, NOT ssh) + fresh EMPTY store + `--frozen-lockfile` + fresh clone of
  `c722daa` → `run-gates.sh` **exit 0, ALL GATES GREEN from nothing** (cold HEAD `c722daa`; cold-cloned
  `@platform/contracts` prints **0.9.6**; drift-check OK @ 0.9.6; every negative fixture fired).
- `evidence/` — re-pin guards · death-proof grep · caller-binding scratch proof · catalog tests.
- `logs/head-sha.txt` · `logs/branch-log.txt` · `logs/full.diff` · `logs/diffstat.txt` — atomic, one HEAD.
- `logs/verifier-report.md` — fresh-context AMBER verifier on the final bytes: **VERDICT PASS · 0
  BLOCKERS**. It mutation-tested the stamp (both its own scratch smuggle-test AND the shipped ⑤
  flipped to approving the smuggle, then reverted), re-proved the re-pin/death/13-invariants, and
  confirmed gate scripts byte-unchanged. One recorded observation (out of scope): catalog-service
  test files aren't CI type-checked, so the `@ts-expect-error` guards are runtime-only — the
  `safeParse` assertions still protect the invariant.

## Test counts
catalog-service **13/13** (moderation 8 incl. ③ + ⑤ caller-binding · product 3 · health 2) · full suite 19/19
· typecheck 11/11.
