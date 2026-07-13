# GROUNDING REPORT — BOUTIK DEPTH (🟢 GREEN · no product code · JOURNAL-only diff)

Purpose: give the founder grep-grounded bytes to write the next build orders against — not
my memory. Every "exists" claim carries a hit count / file:line. Scope candidates: the
publication/moderation flow (M2) and the settlement/statement read models (M7, the B10/B11
screens). Base: `main @ d8a8c08`.

## 0. Recollection check (correcting the order's terms against the repo)
- **"B10/B11 read models" — CONFIRMED as real app screens.** `App.tsx:324,793` **B10 « Mes recettes »** (`screen==='recettes'`, net-per-sellable-product from the 5.4 waterfall); `App.tsx:136,824` **B11 « Modération »** (`screen==='moderation'`, per-product review state + plain-language line). They are UI, built at WO-6.0, **demo-store backed** (`src/demo/store.ts` `seed()` status strings), **not** wired to canonical shapes.
- **« Le Standard » — NOT a spec-defined surface.** Grep of `docs/` finds only generic usages: PackLab "sets the visual **standard**" (Build-Spec:11), DESIGN-LANGUAGE "un **standard** maison" (the audio-listen icon, :11). No screen, invariant, or slice named « Le Standard ». → **FOUNDER DECISION** (§ below); I will not invent its behaviour.

## 1. Presence check (grep-grounded; `--include=*.ts`, dist/node_modules excluded)
| # | Surface | Spec / plan anchor | Exists today (evidence) | Net-new |
|---|---|---|---|---|
| D1 | **Canonical publication → R2** | B2.1 · Build-Spec §7 B+2 | **Mostly built.** `media-service/premium-frame.ts`: private+immutable master (B+I-08), price-free/contact-free derivatives (B+I-02:9), `hashes` (:50). `publi*` = 36 hits. R2 is an E1 ref-stub (`private/master/${captureRef}`). | R2 wiring is post-E1; not depth now. |
| D2 | **Moderation decision + timeout→pending** | B2.2 · B+3 · B+I-01 | **Stub only.** `catalog-service/product.ts:49` hardcodes `moderationState:'approved_e1_sandbox'`; `activate()` gates on publisher eligibility only (`:64-68`) — **no decision states, no timeout→pending.** `moderat*` = 7 hits, all stub/label. | The whole real flow. |
| D3 | **Moderation/media authoritative events** | §5.7 events | **None emitted.** `media.derivative_approved.v1` / `media.asset_rejected.v1` / `catalog.blocked.v1` / `catalog.product_submitted.v1` referenced in app+services src = **0**. Shapes exist in canon. | All of them. |
| D4 | **Neutral / platform-packaging rule** | B+3 · B2.2 | **Ungated.** No `scripts/gates/*packag*`. | A gate + planted negative. |
| D5 | **Settlement projection read model** | B7.1 · B+8 · §8 `supplier_money_view` | **None.** `settlement`/`SettlementObligation`/`supplier_money_view` in src = **0**. Canon ships `SettlementObligationSchema` + states `Locked→Pending→Eligible→Payable→Processing→Paid\|Held\|Failed` (enums note: *"the state machine is app-repo work"*). B10 screen is demo-backed. | The state machine + read model + B10 wiring. |
| D6 | **Statements + trust/consequence view** | B7.2 · B+8 · §8 `supplier_trust_view` | **None.** `statement`/`relevé`/`trust`/`tier` in services src = **0**. Canon ships `SellerTrustStateSchema`/`SellerTrustTierSchema`; repo has a `no-seller-debit` gate. B11 shows moderation, not trust/statements. | Statement generation + trust view + wiring. |

## 2. Governing sentences (derive-or-stop — quoted, per candidate)
- **D2 moderation** — B2.2 DoD: *"Moderation timeout = pending; neutral/platform packaging rule (no supplier branding/contact; checked at pickup)."* B+I-01: *"Every active product version MUST have … an approved moderation decision."* MVP-accept §11: *"creates product/variant offline, **gets moderation**."* → derivable, buildable.
- **D5 settlement** — B7.1 DoD: *"Locked/Pending/Eligible/Processing/Paid/Held/Failed; same/next-day after validated acceptance; provider-confirmed ref before Paid; no withdrawal; no local balance."* B+I-05: *"A supplier receivable displayed … MUST equal the locked quote/ledger obligation (`sellerNet`), never a live recomputation."* → derivable, buildable.
- **D6 statements/trust** — B7.2 DoD: *"Server-generated; seller-fault losses do NOT debit the seller (Protection Fund absorbs); trust-tier consequences shown."* B+8: *"reads `SettlementObligation`; … no withdrawal button; no local balance."* → derivable, buildable.
- **D4 neutral packaging** — B+3: *"no supplier branding/contact on the exterior; checked at pickup."* → a rule with no gate; buildable as a source/asset gate + planted negative.
- **« Le Standard »** — **NO governing sentence exists.** → **FOUNDER DECISION**, do not propose an invention. (Best-grounded guesses, for you to pick or reject: (a) the seller-facing **publication standard** = B+I-01's five approvals rendered as a quality bar on B11; (b) the PackLab **visual standard** / Media-Kit — but that is **build-gated B+9**, not startable now; (c) the DESIGN-LANGUAGE "standard maison" audio motif.)

## 3. Proposed slice split (tiers per the freshly-synced Execution Contract §3.1)
Sequence doctrine §10 orders publication/moderation (item 3) **before** settlement (item 8), so Batch A first.

**Batch A — Moderation depth (M2).** *Depends on: catalog-service, media-service, contracts events (all present).*
- **A1 — real moderation state machine (B2.2).** 🟠 AMBER. Size **M**. Replace the `approved_e1_sandbox` stub with submitted→approved/rejected, **timeout→pending**; emit `catalog.product_submitted/blocked` + `media.derivative_approved/asset_rejected`; wire **B11** to the real state (drop the demo enum). Negative fixtures owed: **moderation-timeout-becomes-pending-not-approved**; **unapproved-version-cannot-activate** (B+I-01); B11 renders honest pending/rejected states (not a fake "approuvé").
- **A2 — neutral-packaging gate (B+3/D4).** 🟢 GREEN. Size **S**. A `scripts/gates/` rule + planted negative (supplier branding/contact on exterior asset/copy). Standalone; no dep on A1.

**Batch B — Settlement & statements depth (M7).** *Depends on: contracts `SettlementObligation`/`SellerTrustState` (present); Batch A not required.*
- **B1 — settlement projection read model (B7.1).** 🔴 **RED** (money path: `sellerNet`, locked obligation, B+I-05 — not AMBER). Size **M**. The `Locked→…→Paid|Held|Failed` state machine as a read model; `settlement.supplier_payable`/`payout.*` consumed; **Paid only after provider-confirmed ref**; wire **B10 « Mes recettes »** to it. Negative fixtures owed: **displayed receivable == locked obligation, never recomputed** (B+I-05); **Paid-requires-provider-confirmed-ref**; **no-withdrawal / no-local-balance** (extend `no-wallet-no-funds`).
- **B2 — statements + trust/consequence view (B7.2).** 🔴 **RED** (seller-never-debited invariant). Size **S**. Server-generated statement + `SellerTrustState` view; **seller-fault loss never debits** (fund absorbs). Negative fixtures owed: **seller-fault-does-not-debit** (extend `no-seller-debit`); **statement-server-generated-not-client-derived**.

## 4. FOUNDER DECISIONS (open — I will not close these)
1. **Define « Le Standard ».** Which of §2's readings (or another)? If it means the PackLab media standard, it is **build-gated B+9** and cannot start now — restate the gate.
2. **Confirm the tiering.** I have marked B1/B2 **RED**, not AMBER, because they touch `sellerNet`/locked-obligation and the seller-never-debited invariant (§3.1: "anything that could move a franc"). If you intend them AMBER, say so; I recommend RED.
3. **Batch order / size.** Recommend A1+A2 as one AMBER-batch first (§10 item 3), then B1+B2 as a RED pair (§10 item 8). A1 is the highest-value depth (it removes a stubbed "approved" that currently lies to the seller).

*No product code changed. Diff beyond this packet = JOURNAL.md only.*
