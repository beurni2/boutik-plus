# ADR-001 — Local `commerce-core` is a scaffold; no authoritative order state machine in this repo

**Status:** Accepted · **Date:** 2026-07-09 · **Slice:** WO-B0.1

## Context
The Boutik+ Building Plan (B0.1) calls for a local `commerce-core` package
alongside the pinned `platform-contracts` consumption. The Execution Contract
§2.2 fixes single-owner hosting for the money/order domains: *"User / Order /
immutable Quote / EscrowTxn / SettlementObligation / order state machine —
definition lives in `contracts`, hosted by commerce-core"* — one accountable
definition, hosted by one app, and *"no second definition may exist."* Which
deployable hosts the authoritative Checkout&Order / Ledger&Settlement services
is an E1-wiring decision (walking-skeleton assembly), not a B0.1 decision.

## Decision
At this slice, `@boutik/commerce-core` is a **scaffold that implements against
the pinned canonical shapes** from `@platform/contracts`:

- typed fixture builders that call the pinned `computeWaterfall` /
  `assertQuoteReconciles` (they feed the money-reconciliation CI gate);
- nothing else.

It contains **no authoritative order state machine, no reservation Durable
Object, no Ledger/Settlement logic, and no redefinition of any canonical
shape** — not in this slice, and never unilaterally in this repo. Authoritative
hosting of Checkout&Order / Ledger&Settlement remains single-owner per
Contract §2.2 and Spec §5.2 and is decided at E1 wiring, ecosystem-wide.

## Consequences
- The money gate runs against the pinned waterfall, so Boutik+ can never drift
  from the canonical money model unnoticed.
- When E1 wiring assigns authoritative hosting, that assignment arrives as its
  own work order with its own spec authority; until then any PR adding order
  state, reservation logic, or settlement math to this package must be
  rejected in review.
