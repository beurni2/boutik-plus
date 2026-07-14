# GP-BOUTIK — Grounding Pass: R2 + Moderation-at-Scale + Studio (🟢 · no product code)

**Repo:** boutik-plus @ `ccd0b0b` (main). **Method:** grep/read-grounded presence-check — every claim carries a `file:line`; every spec claim is quoted; silence is reported as silence (derive-or-stop). No product code changed.

---

## 1. R2 MEDIA — the E1 stub's exact seams

**Governing invariants (quoted):**
- **B+I-08** (`docs/Boutik-Plus-Build-Spec.md:52`): *"Original media is **private and immutable**; processing/redaction creates **versioned derivatives**."*
- **B+I-02** (`docs/Boutik-Plus-Build-Spec.md:46`): *"Product images MUST remain **price-free and supplier-contact-free**. Customer pricing is rendered by Shop+/Checkout."*
- Canonical shape (`Build-Spec:112`, §5): `ProductAssets { masterRef(private,immutable), heroSquare, heroVertical, proof, detail[], hashes[], processingVersion }  // PRICE-FREE, contact-free`.

**What EXISTS today (code):** one pure function.
- `services/media-service/src/premium-frame.ts:32` `buildPremiumFrameAssets(input)` **computes the `ProductAssets` shape**: `masterRef.ref = "private/master/${captureRef}"` (`:45`), derivatives `"media/${kind}/${captureRef}"` (`:39`), `hashes: [input.sha256]` (`:50`), `processingVersion: 'premium-frame.v1'` (`:52`). EXIF-free by construction (MediaRef has no metadata field, `:37-38`); a price- or contact-bearing overlay is **refused closed** (`:34-35`, patterns `:25-26`) — B+I-02 enforced at the boundary.
- `services/media-service/src/index.ts` is **health-only**: `export const handleRequest = makeHealthFetch(SERVICE_NAME)` + `export * from './premium-frame.js'`. Tests: only `health.test.ts` + `premium-frame.test.ts`.

**What "master persists / derivatives serve / hashes verify" REQUIRES — and is ABSENT:**
- **PERSIST (master):** today only a **string ref** is computed; **no bytes are written anywhere**. B+I-08's *"immutable"* is a **storage-layer** property (write-once / object-lock), not expressible in the pure function. → needs a real put-to-store + immutability policy.
- **SERVE (derivatives):** **no serve handler exists** (grep `R2|bucket|\.put(|\.get(|presign|signed-url` in `services/media-service` → **0 hits**). The master must never be served (private); derivatives served public/signed. → needs a fetch handler + a private/public boundary.
- **VERIFY (hashes):** `hashes[]` is computed at build time but **never re-checked on read**. → needs re-hash-retrieved-bytes == stored `sha256` on serve/ingest.

**Infrastructure config vs code (the split):**
- **INFRA CONFIG (none exists — no `wrangler*.toml` anywhere in the repo):** the two R2 buckets (private-master with object-lock/immutability + served-derivatives), the Worker `[[r2_buckets]]` bindings, the CDN / signed-URL serving policy, and **R2 lifecycle** — which the Building Plan explicitly parks at **E5/E6** (`Building-Plan:25`: *"R2 lifecycle, capacity"*).
- **CODE (none beyond the pure ref/hash computation):** put-on-capture, serve-derivative handler, verify-on-read re-hash, and the wiring from `buildPremiumFrameAssets`' output refs → real storage keys.
- **Sequence note:** `Building-Plan:21` sets E1 at *"one premium-framed image (no cleanup)"*; the persist/serve/verify layer + R2 lifecycle are **post-E1 / E5-E6**. This is not startable without a founder sequence decision.

---

## 2. MODERATION AT SCALE — between B1.3's door and A1's machine

**The two ends (quoted):**
- **B1.3's door** (`Building-Plan:49`): *"**B1.3 Three-outcome cleanup + hostile corpus** ⚠ XL | Eligibility → safe/premium/retake; **hostile-image corpus IS the gate.** (Deferred past E1; premium-frame default until E4.)"*
- **A1's machine** (built, merged `1780981`/`b685bbf`): `catalog-service` moderation state machine (`submitted → changes_requested(+reasons) | approved`; `timeout → pending`), now consuming canon `ModerationDecisionSchema`. It is the **decision** engine for one version.
- **B2.2** (`Building-Plan:55`): *"Moderation timeout = pending; neutral/platform packaging rule."* **E4** (`Building-Plan:24`): *"…**moderation-queue alerts**…"*. **Desk 3** (`product.ts:95`): *"the queue for facts, media, and categories."*

**Presence-check — what lives between them TODAY:**
- **Duplicate detection (content/perceptual): 0 — as expected.** `apps/supplier-app/src/studio/normalization.ts:61` `perceptualHash: 'absent'` (pHash is a *declared identity seam*, `:60`). The **only** "duplicate" in the repo is the offline **queue's command-idempotency** (`offline/queue.ts:44-112`: `'duplicate'` = same `command_id`+name+payload; `'collision'` = same id, different payload → refused) — a **different concept** (idempotent replay of an action, not a near-dup image). Content-dedup = 0.
- **Corpus hooks:** `apps/supplier-app/test/hostile-corpus.test.ts` exists **but it is the WO-6.5 metadata-stripper corpus** (`:1-16`: *"Threat model: a HOSTILE ENCODER…"* — proves `stripJpegMetadata` fail-closes on malicious JPEG segments). It is **not** B1.3's **eligibility** corpus (*"the corpus IS the gate"* for safe/premium/retake). The eligibility corpus + the three-outcome cleanup are **absent** (B1.3 deferred).
- **Queue tooling: 0.** Stated absent in two places (`premium-frame.ts:11`, `normalization.ts:8`: *"no moderation queue"*). A1 built the **decision** (a version resolves); there is **no queue / list / assignment / prioritization surface**. That surface is **PLATFORM's Desk 3 console** (the no-self-moderation absence proof, `apps/supplier-app/test/no-self-moderation.test.ts:25`), not this repo, and its *alerts* are E4 (`Building-Plan:24`).

**Proposed split (with honest gate status — most of this is NOT startable now):**
- **The bulk is sequence-gated.** B1.3 is *"Deferred past E1; premium-frame default until E4"*; the moderation queue + alerts are E4. Building these now would **jump the E1→E4 sequence** (Doctrine §4) — I do **not** propose starting them; they need the founder's E4 open.
- **Startable-now candidate (small), if the founder wants it:** the **B0.2 door duplicate-idempotency** (`Building-Plan:36`: *"unverified cannot publish; **duplicate idempotent**"*) at the **catalog create** door — a listing-create idempotency key so a re-submitted create is a safe no-op (mirrors the queue's command-idempotency, at the service). This is the ONLY moderation-at-scale item not E4-gated; it is an S slice with a planted "double-submit → one version" negative. **Recommendation:** confirm whether B0.2's "duplicate idempotent" is in scope now or rides with the B0.2 verify slice; everything else (three-outcome cleanup, eligibility corpus, moderation queue/alerts, content pHash-dedup) is **E4-gated — hold**.

---

## 3. THE STUDIO TEACHING SEAM — inventory only (its definition is a founder decision)

**What `studio/guidance.ts` does TODAY (grounded):**
- `guidanceFor(m): {verdict:'ok'|'advice'; key}` (`:81`) — pure/deterministic. Computes `bytesPerPixel` (`:63`, the v1 detail/exposure proxy on the downscaled frame); below `GUIDANCE_THRESHOLDS_V1.adviceBelowBpp = 0.55` (`:74-77`) → `{verdict:'advice', key:'studio.conseil.lumiere'}`, else `{verdict:'ok', key:'studio.conseil.ok'}` (`:82-85`).
- Category-aware framing: `frameGuideKey(category, shot)` (`:52`) over 9 `CAPTURE_CATEGORIES` (`:23-33`) × `SHOT_KINDS = ['hero','preuve']` (`:36`) → catalog keys (`:40-50`). All strings are **catalog keys**, never inline French (`:14`).
- **Named seams already journaled ⚠** (`:11-13`): richer luminance metrics (needs pixel access, absent under the two authorized deps); voice notes (needs an audio dep this WO never authorized).
- Consumed at capture: `studio/capture.ts` returns `guidance: guidanceFor(metrics)` (`captureShot`, end) from the downscaled metrics frame.

**The teaching MECHANISM today = a single deterministic advice tip** (one `{verdict, key}` per capture; guidance *invites* a retake, never blocks — `:68-77`). What "teaching" means **beyond a one-shot tip** is **undefined in code and spec**:

**⏳ FOUNDER DECISION — the teaching mechanism's definition.** The seam exists (`{verdict, key}` per frame + category framing keys); its *pedagogy* is unspecified. Options that would each be a different build (listed, **not proposed**): progressive/multi-step coaching across attempts · per-category worked before/after examples · a scored-improvement loop (did attempt N beat N-1) · a first-run tutorial · richer metrics driving more specific tips (the pixel-access seam). **I propose nothing here** — per the order, the definition is yours; this section is the seam inventory only.

---

## 4. RESTORE / REPLAY — supplier-side state a drill must recover

**PROVEN recoverable (WO-6.5):** the **offline queue**.
- Substrate: `offline/expoStore.ts:26` `expoDocumentStore()` — Expo's **document** directory (`:21`: *"survives app-kill and reboot, unlike the cache dir"*); a single JSON blob IS the durable queue.
- Recovered shape: `QueueEntry[]` (`offline/queue.ts:23-35`) = `{commandId, name, payload, status('pending'|'delivered'|'failed'), attempts, enqueuedAt, failureReason?}`. Reboot path: `open()` *"RESTORING any persisted state"* (`:75`). Minted-once `command_id` is persisted via the queue (`offline/commandId.ts:44`). Kill/reboot idempotent replay is the WO-6.5 execution proof.

**What ELSE a drill must recover — the honest gaps (NOT persisted today):**
- **In-flight capture bytes.** `studio/capture.ts` `captureShot` returns `masterUri` (a device photo file — survives if the OS keeps it) + `derivative.uri` (a **data-URI held in memory**) + guidance. The stripped derivative is **in-memory only**; an app-kill **after capture, before enqueue** loses it. Named gap.
- **Composing drafts.** There is **no draft / autosave / resume persistence** in the app (grep `draft|autosave|resume|checkpoint` → only the demo product's `status:'draft'` moderation-lifecycle value, `demo/store.ts:31` — not a persisted editing draft). A half-composed listing is **not** recovered.
- **Demo world** (`demo/store.ts`) is in-memory seed, not real persisted state.
- **Net:** the restore drill's known-recoverable surface is the **offline queue only**. Everything else supplier-side (unsent capture, any in-progress composition) is **ephemeral by design at this stage** — a drill should surface that explicitly so it is a decision, not a surprise. Whether the queue is the *only* thing that must survive is itself worth a founder line (E1 says *"offline = pending"*, not *"resume the whole compose"*).

---

## 5. DEBTS — inventoried

- **The `ChangeReason` UI mirror** (`apps/supplier-app/src/demo/store.ts:38-39`, used `:63`): `type ChangeReason` = the 6 reason codes, *"mirror of catalog-service CHANGE_REASONS"* (now canon's). A **second, un-gated copy** of the reason set that can silently drift from canon (the MENUM verifier flagged it independently). **Executioner: the live-Desk-3 wiring slice** (A1 ratification ②) — at which the app consumes canon's `ModerationReasonCode` directly. Still open; still named.
- **The flaky inventory e2e** (`services/inventory-service/test/stock-do.e2e.test.ts:33`): *"TWENTY CONCURRENT RESERVES on stock 1 → EXACTLY ONE winner…"* on workerd/Miniflare. Green 8/8 in isolation and inside `run-gates.sh`; **flakes only under full-parallel `pnpm test`** (a test-infra scheduling artifact, not a stock-logic bug). **Executioner: the next inventory slice.** Named so a future red run is recognised as this flake, not a regression.

---

## Decisions surfaced (not closed — yours)
1. **Media persist/serve/verify + R2 lifecycle** — the whole layer is post-E1 / E5-E6 by the Building Plan. Do not start without a sequence decision.
2. **Moderation at scale** — three-outcome cleanup, eligibility corpus, moderation queue/alerts, content pHash-dedup are **E4-gated (hold)**. Only the B0.2 door duplicate-idempotency is startable now; confirm scope.
3. **The studio teaching mechanism's definition** — ⏳ founder decision; seam inventoried, nothing proposed.
4. **Restore scope** — is the offline queue the *only* state a drill must recover, or should in-flight capture / compose drafts persist too?
