# ANATOMY DERIVATION — Mes échéances (frame « Commandes » — list hub)

**Frame:** `data-screen-label="Commandes"` — `Boutik Plus - Redesign.dc.html` lines **156–179**
(the list-hub composition); the row *time* treatment references « Échéances du jour » (109–121).
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'echeances'` block.
**Note:** the app has no « Commandes » screen at E1; « Mes échéances » is the app's list-hub, so it
takes the « Commandes » list-hub FRAME (title + rows + empty) — the closest planche list surface.

---

## Frame outer shell (planche 156)

`padding:16px 20px 150px; overflow:auto` → `<FlatList style={styles.fill}
contentContainerStyle={styles.scrollFlow}>`. Title rides `ListHeaderComponent`, the continue button
rides `ListFooterComponent`, rows are the items — one scroll surface (#5).

---

## Element-by-element

| # | Frame element (verbatim byte) | Planche | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Hub title `Commandes` Bricolage **800 28px** | 157 | `<HubTitle title={t('echeances.title')} subtitle={t('echeances.regle')} />` → `ts('screen')` 28px + the 6-hour rule as subtitle | frame; **divergence A** (title copy) |
| 2 | Segment chips row (`Toutes`/`À préparer`/…, counts) | 158–162 | *(omitted)* | **divergence B** (E1: single « things due » list, no segments) |
| 3 | Order row — white `border-radius:18px`, duotone thumb + code + sub + status pill, press `.98` | 164–173 | `<ListRow icon="horloge" title={item.name} meta={restant} chip={<StatusChip…/>} onPress={() => go('corrective')}/>` | frame surface; **divergence C** (glyph + data) |
| 4 | Empty `Rien ici pour l'instant.` dashed encart | 174–176 | (list is non-empty when reached; the hub empty state is the designed « à jour » path) | frame (states law) |

---

## Lawful divergences (the complete list)

- **A — Title « Mes échéances » (not « Commandes »).** The app's list-hub is échéances (the post-refusal
  6-hour correction window), not a generic orders list; catalogue-governed copy. The frame's 28px
  Bricolage hub-title *composition* is matched exactly (this commit swapped the small 19px ViewHeader
  for `HubTitle`).
- **B — No segment-filter chip row.** At E1 the hub is a single actionable list (« things due »); there
  are no order segments to filter. Omitted rather than faked.
- **C — Rows keep the horloge glyph + countdown, not the frame's duotone-thumb order row.** These rows
  are **countdown** items (minutes left in the correction window), a different datum than the frame's
  order rows. The horloge + « Temps restant » was reviewed and KEPT at the founder's round-1 device
  review (#4: « the row-tile horloge stays, listed for the founder »); each row navigates to the
  correction flow (#3, `go('corrective')`, guarded by `df2-device-review` #3). **FLAGGED option:** the
  planche's « Échéances du jour » treatment (green tnum `TimeChip` + name + status, no glyph — the same
  block already built on Accueil) is available on the founder's word; not applied unilaterally because
  it reverses a specific round-1 decision and the countdown string is long for a compact chip.

**The frame's list-hub composition — one scroll surface, the 28px Bricolage hub title, the white
rounded rows, the status pills, the designed empty/complete state — is matched.** Divergences are the
E1 single-list scope (no segments), catalogue copy, and one founder-reviewed round-1 row detail
(the horloge), with the planche time-chip treatment flagged for his call.
