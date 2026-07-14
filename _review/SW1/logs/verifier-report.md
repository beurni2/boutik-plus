# SW-1 — fresh-context verifier report

**Subject:** the verifier ran on `sw1-supply-read-model` HEAD **`e40c6d4`** (the code bytes). **VERDICT: PASS · BLOCKERS: 0.** Fresh-context agent, no memory of the build; everything below is by its own hands, tree left byte-clean.

> **Post-verifier delta:** its non-blocking observation #1 was then CLOSED by a lock-in test at code HEAD **`a0fd9b9`** (behaviour-preserving — see "Closure" below). The cold-gates proof in this packet is on `a0fd9b9`; the DoD numbers below were re-confirmed on `a0fd9b9`.

## FORBIDDEN — all held (verifier's own diffs)
- `git diff main HEAD -- services/offer-service/src/offer.ts` → **empty (0-diff)**. Category floor (`CATEGORY_FLOOR_FCFA`) + offer versioning (`revise` = new version) live there → untouched.
- `git diff main HEAD -- services/offer-service/src/projection.ts` → **empty (0-diff)**. `buildSupplyProjection` + refusal ladder unchanged.
- Full code diff `main..HEAD` = exactly **3 files**: `src/index.ts` (compose), new `src/supply-endpoint.ts`, new `test/supply-endpoint.test.ts`.
- No waterfall recompute: `supply-endpoint.ts` does zero money math; `previewSellerNet` runs only inside `OfferBook.create`; `buildSupplyProjection` copies fields, no arithmetic.

## The 4 RED-first fixtures assert real invariants (3 mutation-proven to bite, all reverted)
- **asOf-truthful** — mutated `serveProjection` to return the read clock as `asOf` → the asOf test **FLIPPED to failing** (`expected '…08:00' to be '…09:30'`; the 90-min age assertion is real). Reverted.
- **byte-for-byte** — mutated the served value (`available+1`) → the `toEqual(built.projection)` test **FLIPPED to failing**. Reverted.
- **identity key-sweep** — two-stage: (1) neutered the sweep → identity tests **still passed**, proving they were guarded by the strict schema front line, not the sweep [**this is observation #1, now closed**]; (2) made the schema `.passthrough()` (the exact future regression the sweep exists for): with the sweep intact a planted `supplierPhone` **still threw** (independent teeth); with the sweep also neutered it **leaked**. Both defenses are real. Reverted.
- **refusal-honest** — asserts 409 + typed `reason` (`product_not_approved`, `offer_not_effective`) with `value===undefined`, and 404 `unknown_product_version`. Real status/reason/absence assertions, never a 200-empty.

## Live end-to-end drive of the real `worker.fetch` (scratch, then deleted)
- 200 body: `{"version":1,"asOf":…,"value":{productVersionId,offerVersion:"1",basePrice:10000,resellerCommission:1000,available:5}}` — value keys **exactly** the 5 canonical fields; `SupplyProjectionSchema.parse(value)` → **true**. No supplier identity/contact/pickup present or expressible.
- Unknown pv → **404** `unknown_product_version`. Non-GET → **405** `method_not_allowed`. `/health` → **200**, unknown route → **404**.
- Founder-#001 minted through the REAL command path (`new OfferBook().create(draft, true)`, `SELLER_HELD`, offer from `outcome.offer`) — not a hand-built literal.
- Pinned `SupplyProjectionSchema` (`ba6f16d…`) is `.strict()` with exactly `productVersionId, offerVersion, basePrice, resellerCommission, available`.

## Gates / suites (re-confirmed on a0fd9b9)
- `pnpm --filter @boutik/offer-service exec vitest run` → **23 passed (5 files)** (was 22 at e40c6d4; +1 the lock-in test). Shop-projection-consumer mock still **CERTIFIED 8/8**.
- `pnpm typecheck` → green (11/11). `bash scripts/run-gates.sh` → **ALL GATES GREEN** (copy-lint 178/0, drift-check 11 docs, no-ssh-lockfile, mint-path entropy; every negative fixture failed as required).

## Non-blocking observations
1. **The sweep lacked a dedicated regression test** — fixture #3 passed even with `IDENTITY_LEAK` neutered (satisfied by `.strict()` alone); the invariant held robustly but the *test* wouldn't fail if a future edit deleted the sweep. **→ CLOSED (a0fd9b9):** `sweepIdentityKeys` extracted and a direct test added (`the sweep has INDEPENDENT teeth …`); mutation-confirmed — neutering the sweep now fails exactly that one test. Behaviour-preserving; `offer.ts`/`projection.ts` still 0-line diffs.
2. **Production `asOf` is process-start time** — `index.ts` seeds `founderOneSupply(new Date().toISOString())` once at module load, so every read reports the same `asOf`. Truthful for the pilot (it IS the supply-state write time, never the read clock) — **accepted at E1**, just static until an availability-update path lands (SW-2+/full model).
3. **Endpoint-layer refusal coverage is 2 of 4 ladder reasons** (`product_not_approved`, `offer_not_effective` tested at the HTTP layer; the transport surfaces `built.reason` verbatim so all four surface honestly; `product_not_active`/`offer_not_active` covered in `projection.test.ts`). **Accepted** — the wiring is proven; the two untested reasons flow through the identical code path.
