# ANATOMY DERIVATION — Produits

**Frame:** `data-screen-label="Produits"` — `Boutik Plus - Redesign.dc.html` lines **128–151**
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'produits'` block
**Kit primitives added for the frame:** `HubTitle` (big display title + subtitle),
`SecondaryButton` gained an optional leading `icon` (the frame's soft list button carries a glyph).

---

## Frame outer shell (planche 128)

`padding:16px 20px 150px; overflow:auto; animation:fpIn …` — one scroll surface, tab-clearing
bottom gutter. → `<FlatList style={styles.fill} contentContainerStyle={styles.scrollFlow}>`
inside `<ScreenEnter>`. The header + grid + empty state all ride the ONE FlatList
(ListHeaderComponent / ListEmptyComponent) — chrome scrolls WITH content (#5, no bounded window).

---

## Element-by-element

| # | Frame element (verbatim byte) | Planche | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Hub title `Produits` — Bricolage **800 28px** `letter-spacing:-.02em` | 129 | `<HubTitle title={t('produits.title')} …>` → `ts('screen', C.ink)` (28px display 800) | exact scale/family; **divergence A** (copy) |
| 2 | Subtitle `{{ productCount }} en ligne · photos sans prix incrusté` 13px `#6F6355` | 130 | `subtitle={t('produits.subtitle').replace('{n}', String(enLigne))}` → `ts('body', C.sub)`; `enLigne` = products with status `pret` | frame; **divergence A** (copy word) |
| 3 | Soft button `Lister un produit — gratuit` — 50px, soft `#E4EFE9`/`#073B2E`, **plus svg**, Bricolage 700 | 131–133 | `<SecondaryButton label={t('produits.lister')} onPress={() => go('nouveau')} icon="colis"/>` — soft-fill, deep label, `ts('cta')` | frame; **divergence B** (glyph) |
| 4 | Grid `grid-template-columns:1fr 1fr; gap:12` | 134 | `numColumns={2} columnWrapperStyle={styles.gridRow}` | exact |
| 5 | Tile — `border-radius:18px` white, `box-shadow`, press `scale(.97)` | 136 | `<Pressable style={styles.tile}>` (`R.tile`, `SHADOW.card`, pressed scale) | exact |
| 6 | Tile image — 108px, duotone bg + **135° weave overlay**, glyph, drop-shadow | 137 | `<DuotoneTile label={item.name} />` — the shared signature duotone tile (135° weave) | exact (signature element) |
| 7 | Tile state badges `EN PAUSE` / `EN MODÉRATION` top-left pills | 138–139 | `<View style={styles.tileBadge}><StatusChip tone={STATUS_TONE[item.status]} …/></View>` — status-driven pill | frame (states law) |
| 8 | Tile name — 13.5px 700 `letter-spacing:-.01em` | 142 | `<Text style={ts('row', C.ink)} numberOfLines={1}>` | exact |
| 9 | Price/stock row — `{{ p.priceF }}` Bricolage 800 tnum `#073B2E` + stock text | 143–146 | `<Text style={[ts('priceInline', C.deep), MONEY_TEXT]}>` net line, tnum | **divergence C+D** (net-not-base; no stock) |

---

## Lawful divergences (the complete list)

- **A — Copy: title `Mes produits` (not `Produits`); subtitle uses « sans prix ajouté » (not
  « incrusté »).** Per canon §2.5 the prototype "still carries legacy branding"; user-facing copy
  is governed by the i18n catalog + French Voice Standard (6th-grade), not the planche verbatim.
  Both strings pass copy-lint (0 violations). Composition, hierarchy, and display scale follow the
  frame exactly.
- **B — List-button glyph `plus` → `colis`.** The canon icon set (26 glyphs) has no plus; `colis`
  is the ecosystem's product mark and is already the accueil add-CTA glyph. Icons are the canon
  set (no invented glyphs) — a listed, consistent substitution.
- **C — Tile figure is the supplier NET, not the frame's base price `p.priceF`.** Law 1: the seller
  sees **net** (gross-first UI prohibited). The supplier's own product grid shows « Vous recevrez
  {net} F » — the franc that actually reaches them — computed by the pinned waterfall, not recomputed
  here. This is a money-model correction, not a styling drift.
- **D — No per-tile stock text.** The frozen read model surfaces no stock quantity at E1; omitted
  rather than faked (honest-states law). Returns when the stock model lands (post-E1).
- **E — Empty state carries no duplicate action button.** The « Lister un produit — gratuit » button
  sits in the always-present header directly above; the designed empty encart is the message alone
  (one primary action per screen — the header button — not two).

**Frame composition, hierarchy, the 28px Bricolage hub title, the soft list button, and the duotone
signature grid all match the planche.** Every divergence is copy (French Voice), the canon icon set,
the money-model (net-first), or the frozen store — none is a layout or styling drift.
