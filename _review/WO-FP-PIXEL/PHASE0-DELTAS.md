# WO-FP-PIXEL — Phase 0 deltas (spec ⇄ render), flagged not resolved

**Ground truth:** `_review/WO-FP-PIXEL/values-table.json` — getComputedStyle over every element of
S01–S40 in the Pixel Source render (40 screens · 1,767 elements · 65 money strings). Extractor:
`scripts/pixel/extract-ground-truth.mjs` (Playwright headless Chromium, fonts awaited).
Per the build order: the computed value wins; every disagreement with HANDOFF_V2 is listed here.

## Verified agreements (no action)

- **§1.1 palette: zero unexplained computed colors.** All 39 distinct rendered colors map to the 40
  tokens + the listed alpha values (scrim, celebScrim, dock 88 %, hero divider .22, viewfinder dashed
  .75, celebration hint .65).
- **§1.2 type scale: full agreement.** Sizes 10–38px all match roles; weights {400,500,600,700,800};
  letter-spacings resolve exactly (e.g. DisplayMoney 38×−.02=−0.76px; ChallengeCode 34×+.14=+4.76px;
  Overline 10.5×+.1=+1.05px). Extra computed sizes 25/44/68/72px are the spec'd per-component GLYPH
  sizes (C48 IconTile 25 · C26 tile 44 · S05 héro 68 · C39 viewfinder 72).
- **§3.5 money: 53/53 separators are U+202F** — zero U+00A0, zero U+0020. All asserted amounts
  present and placed (18 700 S02 · 12 750 S02/S32 · 8 500 S05 · 4 675 S15 · 10 200 S13).
- **Fonts resolved in-render:** Bricolage Grotesque ×141, Instrument Sans ×576 text elements — the
  render itself has no silent fallback (except Δ1 below).

## Δ1 — Stepper glyphs + [DEMO] buttons: UA-default font leak (13 elements)

**Computed:** the C15 stepper `−`/`＋` buttons (S19/S21/S22, 8 els) and the Studio [DEMO] sim buttons
(S26–S29/S31, 5 els) compute `font-family: Arial` — the browser's **UA default button font**; the
page never set `font` on those buttons.
**HANDOFF:** C15 « glyphe 20px **IS600** `ink` » · C10 « texte `sub` **IS600**/13 ».
**Recommendation:** build to **IS600 per HANDOFF** — the computed value here is a web-platform
accident (RN has no UA button font to leak), and the glyphs U+2212/U+FF0B render near-identically.
**Founder ruling requested; building the recommendation until overruled.**

## Δ2 — `pauseBadge` has no static render (flow-state-only token)

`rgba(28,23,16,.72)` (« EN PAUSE » tile badge) appears **nowhere** on the 40-screen board: the badge
exists only after T11 (« Mettre en pause »), and the board renders the first-render seed (+ named
states). S06 correctly shows the fiche pill « En pause » as neutralPill/sub. **Source for this value
is therefore §1.1/C26 prose, not a computed sample** — will be built from prose and verified in
Phase 3 (driving T11).

## Δ3 — census blind spots checked, not deltas

`divider #F3EDDE` renders as **border-bottom-color** (24 hits — the census only bucketed border-top);
`skeleton #ECE4D4` renders inside the shimmer **gradient** (7 hits). Both verified present in the
full values table; no disagreement.

## Missing-from-both check

Nothing needed so far is absent from both documents. Anything discovered during Phases 1–3 that is in
NEITHER the values table NOR HANDOFF_V2 stops the build and comes to you (never invented).
