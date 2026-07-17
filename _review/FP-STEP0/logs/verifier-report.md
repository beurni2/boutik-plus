# FP-STEP0 — fresh-context verifier report

**Subject:** `fp-font-pipeline`, verifier ran on code HEAD **`93a3b67`**. **VERDICT: PASS · BLOCKERS: 0.** Fresh-context agent, no memory of the build; every claim by its own hands (fontTools direct reads, independent `formatFcfa` execution, mutation tests). Tree left byte-clean.

## 1 · Scope containment — PASS
`git diff --stat main..HEAD` at `93a3b67` = exactly the 6 TTFs + 2 OFL + `BUILD.md` + the new test. All 10 protected files **0 lines** of diff: `app.json`, `src/ui/fonts.ts`, `kit.tsx`, `sfnt.ts`, `src/demo/store.ts` (formatFcfa), `settlement/readModel.ts`, `journey.ts`, `test/font-embedding.test.ts`, `test/money-render.test.ts`, `services/catalog-service/src/moderation.ts`. Archivo stays the shipped face.

## 2 · Six fonts real / distinct / correct — PASS (fontTools, not the test)
6 **distinct** hyphenated families (`BricolageGrotesque-Bold/-ExtraBold`, `InstrumentSans-Regular/-Medium/-SemiBold/-Bold`); OS/2 `usWeightClass` **700/800** (Bricolage) + **400/500/600/700** (Instrument); **no `fvar`/`gvar`** → truly static (a `STAT` table is present — a static table, not a variable axis). sha256 + sizes match `BUILD.md`. The WO-5.1 collision would collapse these below 6 families — it does not.

## 3 · Money on the new bytes through the shipped formatter — PASS
`formatFcfa` single definition at `src/demo/store.ts:277` (consumed, not reimplemented). Run independently: `formatFcfa(11500)` → `0x31 0x31 0xa0 0x35 0x30 0x30`, `MONEY_SPACE=0xa0`. cmap (its own tool): **U+00A0 present in all six**; every « 11 500 F » codepoint drawable in all six; **U+202F present in Bricolage 700/800, absent in Instrument 400/500/600/700**. No emitted codepoint missing → the STOP-AND-FLAG condition is genuinely absent.

## 4 · Guard bites (mutation) — PASS
`vitest run test/fp-font-pipeline.test.ts` → **9 passed**. Mutation A (expected weight 700→701): identity test **flips to 2 failing**. Mutation B (Instrument U+202F false→true): the split test **flips to failing** (`InstrumentSans-Regular.ttf LACKS U+202F: expected false to be true`). Both reverted; test byte-clean.

## 5 · OFL — PASS
Both `OFL-*.txt` (93 lines each) carry "SIL OPEN FONT LICENSE Version 1.1" and name the respective authors.

## 6 · Nothing regressed — PASS
Archivo `font-embedding` + `money-render` = **10/10 green**; `pnpm typecheck` **11/11**; `bash scripts/run-gates.sh` exit **0**, "ALL GATES GREEN" (44 stanzas, every negative fired); Archivo `Archivo-*.ttf` byte-unchanged.

## Non-blocking observations (recorded)
1. **HEAD advanced mid-review** `93a3b67`→`31659f5` — the supervisor committed `JOURNAL.md` + the `_review/FP-STEP0/` packet while the verifier ran on the code head; it diffed the two and confirmed the **code artifacts (fonts/OFL/BUILD.md/test) byte-identical**, the follow-up adds only docs/evidence. Not a scope violation.
2. **`opsz=36`** — a flagged, deliberately-open production decision (BUILD.md), anchored to the money-hero 36–38px band, adoption-slice call. Correctly flagged, not invented.
3. **Size 292.9 KB** (FP set) vs **166.7 KB** (Archivo) — ~+126 KB cold-start cost. STAGED only (not wired), so no budget impact yet; BUILD.md commits the adoption slice to re-check the byte budget when it embeds.
