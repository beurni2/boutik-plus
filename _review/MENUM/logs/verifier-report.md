# Moderation enum LOCAL→CANON — fresh-context AMBER verifier report

**On the final bytes `c722daa`** (byte-identical in HEAD `2fd84d7`, which touched only `JOURNAL.md` + `_review/MENUM/`). Carried no memory of the build.

## VERDICT: PASS · BLOCKERS: 0

## What it ran by its own hands

**Rule 1 — RE-PIN clean:** installed `@platform/contracts` → **0.9.6** (all five `@platform/*` on 0.9.6); `no-ssh-lockfile` exit 0; lockfile new sha `ba6f16d` ×57, old `2153661` ×0, `git+ssh` ×0; old sha + `0.9.5` absent from every manifest (survive only as JOURNAL history); `drift-check … --pinned-version 0.9.6` exit 0 ("11 canonical docs match, packageVersion 0.9.6").

**Rule 2 — local defs died:** grep over `services/ apps/ packages/` found NO `export const CHANGE_REASONS`, NO `ModerationDecisionSchema = z`, NO `discriminatedUnion('verdict'`, NO `isModerationOperator`/`MODERATION_OPERATOR_PREFIX` definition (surviving hits are comments only + the supplier-app UI `type ChangeReason` alias — see obs 2). Sole runtime definition confirmed in `node_modules/@platform/contracts/dist/shapes/moderation.js` (`discriminatedUnion('decision', …)`, both variants `.strict()`, `decided_by` regex `/^ops:moderation:[A-Za-z0-9._:-]+$/`) + `enums.js` (same 6 codes).

**Rule 3 — caller-binding:** wrote its own scratch test against `ProductCatalog`: (a) operator approves → ok/`approved`; (b) supplier ctx → `{ok:false, reason:'not_a_moderation_operator'}`, state `submitted`; (c) supplier ctx + smuggled `decided_by:'ops:moderation:verifier-x'` cast past the type → still refused, state `submitted`. All 3 passed. **MUTATION** `decided_by: (input as any).decided_by ?? ctx.actor` → its scratch (c) FLIPPED (smuggle produced `approved`, ok:true) AND the shipped test **⑤** also failed under the same mutation — both bite. Reverted; `git diff` empty; scratch file deleted.

**Rule 4 — invariants re-asserted:** catalog-service `vitest run` → **13/13**. Assertions read: ③ supplier refused + state untouched + still unactivatable; ④ `safeParse` rejects reasonless / empty-reasons `changes_requested` and a non-operator `decided_by:'supplier-7'` (all `.success===false`), accepts valid; ① timeout→`pending`, activation `not_approved`, post-approval timeout `not_under_review`; ② submitted/pending/changes_requested all `not_approved` with `status==='draft'`; happy arc approval→activation ok. The `@ts-expect-error` guards proven legitimate by type-checking `["src","test"]` with a throwaway tsconfig → exit 0 (an unused directive would emit TS2578); temp config removed.

**Rule 5 — full green:** `pnpm typecheck` exit 0 (11/11); fresh `tsc -p tsconfig.json` in catalog-service exit 0; `pnpm test` exit 0 (19/19); `bash scripts/run-gates.sh` exit 0 — ALL GATES GREEN (drift-check @ 0.9.6, no-ssh root lockfile OK, copy-lint OK; every negative fired). `git diff main -- scripts/gates/` **empty**; `run-gates.sh` diff is only the two `--pinned-version 0.9.5 → 0.9.6` bumps.

## Non-blocking observations (recorded)
1. **Concurrency:** the builder's evidence commit `2fd84d7` landed mid-verification (HEAD `c722daa`→`2fd84d7`, "verifier report to follow"); it touched ONLY `JOURNAL.md` + `_review/MENUM/` — zero source/test/manifest — so the verified bytes are unchanged.
2. **supplier-app reason-code mirror:** `apps/supplier-app/src/demo/store.ts:37` `type ChangeReason` is a second, un-gated copy of the reason set that can silently drift from canon. A `type` alias (not the retired const/schema/function), untouched by this slice — does not break Rule 2 — but worth a follow-up to make supplier-app consume canon's `ModerationReasonCode`. (Builder note: already named for the live-Desk-3 wiring slice.)
3. **Test files outside CI type-checking:** catalog-service `tsconfig.json` has `include:["src"]` and `vitest run` doesn't type-check, so the tests' `@ts-expect-error` compile-time guards are unenforced by any gate. Currently valid (proven manually), but a future change making a reasonless `changes_requested` type-representable would not be caught at compile time — only the runtime `safeParse` assertions protect that invariant.
