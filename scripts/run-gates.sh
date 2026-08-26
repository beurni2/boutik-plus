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
  # capture <name> <expected: pass|fail|<exit code>> <command...>
  # expected=fail requires exit code EXACTLY 1 (the gate-failure code): a
  # crashed or misinvoked gate (exit 2+) must never pass for a working
  # negative fixture (verifier finding, 2026-07-09).
  # An explicit NUMBER pins a specific non-zero code — used for the exit-2
  # "gate could not run" contract (empty scan, unclassified directory), which
  # is a different outcome from "gate ran and found a violation" and must not
  # be provable by the same expectation (AUDIT-B+1 F2).
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
  case "$expected" in
    ''|*[!0-9]*) ;;
    *) if [ $rc -ne "$expected" ]; then echo "GATE FAILED (expected exit $expected, got $rc): $name"; FAILED=1; fi ;;
  esac
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

# AUDIT-B+1 F8 — the identities alone cannot see a WRONG FEE RATE. This quote
# reconciles perfectly (7000 + 2000 + 2500 = 11500 = productSubtotal) while
# taking 20% from the seller instead of the pinned 5%: 1500 FCFA off the
# seller, and the old gate exited 0 on it. Caught now by recomputing against
# the pinned computeWaterfall.
log "gate: money-reconciliation — NEGATIVE FIXTURE (reconciles, but 20% seller fee — must fail)"
capture money-reconciliation-wrong-rate fail node scripts/gates/money-reconciliation.mjs gates/fixtures/negative/quote.wrong-seller-fee-rate.json

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

log "gate: no-expo-token-leak — repo source + workflows + lockfile (must pass)"
capture no-expo-token-leak-positive pass node scripts/gates/no-expo-token-leak.mjs

log "gate: no-expo-token-leak — NEGATIVE FIXTURE (committed token literal, must fail)"
capture no-expo-token-leak-negative fail node scripts/gates/no-expo-token-leak.mjs gates/fixtures/negative/no-expo-token-leak

log "gate: single-level — repo source (must pass)"
capture single-level-positive pass node scripts/gates/single-level.mjs

log "gate: single-level — NEGATIVE FIXTURE (downline/recruit, must fail)"
capture single-level-negative fail node scripts/gates/single-level.mjs gates/fixtures/negative/single-level

# AUDIT-B+1 F2: the gate learned French, and the FIRST risk of teaching a gate
# French is that it starts failing an approved capability. Single-level
# parrainage is shipped and founder-designed; this asserts the gate still lets
# it through. A pattern that makes this fixture fail is a WRONG pattern.
log "gate: single-level — POSITIVE FIXTURE (single-level parrainage is legal, must pass)"
capture single-level-legal-parrainage pass node scripts/gates/single-level.mjs gates/fixtures/single-level-legal

# AUDIT-B+1 F2 (verifier MAJOR 1) — EVERY PATTERN INDIVIDUALLY LOAD-BEARING.
# The fixtures fail on the SET of patterns. Measured: deleting the `solde…`
# pattern — the exact identifier this whole slice exists for — left every
# fixture red anyway, because siblings still fired. CI would not have noticed
# the law being un-enforced. This gate fails if ANY pattern stops being
# exercised by a fixture line.
log "gate: fr-pattern-coverage — every banned pattern is exercised by a fixture (must pass)"
capture fr-pattern-coverage pass node scripts/gates/fr-pattern-coverage.mjs

# The coverage gate had NO negative demonstration — the board proved it could
# pass, never that it could fail, which is how a hole in IT would ship. This
# corrupts the roster in a temp copy and requires a refusal.
log "gate: fr-pattern-coverage — NEGATIVE (a gutted roster must be refused)"
ROSTER_BAK="$(mktemp)"
cp gates/pattern-roster.json "$ROSTER_BAK"
restore_roster() { cp "$ROSTER_BAK" gates/pattern-roster.json; rm -f "$ROSTER_BAK"; }
trap restore_roster EXIT
node -e 'const f="gates/pattern-roster.json";const fs=require("fs");const r=JSON.parse(fs.readFileSync(f,"utf8"));const k=Object.keys(r)[0];r[k][0].regex="/zzgutted/";fs.writeFileSync(f,JSON.stringify(r,null,2));'
capture fr-pattern-coverage-negative fail node scripts/gates/fr-pattern-coverage.mjs
restore_roster
trap - EXIT

# AUDIT-B+1 F2 — THE FRENCH FIXTURES, SCANNED ONE FILE AT A TIME.
# Scanning the whole negative DIRECTORY cannot prove the French half works: the
# English fixture beside it fails too, so the directory stays red even if every
# French pattern is deleted. Measured — that mutation passed the directory scan.
# Each French fixture is therefore scanned ALONE, and its prose is written in
# French precisely so no English pattern can be what makes it fail.
log "gate: no-wallet-no-funds — FRENCH FIXTURE ALONE (soldeVendeur/crediter, must fail)"
capture no-wallet-no-funds-negative-fr fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds/solde-vendeur.fr.ts

log "gate: single-level — FRENCH FIXTURE ALONE (second level in French, must fail)"
capture single-level-negative-fr fail node scripts/gates/single-level.mjs gates/fixtures/negative/single-level/reseau-multi-niveau.fr.ts

log "gate: no-seller-deposit — FRENCH FIXTURE ALONE (cautionFcfa/acompte/arrhes, must fail)"
capture no-seller-deposit-negative-fr fail node scripts/gates/no-seller-deposit.mjs gates/fixtures/negative/no-seller-deposit/caution-vendeur.fr.ts

log "gate: no-emoji — app chrome (WO-6.0 ruling ①, must pass)"
capture no-emoji-positive pass node scripts/gates/no-emoji.mjs apps

log "gate: no-emoji — NEGATIVE FIXTURE (emoji in chrome, must fail)"
capture no-emoji-negative fail node scripts/gates/no-emoji.mjs gates/fixtures/negative/no-emoji

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

# AUDIT-B+1 F2 / M-GATE-03 — THE SCAN-COVERAGE PROOF.
# Every law gate scans an ALLOWLIST of roots, so a top-level directory nobody
# added was scanned by nothing and reported by nothing. This plants a directory
# with a live violation in it and requires exit 2 ("gate could not run") — not
# exit 0. Without this, the coverage fix would be a claim, not a fact.
log "gate: scan coverage — an UNCLASSIFIED top-level directory must break the build (exit 2)"
UNCLASSIFIED_DIR="$ROOT/zz-unclassified-coverage-probe"
cleanup_probe() { rm -rf "$UNCLASSIFIED_DIR"; }
trap cleanup_probe EXIT
rm -rf "$UNCLASSIFIED_DIR"; mkdir -p "$UNCLASSIFIED_DIR"
printf 'export const soldeVendeur = 0;\n' > "$UNCLASSIFIED_DIR/probe.ts"
capture scan-coverage-unclassified-dir 2 node scripts/gates/no-wallet-no-funds.mjs
cleanup_probe
trap - EXIT

log "gate: no-demo-in-app-graph — the DEMO supply adapter is absent from the app graph (SOURCE inference, must pass)"
capture no-demo-in-app-graph-positive pass node scripts/gates/no-demo-in-app-graph.mjs

# The MEASUREMENT beside the inference (cross-lane relay from OZ1, founder order
# 2026-07-24): `expo export` writes the real Metro/Hermes artifact and this greps
# it, so bundle absence stops being an argument about reachability. ~9s warm,
# ~20s cold. Red-proven: planting the demo fallback back into the resolver makes
# it exit 1 naming the data fingerprint.
log "gate: bundle-absence — the demo adapter is absent from the REAL exported bundle (measured, must pass)"
capture bundle-absence-positive pass node scripts/gates/bundle-absence.mjs

log "gate: fournisseur-bundle-absence — the fournisseur artifact carries NO offers client (founder capability ruling 2026-08-02, measured, must pass)"
capture fournisseur-bundle-absence-positive pass node scripts/gates/fournisseur-bundle-absence.mjs

log "gate: fournisseur-bundle-absence — NEGATIVE (the v2 root legitimately carries X-Write-Key; the same scan must FAIL on it)"
capture fournisseur-bundle-absence-negative fail node scripts/gates/fournisseur-bundle-absence.mjs --root v2

log "gate: no-consumer-storefront — services/ + apps/ (must pass)"
capture no-consumer-storefront-positive pass node scripts/gates/no-consumer-storefront.mjs

log "gate: no-consumer-storefront — NEGATIVE FIXTURE (storefront/checkout/cart routes, must fail)"
capture no-consumer-storefront-negative fail node scripts/gates/no-consumer-storefront.mjs gates/fixtures/negative/no-consumer-storefront

log "gate: neutral-packaging — repo source (B+3: no supplier branding/contact on the exterior, must pass)"
capture neutral-packaging-positive pass node scripts/gates/neutral-packaging.mjs

log "gate: neutral-packaging — NEGATIVE FIXTURE (supplier branding/contact on the exterior, must fail)"
capture neutral-packaging-negative fail node scripts/gates/neutral-packaging.mjs gates/fixtures/negative/neutral-packaging

log "gate: French Voice copy-lint — supplier-app catalog (must pass)"
capture copy-lint-positive pass pnpm exec copy-lint apps/supplier-app/i18n/catalog.json

log "gate: French Voice copy-lint — NEGATIVE FIXTURE (veuillez/séquestre + marketing-in-money + Mooré-in-instruction, must fail)"
capture copy-lint-negative fail pnpm exec copy-lint gates/fixtures/negative/catalog.negative.json

# AUDIT-B+1 F12, verifier round 3 — THE GATE THAT MAKES THE PIN LIVE.
# The existing negative fixture above fails under BOTH the old and the new token
# list (it carries « Veuillez » and « séquestre »), so it discriminates nothing:
# reverting @platform/i18n to the pre-F12 package left every board GREEN while
# the audit's escape passed again — proven by execution. This fixture's ONLY
# violation is one of the stems F12 added, so if the i18n pin ever regresses
# this entry stops failing and the board goes red. Enforced by construction,
# not by discipline (§4).
log "gate: French Voice copy-lint — NEGATIVE FIXTURE (administrative register, F12 — must fail)"
capture copy-lint-administrative fail pnpm exec copy-lint gates/fixtures/negative/catalog.administrative-register.json


log "gate: no-ssh-lockfile — committed root lockfile (ssh-form git URLs must be 0, must pass)"
capture no-ssh-lockfile-positive pass node scripts/gates/no-ssh-lockfile.mjs pnpm-lock.yaml

log "gate: no-ssh-lockfile — NEGATIVE FIXTURE (ssh-form git URL, must fail)"
capture no-ssh-lockfile-negative fail node scripts/gates/no-ssh-lockfile.mjs gates/fixtures/negative/lockfile/pnpm-lock.ssh.yaml

log "gate: mint-path entropy — command_id mint paths draw from the OS CSPRNG, zero Math.random (WO-6.10, inherited from canon; must pass)"
capture mint-path-entropy-positive pass node scripts/gates/check-mint-path-entropy.mjs

log "gate: mint-path entropy — NEGATIVE FIXTURE (a planted Math.random in a mint path must fail)"
capture mint-path-entropy-negative fail bash scripts/gates/show-mint-path-entropy-negative.sh

# ═══ DECLARED **AND** DERIVED — AND THE DIFFERENCE IS THE WHOLE GATE ═══
#
# CATEGORY-WIRE-1 first "fixed" this by DELETING the declaration: it replaced a
# hardcoded `--pinned-version 2.0.0` with the version read from the INSTALLED
# package, copying what platform-contracts did at canon v2.5.0. That copy was
# wrong, and a fresh-context verifier caught it.
#
# In platform-contracts the two operands are genuinely independent — the version
# comes from that repo's own `./package.json`, the manifest from its own
# committed `docs.manifest.json`, two hand-maintained files that CAN disagree.
# HERE they are not: `drift-check` defaults `--manifest` to the installed
# package's own `docs.manifest.json`, so version and manifest were both being
# read out of ONE immutable tarball. The comparison became a tautology — a gate
# that cannot fail, wearing the words of one that can.
#
# So the declaration comes back, and the derived value is checked AGAINST it.
# EXPECTED_CANON is this repo saying which canon it believes it consumes; it is
# bumped by hand, in the same commit as the pin. The failure it exists to catch
# is the one that cost this slice 21 tests: `package.json` repinned while
# `pnpm-workspace.yaml`'s override — the resolution that actually wins — stayed
# behind. Then the installed version is the OLD one, this check fires, and the
# repo says so instead of printing a number that agrees with itself.
#
# ROUTED THROUGH `capture`, WITH A NEGATIVE FIXTURE, like every other gate here
# (verifier finding, round 2). The first cut was a bare `if`/`echo`: it produced
# no evidence artifact and nothing in CI ever proved it could fail — the exact
# gap this file's own header legislates against ("Every gate has a negative
# fixture and this script SHOWS each one failing once per run").
EXPECTED_CANON="3.13.0"
CANON_VERSION="$(node -p "require('@platform/contracts/package.json').version")"
log "canon declared: $EXPECTED_CANON · canon installed: $CANON_VERSION"

log "gate: canon-pin-declared — the canon this repo DECLARES is the canon that RESOLVED (must pass)"
capture canon-pin-declared-positive pass node scripts/gates/canon-pin-declared.mjs "$EXPECTED_CANON"

log "gate: canon-pin-declared — NEGATIVE FIXTURE (a declaration the install does not match, must fail)"
capture canon-pin-declared-negative fail node scripts/gates/canon-pin-declared.mjs 0.0.0-not-the-pin

log "gate: contracts drift-check — honest /docs copy vs pinned canon manifest (must pass)"
capture drift-check-positive pass pnpm exec drift-check docs --pinned-version "$CANON_VERSION"

log "gate: contracts drift-check — TAMPERED doc (must fail)"
DRIFT_TMP="$(mktemp -d)"
cp -r docs "$DRIFT_TMP/docs"
printf '\nrogue edit — this consumer copy drifted from canon\n' >> "$DRIFT_TMP/docs/Boutik-Plus-Build-Spec.md"
capture drift-check-negative fail pnpm exec drift-check "$DRIFT_TMP/docs" --pinned-version "$CANON_VERSION"
rm -rf "$DRIFT_TMP"

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "ONE OR MORE GATES FAILED"
  exit 1
fi
echo ""
echo "ALL GATES GREEN (positives passed; every negative fixture failed as required)"
