# WO-FP-BOUTIK — ECRANS CROSS-CHECK (per-view visual fidelity gate)

**Reference:** `design-reference/handoff_redesign/Boutik Plus - Ecrans_standalone.html` — the flat review
board that `dc-import`s every screen from `Boutik Plus - Redesign.dc.html` at a fixed `start-view`,
laid side by side with its numbered frame name. **The Ecrans frame IS the Redesign frame** (an import
harness, not a re-layout), so the byte-cited anatomy derivations and this visual gate share one source.

**How this gate is applied:** each rebuilt view is held against its numbered Ecrans frame for
**composition** (layout · hierarchy · which signature elements fill which slots). A composition
divergence = not done → re-cut. Content/law divergences (E1 scope, gate rewords, DF-1 controls) stay
in each view's anatomy derivation as *lawful*.

## Per-view verdict

| Ecrans # · frame | app view | composition verdict |
|---|---|---|
| **01 · Accueil** | `accueil` | **MATCH** — wordmark header · à-faire · money stat grid · échéances · gratuité. |
| **02 · Produits** | `produits` | **MATCH** — HubTitle + subtitle · soft « Lister » button · duotone grid. |
| **03 · Commandes** | `echeances` | **RE-CUT this pass** — the rows now carry the **signature duotone tile** (as the frame composes list rows), not a horloge glyph. Segments/counters omitted = E1 (lawful, listed). |
| **04 · Argent** | `recettes` | **MATCH** — singular green money hero + compact « Détail par commande » rows. |
| **05 · Fiche produit** | *(none at E1)* | **Lawful absence** — the app has no standalone product sheet at E1; its gain breakdown lives on `offre` (choosing the price) and `recette` (the locked settlement). Flagged, not faked. |
| **06 · Détail commande — FUNDED** | `recette` + `pret` | **MATCH** — `recette` = product head → locked money → Suivi timeline; the funded « Produit prêt » CTA state is the `pret` sheet composition. |
| **07 · Commande incident — B8** | `corrective` | **MATCH** — danger banner (refusal reason) → Protection-Fund reassurance → correct-and-re-propose CTA. |
| **08 · Nouveau produit — assistant** | `nouveau` + `offre` | **MATCH (per step)** — `nouveau` = wiz0 « Catégorie » (big title + chips); `offre` = wiz2 « Prix & commission » (breakdown + net). Single steps, not the full 5-step wizard = E1 (lawful). |
| **09 · Boutik+ Studio — B4** | `photo` (studio) | **MATCH** — guided capture · live meters · REAL camera (not the mock, §2.5). |
| **10 · Niveau de confiance** | `confiance` | **MATCH** — the three-tier ladder, current tier emphasized; no money on the trust screen (B+I-12). |
| **11 · Inscription vendeur** | `onboarding` | **MATCH** — ob0 welcome step (big title + soft promise card + CTA). Full 5-step signup = E1 (lawful). |
| *(additional state — Ecrans note, board line 18)* | `moderation` | **Lawful absence** — the board itself lists modération among « états additionnels … voir HANDOFF.md », not a primary frame; composed from the shared vocabulary + the `EN MODÉRATION` badge (Redesign 139). |

## Outcome

- **11/11 numbered frames** hold against their rebuilt view in composition. **Frame 03 (échéances) was
  re-cut this pass** to the frame's duotone-tile row (the one composition divergence the board
  surfaced); it also clears the last clock glyph (#4).
- Frame **05 (Fiche produit)** and **modération** are **lawful absences** (E1 scope / additional
  state), flagged — not composition failures.
- Every remaining divergence is content/law/DF-1, already listed in the per-view anatomy derivation.

The Ecrans visual gate is the step BEFORE the byte-cited derivations (still greps of the Redesign
component source) and the founder's device pass. Post re-cut, no view diverges from its Ecrans frame
in composition.
