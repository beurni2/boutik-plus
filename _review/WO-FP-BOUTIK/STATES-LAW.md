# WO-FP-BOUTIK — STATES LAW ledger (founder veto ①)

Every state the app had before this slice SURVIVES the Faso Premium adoption,
restyled within the system's grammar. None dropped, none freely invented. This
is the list for your review.

## A · States PRESERVED (behaviour + data byte-identical; only the dress changed)

| Domain | State(s) | Where it renders now | Backed by (FROZEN, 0-diff) |
|---|---|---|---|
| **B10 settlement** | Locked · Pending · Eligible · Payable · Processing · **Paid** (ref only) · Held · Failed | `recettes` receipt cards (`RECEIVABLE_STATE` map → tone + honest line) + the `HeroLedgerBand` (server statement `pending`/`paid`) | `settlement/readModel.ts` |
| **B11 moderation** | submitted · **changes_requested + reasons** · approved · pending (timeout) | `moderation` cards (`MODERATION` map; `changes_requested` lists its `changeReasons`; a timeout renders « en attente », never a fake approval) | `demo/store.ts` (moderation machine) |
| **B7 readiness** | ready · pending (slow net) · **queued (offline)** · **queue_error** · confirmed | `pret` screen, five conditional blocks; the celebration fires ONLY on `confirmed` | `offline/queue.ts`, `offline/commandId.ts` |
| **Offline** | global offline banner · pending queue count · « jamais perdu » | `OfflineBanner` (warn band) + `PendingNotice` with the durable count | `offline/queue.ts` |
| **queue_error** | durable-store refusal / id-collision → honest error, never a false « en attente » | `pret` `queue_error` block (`WarnNote`) | `offline/queue.ts` |
| **Échéances** | remaining-minutes per clock · overdue | `echeances` list rows (`echeances.restant`) + the accueil urgent banner | `demo/store.ts` |
| **B6 floor / below-min** | below-floor price · part-swallows-net | `offre` `WarnNote` + muted `MoneyHero` + blocked CTA with the reason on it | pinned `computeWaterfall` |
| **DF-1 keypad** | KeyboardAvoidingView + keyboardShouldPersistTaps="handled" + keyboardDismissMode="on-drag" on `offre` | `offre` screen (unchanged wiring) | — |
| **DF-1 editable commission** | la part de la revendeuse is editable; the net recomputes live through the pinned waterfall | `offre` second `MoneyField` → `offerC` | pinned `computeWaterfall` |
| **Camera / studio** | permission null (skeleton) · ask · refused-for-good · granted · preview · **failure (designed state, preview-only code line)** | `photo` screen, all branches; `CornerTicks` signature replaces the old corner guides | `studio/capture.ts`, `normalization.ts`, `guidance.ts` |
| **B2 empty states** | products empty · receivables empty · corrective-nothing | `EmptyState` (designed dashed encart) | — |
| **Trust / confiance** | tier + fault count + restrictions (access-based, never money) | `confiance` cards (server statement verbatim) | `trust/statement.ts` |
| **Preview banner** | IS_PREVIEW build marker | top warn strip | `preview.ts` |

## B · States ABSENT from the prototype, restyled WITHIN the grammar (listed for you)

The prototype's 11 frames do not enumerate these app-only states; they are kept
and dressed in the FP system, not dropped:

1. **queue_error** (the durable-store refusal) — the prototype has no offline-failure frame. Kept as a `WarnNote` (warn band), honest, never a false « en attente ».
2. **Camera permission ladder** (null / ask / refused-for-good) — the prototype's Studio assumes a granted camera. Kept, dressed with the FP frame + `CornerTicks`.
3. **Studio capture FAILURE** (a designed error state carrying its code in preview builds) — kept as a `problem` chip + preview-only diagnostic pill.
4. **B6 part-swallows-net** (a valid price whose commission leaves the seller ≤ 0) — kept as a blocked CTA with the reason, distinct from the below-floor note.
5. **pendingKey shell notice** (a queued-action advisory outside home/pret) — kept as a `PendingNotice`.

## C · SUPERSESSIONS + adaptations (journalled, for your ratification)

1. **DF-1 palette ruling SUPERSEDED.** DF-1 ruled artisan-gold `fact` chips + supply-green CTAs. Faso Premium supersedes it: `fact` chips are now the server-truth **ok green** (`okBg`/`okFg`); gold is reserved for the woven band's third colour (README § Signature elements 1). The supply-green CTA survives (it IS the FP boutik accent). `df1-device-feedback.test.ts` re-baselined; the DF-1 BEHAVIOURS (rows own their height, figure-alone, editable commission, keypad) all still assert and pass.
2. **Duotone-tile emoji → text monogram (no-emoji gate stays GREEN UNCHANGED).** The README shows an emoji glyph inside the duotone tile as placeholder art. The FROZEN demo store carries no `glyph`/`bg` field (I cannot add one), and introducing emoji would force a semantic amendment of the no-emoji chrome gate. I chose the safer path: the tile renders the token-derived duotone + weave signature with a **display-font monogram** (the product's initial) — faithful to the "glyph with drop-shadow" slot, emoji-free. The no-emoji gate passed unchanged; no gate semantics were amended.
3. **Celebration is DEMO-LABELLED.** The overlay ships as a component (`CelebrationLayer`, with amount/label/caption props for the E3 real-franc payout). Its current trigger is the demo B7 confirmation, so it renders a « démo » marker and shows NO « versé » copy (no payment happened) — the standing law (real-franc events only) is honoured; the un-labelled payout celebration is reserved for E3.

## C-bis · Motion wiring (which fp* motions land on a live site)

- **Wired to a live site:** `fpIn` (every screen mount) · `fpPop` (checks + the celebration disc) · `fpShimmer` (skeletons) · **count-up** (money heroes) · **`fpBar`** (the B7 `pending` server-wait bar) · **`fpPulse`** (the B7 `pending` live clock).
- **No site in this app's surface (flagged, not faked):** `fpUp` (bottom sheets — the "Sheet Produit prêt" renders as a full screen here, not a bottom sheet) · `fpShake` (wrong-code entry — the supplier app has no code-entry keypad; that is the rider/buyer flow). Both stay token-defined + fidelity-checked, ready to wire when their surfaces exist. Your call whether to force a sheet/keypad surface here to host them.

## C-ter · The FROZEN-law precision (verifier-surfaced)

The frozen **service SOURCE** (.ts/.tsx/.js) is 0-diff vs main — no transaction/
money/custody logic changed. The inherited STEP-1 re-pin (`6af9d41`) did bump the
pinned `@platform/*` SHA in **6 `services/*/package.json`** (`ba6f16d…`→`f23407c…`),
at the **same contract version 1.0.0** (drift-check green). This is the coordinated
canon re-pin the whole slice consumes (it delivers the v2 `motion.fp*` +
`boutikColour` tokens). **Confirm `f23407c` is the authorized STEP-1 canon re-pin.**

## D · Flags carried forward (from STEP 0, still open for your call)

- **`opsz=36`** — Bricolage's optical-size axis has no static-RN equivalent; the money-hero optical size was derived from the dominant use (36–38px). Accept, or add a text-optical cut for 14–16px.
- **Font byte budget** — the 6 FP faces are ~293 KB (Archivo was 166.7 KB; +126 KB). Archivo is no longer embedded (app.json lists only the 6 FP faces). On-device cold-start feel is your review.
- **Tab-dock blur** — the README dock uses `backdrop-filter: blur(18px)`; a true RN backdrop blur needs `expo-blur` (a new dep, which this slice does not add). Approximated with a near-opaque paper dock + top hairline. Flagged for a later dep decision.
- **Range picks** — where a token states a range, the app resolved to the HANDOFF §1 pixel (view 19, heroMoney 38, body 14, caps 11). Journalled in `src/ui/fp.ts` (TEXT).
