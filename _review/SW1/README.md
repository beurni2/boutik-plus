# SW-1 — the supply read-model endpoint (🟠 AMBER · DO NOT MERGE)

**Branch:** `sw1-supply-read-model` · **HEAD:** `e40c6d4` (`logs/head-sha.txt`, `logs/branch-log.txt`)
**Base:** `main` (`99dadef`) · **Diff:** `logs/full.diff` (`logs/diffstat.txt`) — 3 files (1 modified, 2 new).
**Founder ruling** (Beurni, 2026-07-15): Transport = **Option B** (HTTP read-model; Shop+ pulls + caches; staleness blocks agreement). Option C (event stream) is the frozen target, deferred. Founder-#001 = a normal `SELLER_HELD` account.

## What this slice does
Wraps the EXISTING pure `buildSupplyProjection` (`src/projection.ts`, untouched) in the ruled transport on `offer-service`, over the health-door seam (`index.ts`):

- **`GET /supply-projection/:pv`** → the mock's certified read-model shape **`{ version, asOf, value }`**:
  - **`value`** = the projection, parsed through **`SupplyProjectionSchema` on the way OUT** (strict) **+ the identity key-sweep** (`IDENTITY_LEAK`, byte-mirrored from the certified mock `mocks/shop-projection-consumer-mock.ts:23`) — supplier identity/contact/pickup is un-emittable, twice over.
  - **`version`** = the offer version (canon: a change is a new version).
  - **`asOf`** = the supply-state **write time**, returned verbatim — **staleness is real age, never fabricated freshness** (the endpoint never stamps the read clock).
- **The refusal ladder surfaces as HONEST STATES** — `projection.ts`'s typed reasons pass through: `409 {status:'unavailable', reason}` for not-active/not-approved/not-effective; `404 {status:'not_found', reason:'unknown_product_version'}`; `405` for a non-GET. **Never a 200-empty.**
- **Founder-as-Supplier-#001** (`founderOneSupply`) is a normal **`SELLER_HELD`** account whose offer is minted through the **REAL command path** (`OfferBook.create`) — never hand-built. `PLATFORM_OWNED` stays B+9-gated.
- `index.ts` composes the route over the shared health fallback; `/health` + unknown-route-404 preserved.

## FORBIDDEN honoured
`git diff main --` shows: `src/offer.ts` **0-line diff** (`previewSellerNet` — the only math — + the category floor + offer versioning untouched) · `src/projection.ts` **0-line diff**. The sole code change is `src/index.ts` (compose) + the two new files.

## RED-first (`logs/red-proof.txt`)
The 4 fixtures were written and run FIRST — the suite failed to load (`Cannot find module '../src/supply-endpoint.js'`), proving it bites. Then the implementation turned them GREEN.

## Fixtures (`test/supply-endpoint.test.ts`, 11)
- **served == builder byte-for-byte** — `body.value` deep-equals `buildSupplyProjection(...).projection`; `version`==offer.version; value re-parses strict.
- **refusal honest** — not-approved → 409 `product_not_approved` (value undefined) · expired → 409 `offer_not_effective` · unknown pv → 404 `unknown_product_version`. Never 200-empty.
- **identity un-emittable** — `assertServableValue` refuses a planted `supplierPhone` and a lone `pickup` key (strict schema + sweep); the clean 5-field projection passes.
- **asOf truthful** — served `asOf` == the write time (08:00), NOT the read clock (09:30); the computed age is a real 90 min, not zero.
- **founder-#001 real path** — offer minted by `OfferBook.create`, `SELLER_HELD`, version 1.
- **health door preserved** — `/health` 200, unknown 404, non-GET supply route 405, `serveProjection` pure core.

## Evidence
- `logs/run-gates.txt` — full **warm** run-gates: **ALL GATES GREEN** (every positive passed, every negative fired), exit 0.
- `logs/coldgates.log` — **cold-gates proof (isolated)**: fresh HOME (auth line SHOWN = HTTPS→proxy `insteadOf`, **NOT ssh**) + fresh EMPTY pnpm store + `--frozen-lockfile` (exit 0) + fresh clone of the pushed branch (cold HEAD `e40c6d4`, cold contracts `0.9.6`) → run-gates **ALL GATES GREEN · cold run-gates exit 0**; cold supply-endpoint + shop-mock-cert **13 passed** (mock still 8/8).
- `logs/full.diff` · `logs/diffstat.txt` · `logs/head-sha.txt` · `logs/branch-log.txt` · `logs/red-proof.txt`.
- `logs/verifier-report.md` — fresh-context verifier on the final bytes (`e40c6d4`): **[running — verdict + report land before founder review]**.

## Test counts
offer-service **22/22** (SW-1 11 + health 2 + projection 3 + offer 4 + shop-mock-cert 2 — cert still **8/8**) · full suite 19/19 tasks · typecheck 11/11.

## Named limit (recorded, not fixed — no unrequested tidying)
offer-service `tsconfig.json` is `include:["src"]`, so `test/supply-endpoint.test.ts` is **run by vitest but not CI-typechecked** (the same pre-existing gap catalog-service closed with a `tsconfig.typecheck.json`). SW-1's fixtures are runtime asserts with **no `@ts-expect-error`** compile-guards, so nothing compile-load-bearing is unguarded; the src module IS typechecked (11/11). Flagged so it is known — a follow-up could add a test-typecheck config if wanted.

## SW-2 is the sequel (shop-plus)
This is the Boutik+ half. SW-2 replaces the shop-plus `seed.json` demo-supply seam with a real pull of this endpoint + the stale-block (`Shop-Spec:161`). Not this slice.
