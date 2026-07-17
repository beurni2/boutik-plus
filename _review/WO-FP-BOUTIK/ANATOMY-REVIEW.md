# WO-FP-BOUTIK — FRAME-FIDELITY REVIEW (anatomy packet)

**Branch:** `claude/faso-premium-adoption-xxzgke` · **head:** `270cdd5` · **status:** DO NOT MERGE
(held for the founder device pass). **Preview:** expo-preview run 55, `preview` channel, head
`270cdd5`, EAS publish step **success**.

Every app view was rebuilt to ITS frame in `design-reference/handoff_redesign/Boutik Plus -
Redesign.dc.html` (composition · hierarchy · Bricolage display scale · signature elements). Each view
carries an **anatomy derivation**: frame elements grepped **verbatim from its own frame** (sibling
frames never imported) → the implementation → **lawful divergences only, listed**.

**Ecrans cross-check (visual fidelity gate, per view):** `ECRANS-CROSSCHECK.md` holds each view against
its numbered frame in `Boutik Plus - Ecrans_standalone.html` (the flat board that dc-imports every
Redesign frame side by side). Verdict: **11/11 numbered frames match in composition**; frame 03
(échéances) was **re-cut** this pass to the signature duotone-tile row; frames 05 (Fiche produit) and
modération are lawful E1 absences. The Ecrans gate runs BEFORE the byte-cited derivations and the
device pass.

## The 13 derivations (`anatomy/`)

| view | frame | notes |
|---|---|---|
| `accueil.md` | Accueil (51–123) | wordmark header · money stat grid · échéances · gratuité |
| `produits.md` | Produits (128–151) | HubTitle · soft « Lister » button · duotone grid |
| `recettes.md` | Argent (183–224) | singular money hero + compact détail rows (DF-1 reconciliation) |
| `recette.md` | Détail commande (269–333) | locked obligation verbatim (B+I-05) · Suivi connecting bars |
| `echeances.md` | Commandes (156–179) | hub title · rows keep #4 horloge (flagged) |
| `confiance.md` | Niveau de confiance (561–586) | tier ladder · NO money (B+I-12) · « dépôt/caution » reworded |
| `nouveau.md` | Nouveau produit wiz0 (349–355) | big « Catégorie » title · signature chips |
| `pret.md` | **Produit prêt sheet (601–625) — CUSTODY** | four-secrets verbatim · buyerDropCode structurally absent · honesty line |
| `offre.md` | Prix & commission wiz2 (370–391) | structured breakdown · editable fields (DF-1) |
| `corrective.md` | Détail commande refusal (294–301) | danger banner · Protection-Fund reassurance (B+I-12) |
| `moderation.md` | *none* (badge only, 139) | composed from shared vocabulary; no code change |
| `onboarding.md` | Inscription vendeur ob0 (512–516) | welcome step (E1) · no legacy name · gate-reworded |
| `studio.md` | Boutik+ Studio (432–497) | REAL camera (not the mock, §2.5) · imaging honesty added |

## Custody proof (pret)

`grep -rniE "buyer[_.]?drop[_.]?code|drop[_.]?code|delivery[_.]?code|buyerCode" src App.tsx` → **0
hits**. Enforced permanently + non-vacuously by `apps/supplier-app/test/custody-buyer-code-absent.test.ts`.
The readiness surface affirms « Le code client de livraison ne vous est jamais montré. »

## Green (current head — `PROOF-frame-rebuild.txt`)

typecheck ✓ · **179 tests ✓** (25 files) · **all gates green** (copy-lint 207 entries, 0 violations).

## Also in this packet

- `FONT-RENDER-CHECK.md` — shop finding-#1 (silent font fallback) checked; boutik clean, byte-verified
  (fc-scan all six faces), guarded.
- `PROOF-frame-rebuild.txt` — the current-head green capture.
- `README.md` · `STATES-LAW.md` · `EVIDENCE.md` · `verifier-report.md` — from the earlier engineering
  pass. **NOTE:** the `gates/` and `logs/` folders are that earlier pass's captures (pre-rebuild); the
  authoritative current-head proof is `PROOF-frame-rebuild.txt`.

## Flags for the device pass (founder ratifies)

1. **Mes recettes** — compact rows + singular money hero (kept the DF-1 duotone thumb + figure-alone).
2. **Pret** — the step-1 readiness code (`sellerReadinessChallenge`, server-issued) is NOT modeled at
   E1 and NOT fabricated; a proper post-E1 slice.
3. **Studio** — a fuller live-camera-overlay restyle is the « Studio, its own care » follow-up.
