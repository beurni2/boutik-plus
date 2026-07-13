# B1 — the settlement projection read model (🔴 RED · DO NOT MERGE)

**Branch:** `b1/settlement-read-model` · **HEAD:** `e5d307d` (see `logs/head-sha.txt`, `logs/branch-log.txt`)
**Base:** `6b0006d` (main, after A1) · **Diff:** `logs/full.diff` (`logs/diffstat.txt`)

## What this slice does (Batch B · B1 · B7.1 · B+I-05)
A pure read-model reducer over the authoritative settlement events, and the B10 « Mes
recettes » screen wired to it.

- **`apps/supplier-app/src/settlement/readModel.ts`** — `projectReceivables(events) →
  Map<orderId, SettlementObligation>` over `settlement.supplier_payable` + `payout.*`,
  consuming the canon `SettlementObligationSchema` (never redefined). Boutik+ READS settlement
  (owner: Ledger&Settlement); holds no funds, keeps no running total, offers no way to pull
  money out.
- **⚠ B+I-05** — the `amount` is copied VERBATIM from the event; the reducer imports no
  waterfall and does no arithmetic on it. Proven adversarially (a franc no waterfall yields
  survives to the franc).
- **⚠ B7.1** — `Paid` reachable ONLY on `payout.paid` carrying a non-empty provider `payoutRef`;
  a ref-less paid causes NO transition (honest « en attente »).
- **B10 « Mes recettes »** renders `world.receivables` (projected from seeded EVENTS, not
  hand-set states): the LOCKED amount + honest state (pre-Paid → « en attente », Processing →
  « versement en cours », Paid → « versé » + the provider ref, Held → « en révision », Failed →
  honest retry). The old `status==='pret'` filter is gone. Copy-lint 166/0.

## RED protocol
The adversarial tests were written and run FIRST — they failed to even load
(`logs/red-proof.txt`, "Does the file exist?") — proving they bite; the implementation then
turned them GREEN (7/7).

## Flag for founder review (RED — your veto)
- **My own B1 prose tripped two strict gates (the A1 false-positive class, again).** The words
  « no local balance / no withdrawal » in my read-model COMMENT + the B7.1 spec-quote hit the
  `no-wallet-no-funds` MONEY gate; `⚠` in two `describe()` labels hit `no-emoji`. **On a money
  gate I did NOT narrow the gate — I reworded my own prose** and left every gate script
  byte-unchanged (`git diff … scripts/gates/` = only the fixture added). Recorded so the
  property is known: the funds-holding vocabulary cannot appear even in comments, by design.

## Evidence (`logs/`)
- `run-gates.txt` — full **warm** `run-gates.sh`: typecheck 0 · tests · **ALL GATES GREEN**
  (no-wallet positive clean + negative 21 hits incl. the settlement fixture; copy-lint 166/0).
- `coldgates.log` — **cold-gates proof**: fresh HOME (auth line = HTTPS→proxy `insteadOf`, NOT
  ssh) + fresh empty store + `--frozen-lockfile` + fresh clone of `e5d307d` → `run-gates.sh`
  **exit 0, ALL GATES GREEN** from nothing.
- `red-proof.txt` — the adversarial tests failing BEFORE implementation.
- `head-sha.txt` · `branch-log.txt` · `full.diff` · `diffstat.txt` — atomic, one HEAD.
- `verifier-report.md` — fresh-context RED verifier on the final bytes: **VERDICT PASS · 0
  BLOCKERS** (mutation-tested the assertions; planted a `balance` to confirm the gate bites).
  One low observation, recorded not fixed (canon parity): a whitespace-only `payoutRef` reaches
  Paid because canon's `payoutRef` is `z.string().min(1)` which accepts a space — trusted
  provider data; tightening would exceed canon.

## Test counts
supplier-app **130/130** (settlement 7 adversarial + demo-store 6 + offline-queue 8
byte-unchanged) · full suite 19/19 · typecheck 11/11.
