# B0.2-DUP — the create-door idempotency (🟠 AMBER · DO NOT MERGE)

**Branch:** `b02-dup-create-idempotency` · **HEAD:** `bfe9fcf` (see `logs/head-sha.txt`, `logs/branch-log.txt`)
**Base:** `main` (`d15b977`) · **Diff:** `logs/full.diff` (`logs/diffstat.txt`) — 2 files (`product.ts` + the new fixture).
**Anchor:** `docs/Boutik-Plus-Building-Plan.md:36` — *"unverified cannot publish; **duplicate idempotent**."* (The verify half is out of scope; the duplicate half is this slice.)

## What this slice does
`catalog-service` `ProductCatalog.create(draft, canPublish, ctx, at)` is now **idempotent by `ctx.command_id`** — the minted key the offline queue already persists per intent. On a SUCCESSFUL create it records `command_id → {versionId, variantId, fingerprint}` where `fingerprint = JSON.stringify(draft)` (the same comparison `offline/queue.ts:111` uses on its payload). Then:
- **duplicate** — same key + same fingerprint → a **safe no-op**: `{ok:true, outcome:'duplicate'}` with the **SAME version + variant identity** and **`events: []`** (no re-emit — the `catalog.product_submitted.v1` already fired once). No second version is minted.
- **collision** — same key + a DIFFERENT fingerprint → **`{ok:false, reason:'idempotency_collision'}`** (refused + surfaced; the first version is **never overwritten**).
- **created** — a new key → the normal create, now tagged `outcome:'created'`.

The check runs **before eligibility**, so a replay of an already-successful create is stable regardless of the current `canPublish` (and a create that FAILED on `canPublish` records nothing, so it never falsely collides later). Vocabulary mirrors `offline/queue.ts:108-118` (`duplicate` | `collision`) at the service door.

## RED protocol (adversarial-first)
The 3 fixtures were written and run FIRST — all **3 failed** before the code existed (`logs/red-proof.txt`: `outcome` undefined; the second create returned `ok:true` instead of the collision). The implementation turned them GREEN (3/3).

## Fixtures (`test/create-idempotency.test.ts`)
① double-submit → one version, same identity, no re-emit · ② same key + different payload → collision refused + surfaced, first version untouched · ③ distinct keys → distinct versions.

## FORBIDDEN honoured
`services/catalog-service/src/moderation.ts` **untouched** (`git diff main -- …/moderation.ts` empty — `evidence/forbidden-proof.txt`). `product.ts` changed only `create()` / `CreateOutcome` / the intents map — `decide()`, `timeoutModeration()`, `activate()`, `revise()` bodies unchanged. No verify/eligibility rule added.

## Evidence
- `logs/run-gates.txt` — full **warm** `run-gates.sh`: typecheck 0 · tests · **ALL GATES GREEN**.
- `logs/coldgates.log` — **cold-gates proof (isolated)**: fresh HOME (auth line = HTTPS→proxy, NOT ssh) + fresh EMPTY store + `--frozen-lockfile` + fresh clone of `bfe9fcf` → `run-gates.sh` **exit 0, ALL GATES GREEN from nothing** (cold HEAD `bfe9fcf`; cold contracts 0.9.6; every negative fixture fired).
- `logs/red-proof.txt` — the 3 fixtures failing BEFORE implementation.
- `logs/head-sha.txt` · `logs/branch-log.txt` · `logs/full.diff` · `logs/diffstat.txt` · `evidence/`.
- `logs/verifier-report.md` — fresh-context verifier on the final bytes: **VERDICT PASS · 0 BLOCKERS**
  (5 scratch tests incl. idempotency-before-eligibility both directions; mutation-tested the collision
  AND duplicate guards — both flipped the shipped fixtures, then reverted; FORBIDDEN re-confirmed;
  catalog 16, run-gates exit 0). One recorded design note: the fingerprint is `JSON.stringify(draft)`
  only (the command_id already scopes to one create command) — not a defect.

## Test counts
catalog-service **16/16** (create-idempotency 3 + moderation 8 + product 3 + health 2) · full suite 19/19 · typecheck 11/11 (catalog now type-checks `test/` — the new fixture is gate-typechecked).
