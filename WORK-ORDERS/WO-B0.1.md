> Part of the E0 work-order set (master: E0-Work-Orders.md). Sequence: WO-0 first; the three app WOs pin its v0.1.0 tag. Canon: /docs in this repo (Annex A already applied). Nothing gated; sandbox only.

## WORK ORDER — WO-B0.1 · Boutik+ app workspace + pinned canon + CI harness

### SPEC AUTHORITY (quoted)
- **Boutik+ Building Plan v3.0, slice B0.1 (DoD, verbatim):** *"Per-app pnpm/Turborepo workspace in the `boutik-plus` repo; consumes `platform-contracts` (contracts/kernel/i18n-catalog/ui tokens) as a pinned versioned package + local `commerce-core`; CI enforces money-reconciliation, no-seller-deposit, single-level, French + French Voice Standard copy-lint (§10.5), phone-alias, imaging-architecture stubs, and the contracts drift-check from the first PR."*
- **Boutik+ Building Plan standing guardrails (CI on every slice):** *"money model reconciles (spec 5.4); commission never in buyer price; delivery outside fee bases; reseller sees net · zero seller deposit/reserve · buyer refund never gated on the Protection Fund · custody only after pickup verification + custody-seal · the four secrets never substituted · deterministic imaging (no AI) · single-level · French default + French Voice Standard copy-lint · phone is an alias · canonical shapes from `contracts/`, never redefined."*
- **Execution Contract E0 repo-topology block** (quoted in WO-0) + **founder slug ruling:** canon repo slugs are kebab-case (`boutik-plus`); if a created repo uses a "+" variant, **align the slug to canon before the first commit**.
- **Boutik+ Spec §11 CI gates** — the merge-blocking list this harness must register.

### READ FIRST
1. Current state of the `boutik-plus` repo (empty or not) — report the slug exactly as it exists; if it contains "+", rename before any commit.
2. `platform-contracts` `v0.1.0` published exports + `/docs` manifest.
3. Boutik+ Spec §1, §4 (B+I-01…B+I-14), §11; Building Plan Phase 0.
Agent states back: which gates B0.1 must stand up, what the drift-check compares, and what "local `commerce-core`" contains at this slice — before writing code.

### BUILD
- Per-app pnpm/Turborepo workspace in `boutik-plus`: Expo/RN supplier-app shell + Workers services scaffold (supplier/catalog/media/offer/inventory/fulfillment service *stubs* — folders, types, health endpoints; no features).
- Pin `platform-contracts@v0.1.0`. **Local `commerce-core` package = scaffold implementing against the pinned canonical shapes.** Note in-repo (ADR-001): authoritative hosting of Checkout&Order / Ledger&Settlement services remains single-owner per Contract §2.2 and Spec §5.2 — decided at E1 wiring; **no authoritative order state machine is built in this slice or unilaterally in this repo.**
- `/docs` drift-checked copy + `drift-check` wired into CI.
- CI harness registering the **full standing-guardrail list**, where at this slice: the DoD-named gates (money-reconciliation via the pinned `assertQuoteReconciles` on a fixture quote incl. the worked baseline · no-seller-deposit · single-level · copy-lint over app strings · phone-alias · imaging-architecture stubs) run as **real positive + negative tests**; guardrails with no code paths yet (custody, four secrets, refund-priority) run as **executable architectural checks** (banned modules/imports: no wallet/balance module, no payment-funds code, no ML/inference libs, no consumer-storefront routes) that will grow teeth as slices land.
- Correlation-ID plumbing: structured logger with `correlation_id` field wired through one hello-world request (Contract E0 exit).
- Flag/kill-switch client stub wired to the E0 harness (Contract §7.2) — read-only consumption; the service itself is ecosystem infrastructure, not this repo's to build.

### OUT OF SCOPE
B0.2+ features (onboarding, verification, Studio) · any UI beyond the app shell rendering with `ui-tokens` theme `boutik-plus` · any authoritative money/custody logic · copying `platform-contracts` source instead of consuming the pin.

### DoD (binary)
The B0.1 DoD quoted above, plus: **every named gate demonstrably fails on its negative fixture** (e.g. a fixture introducing a `sellerDeposit` field fails the no-deposit gate; a fixture quote violating reconciliation fails the money gate; a string with « veuillez » fails the lint) · drift-check passes on the honest `/docs` copy and **fails on a tampered doc** (both runs attached) · repo slug verified kebab-case · app shell boots on the reference device profile in the emulator.

### CI GATES THAT MUST STAY GREEN
money-reconciliation · no-seller-deposit · single-level · French Voice copy-lint · phone-alias · imaging-architecture stubs · contracts drift-check · no-wallet/no-ML architectural checks.

### EVIDENCE REQUIRED
PR #1 CI run showing every gate executed · one negative-fixture failure output per named gate · both drift-check runs · workspace `tree` · the pinned dependency lockfile line · ADR-001 text.

### FORBIDDEN
- Starting B0.2 "since we're set up anyway."
- Redefining any canonical shape locally, even as a "temporary" type.
- Gates that pass because they assert nothing — every gate ships with the fixture that makes it fail.
- A repo slug containing "+".
- Building an order state machine or reservation DO in local commerce-core.
