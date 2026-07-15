# ANATOMY DERIVATION — Mes recettes (frame « Argent »)

**Frame:** `data-screen-label="Argent"` — `Boutik Plus - Redesign.dc.html` lines **183–224**
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'recettes'` block
**Money surface — maximum deliberation.** The figure is the read model's LOCKED obligation,
formatted by the frozen `formatFcfa`, NEVER recomputed (B+I-05 / Law 1).

---

## Frame outer shell (planche 183)

`padding:16px 20px 150px; overflow:auto` — one scroll surface. → `<FlatList style={styles.fill}
contentContainerStyle={styles.scrollFlow}>`. The hero band + section label ride
`ListHeaderComponent`; the compte note + button ride `ListFooterComponent`; the per-order rows are
the list items — chrome scrolls WITH content (#5, one surface, no bounded window).

---

## Element-by-element

| # | Frame element (verbatim byte) | Planche | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Title `Argent` Bricolage 800 28px | 184 | `<ViewHeader title={t('recettes.title')} …onBack>` | **divergence A** (E1: stacked view, back law → 19px back-header, not a 28px tab title) |
| 2 | Sub `Pas de compte interne — tout arrive sur votre Mobile Money` | 185 | footer `t('recettes.compte')` | frame (relocated to footer, see F) |
| 3 | **Money hero band** — `#0B5B47` green, `border-radius:22px`, **135° 5% weave**, caps « En attente », **38px Bricolage tnum** pending, top-border row « Versé ces 7 jours » + figure | 186–194 | `<HeroLedgerBand label={chip_attente} amount={pending} sub>` + `ledgerRow` « Versé » + paid figure | **exact** (the singular money hero, in majesty) |
| 4 | Section label `Détail par commande` caps `.1em` | 195 | `{receivables.length > 0 && <SectionLabel>{t('recettes.detail_label')}</SectionLabel>}` in ListHeader | exact |
| 5 | Order row — white `border-radius:18px`, code+name left, **net Bricolage 800 tnum right ALONE**, status pill | 197–208 | compact `styles.moneyRow`: duotone thumb + name (`ts('row')`) + state line + net (`ts('priceInline')` MONEY_TEXT, alone) + `StatusChip` | frame; **divergence B** (thumb kept: DF-1) |
| 6 | `Relevés hebdomadaires` section + weekly rows + PDF download | 210–222 | *(omitted)* | **divergence C** (frozen store: no weekly rollup / PDF at E1) |
| 7 | Protection-fund reassurance note `#E4EFE9`/`#073B2E` | 223 | footer `recettes.compte` note + a « Mes produits » continue button | **divergence D** (E1 note text) |

---

## Lawful divergences (the complete list)

- **A — Header is a 19px back-header, not the frame's 28px tab title.** In the planche, `Argent` is
  a **tab hub**; in the app's E1 journey the tab set is `accueil · produits · échéances` (HUBS), and
  « Mes recettes » is reached by navigation — a **stacked** view. The journey-spine back law (frozen)
  requires a back affordance on stacked views, so it keeps `ViewHeader`. The confident-money
  treatment the frame reserves for the title lives in the hero band (#3), which is byte-faithful.
- **B — The compact money row KEEPS a duotone thumb** (the planche `Argent` détail row has none).
  This honours the founder's round-1 device review (DF-1 B: « product art + name as title + the
  figure alone » — a real « which sale is this money from? » need), using the duotone thumb from the
  planche's own `Commandes` row vocabulary (166). The frame's compact-row **hierarchy** is adopted
  (singular hero at top, figure alone per row — not a per-card display hero); the thumb is the one
  retained round-1 detail. **Flagged for the founder's device pass.**
- **C — « Relevés hebdomadaires » + PDF download omitted.** The frozen read model exposes per-order
  obligations, not a weekly rollup, and there is no PDF export at E1. Omitted rather than faked
  (honest-states law). Returns when the statement model lands (post-E1).
- **D — Footer reassurance is the E1 « compte » note + a continue button**, not the frame's exact
  protection-fund paragraph. Same promise register (« tout arrive sur votre Mobile Money »),
  catalogue-governed copy.

## Money invariant (verified)

- The per-row figure is `t('money.amount_f')` over `item.obligation.amount` via `formatFcfa` — the
  **verbatim locked obligation**, never recomputed. The old buried-sentence form
  (`recettes.net_ligne`, « Vous recevrez … F ») is banned by DF-1 B and absent. `faso-contrast` +
  `settlement-read-model` + `df1-device-feedback` all green.

**The singular money hero, the compact détail-par-commande hierarchy, the section label, and the
signature weave all match the `Argent` frame.** Divergences are the E1 tab set + back law, the
frozen store (weekly/PDF), one retained founder device-review detail (the thumb), and
catalogue-governed copy — none a styling drift.
