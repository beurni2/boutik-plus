# VERIFIER REPORT — B1 settlement projection read model (🔴 RED)

Fresh-context RED verifier, dispatched with only the canon quotes, the diff scope, and the DoD
(no memory of the build). Commit `e5d307d` vs base `6b0006d`. Every check ran by its own hands
— read the bytes, ran the tests uncached, wrote its own attack script, MUTATION-tested the
assertions, and independently exercised the gate.

### Findings (most-severe first)

**1. OBSERVATION (low, NOT a blocker) — whitespace-only payoutRef reaches Paid.** `readModel.ts:44`
guards with `typeof ref === 'string' && ref.length > 0`. Attack fed `payoutRef: ' '` (single
space) → obligation flips to `Paid` with ref `" "`. This is *consistent with canon*:
`SettlementObligationSchema.payoutRef` is `IdSchema = z.string().min(1)`, which itself accepts a
space. Provider refs are trusted authoritative event data from Ledger&Settlement; a
whitespace-only ref is not a realistic provider output, and tightening past canon would exceed
the work order. Flagged for the record only.

No other findings. No blockers.

### What was verified, by its own tools

- **A · B+I-05 (money) — HELD.** `readModel.ts` imports only `SettlementObligationSchema` + types — no `computeWaterfall`, zero arithmetic on `amount` (grep hit only the doc-comment). Attack: amounts `8501, 1, 0, 999999` survive verbatim; immutable through Processing→Paid. **Mutation test:** changing `amount: p.amount` → `amount: 0` fails *both* B+I-05 tests — they bite.
- **B · Paid-requires-ref — HELD.** submitted→Processing (no ref); paid-without-ref → stays Processing; paid with `''` → not Paid; paid with numeric ref → not Paid; paid with a real ref → Paid+ref; paid-with-ref-but-no-prior-payable → no entry (cannot fabricate Paid). **Mutation** removing the guard fails the "paid WITHOUT ref NEVER reaches Paid" test.
- **C · Test file bites, not vacuous.** Read every assertion; ran uncached → 7/7. RED-first plausible (read model is a separate file the test imports; the mutations prove the assertions fail when the invariant breaks).
- **D · B10 wiring — CONFIRMED.** Renders `world.receivables` and `item.obligation.amount` (NOT `item.money.sellerNet`, no recompute); provider ref shown ONLY when `state === 'Paid' && payoutRef !== undefined`; old `status==='pret'` recettes filter removed (the remaining `pret` is the unrelated `enLigne` online-count). Demo SEEDS events and PROJECTS them through `projectReceivables` — states computed by the reducer, not hand-set.
- **E · no-wallet gate — CONFIRMED.** Positive exit 0; against fixture dir exit 1 naming `settlement-balance.ts`. Independently planted a `balance` field in a read-model copy under `apps/` → gate caught it (exit 1, named the file). No `balance`/`withdraw`/`wallet` in read-model / B10 / store code.
- **F · Honesty flag — CONFIRMED honest.** `git diff -- scripts/gates/` is empty: no gate script changed, only the fixture added. The builder reworded its own comments to dodge the blunt line-scanner's `/balance/i` `/withdraw/i` — legitimate, since the gate scans comments and no gate was weakened; the code genuinely holds no balance/withdrawal/running total.
- **G · Exit codes.** `tsc -p` supplier-app direct → 0. `pnpm test` → 19/19 tasks; full supplier-app suite uncached → **130/130**. `run-gates.sh` → `ALL GATES GREEN`, exit 0.
- **H · Smells.** No `Math.random` in changed source; no silent catch added; no canon-name drift; French Voice strings are money-register, in the catalog with `register` tags, no administrative French; no UI path shows a payout as done without a provider ref.

Working tree restored clean after all mutations/probes.

**VERDICT: PASS**
**BLOCKERS: 0**
