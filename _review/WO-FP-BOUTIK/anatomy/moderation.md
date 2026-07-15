# ANATOMY DERIVATION — Modération

**Frame:** *none dedicated.* The planche has **no Modération screen** — only the tile **badge**
`EN MODÉRATION` (`Boutik Plus - Redesign.dc.html` line **139**). Modération is an app-only E1 surface
(B11), so it is composed from the SHARED frame vocabulary, not a single frame. No sibling frame is
imported for a composition it doesn't have.
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'moderation'` block.

---

## Element-by-element (shared-vocabulary composition; the one planche anchor is the badge)

| # | Shared frame element | source | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Stacked-view header (back + title) — the frame's back-header pattern (e.g. « Détail commande » 270) | back law | `<ViewHeader title={t('moderation.title')} backLabel onBack>` in `ListHeaderComponent` | exact (stacked, keeps back) |
| 2 | One scroll surface — chrome rides ListHeader/Footer (#5) | frame model | `<FlatList … ListHeaderComponent ListFooterComponent>` | exact |
| 3 | White rounded Card rows | frame surface | `<Card style={styles.modCard}>` per product | exact |
| 4 | **Badge language** `EN MODÉRATION` / status pills | **139** | `<StatusChip tone={MODERATION[state].tone} …>` — the FP status palette (approved→fact · changes_requested→problem · timeout→pending) | frame (badge system) |
| 5 | Honest per-state line + change reasons | states law | `t(mod.line)` + `changeReasons.map(… moderation.reason.*)` | exact |
| 6 | Offline is a designed state | honest states | `{offline && <Text>{t('moderation.hors_ligne')}</Text>}` | exact |

---

## Lawful divergences (the complete list)

- **No dedicated planche frame — composed from the shared vocabulary.** The prototype never draws a
  Modération screen; it only shows the `EN MODÉRATION` **badge** on a product tile (139). Modération
  (B11) is an app-only E1 surface. It therefore takes the shared frame patterns — the stacked-view
  back-header, the one-scroll-surface list, the white Card rows, and the **badge language** the whole
  ecosystem shares — rather than a single frame's composition. Nothing here is a snowflake; every
  element is a shared kit primitive already themed to Faso Premium.
- **Header is a back-header, not a hub title.** Modération is reached by navigation (stacked), so the
  journey-spine back law keeps `ViewHeader` — the same reason « Mes recettes » keeps it. Hub titles
  (the 28px `HubTitle`) are reserved for the tab roots (Accueil · Produits · Échéances).

**Modération has no frame to rebuild TO; it is already built FROM the shared Faso Premium vocabulary,
including the ecosystem badge language (`EN MODÉRATION`, 139) and the honest-states law.** The one
grep anchor the planche offers (the badge) is matched; the rest is the shared system, applied
consistently. No code change was warranted (forcing one would be unrequested tidying).
