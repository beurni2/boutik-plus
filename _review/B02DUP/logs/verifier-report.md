# B0.2-DUP — fresh-context verifier report

**On the final bytes `bfe9fcf`** (byte-identical in HEAD after the evidence commit `42b5c62`, which touched only `JOURNAL.md` + `_review/B02DUP/`). Carried no memory of the build.

## VERDICT: PASS · BLOCKERS: 0

## What it ran by its own hands

**The diff:** `git diff main...HEAD` = `product.ts` (+28/−3) + the new `test/create-idempotency.test.ts`. In `product.ts` only `CreateOutcome`, the new `createIntents` map, and the `create()` body changed; `decide()`/`timeoutModeration()`/`activate()`/`revise()` untouched. `git diff main -- …/moderation.ts` and `git diff main -- scripts/gates/` both **empty**. No verify/eligibility rule added.

**Scratch test (deleted after), run against `ProductCatalog` directly — all 5 passed:**
1. **duplicate** — same command_id + same draft → first `{ok, outcome:'created'}`, replay `{ok, outcome:'duplicate'}` with identical `version.id`/`variant.id`, `events:[]`, `get('pv-2')===undefined`.
2. **collision** — same key + different draft → `{ok:false, reason:'idempotency_collision'}`; first version's `name` unchanged; no `pv-2`.
3. **distinct keys** — two command_ids → two distinct versions, both `'created'`.
4. **idempotency-before-eligibility** — a `canPublish=false` create returns `publisher_not_eligible` and records nothing; a later same-key `canPublish=true` create is `'created'` (not falsely `'duplicate'`).
5. **idempotency wins over flipped flag** — a successful create replayed with `canPublish=false` still returns `'duplicate'` with the original `version.id` and `events:[]`.
It also read the shipped fixture line-by-line: the assertions genuinely bind the invariants (asserts `outcome`, same `id`, `events).toEqual([])`, `get('pv-2')` undefined, `.name` unchanged) — not a hollow passing test.

**Mutation tests — the guard bites:**
- **4a** neutered the collision line to `if (false && priorIntent.fingerprint !== fingerprint)` → shipped fixture ② AND its scratch collision test FAILED (differing fingerprint returned the prior version instead of refusing). Reverted → green.
- **4b** neutered the duplicate short-circuit (`if (priorIntent !== undefined && false)`) → shipped fixture ① AND its scratch duplicate test FAILED (a replay re-minted a version). Reverted → green.
- After each revert, `git diff HEAD -- product.ts` empty.

**Full green:** `tsc -p tsconfig.typecheck.json` (catalog, includes `test/`) exit 0; `vitest run` catalog 16 passed; `bash scripts/run-gates.sh` exit 0 — ALL GATES GREEN (repo-wide typecheck 10 pkgs, catalog 16, every negative fixture failed as required); `git diff main -- scripts/gates/` empty.

## Non-blocking observations (recorded)
1. **Concurrency:** the parent's evidence commit `42b5c62` landed mid-verification (HEAD `bfe9fcf`→`42b5c62`); `git diff bfe9fcf 42b5c62` added ONLY `JOURNAL.md` + `_review/B02DUP/**` — no code/test/moderation/gate touched, so the verified bytes are unchanged; `bfe9fcf` is an ancestor of HEAD.
2. **Fingerprint is `JSON.stringify(draft)` only** (vs the offline queue's `name` + `JSON.stringify(payload)`) — correct here because the `command_id` already scopes the intent to a single "create" command; noted as a design fact, **not a defect**.
