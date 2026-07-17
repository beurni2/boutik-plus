# ANATOMY DERIVATION — Détail du versement (frame « Détail commande »)

**Frame:** `data-screen-label="Détail commande"` — `Boutik Plus - Redesign.dc.html` lines **269–333**
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'recette'` block (built at #6).
**Money surface — maximum deliberation.** The figure is the settlement read model's LOCKED
obligation, formatted by the frozen `formatFcfa`, NEVER recomputed (B+I-05).

---

## Frame outer shell (planche 269)

`padding:16px 20px 60px; overflow:auto` → `<ScrollView style={styles.fill}
contentContainerStyle={styles.scrollFlow}>`. Stacked view → `ViewHeader` (back law).

---

## Element-by-element

| # | Frame element (verbatim byte) | Planche | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Back + order code (Bricolage 19px tnum) + status pill | 270–274 | `ViewHeader` (title « Détail du versement ») + product head `StatusChip` | frame; **divergence A** |
| 2 | Product row — duotone thumb + prod line + « Qté 1 · zone … » | 275–281 | `receiptHead`: `DuotoneTile` thumb + `r.label` (`ts('view')`) + `StatusChip` | frame; **divergence B** (no qté/zone at E1) |
| 3 | Gain card « Votre gain — verrouillé » — base − commission − frais = **net** (dashed rule, Bricolage 800 20px green) | 282–289 | `Card` → `AmountHero` (`offer.net_label`, the LOCKED obligation via `formatFcfa`) + state line + `payoutRef` `ReconcileLine` | **divergence C** (locked figure, not a re-breakdown) |
| 4 | State banners (funded/failed/pickup-refused/done) | 290–304 | the settlement state line (`t(st.line)`) + status tone | frame (states law, E1 subset) |
| 5 | **Suivi** card — dots + **connecting bars**, current highlighted | 305–321 | `Card` → `Overline` + timeline: `timelineDotCol` (dot + connecting `timelineBar`, done→green) + label | **exact** (bars added this commit) |
| 6 | Simulate-next demo button | 322–324 | *(omitted)* | **divergence D** (settlement advances server-side, no client sim) |
| 7 | Historique card | 325–332 | *(omitted)* | **divergence E** (no per-event history in the read model at E1) |
| — | states law: null selection → designed empty | — | `selectedReceivable === null ? <EmptyState …>` | exact |

---

## Lawful divergences (the complete list)

- **A — Header title « Détail du versement », not the order code.** This is the **settlement**
  (versement) detail — money owed on a settled obligation — not the live order. The order code isn't
  the read model's key here; the product identity + status carry it. Catalogue-governed copy.
- **B — No « Qté 1 · zone · mode » sub-line.** The settlement read model exposes the obligation +
  label, not order logistics, at E1. Omitted rather than faked.
- **C — The gain card shows the SINGLE LOCKED net, not a base−commission−frais breakdown.**
  Decisive money-model point: a **settled** obligation's amount is locked and rendered **verbatim**
  through the frozen formatter — re-deriving a breakdown here would recompute a settled figure
  (violates B+I-05, « never recomputed »). The base/commission/frais breakdown lives where the price
  is being CHOSEN (fiche produit · offre), never on the settlement record. This is correctness, not a
  styling shortcut. (`settlement-read-model` + `df2-device-review` #6 guard the verbatim figure.)
- **D — No « Simuler l'étape suivante » demo button.** Settlement advances on server/provider truth;
  the supplier surface never drives it client-side (no wallet/no self-advance).
- **E — No Historique card.** No per-event settlement history in the read model at E1. Returns with
  the event log (post-E1).

**The frame's composition — product identity → the locked money in majesty → the connected Suivi
timeline → designed empty state — matches « Détail commande ».** The one deliberate money divergence
(locked figure, not a live breakdown) is REQUIRED by B+I-05; the rest is the frozen store's E1 scope.
