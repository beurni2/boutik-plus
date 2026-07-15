# ANATOMY DERIVATION — Niveau de confiance

**Frame:** `data-screen-label="Niveau de confiance"` — `Boutik Plus - Redesign.dc.html` lines **561–586**
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'confiance'` block.
**Access, not money (B+I-12 / B7.2):** a seller-fault consequence is access-based, never a franc.

---

## Frame outer shell (planche 561)

`padding:16px 20px 60px; overflow:auto` → `<ScrollView style={styles.fill}
contentContainerStyle={styles.scrollFlow}>`. Stacked view → keeps `ViewHeader` (back + title), the
journey-spine back law.

---

## Element-by-element

| # | Frame element (verbatim byte) | Planche | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Back + title `Niveau de confiance` Bricolage 800 19px | 562–565 | `<ViewHeader title={t(SCREEN_TITLE_KEY.confiance)} backLabel onBack>` | exact |
| 2 | Sub `Votre niveau progresse par des livraisons propres — jamais par un dépôt d'argent.` | 566 | `<Text style={ts('body', C.sub)}>{t('confiance.subtitle')}</Text>` | frame; **divergence A** (gate reword) |
| 3 | Tier card **Provisoire** — white, title + description | 568–571 | `Card` (tier `provisional`) → title `ts('row')` + `ts('body', sub)` desc | exact |
| 4 | Tier card **Vérifié** — **2px accent border**, « Votre niveau » pill, title + « paiement à la livraison débloqué » | 572–578 | `Card accent={current}` + `<StatusChip tone="celebrate" label={confiance.tier_current} icon="scelle"/>` on the current tier | exact (emphasis follows the seller's live tier) |
| 5 | Tier card **De confiance** — white, title + description | 579–582 | `Card` (tier `trusted`) → title + desc | exact |
| 6 | Gold warning `Une faute répétée réduit l'accès … pas une caution.` | 584 | `<WarnNote text={t('confiance.warning')} />` (gold/warn tone) | frame; **divergence A** (gate reword) |

The three tier cards are the frame's **ladder**, rendered from
`(['provisional','verified','trusted']).map(...)` with `current = trust.tier === tier`. The
emphasized (current) card additionally carries the seller's **real** consequence — `faultCount` +
`restrictions` (B7.2, « trust-tier consequences shown ») — which the static frame omits.

---

## Lawful divergences (the complete list)

- **A — Subtitle + warning reword « dépôt » / « caution ».** The no-seller-deposit gate
  (`scripts/gates/no-seller-deposit.mjs`, B+I-12) bans « dépôt » and « caution » in any new code/json
  string, INCLUDING the frame's reinforcements (« jamais par un dépôt », « pas une caution »). Reworded
  gate-clean, same promise: « jamais avec de l'argent avancé » · « jamais une somme bloquée ». Both
  pass copy-lint (0 violations, 199 entries).
- **B — NO money on the trust screen.** The frame « Niveau de confiance » shows no franc; the previous
  build had a statement money-hero here. Removed — the statement figures live on the money surfaces
  (Accueil StatCards · Mes recettes hero), never the trust screen (B+I-12: a consequence is access,
  never money). No test pinned the confiance money card; `trust-statement` guards the pure presenter.
- **C — The current tier card carries the seller's live `faultCount` + `restrictions`.** An enrichment
  BEYOND the static frame (which shows generic tier copy): B7.2 requires the seller's actual
  consequence be shown. Placed on the emphasized (current) tier card so the ladder still reads as the
  frame composes it.

**The frame's trust LADDER — three tier cards, the current one accent-bordered with the « Votre
niveau » pill, the plain-French subtitle, the gold warning — matches the planche.** Divergences are
the gate reword (banned surety words), the removal of money from a non-money screen (B+I-12), and one
B7.2 enrichment (the live consequence on the current tier).
