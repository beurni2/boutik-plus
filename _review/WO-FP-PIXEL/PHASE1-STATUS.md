# WO-FP-PIXEL — Phase 1 status (component library, diff-verified)

**Pipeline (proven end-to-end):** Expo Web harness (`?pixel=C##` mounts the case instead of the
app; native untouched) + `scripts/pixel/diff-component.mjs` (board `.phone` element screenshot →
crop at the Phase-0 values-table box → DSF-2 supersample → 3×3 blur → per-channel TOL 32 → % + red
diff PNG in `diff/`). The harness renders with the board's OWN woff2 bytes (hex-encoded,
`source-fonts.json`) so text diffs measure layout, not TTF-vs-variable rasterization — native ships
the static TTF instances unchanged (font-embedding tests).

| case | source | property match | visual diff | verdict |
|---|---|---|---|---|
| C02 StripeTissée | S02 stripe (0,54,402×6) | exact stops [green 18 · bg 6 · gold 8 · bg 6] as literal Views (repeating-gradient → listed RN divergence) | **0.000 %** | **PASS** |
| C07 BtnPrimary | S02 « Ajouter un produit » (362×54) | bg/radius/height/gap/type/shadow(with spread, boxShadow string) all equal computed; lh frozen 19.2 (§9.2) | **1.888 %** | **NOT DONE** — residual = glyph-edge AA from the board's fractional-origin rasterization + §9.2 lh vs web 'normal'; metric to be CALIBRATED with planted-error negatives before any further tolerance move |

**Metric governance:** TOL was raised 16→24→32 ONLY alongside supersampling+blur, and stops here.
Before C07 (or any text component) is declared PASS, the diff metric gets **negative controls**:
planted wrong-tone / 1px-shift / wrong-radius variants that MUST fail. No calibration by
tuning-until-green (repo failure mode #7).

**UA-artifact note (Δ-class of PHASE0-DELTAS Δ1):** the source `<button>` computes `padding-left:
6px` (UA default; content is flex-centered, visually inert) — not reproduced.

**Founder deltas pending ruling:** PHASE0-DELTAS Δ1 (stepper/[DEMO] font — building IS600 per
HANDOFF until overruled).
