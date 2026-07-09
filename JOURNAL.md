# JOURNAL — boutik-plus
Continuity ledger per CTO charter §6/§6bis. Every entry is evidence-grounded.

Format per entry:
## <date> · <slice/WO id> · <status: in-progress | in-review | done | blocked-on-founder>
- What was done (with the tool result / test output that proves it)
- Decisions made · safest-defaults applied on open ⏳ (flagged) · founder overrides
- Pending / next

---

## 2026-07-09 · E0 bootstrap (pre-WO-B0.1) · done
- Pre-flight: repo slug verified `boutik-plus` (origin remote `beurni2/boutik-plus` — kebab-case, no "+"). `platform-contracts` cloned fresh at pinned commit `b10f4822b173c9cd4b162f416ad213bf580ab652`; `/CONSUMING.md` read.
- **Pin decision:** `git ls-remote --tags origin` on platform-contracts returned **no tags** — `v0.1.0` does not exist on origin (its journal records the tag cut locally, push blocked by proxy 403). Pin ref is therefore the commit sha `b10f4822b173c9cd4b162f416ad213bf580ab652`. **Move the pin to `#v0.1.0` in the first version-bump PR** once the tag is pushed.
- Bootstrapped from the pinned clone: `/docs` (all seven canon documents), `/CLAUDE.md` + `/AGENTS.md` (byte-identical, sha256 `faa0c040…`), `/WORK-ORDERS/WO-B0.1.md`, this fresh `/JOURNAL.md`.
- Pending / next: WO-B0.1 on branch `e0/wo-b0.1` — consumption pre-flight per `/CONSUMING.md`, then the workspace + CI harness to DoD.

## 2026-07-09 · WO-B0.1 · in-progress
- **Step-3 consumption pre-flight (CONSUMING.md, exact): PASSED.** Both required `pnpm-workspace.yaml` blocks added (`onlyBuiltDependencies` for the four packages + the `@platform/kernel-types` override at the sha pin). `pnpm install` resolved all four `@platform/*@0.1.0` from `git+https://github.com/beurni2/platform-contracts.git#b10f4822…&path:packages/*` (lockfile carries the pin; `dist/` present for all four — prepare builds ran). Baseline import check printed: productSubtotal 11500 · buyerTotal 12500 · sellerNet 8500 · resellerNet 2000 · platformProductFeeRevenue 1000 · `assertQuoteReconciles: no throw` (evidence: `_evidence/step3-baseline-check.txt`).
- **State-back before code (WO-B0.1 READ FIRST):**
  - *Repo state as it exists:* slug `boutik-plus` (kebab-case, verified on origin remote); before this WO the repo contained only the bootstrap commit — `/docs` (7 canon docs), `CLAUDE.md`/`AGENTS.md`, `WORK-ORDERS/WO-B0.1.md`, `JOURNAL.md`, LICENSE. No code existed.
  - *Gates B0.1 stands up (each with a negative fixture shown failing once):* ① money-reconciliation — pinned `assertQuoteReconciles` + `computeWaterfall` on fixture quotes incl. the §5.4 worked baseline; ② no-seller-deposit (B+I-12) — no deposit/reserve/bond field or flow in repo source; ③ single-level (B+I-10) — no downline/recruitment/MLM identifiers; ④ French Voice copy-lint (§10.5) — pinned `copy-lint` CLI over the app i18n catalog; ⑤ phone-alias (§5.1) — phone never a DB key / entity id; ⑥ imaging-architecture stubs (B+I-11) — no ML/generative/inference deps or imports, deps + import scan; ⑦ contracts drift-check — `/docs` vs pinned canon manifest; ⑧ architectural checks — no wallet/balance module, no payment-funds code, no consumer-storefront/checkout/cart routes in `services/`+`apps/`.
  - *What the drift-check compares:* the seven `.md` files in this repo's `/docs` byte-for-byte (sha256) against `docs.manifest.json` shipped inside the pinned `@platform/contracts` package, plus `--pinned-version 0.1.0` vs the manifest's `packageVersion`; it fails on changed bytes, missing docs, extra top-level `.md` files, or version mismatch.
  - *Local `commerce-core` scope at this slice:* a scaffold package implementing **against** the pinned canonical shapes only — typed fixture builders that call the pinned `computeWaterfall` and feed the money gate; **no authoritative order state machine, no reservation Durable Object, no redefinition of any canonical shape** — authoritative hosting of Checkout&Order / Ledger&Settlement remains single-owner per Contract §2.2 / Spec §5.2, decided at E1 wiring (ADR-001).
