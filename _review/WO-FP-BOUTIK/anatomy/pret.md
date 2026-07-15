# ANATOMY DERIVATION — Produit prêt (frame « SHEET : PRODUIT PRÊT »)

**Frame:** `<!-- ══ SHEET : PRODUIT PRÊT ══ -->` — `Boutik Plus - Redesign.dc.html` lines **601–625**
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'pret'` block, `b7Phase === 'ready'`.
**CUSTODY SURFACE — maximum deliberation.** Every row below is grep-evidenced from THIS sheet frame
(601–625) — no sibling frame is imported. Structural custody proof + the four-secrets law follow.

---

## The four-secrets law (Boutik-Plus-Build-Spec.md:154, verbatim)

> **Four distinct, non-interchangeable secrets (CI-enforced separation):**
> `sellerReadinessChallenge` (short-TTL, in-app, seller↔readiness) · `pickupVerificationCode`
> (rider↔pickup) · `buyerDropCode` (buyer↔delivery, **private — never shown to the seller or in
> readiness evidence**) · `HandoffAuthorization` (payment-confirmed handoff).

> ECOSYSTEM-MASTER-REFERENCE.md:154 — "the **`buyerDropCode` NEVER appears in readiness evidence** —
> a supplier must not be able to manufacture proof of a delivery that never happened. This is a CI
> gate." · B+I-06 (§582) — "confirms « Produit prêt » with readiness evidence. *(No drop code in it —
> ever.)*"

---

## Element-by-element (each row: `grep "<byte>" Redesign.dc.html` → line)

| # | Frame element (grepped verbatim from the sheet) | grep → line | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | `Confirmer « Produit prêt »` (sheet title) | **606** | `ViewHeader` title « Produit prêt » (full-screen view, not a sheet) | frame; **divergence A** (nav) |
| 2 | `1 · Code de préparation (valable 15 min)` | **607** | *(step-1 code NOT rendered — see divergence B)* | **divergence B** (custody) |
| 3 | big code `{{ ordChallenge }}` (Bricolage 800 34px) + `Écrivez ce code sur un papier…` | 609 / **610** | *(not rendered — the sellerReadinessChallenge is server-issued, never fabricated)* | **divergence B** (custody) |
| 4 | `2 · Photo de préparation` | **612** | `<Overline>{t('pret.step_photo')}</Overline>` (« 1 · Photo de préparation ») + `CheckRow` (pret.check_photo) | frame (renumbered, see B) |
| 5 | `3 · Disponibilité` (presence) | **619** | `<Overline>{t('pret.step_emballage')}</Overline>` (« 2 · Emballage du colis ») + `CheckRow` (pret.check_ferme) | frame; **divergence C** (evidence maps to photo+package) |
| 6 | Confirm `Confirmer — envoyer à Séra` | **621** | `<PrimaryButton label={t('pret.confirmer')} disabled={!(check1&&check2)} …>` | frame; copy untouched (« Confirmer : produit prêt ») |
| 7 | Honesty `Le code client de livraison ne vous est jamais montré.` | **622** | `<NoteCard><Text>{t('pret.honnete_code_client')}</Text></NoteCard>` — VERBATIM the frame's line | **exact** |

The `b7Phase` state machine (`pending` server-wait · `queued` offline · `queue_error` · `confirmed`)
and every honesty/pending/offline string are **untouched** (states law + offline correctness).

---

## STRUCTURAL custody proof (the absence pattern — no path renders it)

`grep -rniE "buyer[_.]?drop[_.]?code|drop[_.]?code|delivery[_.]?code|buyerCode" src App.tsx` → **0
hits.** The supplier app **never names** the buyer's delivery code, so no path can render it. This is
enforced permanently and non-vacuously by `test/custody-buyer-code-absent.test.ts` (scans every
supplier `.ts/.tsx`; a planted `buyerDropCode` reference is proven to be caught; the honesty PROSE is
proven NOT a false positive). The readiness surface additionally **affirms** the law to the seller
(row 7). Readiness evidence = photo + package only — the buyer's secret is structurally excluded.

---

## Lawful divergences (the complete list)

- **A — Full-screen view, not a bottom sheet.** The app's E1 navigation model is full-screen views
  with a `ViewHeader`; the frame presents readiness as a modal sheet. Nav-model divergence, listed;
  the sheet's numbered-step + honesty COMPOSITION is adopted in-view.
- **B — The step-1 readiness CODE (`sellerReadinessChallenge`) is NOT rendered.** It is a
  **server-issued, short-TTL secret** (`seller.readiness_challenge_issued.v1`, B+6) not modeled in the
  E1 store. Per the four-secrets law and "no invented custody data", it is **NEVER fabricated** in the
  UI to satisfy a frame. **FLAGGED for the founder:** rendering it is a proper post-E1 slice that
  models the readiness-challenge-issued event; the readiness step numbering shifts (photo=1,
  package=2) until then.
- **C — Readiness evidence maps to the app's real photo + package checks**, not the frame's exact
  « Disponibilité » presence text. B+6 readiness = « PackageReadinessConfirmation (photo + …) »;
  the app's two checks (colis↔photo, fermé/inspectable) are that evidence. Copy untouched.

**The sheet's composition — numbered readiness steps → confirm CTA → the buyer-code honesty line —
is matched, with the buyerDropCode STRUCTURALLY absent and the readiness CODE deliberately not
fabricated.** Every divergence is nav-model, E1 custody-secret scope, or evidence-mapping — none
weakens a custody invariant, and the honesty line is added verbatim from the frame.
