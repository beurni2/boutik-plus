# WO-FP-PIXEL — Phase 1 status (gate order per founder reprioritization)

## PRIMARY GATE — property diff (deterministic, no render)

`apps/supplier-app/test/pixel-property-diff.test.ts` — a STANDING vitest test: each C##'s style
DATA (plain objects in `C##.styles.ts`, no react-native import) is compared property-for-property
to the Phase-0 computed values table, through explicit RN→CSS normalizers (px, hex→rgb, font
identity via FP_FACES, canonical box-shadow). FROZEN §9 rulings are recorded with their citation,
never silently skipped. Artifact: `property-diff.json` (per-property rows + per-case verdict).
Empty diff == VALUE-PASS — this is what catches recolors, and it runs in the normal suite.

| case | properties | mismatches | frozen | verdict |
|---|---|---|---|---|
| **C07 BtnPrimary** | 18 | 0 | 1 (§9.2 lh 'normal'→1.2) | **VALUE-PASS** |
| **C02 StripeTissée** | 3 (box + cycle widths + cycle colors) | 0 | 0 | **VALUE-PASS** |

The gate proved itself on first run: it caught two normalizer bugs (shadow color whitespace,
bare-0 length ordering) before ever letting a value through.

## SECONDARY — visual diff (demoted per order)

ONE masked composition check per SCREEN (S01–S40), at the END of Phase 2 — not per component;
≤2 % on the element-masked region only. The component-level runner
(`scripts/pixel/diff-component.mjs`) remains as a debugging tool; its C02 0.000 % stands as the
band's render proof, and C07's earlier 1.888 % is understood as crop paper-bleed +
fractional-origin AA — value-passed above, per order, not re-measured.

## Server

ONE persistent Metro (watch mode) on :8081 — hard-reload pages on staleness, never restart per
component.

## Founder deltas pending ruling

PHASE0-DELTAS Δ1 (stepper/[DEMO] font — building IS600 per HANDOFF until overruled).
