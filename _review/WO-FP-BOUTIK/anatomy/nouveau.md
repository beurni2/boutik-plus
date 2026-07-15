# ANATOMY DERIVATION — Nouveau produit (frame « Nouveau produit » wiz0)

**Frame:** `data-screen-label="Nouveau produit"`, step 0 (`wiz0` « Catégorie ») — `Boutik Plus -
Redesign.dc.html` lines **338–356** (the wizard shell 338–347; the Catégorie step 349–355).
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'nouveau'` block.

---

## Element-by-element

| # | Frame element (verbatim byte) | Planche | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Wizard header — back + `Nouveau produit` + step label + progress dots | 339–346 | `<ViewHeader title={t(SCREEN_TITLE_KEY.nouveau)} backLabel onBack>` | **divergence A** (E1: single step, no dots) |
| 2 | Step title `Catégorie` Bricolage **800 26px** `letter-spacing:-.02em` | 350 | `<Text style={ts('screen', C.ink)}>{t('studio.categorie')}</Text>` (28px display 800) | exact scale/family |
| 3 | Category chips — flex-wrap, pill, 1.5px border, selected = accent fill | 351–354 | `CAPTURE_CATEGORIES.map` → `<Selectable selected={category === c}>` (the signature selection border-swap) on the paper surface (no card) | exact (signature element) |
| 4 | Fixed-bottom Next button | 425–426 | `<PrimaryButton label={t('product.photo_action')} onPress={() => go('photo')} icon="camera"/>` | **divergence B** (E1: capture CTA, in-flow) |

---

## Lawful divergences (the complete list)

- **A — Single category step, not the full 5-step wizard (progress dots omitted).** The frame is a
  5-step flow (Catégorie → Détails/stock → Prix/commission → Photos → Vérifiez/publiez). At E1 the
  supplier capture path is a single guided-category step → the Studio capture; building the full
  wizard would jump E1 scope (no unrequested feature build). The step title + chip composition of
  wiz0 is matched exactly.
- **B — CTA is the in-flow capture button, not a fixed-bottom « Continuer ».** The step leads
  straight to the Studio capture (`go('photo')`) rather than a multi-step advance. In-flow CTA (the
  scroll surface owns it) consistent with the E1 single-step scope.
- **C — Chips composed on the PAPER surface (no card wrapper).** This commit removed the previous
  `<Card>` wrapper + the redundant body line; wiz0 places the big title + chips directly on the paper,
  as the frame composes them. `product.title` string is now unused (no gate consequence).

**wiz0's composition — the big Bricolage step title over the signature selection chips — matches the
frame.** Divergences are the E1 single-step scope (no full wizard / progress dots) and the in-flow
capture CTA, both scope, not styling.
