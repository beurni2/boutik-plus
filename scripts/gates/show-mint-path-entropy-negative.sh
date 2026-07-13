#!/usr/bin/env bash
# Negative fixture for the mint-path entropy gate (WO-6.10, inherited from canon
# WO-5.9). A planted Math.random in a mint path must be REJECTED — and rejected BY
# CATCHING THE OFFENDER, not by some other exit-1 path (the vacuous-proof lesson:
# assert the output names the offender AND the sed re-root actually changed the
# gate). Run under `capture ... fail`, so this EXITS 1 only when the plant is
# caught. Real repo untouched (plant lives in a tmp copy).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
# copy the REAL mint path (apps/supplier-app/src/offline/commandId.ts) into a
# tmp source tree, then plant the forbidden entropy source in it
mkdir -p "$TMP/apps/supplier-app/src/offline"
cp "$ROOT/apps/supplier-app/src/offline/commandId.ts" "$TMP/apps/supplier-app/src/offline/commandId.ts"
MINT="$TMP/apps/supplier-app/src/offline/commandId.ts"
printf '\nexport const __bad = () => Math.random().toString(36);\n' >> "$MINT"
# re-root the gate at the tampered tree (replace the single root expression)
sed "s#join(dirname(fileURLToPath(import.meta.url)), '..', '..')#'$TMP'#" \
  "$ROOT/scripts/gates/check-mint-path-entropy.mjs" > "$TMP/check.mjs"

# (1) the sed re-root must have actually changed the gate's bytes:
if cmp -s "$ROOT/scripts/gates/check-mint-path-entropy.mjs" "$TMP/check.mjs"; then
  echo "NEGATIVE FIXTURE MISBEHAVED — the sed re-root did not change the gate"
  exit 0
fi
# (2) the plant must be CAUGHT — exit 1 AND the failure names Math.random:
out="$(node "$TMP/check.mjs" 2>&1)"; code=$?
if [ "$code" -eq 1 ] && printf '%s' "$out" | grep -q 'Math.random'; then
  echo "mint-path-entropy negative OK: planted Math.random in commandId.ts CAUGHT (exit 1; output names Math.random)"
  exit 1   # the fixture failed as required — harness expects 'fail'
fi
echo "NEGATIVE FIXTURE MISBEHAVED — exit $code, output did not name Math.random: $out"
exit 0     # a pass here means the plant slipped through — harness alarms
