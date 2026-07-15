# ANATOMY DERIVATION — Accueil

**Frame:** `data-screen-label="Accueil"` — `Boutik Plus - Redesign.dc.html` lines **51–123**
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'accueil'` block, lines **369–434**
**Method:** every frame element below is grepped verbatim from the planche bytes, mapped to the
implementation element that carries it, and any gap between the two is named as a **lawful
divergence** (RN constraint, frozen store, or standing law) — never an unlisted drift.

---

## Frame outer shell (planche 51)

`padding:16px 20px 150px; animation:fpIn .32s cubic-bezier(.2,.8,.2,1); overflow:auto`
— one scroll surface, top-padded, generous bottom gutter for the tab bar, mounts on `fpIn`.

→ `<ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow}>` inside
`<ScreenEnter>` (App.tsx 367, 375). `scrollFlow` carries `paddingTop:D.gap` + a tab-clearing
`paddingBottom:D.scrollFlow`; `<ScreenEnter>` drives the `fpIn` token (native driver,
reduced-motion static). **Fidelity: exact** — one scroll surface, no bounded middle window.

---

## Element-by-element

| # | Frame element (verbatim byte) | Planche | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Monogram square `>BW<`, `40px`, `border-radius:14px`, `background:#0B5B47`, Bricolage 800 15px | 53 | `<WordmarkHeader>` → `<Monogram>` "B+" 40px, `R.art`, `appColour.primary`, display 800 (kit.tsx) | frame; **divergence A** (glyph) |
| 2 | Wordmark `>Boutik+<` Bricolage 800 19px `letter-spacing:-.02em` | 55 | `<Monogram>`+wordmark row, `ts('wordmark')` display 800 | exact |
| 3 | Shop line `{{ shopName }} · Rood Woko`, 12.5px, `#6F6355` | 56 | `shopLine={t('accueil.shopline')}` → "Marché Rood-Woko", `ts('shopLine', C.sub)` | frame; **divergence B** (no shopName) |
| 4 | `Vérifié` pill — white, `border:1px #E5DCC9`, green text, check svg, 38px, `border-radius:99px` | 58–60 | `right={<VerifiedChip label={t('confiance.title')} onPress={() => go('confiance')} />}` — white pill, check icon, deep-green text | exact |
| 5 | Greeting `Nd'waoga, {{ ownerName }}` Bricolage **800 28px** `line-height:1.1` | 62 | `<Text style={ts('screen', C.ink)}>{t('accueil.greeting')}</Text>` — display 800, `screen` scale (28px) | frame; **divergence B** (drops name) |
| 6 | Sub `Boutique ouverte · {{ productCount }} produits en ligne · aucun dépôt exigé, jamais.` 14px `#6F6355` | 63 | `ts('body', C.sub)` + `accueil.greeting_sub` with `{n}`→`enLigne` | frame; **divergence C** (no-deposit wording) |
| 7 | `À faire maintenant` overline (11px caps `.1em`) + danger count pill `#F8E1DE`/`#8C1D18` | 66–68 | `<SectionLabel count={todo.length}>{t('accueil.section_todo')}</SectionLabel>` — caps overline + danger count bubble | exact |
| 8 | Todo rows: 52px duotone tile (135° weave) + `{{code}} · {{name}}` 700 + sub + status pill | 71–79 | `todo.map` → `<ListRow art={<DuotoneTile…/>} title meta chip={<StatusChip…/>} onPress>` | frame; **divergence D** (code prefix) |
| 9 | Stat grid `1fr 1fr` gap 12; card `border-radius:20px` white; caps label; **24px Bricolage tnum**; note | 84–95 | `<View style={styles.statGrid}>` → `<StatCard label amount note/>` ×2; `statAmount` = display 800 `cardMoney` tnum | exact |
| 10 | « En attente » card — `Payé après livraison validée` | 86–88 | `StatCard label={recettes.chip_attente} amount={pending} note={stat_attente_note}` | exact |
| 11 | « Versé » card — green figure `#0B5B47`, `Sous 24 h après acceptation` | 91–93 | `StatCard … accent` → amount in `C.deep`, `stat_verse_note` | exact |
| 12 | Primary CTA `Ajouter un produit` — 54px, `#0B5B47`, `#F6F1E7`, plus svg, Bricolage 700 16px | 97–99 | `<PrimaryButton label={t('accueil.card_nouveau')} onPress={() => go('nouveau')} icon="colis"/>` | frame; **divergence D+#1** |
| 13 | `Alerte stock` card — warning triangle svg, gold pill, low-stock text | 101–107 | *(omitted)* | **divergence E** (frozen store: no low-stock signal) |
| 14 | `Échéances du jour` card — overline + rows: green tnum time chip `#E4EFE9`/`#073B2E` + label | 109–121 | `clocks.length > 0 && <Card><Overline>{ech_titre}</Overline>` + `<TimeChip>{ech_restant}</TimeChip>` + name | exact |
| 15 | Gratuité note `#E4EFE9`/`#073B2E` + underlined `Voir le parcours d'inscription vendeur` link | 122 | `<NoteCard>` soft-accent + `<UnderlineLink label={gratuite_link} onPress={() => go('onboarding')}/>` | exact |

---

## Lawful divergences (the complete list)

- **A — Monogram glyph `BW` → `B+`.** Standing law §3.10: naming is locked to **Boutik+**; `BW`
  (Boutique Wendkuni initials) is demo content. The monogram carries the canon mark, not the demo
  shop's initials.
- **B — Greeting drops `{{ ownerName }}`; shop line drops `{{ shopName }}`.** The frozen read
  model (`readModel.ts`, "Render code only") exposes no owner/shop identity to this surface.
  Greeting renders `t('accueil.greeting')` (« Nd'waoga ») without a name; the shop line uses the
  fixed market landmark (« Marché Rood-Woko »). Inventing a name would fabricate data.
- **C — Sub copy: « aucun dépôt exigé » → « vous n'avancez rien, jamais ».** The no-seller-deposit
  gate (Law 4) bans the token « dépôt » in *any* new string, including reinforcement. Same promise,
  gate-clean register. (JOURNAL 2026-07-14.)
- **D — Row/CTA copy carries no `{{ t.code }}` prefix.** Todo items key off the live product list,
  which has no per-item short code at E1; the row leads with the product name.
- **E — `Alerte stock` card omitted.** The frozen store surfaces no stock quantity to the supplier
  home at E1; a low-stock card would need a stock signal that does not exist. Omitted rather than
  faked (honest-states law). Reintroduced when the stock model lands (post-E1).

**Frame composition, hierarchy, display scale, and every signature element (woven band, wordmark
monogram, duotone tiles, stat-card ledger figures, green time chips, soft-accent notes) match the
planche.** All divergences are content/data forced by a standing law or the frozen store — none is
a styling or layout drift.
