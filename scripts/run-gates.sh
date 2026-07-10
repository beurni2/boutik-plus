#!/usr/bin/env bash
# WO-B0.1 CI gates, run end-to-end with evidence. Every gate has a negative
# fixture and this script SHOWS each one failing once per run — if a negative
# fixture stops failing, the run itself fails (output captured under
# _evidence/ when EVIDENCE_DIR is set, otherwise printed).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${EVIDENCE_DIR:-}"
FAILED=0

log() { printf '\n=== %s ===\n' "$1"; }
capture() {
  # capture <name> <expected: pass|fail> <command...>
  # expected=fail requires exit code EXACTLY 1 (the gate-failure code): a
  # crashed or misinvoked gate (exit 2+) must never pass for a working
  # negative fixture (verifier finding, 2026-07-09).
  local name="$1" expected="$2"; shift 2
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ -n "$EVIDENCE_DIR" ]; then
    mkdir -p "$EVIDENCE_DIR"
    printf '$ %s\n%s\n(exit code: %d)\n' "$*" "$out" "$rc" > "$EVIDENCE_DIR/$name.txt"
  fi
  printf '%s\n(exit code: %d)\n' "$out" "$rc"
  if [ "$expected" = pass ] && [ $rc -ne 0 ]; then echo "GATE FAILED (expected pass): $name"; FAILED=1; fi
  if [ "$expected" = fail ] && [ $rc -ne 1 ]; then echo "GATE FAILED (expected the negative fixture to fail with exit 1, got $rc): $name"; FAILED=1; fi
}

cd "$ROOT"

log "typecheck (all workspace packages, incl. the Expo app shell)"
capture typecheck pass pnpm typecheck

log "tests (money gate, correlation hello-world, flags, service health, app catalog)"
capture tests pass pnpm test

log "consumption baseline — pinned computeWaterfall reproduces the §5.4 worked baseline"
capture baseline-check pass node scripts/baseline-check.mjs

log "gate: money-reconciliation — §5.4 baseline fixture quote (must pass)"
capture money-reconciliation-positive pass node scripts/gates/money-reconciliation.mjs gates/fixtures/quote.baseline.json

log "gate: money-reconciliation — NEGATIVE FIXTURE (independent-multiplication sellerNet, must fail)"
capture money-reconciliation-negative fail node scripts/gates/money-reconciliation.mjs gates/fixtures/negative/quote.independent-multiplication.json

log "gate: unverified-cannot-publish — verified supplier (must pass)"
capture unverified-cannot-publish-positive pass node scripts/gates/unverified-cannot-publish.mjs gates/fixtures/publish.verified-supplier.json

log "gate: unverified-cannot-publish — NEGATIVE FIXTURE (unverified supplier publishing, must REFUSE CLOSED)"
capture unverified-cannot-publish-negative fail node scripts/gates/unverified-cannot-publish.mjs gates/fixtures/negative/publish.unverified-supplier.json

log "gate: premium-frame-assets — canonical EXIF-free price-free assets (must pass)"
capture premium-frame-positive pass node scripts/gates/premium-frame-assets.mjs gates/fixtures/assets.premium-frame.json

log "gate: premium-frame-assets — NEGATIVE FIXTURE (EXIF-bearing derivative, must fail)"
capture premium-frame-exif-negative fail node scripts/gates/premium-frame-assets.mjs gates/fixtures/negative/assets.exif-bearing.json

log "gate: premium-frame-assets — NEGATIVE FIXTURE (price-overlaid asset, must fail)"
capture premium-frame-price-negative fail node scripts/gates/premium-frame-assets.mjs gates/fixtures/negative/assets.price-overlaid.json

log "gate: projection-identity-free — pinned contract shape (must pass)"
capture projection-identity-positive pass node scripts/gates/projection-identity-free.mjs gates/fixtures/projection.contract.json

log "gate: projection-identity-free — NEGATIVE FIXTURE (supplier identity + pickup leak, must fail)"
capture projection-identity-negative fail node scripts/gates/projection-identity-free.mjs gates/fixtures/negative/projection.identity-leak.json

log "gate: readiness — happy path with live challenge (must pass)"
capture readiness-positive pass node scripts/gates/readiness-gate.mjs gates/fixtures/readiness.happy.json

log "gate: readiness — NEGATIVE FIXTURE (pickup task before readiness, must REFUSE CLOSED)"
capture readiness-pickup-before-negative fail node scripts/gates/readiness-gate.mjs gates/fixtures/negative/readiness.pickup-before.json

log "gate: readiness — NEGATIVE FIXTURE (buyerDropCode in readiness payload, must REFUSE CLOSED)"
capture readiness-drop-code-negative fail node scripts/gates/readiness-gate.mjs gates/fixtures/negative/readiness.with-drop-code.json

log "gate: readiness — NEGATIVE FIXTURE (expired challenge, must REFUSE CLOSED)"
capture readiness-expired-negative fail node scripts/gates/readiness-gate.mjs gates/fixtures/negative/readiness.expired-challenge.json

log "mock certification — all three in-repo mocks 8/8 via the pinned @platform/certification suite (must pass)"
capture certify-mocks pass node scripts/certify-mocks.mjs

log "gate: no-seller-deposit — repo source (must pass)"
capture no-seller-deposit-positive pass node scripts/gates/no-seller-deposit.mjs

log "gate: no-seller-deposit — NEGATIVE FIXTURE (sellerDeposit field, must fail)"
capture no-seller-deposit-negative fail node scripts/gates/no-seller-deposit.mjs gates/fixtures/negative/no-seller-deposit

log "gate: no-seller-debit — repo source (must pass)"
capture no-seller-debit-positive pass node scripts/gates/no-seller-debit.mjs

log "gate: no-seller-debit — NEGATIVE FIXTURE (debitFcfa/deduct/retenue flow, must fail)"
capture no-seller-debit-negative fail node scripts/gates/no-seller-debit.mjs gates/fixtures/negative/no-seller-debit

log "gate: single-level — repo source (must pass)"
capture single-level-positive pass node scripts/gates/single-level.mjs

log "gate: single-level — NEGATIVE FIXTURE (downline/recruit, must fail)"
capture single-level-negative fail node scripts/gates/single-level.mjs gates/fixtures/negative/single-level

log "gate: phone-alias — repo source (must pass)"
capture phone-alias-positive pass node scripts/gates/phone-alias.mjs

log "gate: phone-alias — NEGATIVE FIXTURE (phone as DB key, must fail)"
capture phone-alias-negative fail node scripts/gates/phone-alias.mjs gates/fixtures/negative/phone-alias

log "gate: imaging-architecture — repo deps + imports (must pass)"
capture imaging-architecture-positive pass node scripts/gates/imaging-architecture.mjs

log "gate: imaging-architecture — NEGATIVE FIXTURE (tensorflow dep + onnx import, must fail)"
capture imaging-architecture-negative fail node scripts/gates/imaging-architecture.mjs gates/fixtures/negative/imaging-architecture

log "gate: no-wallet-no-funds — repo source (must pass)"
capture no-wallet-no-funds-positive pass node scripts/gates/no-wallet-no-funds.mjs

log "gate: no-wallet-no-funds — NEGATIVE FIXTURE (wallet/balance module, must fail)"
capture no-wallet-no-funds-negative fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds

log "gate: no-consumer-storefront — services/ + apps/ (must pass)"
capture no-consumer-storefront-positive pass node scripts/gates/no-consumer-storefront.mjs

log "gate: no-consumer-storefront — NEGATIVE FIXTURE (storefront/checkout/cart routes, must fail)"
capture no-consumer-storefront-negative fail node scripts/gates/no-consumer-storefront.mjs gates/fixtures/negative/no-consumer-storefront

log "gate: French Voice copy-lint — supplier-app catalog (must pass)"
capture copy-lint-positive pass pnpm exec copy-lint apps/supplier-app/i18n/catalog.json

log "gate: French Voice copy-lint — NEGATIVE FIXTURE (veuillez/séquestre + marketing-in-money + Mooré-in-instruction, must fail)"
capture copy-lint-negative fail pnpm exec copy-lint gates/fixtures/negative/catalog.negative.json

log "gate: contracts drift-check — honest /docs copy vs pinned canon manifest (must pass)"
capture drift-check-positive pass pnpm exec drift-check docs --pinned-version 0.5.0

log "gate: contracts drift-check — TAMPERED doc (must fail)"
DRIFT_TMP="$(mktemp -d)"
cp -r docs "$DRIFT_TMP/docs"
printf '\nrogue edit — this consumer copy drifted from canon\n' >> "$DRIFT_TMP/docs/Boutik-Plus-Build-Spec.md"
capture drift-check-negative fail pnpm exec drift-check "$DRIFT_TMP/docs" --pinned-version 0.5.0
rm -rf "$DRIFT_TMP"

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "ONE OR MORE GATES FAILED"
  exit 1
fi
echo ""
echo "ALL GATES GREEN (positives passed; every negative fixture failed as required)"
