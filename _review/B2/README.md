# B2 — statements + the trust/consequence view (🔴 RED · DO NOT MERGE)

**Branch:** `b2/statements-trust-view` · **HEAD (code):** `2c315b1` (see `logs/head-sha.txt`, `logs/branch-log.txt`)
**Base:** `0dad348` (B1 head, after its close) · **Diff:** `logs/full.diff` (`logs/diffstat.txt`) — 7 files, code only.

## What this slice does (Batch B · B2 · B7.2 · B+I-12)
The seller's « Confiance » surface: a **server-generated statement** shown verbatim, plus the
**trust/consequence view** — access-based only, a fault never touches the seller's money.

- **`apps/supplier-app/src/trust/statement.ts`** — two pure presenters:
  - `statementFigures(s)` returns the authority's `paidTotal` / `pendingTotal` **verbatim** — no
    arithmetic, no client re-sum. Boutik+ holds no funds and computes no statement (B7.2 owner:
    Ledger&Settlement); it reports what the authority reports.
  - `presentTrustConsequence(state)` derives the view **solely from the access fields** of the
    canon `SellerTrustState` — `{tier, faultCount, restrictions, limits:probationLimits}`. There
    is NO money field to carry and none is added (B+I-12: "progression, not payment").
- **⚠ B+I-12** — a seller-fault consequence is ACCESS-based, never money. Proven adversarially:
  the view's key set is EXACTLY `{tier, faultCount, restrictions, limits}`, and the canon
  `SellerTrustStateSchema` is strict — an added money field fails `safeParse` outright.
- **⚠ B7.2** — the statement is SERVER-generated, not client-derived. Proven adversarially: a
  figure no local receivable yields (`12_345`) survives verbatim; `paid + pending` is NOT forced
  to any receivable sum.
- **B10-sibling « Confiance » screen** (`App.tsx` `screen==='confiance'`) renders the verbatim
  statement (« Versé ce mois » + « En attente » + « Boutik+ ne garde rien ») and the trust view
  (tier chip · incident count · restrictions as access lines) closing on the invariant, in plain
  words: **« Aucun franc n'est pris sur vos ventes. La protection Séra couvre la perte. »** Money
  register where money is named, neutral elsewhere; copy-lint **177/0**.

## RED protocol
The adversarial tests were written and run FIRST — they failed to even load
(`logs/red-proof.txt`, the presenter did not exist) — proving they bite; the implementation then
turned them GREEN (4/4).

## Flag for founder review (RED — your veto)
- **My own B2 prose tripped THREE strict money gates (the A1/B1 false-positive class, again).**
  A test comment quoting canon (« zero deposit, ever ») hit `no-seller-deposit`; a planted-field
  name and a comment word (« debit »/« deduction ») hit `no-seller-debit`. **On money gates I did
  NOT narrow any gate — I reworded my own prose** and left every gate script byte-unchanged
  (`git diff -- scripts/gates/` = empty; only the new fixture was added). Recorded so the property
  is known: the seller-money-consequence vocabulary cannot appear even in comments, by design.

## Evidence
- `logs/run-gates.txt` — full **warm** `run-gates.sh`: typecheck 0 · tests · **ALL GATES GREEN**
  (no-seller-debit positive clean + negative 21 hits incl. the new statement-fault fixture;
  no-seller-deposit + no-wallet positives clean; copy-lint 177/0).
- `logs/coldgates.log` — **cold-gates proof**: fresh HOME (auth line = HTTPS→proxy `insteadOf`,
  NOT ssh) + fresh EMPTY store + `--frozen-lockfile` + fresh clone of `2c315b1` → `run-gates.sh`
  **exit 0, ALL GATES GREEN from nothing** (cold HEAD `2c315b1`; contracts 0.9.5 built via the
  HTTPS proxy; typecheck 0, supplier-app 134/134, every negative fixture fired as required).
- `logs/red-proof.txt` — the adversarial tests failing BEFORE implementation.
- `logs/head-sha.txt` · `logs/branch-log.txt` · `logs/full.diff` · `logs/diffstat.txt` — atomic, one HEAD.
- `evidence/` — typecheck · tests · the money gates (no-seller-debit pos/neg, no-seller-deposit,
  no-wallet) · copy-lint pos/neg.
- `logs/verifier-report.md` — fresh-context RED verifier on the final bytes: **[VERDICT — see report]**.

## UI evidence note (honest limit)
The « Confiance » screen is an Expo React-Native App.tsx screen; RN screen capture needs the full
device/simulator runtime, which is not available in this sandbox (same limit as B1's B10 screen,
which shipped without a gallery). Its UI evidence is therefore: the reviewed render
(`App.tsx` `screen==='confiance'`, in `logs/full.diff`), the **copy-lint 177/0** French-Voice pass
on the confiance strings, and the presenter unit tests — matching the B1 convention this branch
extends.

## Test counts
supplier-app **134/134** (trust-statement 4 adversarial + settlement 7 + demo-store 6 +
offline-queue 8 byte-unchanged) · full suite 19/19 · typecheck 11/11.
