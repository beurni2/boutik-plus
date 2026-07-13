# VERIFICATION REPORT — A1: the real moderation state machine

Fresh-context verifier, dispatched with only the canon quotes, the diff scope, and the DoD
(no memory of the build). Every DoD item confirmed by execution — it also wrote its own
independent scratch spec exercising the state machine and event envelopes from scratch (5/5),
and planted a decision lever to prove the absence test has teeth.

### DoD — all 8 CONFIRMED
1. **Stub dead** — repo-wide grep for `approved_e1_sandbox` returns only comments + JOURNAL/`_review` docs; **zero surviving code value**. `create()` stamps `moderationState:'submitted'` (`product.ts:77`), verified by scratch run.
2. **States correct** — `submitted → changes_requested(+reasons) | approved`; `timeout → pending`. Scratch confirmed timeout yields `pending`, a timed-out version stays unactivatable, and a decided (approved) version refuses a subsequent timeout (`not_under_review`).
3. **Activation structurally gated** — `activate()` returns `{ok:false, reason:'not_approved'}` for submitted/pending/changes_requested; `revise()` re-enters `submitted` (never inherits approval). Both reproduced independently.
4. **4 canon events, canon envelopes** — `catalog.product_submitted.v1` / `media.derivative_approved.v1` (approve) / `catalog.blocked.v1` + `media.asset_rejected.v1` (changes_requested). All 4 in the contract's `EVENT_NAMES`; each emitted event validated against `PlatformEventSchema` (command_id/correlation_id/aggregateVersion/actor/serverTime/version all present); `reasons` array present on **both** rejection events.
5. **No self-moderation, both ways** — runtime: `decide()` refuses any non-`ops:moderation:` actor and leaves state untouched (reproduced). Structural: independent grep of App.tsx+src found **no** `.decide(`/`approve`/`setModerationState` lever; and a **planted** `catalog.decide(` call made the absence test FAIL, then pass once removed. The guard is real.
6. **Silent rejection unrepresentable** — ran `ModerationDecisionSchema.safeParse`: `{verdict:'changes_requested'}` → fail, `{...reasons:[]}` → fail, unknown reason code → fail, strict extra field → fail, `{...reasons:['authenticity_concern']}` → pass. Type-level refusal proven by the `@ts-expect-error` line surviving a clean typecheck.
7. **B11 wired to real state** — renders `MODERATION[item.moderationState]` (no `item.status` moderation lookup survives); lists specific reasons on `changes_requested`; honest offline note; store's `moderationState` is `readonly` with no setter. French copy-lint: **153 entries, 0 violations**.
8. **Gates/tests/typecheck** — fresh `turbo typecheck --force` = **11/11, exit 0**. Full `bash scripts/run-gates.sh` = **exit 0, "ALL GATES GREEN"** (every negative fixture failed as required, incl. tampered-doc drift-check).

### Flagged decisions — correctly handled, NOT blockers
- **Reason-code set is derived, and explicitly flagged** (`moderation.ts` traces each of 6 codes to a requirement + `⏳ FLAGGED for founder ratification`). Canon-correct: safest-default + flag, not silent invention.
- **neutral-packaging gate narrowed (dropped English "packaging")** — legitimate; A1's own reason code `not_neutral_packaging` false-positived A2's gate. Real French coverage intact: `"mettez votre logo sur le colis"` still trips (exit 1), negative fixture still fails (exit 1, 15 hits). Fixture `packagingContactPhone`→`colisContactPhone` still exercises the compound path.
- **zod added to catalog-service** — legitimate (discriminated union). JOURNAL honestly flags offer-service's pre-existing phantom-dep as out of scope, left unfixed.
- **offer fixtures `approved_e1_sandbox`→`approved`** — consistent with offer-service's `moderationState.startsWith('approved')` predicate (`projection.ts:32`); tests still assert the same behavior (11/11 in isolation).

### Non-blocking factual findings (honest grounding)
- **`pnpm test` (full parallel turbo) exited 1 once** — the sole failure was `inventory-service`'s "TWENTY CONCURRENT RESERVES" workerd durable-object concurrency e2e, which A1 never touches. It **passed 8/8 in isolation twice**, and the `pnpm test` step inside `run-gates.sh` passed green. A pre-existing timing flake under parallel load, not an A1 regression — but the concurrency e2e is flaky test-infra debt worth naming.
- **No `contracts/` shapes, event schemas, `/docs`, or money waterfall touched** — §7 not triggered; the change only consumes the pinned `@platform/contracts` unchanged.

No smells: no `Math.random` in touched files, no silent catch in `moderation.ts`/`product.ts`, no `Ma Boutique`/`Mon Shop` drift, no vacuous tests found.

**VERDICT: PASS**
**BLOCKERS: 0**
