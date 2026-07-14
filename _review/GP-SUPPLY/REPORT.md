# GP-SUPPLY — THE REAL SUPPLY WIRE (grounding pass · 🟢 · no product code)

**Question:** SP#001 made the *shop* side real on a **demo-supply seam**; the real Boutik+→Shop+ supply wire is the named next wave. This grounds that wave's **boutik half** against bytes so the build orders (both repos) are written against the repo, not recollection. Every claim is `file:line`; every spec claim is quoted; silence is reported as silence; nothing is invented.

**Headline (answer first):** the **shapes and event names for the wire already exist and are canon-frozen** — `SupplyProjection` (5 fields, strict), the offer aggregate, the 8/8-certified consumer mock, and the four `offer.published`/`inventory.*` event names. What does **not** exist is a **transport**: on the Boutik+ side the projection is a *pure builder with no emitter or endpoint*; on the Shop+ side there is *no consumer* — discovery/quote read a seeded `seed.json` (« démo »). The canon specifies the **what** ("Publish one supply projection" → "consume supply projection") but is **silent on the delivery mechanism** (HTTP read-model vs event stream vs shared/in-process). That silence is the one **FOUNDER/ARCH DECISION** this wave turns on. There is **no gate blocking** the pilot wire — it is startable now, once transport is chosen.

---

## 1 · WHAT OFFER-SERVICE PUBLISHES TODAY (hit-grounded)

**The offer aggregate — `services/offer-service/src/offer.ts`.** `OfferBook.create/revise` (`:58`, `:83`) hold `SupplierOffer` (canon shape, imported never redefined). The seller sets **B** (`basePrice`) and **C** (`resellerCommission`); the « Vous recevrez X F » net comes **exclusively** from the pinned waterfall via `previewSellerNet` (`:40`) — `computeWaterfall` + `assertQuoteReconciles` on **every** preview (`:50`), zero local math. Category floor ≥ 5 000 FCFA blocks below-floor closed (`:18`, `:60`). Offers are versioned; **a price change is a NEW version, the prior stays immutable** (`:82-98`) — B4.1.

**The projection — `services/offer-service/src/projection.ts:25` `buildSupplyProjection(product, offer, available, nowIso)`.** A **pure function**. Refusal ladder first (`:31-34`): product not `active` · moderation not `approved*` · offer not `active` · outside `[effective, expiry]` → typed `{ok:false, reason}`. On pass it builds **exactly five fields** by explicit literal (`:38-44`): `productVersionId · offerVersion · basePrice · resellerCommission · available`. The comment states the invariant by construction (`:36-37`): *"building via explicit literals means a supplier id or pickup point is not even expressible here."* The payload type is `SupplyProjection = z.infer<SupplyProjectionEventPayloadSchema>` (`:19`, type-only import of certification — erased at build, `:2-6`).

**The pinned wire shape — `platform-contracts` `packages/contracts/src/shapes/commerce.ts:181` `SupplyProjectionSchema`.** `.strict()`, the five fields above. Header quote (`:176-179`): *"the §2.2 canonical single definition (promoted from @platform/certification at v0.4.0; owner: Boutik+ → Shop+). B4.2/SP-I03: the projection NEVER carries supplier identity, contact, or precise pickup — the strict schema refuses any undeclared key."* (`SupplyProjectionEventPayloadSchema = SupplyProjectionSchema`, certification `domain-schemas.ts:53`.)

**The certified mock — `services/offer-service/mocks/shop-projection-consumer-mock.ts`.** `ShopProjectionConsumerMock implements MockAdapter`, `domain='supply-projection'` (`:41`), `producerSchema = DOMAIN_PAYLOAD_SCHEMAS['supply-projection']` (`:42`). It carries **both candidate transport shapes**: an **event stream** — `emit()` (`:46`) produces a 3-event enveloped `PlatformEvent` sequence `offer.published.v1 → inventory.availability.changed.v1 → inventory.adjusted.v1` (`:34-37`), each parsed through `PlatformEventSchema` with a real envelope (`command_id`, `correlation_id`, `aggregateVersion`, `actor`) — **and** a **read-model** — `readProjection(seed,{stale})` (`:81`) returning a versioned `{version, asOf, value}` with a stale branch. The **consumer law** `consumeProjection(raw)` (`:102`): rejects non-`PlatformEvent` → rejects payload failing the strict producer schema → sweeps keys against an identity-leak regex (`:23`, `:108-110`) → absorbs duplicates on `command_id` (`:111-115`).

**What the mock CERTIFIES — `services/offer-service/test/shop-mock-certification.test.ts`.** `certifyAdapter(new ShopProjectionConsumerMock())` scores **8/8 CERTIFIED** (`:8-16`) against the shared §3 suite (the eight mock-misbehaviours — duplicates, out-of-order, delay, stale reads, timeout, partial failure, invalid-transition reject, **schema identity** producer≡consumer). The second test (`:18-41`) proves the **real producer path feeds the consumer clean**: a `buildSupplyProjection(...)` output is accepted end-to-end, and a payload bearing `supplierPhone` is refused `payload_not_contract_shaped` (`:39-40`).

**The service door — `services/offer-service/src/index.ts:14`.** `handleRequest = makeHealthFetch(SERVICE_NAME)` — **health only**. `offer.ts` + `projection.ts` are re-exported as **library functions** (`:17-18`). Header quote (`:5-6`): *"Boutik+ is the authoring surface only (§5.2) — it does not own the domain DB."*

---

## 2 · THE TRANSPORT GAP (this is the wave)

**On the Boutik+ side there is no emitter.** Grep for a runtime caller of `buildSupplyProjection` / `offer.published` / `publishSupplyProjection` outside tests and mocks → **0 hits** (only the definition in `projection.ts` and the doc-comment). The projection is *computed in-process and returned as an object*; nothing serves it, queues it, or emits it across the repo boundary.

**On the Shop+ side there is no consumer.** Grep `shop-plus` for `SupplyProjection` / `consumeProjection` / a real `offer.published` reader outside tests → **0 hits**. The shop stack takes supply as **plain inputs**: `quote-issuance.ts:38-48` `QuoteIssuanceInput` receives `sellerBasePrice`/`sellerFundedCommission` (commented *"from the supplier offer"*); `customer-projection.ts` (SP-I03) and `discovery.ts` (SP-I05) are pure view-builders over data handed to them. The data itself comes from **`apps/reseller-app/src/demo/seed.json`** — obviously-fictional « (démo) » rows carrying `sellerBasePrice`/`resellerCommission`, generated *through* `computeWaterfall` and reconciliation-checked (`demo/store.ts:6-11,78`). **That seed IS the demo-supply seam the WO names.**

**What canon SAYS (the what — quoted):**
- Execution Contract `:84` (the walking skeleton, verbatim): *"3. **Publish one supply projection**. 4. Create one reseller listing."*
- Boutik-Plus-Build-Spec `:202`: *"Offer & commission (5.4 waterfall … category floor) → **supply projection to Shop+**."*
- Shop-Plus-Build-Spec `:184`: *"Opportunités (**consume supply projection**) + commission agreement + pick→markup→ResellerListing (net preview) + storefront."*
- Ownership, Boutik-Plus-Build-Spec `:75`: *"**No app writes another domain's truth.** Boutik+ is the authoring surface for Catalog/Media/Offer/Inventory/Fulfillment; it does not own those DBs"* — and, same line, the only architectural hint on *co-location*: *"co-deployable behind a small commerce core with authority enforced in code."*

**What canon is SILENT on (the how):** grep of `contracts/src` **and** the Execution Contract for `topic|routing|subscribe|delivery guarantee|at-least-once|outbox|event bus` → **0 hits**. No document picks HTTP-pull vs event-push vs shared-store. The §3 mock law (`Execution-Contract:91`) *requires* a producer that "emit[s] duplicates · deliver[s] events out of order · delay[s] events · return[s] stale projections" — i.e. it **assumes an at-least-once, possibly-stale delivery channel** — but names no mechanism. **→ FOUNDER/ARCH DECISION.** Options, with honest costs (invent nothing — pick one):

| Option | What it is | Cost / risk | Fits which quote |
|---|---|---|---|
| **A · In-process / shared commerce-core module** | Boutik+ builder + Shop+ consumer linked behind one "small commerce core"; projection passed as a value or via an in-proc bus. | Cheapest to E1; **but** collides with the doctrine *"Three apps = three repos = three deployables, never one unified app"* (`CLAUDE.md §4`). Only honest if the shared core is a **package**, not a merged app. | Boutik-Spec `:75` "co-deployable behind a small commerce core" |
| **B · HTTP read-model (Shop+ pulls)** | offer-service exposes a `GET supply-projection` endpoint; Shop+ discovery pulls + caches; staleness = cache age. | Matches the existing `readProjection(stale)` mock branch; simplest to reason about at pilot; needs a freshness/stale-block rule (Shop-Spec `:161` *"stale → block agreement"*). | Execution-Contract `:91` "return stale projections" |
| **C · Event stream / outbox (Boutik+ pushes)** | offer-service emits `offer.published.v1` + `inventory.*` via an outbox; Shop+ subscribes idempotently on `command_id`. | Matches the `emit()` 3-event mock sequence and the §3 duplicate/out-of-order law most directly; **highest infra cost** (a bus + outbox + idempotent consumer) — heavy for one-supplier pilot. | Execution-Contract `:84,:91`; events already named (§4) |

**Recommendation:** **B for the pilot, C as the frozen target.** B is the minimal honest wire for one-supplier scale and the mock already certifies its stale-read behaviour; C is what the event names + §3 law are clearly built toward, deferred until fan-out/real-time inventory is real. A is only acceptable as a **shared package** (not a merged deployable) and I do not recommend it as the boundary. This is the founder's call — I've quoted, not closed it.

---

## 3 · FOUNDER-AS-SUPPLIER-#001 — the minimal honest wire

**Canon has no "founder-owned-inventory" concept by that name** (grep of the three governing docs → 0 hits for `founder-owned`/`founder as supplier`). What it *does* have: `SUPPLY_MODES = ['SELLER_HELD','PLATFORM_OWNED']` (`contracts/enums.ts:9`), and **`PLATFORM_OWNED` behaviour is PackLab B+9 — build-gated** (`enums.ts:9` comment: *"PLATFORM_OWNED behavior (PackLab B+9) stays build-gated; the field is canon"*; Boutik-Spec `:182`). **So the founder-as-supplier pilot cannot run as `PLATFORM_OWNED`** — that would jump the B+9 gate (Ten Laws #8).

**The minimal honest wire at pilot (one supplier, one reseller) = the E1 walking skeleton, quoted** (`Execution-Contract:84`): *"1. Create one supplier (manual). 2. Create one basic product, one image (premium-frame only) … 3. Publish one supply projection. 4. Create one reseller listing."* The **one supplier is the founder operating a normal `SELLER_HELD` supplier account** — the "manual supplier" the contract already names. At this scale the wire needs **one published projection**, not a fan-out or a live inventory stream: a single Option-B transport (see §2) carrying one `SupplyProjection`, refreshed on demand, satisfies the whole pilot. `available` can move by hand (the `inventory.adjusted.v1` path exists) — no real-time push required.

**What the full model additionally needs (not the pilot):** continuous `inventory.availability.changed.v1` updates with stale-block (`Shop-Spec:161` *"stale → block agreement"*), multi-supplier fan-out, and — separately, gated — the `PLATFORM_OWNED`/PackLab supply mode (B+9). None of that is pilot-blocking.

**DECISION surfaced (not closed):** confirm the founder-#001 pilot runs the founder as a **`SELLER_HELD` supplier account** (the manual walking-skeleton supplier), with `PLATFORM_OWNED` explicitly deferred to B+9. **Recommend yes** — it is the safest default and the only ungated path; treating founder inventory as `PLATFORM_OWNED` early trips the B+9 gate.

---

## 4 · WHAT CANON LACKS FOR THE WIRE

**Shapes — present, nothing missing.** `SupplyProjectionSchema` (`commerce.ts:181`), `SupplierOffer`, `CommissionAgreementSchema` (`:96`, *"bound to an offer version"*), `ResellerListingSchema` (`:108`, *"markup (M) versioned, future-only SP-I02; OWNER: Shop+"*, fields `productVersionId·offerVersion·markup·version·variants`). The producer→listing chain is fully typed: projection carries `productVersionId`+`offerVersion`+B+C; the listing binds them and adds M. **No shape needs inventing for the pilot wire.**

**Event names — present.** `contracts/events.ts`: `offer.published.v1` (`:38`), `inventory.adjusted.v1` (`:41`), `inventory.reconfirmation_due.v1` (`:42`), `inventory.availability.changed.v1` (`:43`).

**The one true lack — the transport/delivery contract.** There is **no canonical envelope-routing / topic / delivery-guarantee / idempotency-beyond-`command_id` / ordering contract** anywhere (grep §2, 0 hits). The §3 suite *tests* a producer against duplicate/out-of-order/stale/timeout **behaviours**, but that is a mock-certification law, not a wire specification. **If the founder picks Option C (events),** a small canon addition would be honest: a one-paragraph delivery contract (at-least-once, `command_id` idempotency, per-`productVersionId` ordering, staleness semantics) — a `contracts/`-shape/event-schema change and therefore a **§7 STOP trigger** when the time comes. **If B (HTTP read-model),** no canon change is needed — the shapes already suffice; only a freshness/stale-block rule (app-level) is owed.

---

## PROPOSED SPLIT (tiers · fixtures owed) — for when the founder rules transport

*Direction only — no order starts until the §2 transport decision lands. Sizes assume Option B unless noted.*

- **SW-1 · Boutik+ emitter/endpoint (🟠 AMBER, M).** Wrap `buildSupplyProjection` in the chosen transport: **B** = a `GET` read-model on offer-service (health-door pattern already there, `index.ts:14`); **C** = an outbox emitting `offer.published.v1`. *Fixtures owed:* projection served == `buildSupplyProjection` byte-for-byte · refusal-ladder reasons surface as honest states (not 200-empty) · **identity/pickup un-emittable** (the strict-schema + key-sweep, mirrored from the mock) · (C only) duplicate/out-of-order idempotency on `command_id`.
- **SW-2 · Shop+ consumer replacing the seed seam (🟠 AMBER, M · shop-plus).** Discovery/opportunity reads the real projection instead of `seed.json`; markup M binds via `ResellerListing`. *Fixtures owed:* a live projection produces the same reconciling `opportunity_card` net the seed did · **stale → block agreement** (`Shop-Spec:161`) · supplier identity never reaches a customer surface (existing no-supplier-contact gate) · seed path retired without a money-drift.
- **SW-3 · (Option C only) canon delivery contract (🔴 RED, S · platform-contracts — §7 STOP).** The at-least-once/idempotency/ordering/staleness paragraph + schema. Founder-gated; do not start under Option B.

**Pilot cut:** SW-1(B) + SW-2 is the whole founder-#001 wire. SW-3 and the event-push path wait for the full model.

## FLAGS / SILENCE
1. **Transport mechanism** — canon-silent; **FOUNDER/ARCH DECISION** (§2). Recommend B-now / C-target. Nothing starts until ruled.
2. **Founder-#001 supply mode** — recommend `SELLER_HELD` (only ungated path); `PLATFORM_OWNED` is B+9-gated (§3).
3. **No canon gate blocks the pilot wire** — this is E1-spine work (Execution-Contract:84), not gated; startable the moment transport is chosen.

*Diff: this report + the JOURNAL entry only. No product code.*
