# DF-1 — device feedback, first batch (🟠 AMBER · DO NOT MERGE)

**Branch:** `df1-device-feedback` · **HEAD:** `2acd224` (see `logs/head-sha.txt`, `logs/branch-log.txt`)
**Base:** `main` (`dc8763f`) · **Diff:** `logs/full.diff` (`logs/diffstat.txt`) — 5 files.
**Founder directive** (Beurni, on-device, 2026-07-14): too much black · Mes Recettes card · Mon Prix editable + keypad.

## The visual (the founder's aesthetic ruling surface)
`gallery.html` — a **token-faithful before/after** rendered from the *real* Grand Teint hex tokens + type scale. **It is not a device screenshot** (the RN app has no in-sandbox capture harness); the on-device look is the founder's re-check, exactly as the WO frames Part C.

## What this slice does
**A — palette off ink + the overlap defect (`kit.tsx`):**
- `CHIP_STYLE.fact`: ink fill → **`C.artisanAccent`** (existing boutik gold token) + `C.ink` text — legible at arm's length. Distinct from celebrate (green) / pending (cream) / problem (red).
- Primary CTA `buttonInk`: ink fill → **`C.primary`** (supply-green).
- **The chip-row collision:** `ListRow` `styles.row` `height:LIST_ROW_HEIGHT` → **`minHeight`** + `paddingVertical` — the row grows to fit title+meta+chip, so « PRÊT » no longer overprints the next row's title. Safe: no FlatList pins `getItemLayout`.
- Body text stays ink. **Kept on ink (listed for your call):** header/wordmark, hairlines, the money-majesty `boxInk` border, offline band, tab indicator.

**B — Mes Recettes card (`App.tsx`):** a photo thumb (`receiptThumb`, sized from `touch.minTargetPx`) + the item name as the **body-scale title** (`receiptName`) + the figure **ALONE** — `money.amount_f` (« {amount} F ») with `offer.net_label` (« Vous recevrez ») as the small-caps label ONCE. The duplication died at the template (was `recettes.net_ligne` = « Vous recevrez {amount} F » fed whole into the hero). **B+I-05 held:** the figure is still `formatFcfa(item.obligation.amount)` — presentation only; `readModel` + `settlement-read-model.test` untouched.

**C — Mon Prix (`App.tsx`):**
- **« La part de la revendeuse » is now editable** (`commissionInput` state → `offerC`); the net **recomputes live** through the PINNED `computeWaterfall`/`livePreviewNet`. A commission that swallows the net is honestly blocked (`offer.part_too_high`, money register, copy-lint 178/0).
- **Keypad:** the offre screen wraps in `KeyboardAvoidingView` + `ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"` — tap-outside/drag dismisses, the « Publier » CTA clears the keyboard. (Number-pad has no iOS return key; the **on-device feel is the founder's post-merge re-check**, as the WO names it.)

## FORBIDDEN honoured
`git diff main --` shows: `formatFcfa` (store.ts) **untouched** · `readModel.ts` **empty** · `journey.ts` **empty** · the offer v2/`reoffer` banner logic intact.

## Two flags (derive-or-stop — surfaced, not silently resolved)
1. **« à corriger » and « délai passé » both map to the `problem` red tone** (pre-existing, unchanged by this pass). Making them distinct needs a 5th tone/token decision — not invented here. Your call.
2. The **ink surfaces kept** (above) — ink is structural there; listed for you to veto any.

## Fixtures (`test/df1-device-feedback.test.ts`, 9)
A: fact-chip-off-ink-onto-gold · four-tones-distinct · row-owns-height(minHeight). B: photo+name-as-title · figure-alone(money.amount_f, no full-sentence). C: commission-editable(not readOnly)+drives-offerC · **net-recomputes-on-the-pinned-waterfall** (C=1000→8500, C=2000→7500, reconciles) · keypad-props-wired.

## Evidence
- `logs/run-gates.txt` — full **warm** run-gates: typecheck 0 · tests · **ALL GATES GREEN** (copy-lint 178/0; no-emoji; token-docket App.tsx zero-hardcoded-dims incl. the token-sized thumb).
- `logs/coldgates.log` — **cold-gates proof (isolated)**: fresh HOME (auth line SHOWN = HTTPS→proxy `insteadOf`, **NOT ssh**) + empty pnpm store + `--frozen-lockfile` (exit 0) + fresh clone of the pushed branch (cold HEAD `2acd224`, cold contracts `0.9.6`) → run-gates **ALL GATES GREEN · cold run-gates exit 0** (every positive passed, every negative fired).
- `logs/full.diff` · `logs/diffstat.txt` · `logs/head-sha.txt` · `logs/branch-log.txt` · `gallery.html`.
- `logs/verifier-report.md` — fresh-context verifier on the final bytes (`2acd224`): **VERDICT PASS · BLOCKERS 0**. By its own hands: FORBIDDEN clean (`formatFcfa`/`readModel`/`journey`/`scripts/gates` diff empty; reoffer banner intact); Part C recompute real on the pinned waterfall (C=1000→8500, C=2000→7500, C=9600→−100 so the block is real, all reconcile); B+I-05 held (`settlement-read-model` 7 pass, untouched); **the 9 DF-1 fixtures bite** (4 mutations flipped exactly their matching fixture, each reverted); typecheck 0, supplier-app 143, run-gates ALL GREEN; tree left clean.

## Test counts
supplier-app **143/143** (DF-1 9 + the rest; settlement-read-model 7 untouched) · full suite 19/19 · typecheck 11/11.
