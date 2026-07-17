# BOUTIK+ — HANDOFF D'IMPLÉMENTATION V2 (pixel-for-pixel)

Cible : rebuild **React Native** du prototype `Boutik Plus - Redesign.dc.html` (frame 402×874).
Compagnon : `Boutik Plus - Pixel Source (standalone).html` — source greppable + planche de revue (mêmes valeurs, mêmes chaînes).

## §0 · PORTÉE & RÈGLES

- **Ne rien redessiner.** Ce document décrit l'existant. Toute valeur absente = défaut listé ici, jamais une invention.
- **Langue** : français (vouvoiement), salutation mooré « Nd'waoga ». Apostrophe typographique **U+2019 (')** partout, jamais U+0027.
- **Notation** : `BG800/28/-.02` = Bricolage Grotesque, weight 800, 28px, letter-spacing -0.02em. `IS600/13` = Instrument Sans 600 13px. Couleurs citées par token (§1.1). `[NBSP]` = U+00A0, `[NNBSP]` = U+202F, `[SP]` = U+0020. Sauf marqueur, les espaces des chaînes sont des U+0020.
- **[DEMO]** marque les éléments de démonstration à conserver dans le prototype RN mais derrière le flag `showDemoControls` (défaut `true`) : bouton « ▶ Simuler… », toggle « Simuler : faible lumière », suffixes « (démo) ».
- **Argent = render-only.** Les montants (net, fee, pending, paid) sont FIGÉS à la commande côté serveur. L'UI affiche des valeurs stockées ; elle ne recalcule jamais un montant d'une commande passée (§3.6).
- **Emoji produits** (👗 👜 🧣 👔 🧥 🤳 🏷️) = placeholders d'imagerie, rendus en police système aux tailles spécifiées, sur tuile dégradé + texture. En production ils seront remplacés par les photos ; le prototype RN les garde tels quels.
- **Interdits structurels** : aucune scrollbar visible ; aucun retour à la ligne dans pills/chips/montants ; dock masqué sur tout écran empilé ; zone statut 54px + liseré tissé 6px présents sur TOUS les écrans.

### Écrans couverts (§5)
S01 Chargement · S02 Accueil · S03/S04 Produits (+modération) · S05/S06 Fiche produit (en ligne / en pause) · S07–S10 Commandes (4 segments) · S11–S16 Détail commande (FUNDED, READY, READY_FAILED, PICKUP_REFUSED, BUYER_REFUSED, PAID) · S17/S18 Sheet « Produit prêt » (2 états) · S19 Sheet Stock · S20–S25 Assistant Nouveau produit (5 étapes, 6 états) · S26–S31 Studio (3 captures, faible lumière, traitement ×2) · S32 Argent · S33 Niveau de confiance · S34–S39 Inscription vendeur (5 étapes + succès) · S40 Célébration versement.

---

## §1 · TOKENS

### 1.1 Palette (exhaustive)

| Token | Hex/valeur | Rôle exact |
|---|---|---|
| `bg` | `#F4EFE6` | Fond app (toutes vues) ; segment crème du liseré ; cadre photo « premium » (border 5px) ; fondu bas wizard |
| `sheet` | `#FCF9F2` | Fond bottom sheets ; dock à 88 % (`rgba(252,249,242,.88)`) |
| `surface` | `#FFFFFF` | Cartes, rangées, tuiles, chips off, inputs, boutons ronds |
| `ink` | `#1C1710` | Texte principal ; fond toast ; couleur base des ombres |
| `inkSoft` | `#4A3F33` | Corps de texte secondaire (intro onboarding, échéances, sous-titres wizard) |
| `sub` | `#6F6355` | Texte tertiaire, overlines, légendes, chips off |
| `faint` | `#8A7D6B` | Icônes/labels dock inactifs, étapes timeline futures, texte désactivé |
| `green` | `#0B5B47` | Primaire : CTA, monogramme, dots actifs, borders actives, liens (`a`), valeur « Versé » |
| `greenDeep` | `#073B2E` | Encre sur fonds verts clairs ; montants ; tabs actifs ; hover lien |
| `greenSoft` | `#E4EFE9` | Fond soft : chips actives, boutons soft, badges heure, bannières info |
| `successBg` | `#DFEEE3` | Fond pills/bannières succès |
| `successFg` | `#14603A` | Encre succès |
| `toastCheck` | `#8FD4B4` | Coche verte dans les toasts |
| `warnBg` | `#F6E9C8` | Fond warning (pills « À préparer », bannières prépa, alerte stock) |
| `warnFg` | `#7A5104` | Encre warning (pills, icône triangle, stock bas) |
| `warnDeep` | `#5F4403` | Encre warning des bannières pleines ; badge « EN MODÉRATION » |
| `dangerBg` | `#F8E1DE` | Fond danger (pills refus, badge à-faire, bannières échec) |
| `dangerFg` | `#8C1D18` | Encre pills danger + badge compteur à-faire |
| `dangerDeep` | `#7E1A15` | Encre bannières danger pleines |
| `gold` | `#C89A3F` | Or : liseré tissé, tirets célébration, label célébration |
| `borderCard` | `#EDE4D3` | Border cartes/rangées/tuiles + divider hairline (recap wizard) |
| `borderCtl` | `#E5DCC9` | Border contrôles : chips off, boutons ronds/ghost, inputs, dots inactifs, divider dashed |
| `divider` | `#F3EDDE` | Séparateurs de lignes internes (meters, processing) |
| `dockBorder` | `#EBE2D0` | border-top du dock |
| `grabber` | `#DDD2BC` | Poignée sheet ; border dashed état vide |
| `disabledBg` | `#DDD5C3` | Fond CTA désactivé |
| `disabledFg` | `#8A7D6B` | Encre CTA désactivé (= `faint`) |
| `dotIdle` | `#E0D6C2` | Border dots timeline futurs |
| `barIdle` | `#E8DFCC` | Connecteurs timeline futurs |
| `dashDemo` | `#C9BDA3` | Border dashed du bouton [DEMO] Simuler |
| `neutralPill` | `#EFE8DA` | Pill neutre : « En pause », « Retourné », chip catégorie fiche |
| `cream` | `#F6F1E7` | Encre sur vert (CTA, money hero, célébration) ; phase claire du shimmer |
| `toastFg` | `#F6F0E4` | Texte toast |
| `skeleton` | `#ECE4D4` | Phase sombre du shimmer |
| `creamCaption` | `#FFF6E8` | Légende du viseur Studio |
| `scrim` | `rgba(24,18,11,.45)` | Voile derrière sheets |
| `celebScrim` | `rgba(7,59,46,.95)` | Voile célébration |
| `pauseBadge` | `rgba(28,23,16,.72)` | Fond badge « EN PAUSE » sur tuile |
| Tuile p1 | `linear-gradient(140deg,#B65C2E,#7A3014)` | Robe brodée bogolan (aussi viseur Studio lumière OK) |
| Tuile p3 | `linear-gradient(140deg,#8A4F1D,#5C3210)` | Sac cuir artisanal |
| Tuile p7 | `linear-gradient(140deg,#A31D4E,#5E0F2C)` | Foulard Faso Dan Fani |
| Tuile p8 | `linear-gradient(140deg,#3E4B8C,#232B54)` | Chemise Faso Dan Fani |
| Tuile nouveau produit | `linear-gradient(140deg,#0B5B47,#073B2E)` | Produit publié via l'assistant + aperçu revendeuses |
| Studio original | `linear-gradient(140deg,#8A5A3A,#5A3A22)` | Photo « originale » avant/après |
| Studio faible lumière | `linear-gradient(140deg,#3A3128,#241E17)` | Viseur en faible lumière |
| Backdrop poste de travail | `radial-gradient(120% 90% at 50% 0%, #F2ECDF 0%, #E7DFCE 100%)` | HORS APP — décor du prototype web autour du téléphone (padding 34px). Ne pas implémenter dans RN. |

### 1.2 Échelle typographique

Fonts : **Bricolage Grotesque** (display ; graisses chargées 500/600/700/800 — utilisées 700 & 800) ; **Instrument Sans** (texte ; 400/500/600/700). Fallback : `system-ui, sans-serif`.
Tous les nombres/montants : `font-feature-settings:'tnum'` (RN : `fontVariant:['tabular-nums']`) **+ interdiction de wrap** (§0). `lh —` = non défini en source → **geler à 1.2**.

| Rôle | Spéc | ls | lh | Usages |
|---|---|---|---|---|
| DisplayMoney | BG800/38 | -.02em | — | Montant « En attente » carte Argent |
| CelebAmount | BG800/34 | -.02em | — | Montant célébration |
| ChallengeCode | BG800/34 | **+.14em** | — | Code WK-### (sheet Produit prêt) |
| PageTitle | BG800/28 | -.02em | — (Accueil : **1.1**) | Titres d'onglets + salutation Accueil |
| StepTitle | BG800/26 | -.02em | — | Titres d'étape wizard/onboarding/succès |
| StatValue | BG800/24 | -.01em | — | Valeurs cartes stats Accueil |
| NetXL | BG800/22 | — | — | « Vous recevez » wizard étape 3 |
| NetL | BG800/20 | — | — | « Vous recevez » fiche + détail commande |
| SheetTitle | BG800/20 | -.01em | — | Titres de sheets |
| StudioTitle | BG700/20 | — | — | Titre de prise Studio / « Traitement… » |
| ScreenTitle | BG800/19 | -.02em (détail cmde : -.01em) | — | Titres écrans empilés + « Boutik+ » header |
| StepperValue | BG800/19 | — | — | Valeur stepper (« 7 unités », « 10 000 F ») |
| MoneySub | BG800/17 | — | — | « Versé ces 7 jours » (valeur) |
| CardHeadline | BG700/16 | — | — | Titre header wizard/inscription ; nom recap |
| RecapNet | BG800/16 | — | — | « Vous recevez / vente » recap |
| BtnL | BG700/16 | — | — | CTA 54px |
| BtnM | BG700/15–15.5 | — | — | CTA 48–50px ; CTA succès inscription 15.5 |
| MoneyRowNet | BG800/15.5 | — | — | Net des rangées Argent |
| RowMonogram | BG800/15 | +.02em | — | « BW » monogramme |
| RelevTotal | BG800/15 | — | — | Total relevé hebdo |
| ProduitPrix | BG800/14 | — | — | Prix tuile produit |
| EchTime | BG800/12.5 | — | — | Badge heure échéance |
| Body | IS400/14–14.5 | — | 1.55–1.8 selon écran | Paragraphes |
| RowTitle | IS700/14.5 | (-.01em sur todo) | — | Titres de rangées ; code commande |
| CardTitle | IS700/15 | — | — | « Stock », niveaux de confiance |
| BannerTxt | IS400/12.5–13 | — | 1.5–1.65 | Bannières info/warn/danger/succès |
| SubLine | IS400/12.5–13.5 | — | 1.4–1.55 | Sous-titres, légendes |
| TileName | IS700/13.5 | -.01em | 1.25 | Nom tuile produit |
| Timeline | IS500→700/13.5 | — | 1.45 | Étapes suivi (700 = faite/courante) |
| ChipTxt | IS600/13–14 | — | — | Chips segments 13 / catégories 14 |
| ToastTxt | IS600/13 | — | — | Toasts |
| GhostS | IS600/13–13.5 | — | — | Boutons ghost |
| HistTxt | IS400/12.5 | — | 1.5 | Historique (timestamp IS600 tnum) |
| Caption | IS400/11.5–12 | — | 1.4 | Légendes avant/après, footnotes |
| PillTxt | IS700/11 | — | — | Status pills (10.5 rangées Argent ; 11.5 chips fiche ; 10 badges tuile) |
| Overline | IS700/10.5–11 | **+.1em** | — | UPPERCASE ; 11 = section Accueil/labels formulaires, 10.5 = intra-carte |
| CelebLabel | IS700/11 | +.12em | — | « VERSÉ SUR VOTRE MOBILE MONEY » |
| TabLabel | IS700/10.5 | +.01em | — | Labels dock |
| Input | IS400/16 | — | — | Champs texte |

### 1.3 Géométrie

- **Frame** : 402 × 874. **Zone statut OS** : 54px réservés (fond `bg`, aucun contenu app). **Liseré tissé** : 6px plein-largeur, `repeating-linear-gradient(90deg, #0B5B47 0 18px, #F4EFE6 18px 24px, #C89A3F 24px 32px, #F4EFE6 32px 38px)` — période 38px = 18 vert · 6 crème · 8 or · 6 crème. Les deux sont fixes (flex:none) au-dessus du contenu, visibles sur 100 % des écrans, sheets/toasts/célébration passent PAR-DESSUS.
- **Paddings d'écran** : latéral 20 ; haut 16 ; bas **150** (onglets scrollables, sous dock) / **60** (écrans empilés) / contenu wizard-onboarding `18 20 120` ; footer wizard `14 20 40` ; sheets `10 22 44`.
- **Espacements** : pas de grille abstraite — valeurs exactes par composant (§2) et par écran (§5). Gaps récurrents : rangées de liste 10 (relevés 9) ; grilles 12 ; chips 8–9 ; dots 6.
- **Rayons par composant** : sheet 30 (haut seulement) ; money hero/héro produit/viseur 22 ; carte L 20 ; rangée/tuile/bannière 18 ; bannière S/valeur stepper/recadre avant-après 16 ; CTA L 16 ; CTA M/input/ghost/tuile-icône 14 (tuile-icône commandes 13) ; encart code 18 ; badge heure 10 ; item dock 14 ; skeleton 9/12/16/20 ; pills/cercles/chips/dots/poignée 99. Cadre premium avant/après : border 5px `bg`, r16 (image interne r≈11 par clip).
- **Hit targets** : tous boutons ≥ 38px de haut (back 40, steppers 52, dock item ≈51).

### 1.4 Ombres (échelle exhaustive)

| Nom | Valeur exacte | Usages |
|---|---|---|
| cardSm | `0 1px 2px rgba(28,22,15,.04)` | Rangées, cartes simples, meters |
| cardLg | `0 1px 2px rgba(28,22,15,.04), 0 10px 30px -16px rgba(28,22,15,.14)` | Cartes stats, todo, tuiles produit |
| chipHdr | `0 1px 2px rgba(28,22,15,.05)` | Chip « Vérifié » header |
| heroImg | `0 16px 36px -16px rgba(28,22,15,.35)` | Héro fiche produit |
| heroStudio | `0 16px 36px -16px rgba(28,22,15,.4)` | Viseur Studio |
| moneyHero | `0 16px 36px -14px rgba(11,91,71,.55)` | Carte verte Argent |
| btnPrimary | `0 12px 26px -10px rgba(11,91,71,.5)` | CTA verts |
| btnPrimaryPressed | `0 6px 14px -8px rgba(11,91,71,.5)` | CTA vert enfoncé (Accueil) |
| sheet | `0 -18px 50px rgba(24,18,11,.25)` | Bottom sheets |
| toast | `0 12px 30px rgba(0,0,0,.35)` | Toasts |
| trustActive | `0 12px 30px -14px rgba(11,91,71,.35)` | Carte « Vérifié » niveau de confiance |
| celebCircle | `0 18px 40px -12px rgba(11,91,71,.55)` | Cercle coche célébration + succès inscription |
| framedPhoto | `0 6px 16px rgba(28,22,15,.18)` | Photo encadrée avant/après |
| glyphSm | `drop-shadow(0 3px 6px rgba(0,0,0,.25))` | Glyphes 22–25px |
| glyphMd | `drop-shadow(0 4px 8px rgba(0,0,0,.25))` | Glyphes 38–44px |
| glyphLg | `drop-shadow(0 6px 12px rgba(0,0,0,.3))` | Glyphes 68–72px |

### 1.5 Textures & dégradés

- **Texture tissée S** (tuiles-icônes 48–56px) : overlay `repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 8px, transparent 8px 20px)`.
- **Texture tissée M** (images 96–230px : tuiles produit, héros, viseur) : idem mais `0 10px / 10px 26px` (viseur Studio : opacité `.06`).
- **Texture money hero** : `135deg, rgba(255,255,255,.05) 0 12px, transparent 12px 30px`.
- **Fondu footer wizard** : `linear-gradient(transparent, #F4EFE6 32%)`.
- **Tirets or célébration** : bloc 132×6, `repeating-linear-gradient(90deg, #C89A3F 0 12px, transparent 12px 20px)` (×2 : haut et bas).
- **Shimmer skeleton** : `linear-gradient(90deg, #ECE4D4 25%, #F6F1E7 50%, #ECE4D4 75%)`, `background-size:640px 100%`, anim §7.

### 1.6 Z-index / empilement

Contenu écran (base) → **dock z30** → **sheets + scrim z60** → **toasts z80** (top:66, pointer-events:none) → **célébration z90**.

### 1.7 États pressés (transform scale, transition .15s)

`.98` CTA pleine largeur + rangées todo/commandes ; `.97` tuiles produit + boutons demi-largeur ; `.96` chips segments/« Vérifié »/toggles Studio ; `.95` chips catégorie ; `.94` items dock ; `.92` bouton retour ; `.9` steppers ±. CTA Accueil pressé : ombre → `btnPrimaryPressed` (transition box-shadow .2s).

### 1.8 Obligations de mapping RN (sans redesign)

- `backdrop-filter: blur(18px)` du dock → `BlurView` (tint clair) sous `rgba(252,249,242,.88)`.
- `repeating-linear-gradient` (liseré, textures, tirets) → SVG `<Rect>` motifs ou image ; reproduire les périodes EXACTES de §1.3/§1.5.
- Ombres multi-couches → `react-native-shadow-2` ou 2 vues superposées ; ne pas approximer par `elevation` seule.
- `font-feature-settings:'tnum'` → `fontVariant:['tabular-nums']`.
- Borders dashed (1.5 `borderCtl`, 2.5 blanc viseur, empty state, bouton demo) → `borderStyle:'dashed'`.
- `overflow:auto` sans scrollbar → `ScrollView showsVerticalScrollIndicator={false}`.
- Focus input (web) → état focus RN identique : border `green` + halo `0 0 0 3px rgba(11,91,71,.12)`.

---

## §2 · BIBLIOTHÈQUE DE COMPOSANTS

Chaque composant : spec CSS exacte + tous états. Les écrans (§5) référencent ces IDs.

### C01 StatusZone + C02 StripeTissée
54px de `bg` (flex:none) puis 6px liseré (§1.3). Toujours premiers enfants de la colonne app.

### C03 Dock (tab bar)
Position absolute bas, z30. Container : `display:flex; padding:8px 10px 28px; background:rgba(252,249,242,.88); backdrop-blur:18px; border-top:1px solid dockBorder`.
Item (×4, flex:1) : colonne centrée, gap 3, `padding:8px 2px 6px`, r14, TabLabel. Icône 24×24 (C42), stroke-width 1.9.
- **Actif** : fond `greenSoft`, texte+icône `greenDeep`. — **Inactif** : fond transparent, `faint`. — Pressé `.94`. Transition background/color .2s.
- Onglets : Accueil `home` · Produits `tag` · Commandes `box` · Argent `franc`.
- **Visibilité : uniquement quand aucune vue empilée** (view=null). Les sheets le recouvrent (z60) sans le démonter.

### C04 PageTitle — BG800/28/-.02, couleur `ink`.
### C05 Overline — IS700 uppercase ls .1em ; 11px (niveau écran, `sub`) ou 10.5px (intra-carte, `sub`).

### C06 StatusPill
`font:IS700/11; padding:5px 10px` (variante header détail : `5px 11px` ; rangées Argent : 10.5px `4px 9px`) ; r99 ; `white-space:nowrap`. Mapping status → (libellé, fond, encre) :

| Status | Libellé | Fond | Encre |
|---|---|---|---|
| FUNDED | À préparer | warnBg | warnFg |
| READY | Prêt — enlèvement | greenSoft | greenDeep |
| TRANSIT | En route | greenSoft | greenDeep |
| ARRIVED | Livreur arrivé | greenSoft | greenDeep |
| INSPECT | Inspection | greenSoft | greenDeep |
| AWAIT_PAY | Paiement à la porte | warnBg | warnFg |
| PAY_OK | Paiement confirmé | successBg | successFg |
| HANDOFF | Remise — code cliente | greenSoft | greenDeep |
| DELIVERED | Livré | successBg | successFg |
| PAID | Versé | successBg | successFg |
| READY_FAILED | Photo à reprendre | dangerBg | dangerFg |
| BUYER_REFUSED | Refusé par la cliente | dangerBg | dangerFg |
| PICKUP_REFUSED | Refusé à l'enlèvement | dangerBg | dangerFg |
| RETURNED | Retourné | neutralPill | sub |

Statut produit (fiche) : « En ligne » successBg/successFg · « En pause » neutralPill/sub · « En modération » warnBg/warnDeep.

### C07 BtnPrimary
H 54, r16, fond `green`, texte `cream` BtnL, ombre btnPrimary, icône 17–18px stroke 1.9–2.2 gap 9, `justify-content:center`. Pressé `.98`. **Désactivé** : fond `disabledBg`, texte `disabledFg`, **aucune ombre**, attribut disabled.

### C08 BtnSoft — H 48–50, r14–16, fond `greenSoft`, texte `greenDeep` BG700/14–15, sans ombre, gap 8, pressé `.97–.98`.
### C09 BtnGhost — H 46–48, r14, `border:1.5px solid borderCtl`, fond transparent, texte `ink` IS600/13.5–14, pressé `.97–.98`.
### C10 BtnDemo [DEMO] — H 46, r14, `border:1.5px dashed dashDemo`, texte `sub` IS600/13, préfixe « ▶ » (U+25B6).
### C11 BackBtn — 40×40, r99, border 1px `borderCtl`, fond `surface`, chevron 17px stroke `ink` 2.1 (`M14.5 6l-6 6 6 6`), pressé `.92`. Toujours 1er élément du header empilé, gap 10 avec le titre.

### C12 ChipSegment (Commandes)
H 38, `padding:0 14px`, r99, border **1.5px**, gap 7, ChipTxt/13 + compteur IS700/11 tnum opacité .75, nowrap, pressé `.96`.
- **Active** : border `green`, fond `greenSoft`, texte `greenDeep`. **Inactive** : border `borderCtl`, fond `surface`, texte `sub`.

### C13 ChipCategory (wizard) — H 42, `padding:0 16px`, r99, border 1.5px, IS600/14, pressé `.95`, transition background .2s. Active : `green`/`greenSoft`/`greenDeep` ; inactive : `borderCtl`/`surface`/`ink`.

### C14 ChipVerified (header Accueil) — H 38, `padding:0 14px`, r99, border 1px `borderCtl`, fond `surface`, texte `green` IS600/13, coche 15px stroke 2.2, gap 6, ombre chipHdr, pressé `.96`. Libellé : `Vérifié`.

### C15 Stepper (− / valeur / ＋)
Rangée gap 10. Boutons 52×52 r99 border 1px `borderCtl` fond `surface`, glyphe 20px IS600 `ink` — **moins = U+2212 « − », plus = U+FF0B « ＋ »** — pressés `.9`. Valeur : flex:1, centrée, `padding:13px`, r16, border 1px `borderCard`, fond `surface`, StepperValue tnum.

### C16 Input
`padding:14px 15px`, r14, border **1.5px** `borderCtl`, fond `surface`, Input/16 `ink`, `width:100%`. Label au-dessus : Overline/11 `sub`, marge label→champ 8. **Focus** : border `green` + halo `0 0 0 3px rgba(11,91,71,.12)`. Placeholder : couleur navigateur par défaut — geler à `sub` 60 %.

### C17 Card
- **Card/L** : `padding:17px`, r20, border 1px `borderCard`, fond `surface`, ombre cardSm. Variante « lg » : ombre cardLg. Variante liste interne (meters/processing) : `padding:8px 17px`.
- **Card/row** : `padding:13px` (ou `13px 15px` / `14px 15px`), r18 (relevés r16), border `borderCard`, fond `surface`, cardSm.

### C18 StatCard (Accueil ×2)
Card/L lg, `padding:16px`. Stack : Overline/10.5 → valeur StatValue tnum nowrap (mt 6) → légende IS400/12/1.4 `sub` (mt 3). Valeur « Versé » en `green`.

### C19 MoneyBreakdown (+ MoneyLine)
Card/L. Overline/10.5. MoneyLine : rangée `space-between`, IS400/14, `padding:6px 0` ; lignes déduction en `sub`, valeur `<b>` tnum préfixée « − » (U+2212). Ligne totale : `border-top:1.5px dashed borderCtl; margin-top:5px; padding-top:12px`, libellé IS700/15, valeur NetL(20)/NetXL(22) `greenDeep` tnum. Note : IS400/12/1.5 `sub`, mt 8.
Ordre EXACT des lignes : `Prix de base` → `Commission revendeuse` (−) → `Frais Boutik+ (5[NBSP]%)` (−) → `Vous recevez`.

### C20 MoneyHero (Argent)
`padding:20px`, r22, fond `green`, texte `cream`, ombre moneyHero, overflow hidden + texture §1.5. Stack : Overline/10.5 opacité .75 → montant DisplayMoney tnum (mt 6) → rangée pied (mt 10, `border-top:1px solid rgba(246,241,231,.22)`, pt 12) : « Versé ces 7 jours » IS400/12.5 op .85 ↔ valeur BG800/17 tnum.

### C21 IconTile
Carré dégradé produit + texture S + glyphe centré avec glyphSm/Md/Lg. Tailles : 52 r14 glyphe 24 (todo, produit-ligne détail) · 48 r13 glyphe 22 (rangées commandes) · 56 r14 glyphe 25 (aperçu revendeuses) · tuile produit : image 108px pleine largeur glyphe 44 · héro fiche 180px r22 glyphe 68 · viseur 230px r22 glyphe 72.

### C22 RowTodo (Accueil) / C23 RowOrder (Commandes)
Bouton pleine largeur : rangée gap 12, `padding:13px`, r18, border `borderCard`, fond `surface`, ombre cardLg (todo) / cardSm (commandes), pressé `.98`. Contenu : IconTile 52/48 → colonne flex:1 min-width:0 [titre RowTitle tnum ; sous-titre IS400/12.5 `sub` mt 2, nowrap+ellipsis] → StatusPill flex:none.
- Titre todo : `{code} · {nomProduit[ · variante]}` ; titre commande : `{code}` seul.
- Sous-titre todo FUNDED : `Commande payée — confirmez « Produit prêt »` ; READY_FAILED : `Photo refusée — reprenez la photo du produit prêt`.
- Sous-titre commande : `{nomProduit[ · variante]} · {payé en entier | produit payé à la porte}`.

### C24 RowMoney (Argent) — Card/row `14px 15px`. Colonne gauche [code RowTitle tnum ; nom IS400/12.5 `sub`] ; droite alignée fin [net MoneyRowNet tnum ; StatusPill 10.5 mt 4].
### C25 RowReleve — Card/row `13px 15px` r16 sans ombre. [semaine IS700/13.5 ; sous-ligne IS400/12 `sub` mt 1] ↔ total RelevTotal tnum nowrap.

### C26 ProductTile
Bouton r18 overflow hidden, border `borderCard`, fond `surface`, cardLg, pressé `.97`. Image 108px (IconTile) + badge éventuel coin haut-gauche (8,8) : « EN PAUSE » (IS700/10, `4px 8px`, r99, fond pauseBadge, texte `cream`) ou « EN MODÉRATION » (idem, fond warnBg, texte warnDeep, nowrap). Corps `padding:11px 12px 12px` : nom TileName → rangée mt 5 baseline space-between gap 6 : prix ProduitPrix `greenDeep` ↔ `stock {n}` IS600/11.5 tnum nowrap (`warnFg` si stock ≤ 4, sinon `sub`).

### C27 Banner (4 tons)
r18 (variantes serrées r16), IS400/12.5–13, lh 1.5–1.65, `padding:14px 16px` (variantes : 15/16, 13/15, 12/15).
- **Info** : fond `greenSoft`, texte `greenDeep`. **Warn** : `warnBg`/`warnDeep`. **Danger** : `dangerBg`/`dangerDeep`. **Succès** : `successBg`/`successFg` (souvent avec coche 17px gap 9, `align-items:center|flex-start`).

### C28 EmptyState — `padding:22px 16px`, r18, `border:1px dashed grabber`, texte IS400/13.5 `sub` centré : `Rien ici pour l'instant.`

### C29 Timeline (Suivi)
Par étape : rangée gap 12 ; colonne repère largeur 18 : dot 14×14 r99 `border:2.5px` mt 2 + connecteur 2.5px large `min-height:16px` flex:1 (absent sur la dernière étape) ; label `padding-bottom:16px`, Timeline/13.5/1.45.
- **Faite** : dot border+fond `green`, connecteur `green`, label 700 `ink`. **Courante** : dot border `green` fond `surface`, **animation fpPulse 1.2s infinite**, label 700 `ink`, connecteur `barIdle`. **Future** : dot border `dotIdle` fond `surface`, connecteur `barIdle`, label 500 `faint`.
- **Interrompue** (status hors flux) : TOUTES les étapes en style « future » + carte danger en fin de liste (r16, `padding:13px 15px`, dangerBg/dangerDeep, 12.5/1.55) : `Commande interrompue : {libelléPill}. {note}`.

### C30 Toast
Pile centrée `top:66px`, z80, gap 8, pointer-events:none. Toast : fond `ink`, texte `toastFg` ToastTxt, `padding:12px 17px`, r99, `max-width:86%`, ombre toast, coche 15px stroke `toastCheck` 2.4 gap 8. Entrée fpToast .25s ; **durée de vie 2800ms** (pas d'anim de sortie — retrait sec).

### C31 Sheet
Scrim plein écran z60 `scrim`, fpFade .2s ; tap scrim = fermer (tap contenu : stopPropagation). Panneau ancré bas pleine largeur : fond `sheet`, `border-radius:30px 30px 0 0`, `padding:10px 22px 44px`, `max-height:86%` scrollable (sheet Produit prêt), ombre sheet, entrée fpUp .34s. Poignée : 40×5 r99 `grabber`, `margin:6px auto 16px`. Titre SheetTitle.

### C32 ProgressDots (wizard/inscription) — rangée gap 6, mt 14 sous le header ; segment flex:1 H4 r99 ; `green` si index ≤ étape courante sinon `borderCtl` ; transition background .3s.

### C33 WizardFooter — absolute bas pleine largeur, `padding:14px 20px 40px`, fond fondu §1.5, contient un C07 (état selon étape).

### C34 Skeleton — blocs shimmer (§1.5, anim §7) : voir S01 pour les 7 blocs exacts.

### C35 Celebration — voir S40.

### C36 TrustCard — Card/L. Standard : border 1px `borderCard`. **Niveau courant** : `border:2px solid green` + ombre trustActive + pill « Votre niveau » (StatusPill successBg/successFg) alignée à droite du titre. Titre CardTitle/15 ; corps IS400/13/1.55 `sub` mt 6.

### C37 MetersList (Studio) — Card/L `8px 17px`. Rangée : `padding:9px 0`, `border-bottom:1px solid divider` (toutes, y c. la dernière), label IS400/13.5 `sub` ↔ pill valeur (IS700/11, `4px 10px`, r99) : `OK` successBg/successFg ou `À corriger` warnBg/warnFg.

### C38 ProcessingList — même carte ; rangée `padding:10px 0` ; label IS/14 (fait : 600 `ink` ; sinon 500 `faint`) ↔ marque 13px : `✓` (fait) / `…` (courant, fpPulse 1s infinite) / `·` (futur).

### C39 Viewfinder (Studio) — 230px r22 ombre heroStudio, fond = dégradé produit (lumière OK) ou faible-lumière, transition background .4s ; texture M .06 ; cadre pointillé inset 20, `border:2.5px dashed rgba(255,255,255,.75)` r16 ; glyphe 72 glyphLg, opacité 1 → **0.5 en faible lumière** (transition .4s) ; légende absolute bas 30 latéral 30 centrée `creamCaption` IS700/12 ls .02em, text-shadow `0 1px 4px rgba(0,0,0,.4)` : `Placez l'article dans le cadre`.

### C40 AvantApres — grille 2 col gap 12 align start. Gauche : image 106 r14 dégradé original, glyphe 38 glyphMd ; légende mt 7 Caption/11.5 centrée `Originale (conservée en privé)`. Droite : cadre `border:5px solid bg` r16 ombre framedPhoto ; image interne 96px, fond = traité (`Tuile p1`) ou original selon toggle (transition .3s), glyphe 38 ; légende `Publique · sans prix`.

### C41 ChallengeCode — carte `padding:19px`, r18, `border:1.5px solid green`, fond `surface`, centrée : code ChallengeCode `greenDeep` tnum ; note mt 6 IS400/12.5 `sub`.

### C42 IconSet (SVG inline, viewBox 24, fill none, stroke courant, linecap+linejoin round)
| Nom | Paths | Stroke-w | Usages (taille) |
|---|---|---|---|
| check | `M5 12.5l4.5 4.5L19 7.5` | 2.2 (toast 2.4 ; célébration 2.6 ; succès 2.4) | Vérifié 15 · CTA 18 · bannières 17 · toast 15 · célébration 36 · succès inscription 40 |
| plus | `M12 5v14` + `M5 12h14` | 2.2 | CTA Ajouter 18 · Lister 17 |
| chevronLeft | `M14.5 6l-6 6 6 6` | 2.1 | BackBtn 17 |
| camera | `M4 8h3l2-2.5h6L17 8h3v11H4V8z` + `circle cx12 cy13 r3.2` | 1.9 | CTA photo 17–18 |
| retry | `M4 10a8 8 0 1 1 2 5.3` + `M4 5.5V10h4.5` | 1.9 | Corriger et re-proposer 18 |
| alertTriangle | `M12 4L21 19.5H3L12 4z` + `M12 10v4` + `circle cx12 cy16.8 r1.2` (fill warnFg) | 1.9 | Alerte stock 17, stroke `warnFg` |
| tab.home | `M4 11l8-7 8 7` + `M6 9.5V20h12V9.5` + `M10 20v-6h4v6` | 1.9 | Dock 24 |
| tab.tag | `M4 4h6.8l9.2 9.2-6.8 6.8L4 10.8V4z` + `circle cx8.6 cy8.6 r1.5` | 1.9 | Dock 24 |
| tab.box | `M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3z` + `M4.5 7.2L12 11.5l7.5-4.3` + `M12 11.5V21` | 1.9 | Dock 24 |
| tab.franc | `circle cx12 cy12 r8.5` + `M10 16V8.5h4.5` + `M10 12.2h3.5` | 1.9 | Dock 24 |

### C43 HeaderStacked — rangée gap 10 : BackBtn + titre ScreenTitle flex:1 (nowrap+ellipsis si long) + élément droit optionnel (StatusPill). Variante wizard/inscription : titre CardHeadline/16 avec compteur `{{n}}/5` en `sub` tnum.

### C44 HeaderBoutique (Accueil) — rangée gap 12 : monogramme 40×40 r14 fond `green` texte `cream` RowMonogram (`BW`) + colonne flex:1 [« Boutik+ » BG800/19/-.02 ; sous-ligne IS400/12.5 `sub` nowrap-ellipsis `{{shopName}} · Rood Woko`] + ChipVerified.

### C45 EcheanceRow — rangée gap 10 : badge heure (EchTime `greenDeep` fond `greenSoft` r10 `padding:5px 9px` nowrap) + label IS400/13/1.4 `inkSoft`.

### C46 ActivityCard (fiche) — Card/L `16px 17px` sans ombre. Overline/10.5 + bloc IS400/13/1.7 `sub` mt 8, puces « • » :
`• Photo canonique approuvée (cadre premium)` / `• Version 2 activée — prix inchangé pour les commandes passées` / `• Ajout au catalogue · vérifié par la modération`.

### C47 RecapCard (wizard 5/5) — Card/L. Nom CardHeadline/16 ; sous-ligne IS400/13 `sub` mt 3 `{{cat}} · variantes {{sizes}} · stock {{stock}}` ; divider 1px `borderCard` marges 13 0 ; ligne `Vous recevez / vente` IS400/14 ↔ RecapNet `greenDeep` tnum ; ligne `Commission revendeuse` (`sub`) ↔ `<b>` tnum, `padding:5px 0` chacune.

### C48 PreviewRevendeuse (wizard 5/5) — Card/L `16px` sans ombre. Overline/10.5 `APERÇU — CE QUE VERRONT LES REVENDEUSES` ; rangée mt 11 gap 12 : IconTile 56 (dégradé nouveau produit, glyphe 🧥 25) + colonne [nom IS700/14 ; `{{cat}} · photo premium, sans prix incrusté` IS400/12 `sub` mt 2 ; `Commission revendeuse {{C}}` IS700/12.5 `greenDeep` tnum mt 3].


---

## §3 · MODÈLE DE DONNÉES & CALCULS

### 3.1 Forme d'état que l'UI lit

```
{
  loading: bool,                    // skeleton (750ms au boot)
  tab: 'home'|'produits'|'commandes'|'argent',
  view: null | {s:'product'|'order'|'add'|'studio'|'trust'|'onboard', id?},
  seg: 'traiter'|'cours'|'fini'|'incidents',   // segment Commandes (défaut 'traiter')
  sheet: null|'ready'|'stock',
  readyShot: bool,                  // photo prise dans le sheet Produit prêt
  stkDelta: int,                    // ajustement stock non enregistré (sheet)
  toasts: [{id, m}],
  counters: {pending?, paid?},      // valeurs animées (tween §7)
  products: {id → Product}, orders: {id → Order}, pseq: int,
  wiz: {step:0..4, cat, name, B, C, sizes, stock, photos:bool},
  studio: {step:0..3, low:bool, proc:0..4, orig:bool},
  ob: {step:0..5},                  // inscription
  celebr: string|null               // montant formaté de la célébration
}
```

Props racine : `shopName` (déf. `Boutique Wendkuni`), `ownerName` (déf. `Rasmané`), `startTab`, `startView`, `showDemoControls` (déf. true).

### 3.2 Entités

```
Product: {id, name, cat, B:int, C:int, stock:int, sizes:string|null,
          glyph, bg, paused:bool, mod?:bool}
Order:   {id, code:'CMD-####', pid, mode:'A'|'B', variant:string|null,
          status:Status, challenge:'WK-###', reason?:string,
          buyer:{name, zone}, history:[{ts, l}]}
```

`mode 'A'` = **payé en entier** (tout prépayé) ; `mode 'B'` = **produit payé à la porte** (frais de livraison 1 000 F prépayés, produit payé à la livraison).

### 3.3 Seed EXACT (première ouverture)

Produits (ordre d'itération = ordre d'affichage) :

| id | name | cat | B | C | stock | sizes | glyph | dégradé |
|---|---|---|---|---|---|---|---|---|
| p1 | Robe brodée bogolan | Mode femme | 10 000 | 1 000 | 7 | `S · M · L` | 👗 | Tuile p1 |
| p3 | Sac cuir artisanal | Sacs | 15 000 | 1 500 | 4 | null | 👜 | Tuile p3 |
| p7 | Foulard Faso Dan Fani | Accessoires | 5 500 | 550 | 14 | null | 🧣 | Tuile p7 |
| p8 | Chemise Faso Dan Fani | Mode homme | 12 000 | 1 200 | 5 | `M · L` | 👔 | Tuile p8 |

Commandes (ordre d'itération : o1, o3, o7, o5, o9) :

| id | code | pid | mode | variant | status | challenge | buyer / zone |
|---|---|---|---|---|---|---|---|
| o1 | CMD-2417 | p1 | B | M | FUNDED | WK-472 | Awa Kaboré · Ouaga 2000 |
| o3 | CMD-2411 | p8 | A | L | READY_FAILED | WK-981 | Salif Nikiéma · Tampouy |
| o7 | CMD-2409 | p3 | A | — | PAID | WK-118 | Moussa Traoré · Cissin |
| o5 | CMD-2398 | p7 | B | — | BUYER_REFUSED | WK-204 | Moussa Traoré · Cissin |
| o9 | CMD-2402 | p8 | A | M | PICKUP_REFUSED | WK-655 | Fatou Ilboudo · Tampouy |

`o9.reason = "variante M au lieu de L à l'enlèvement"`.

Historiques seed VERBATIM (affichés inversés, plus récent en premier) :
- o1 : `09:12` `Frais de livraison payés : 1 000 F, gardés en sécurité chez le partenaire` · `09:12` `Stock réservé · vendeur notifié`
- o3 : `08:40` `Payé en entier — en sécurité` · `08:58` `Photo de préparation refusée : trop sombre`
- o7 : `hier` `Payé en entier — en sécurité` · `hier` `Livré — code client confirmé` · `hier` `Versements effectués`
- o5 : `lun.` `Refusé à la porte : la cliente a changé d'avis` · `lun.` `Frais de livraison gardés — retour scellé RET-1104`
- o9 : `09:20` `Payé en entier — en sécurité` · `10:02` `Refusé à l'enlèvement par Issa (Séra) : variante incorrecte — la cliente est remboursée par le fonds de protection`

Relevés hebdo (statiques) : `Sem. 28 — 6 au 12 juil.` / `1 versement Mobile Money` / **12 750 F** ; `Sem. 27 — 29 juin au 5 juil.` / `2 versements Mobile Money` / **21 400 F** ; `Sem. 26 — 22 au 28 juin` / `1 versement Mobile Money` / **9 200 F**.

### 3.4 Maths de l'argent (formules exactes)

```
fee(B)      = round(B × 0.05)          // arrondi Math.round (au plus proche, .5 → sup)
net(B,C)    = B − C − fee(B)
prixClient  = B + margeRevendeuse      // fixée par la revendeuse dans Shop+ ; JAMAIS B + C
pending     = Σ net(o) pour o.status ∉ {PAID, BUYER_REFUSED, PICKUP_REFUSED, RETURNED}
paid        = Σ net(o) pour o.status = PAID
```

Valeurs seed dérivées (à retrouver au pixel) :

| Produit | fee | net |
|---|---|---|
| p1 | 500 | **8 500** |
| p3 | 750 | **12 750** |
| p7 | 275 | **4 675** |
| p8 | 600 | **10 200** |

→ Premier rendu : **pending = 18 700 F** (o1 8 500 + o3 10 200) ; **paid = 12 750 F** (o7).

### 3.5 Formatage

- **Montants** : `n.toLocaleString('fr-FR') + ' F'` → séparateur de milliers **[NNBSP] U+202F** (fallback accepté U+00A0 ; jamais U+0020), suffixe `[SP]F`. Ex : `18[NNBSP]700[SP]F`. Toujours tnum + nowrap.
- **Heures** : `HH:MM` 24h (historique) ; échéances littérales : `11 h 30`, `11 h 00`, `11–13 h` (tiret demi-cadratin U+2013).
- **Pluriel** : pill alerte stock = `{n} produit` si n = 1, `{n} produits` sinon. Aucune autre pluralisation dynamique.
- **Compteur wizard/inscription** : `{étape+1}/5`.

### 3.6 FIGÉ (rendre, ne jamais recalculer)

1. `net`, `fee`, `C`, `B` d'une **commande** : capturés à la commande. Modifier un produit crée une **version** ; les commandes passées gardent leurs montants (cf. C46 : « Version 2 activée — prix inchangé pour les commandes passées »).
2. `pending`/`paid` : dérivés serveur en prod — le client les affiche.
3. Attribution/custody : l'argent client est chez le **partenaire de paiement**, jamais chez le vendeur ; remboursements incident via **fonds de protection** (rien n'est prélevé sur le vendeur).
4. `challenge` (WK-###) : généré serveur, valable 15 min ; le **code client de livraison n'est jamais montré au vendeur**.
5. Stock affiché aux revendeuses : calculé côté serveur (cf. copy sheet stock).

---

## §4 · MACHINE À ÉTATS & FLUX

### 4.1 Navigation

- 4 onglets racine (dock). `view` = écran empilé unique au-dessus de l'onglet courant (pas de pile profonde). `back` → `view=null` (retour racine onglet courant). Dock visible ssi `view=null`.
- Changer d'onglet remet `view=null` ; onglets `home`/`argent` relancent le tween pending/paid.
- Wizard : `back` à l'étape 1/5 quitte le wizard ; sinon étape −1. Idem inscription.
- `startView` (prop, [DEMO]) : `product`→fiche p1 · `order`→o1 · `incident`→o9 · `add`/`studio`/`trust`/`onboard` directs.

### 4.2 Cycle de vie d'une commande

```
mode A : FUNDED → READY → TRANSIT → ARRIVED → INSPECT → HANDOFF → DELIVERED → PAID
mode B : FUNDED → READY → TRANSIT → ARRIVED → INSPECT → AWAIT_PAY → PAY_OK → HANDOFF → DELIVERED → PAID
hors flux (poussés par le backend, render-only) : READY_FAILED, PICKUP_REFUSED, BUYER_REFUSED, RETURNED
```

Libellés timeline (flowLabel) VERBATIM :
| Status | Libellé |
|---|---|
| FUNDED | mode B : `Frais de livraison payés — en sécurité` · mode A : `Paiement complet — en sécurité` |
| READY | `Produit prêt chez le vendeur` |
| TRANSIT | `Vérifié, scellé, pris en charge par Séra` |
| ARRIVED | `Livreur arrivé` |
| INSPECT | `La cliente inspecte avant la remise` |
| AWAIT_PAY | `Le produit se paie à la porte` |
| PAY_OK | `Paiement confirmé par le partenaire` |
| HANDOFF | `Remise autorisée — code de la cliente` |
| DELIVERED | `Livré` |
| PAID | `Vendeur et revendeuse payés` |

### 4.3 Table des transitions (trigger → état → effets)

| # | Déclencheur (précondition) | Nouvel état | Effets de bord (textes verbatim, délais exacts) |
|---|---|---|---|
| T01 | Boot | `loading=true` | Après **750ms** : `loading=false` + tween pending/paid (0 → valeurs, 800ms) |
| T02 | Tap onglet dock | `tab=x, view=null` | Si x ∈ {home, argent} : re-tween compteurs |
| T03 | Tap « Vérifié » | `view={s:'trust'}` | — |
| T04 | Tap « Ajouter un produit » / « Lister un produit — gratuit » | `wiz` réinitialisé `{step:0, cat:'Mode femme', name:'', B:10000, C:1000, sizes:'S, M, L', stock:5, photos:false}`, `view={s:'add'}` | — |
| T05 | Tap tuile produit | `view={s:'product', id}` | — |
| T06 | Tap rangée todo/commande/… | `view={s:'order', id}` | — |
| T07 | BackBtn | `view=null` | — |
| T08 | « Ajuster le stock » | `sheet='stock', stkDelta=0` | — |
| T09 | Stepper stock ± | `stkDelta ±1` | Borne basse : `stkDelta ≥ −stock` (valeur affichée ≥ 0) |
| T10 | « Enregistrer » (sheet stock) | `product.stock += stkDelta ; sheet=null` | Toast `Stock mis à jour : {n} unités` |
| T11 | « Mettre en pause » / « Réactiver » | `paused = !paused` | Toast `Produit en pause — masqué chez les revendeuses` / `Produit remis en ligne` |
| T12 | « Modifier » | — | Toast `Modification (démo) — nouvelle version, les commandes passées ne changent pas` |
| T13 | « Produit prêt » / « Reprendre la photo » / « Corriger et re-proposer » | `sheet='ready', readyShot=false` | — |
| T14 | « Prendre la photo (caméra intégrée) » | `readyShot=true` | Bloc succès remplace le bouton (fpPop .3s) ; CTA s'active |
| T15 | « Confirmer — envoyer à Séra » (readyShot) | `order.status='READY' ; sheet=null` | Historique + `Produit prêt confirmé (code {challenge}) — Séra assigne un livreur` ; toast `Prêt — Issa (Séra) est notifié` ; re-tween |
| T16 | [DEMO] « ▶ Simuler l'étape suivante » (statut dans le flux, pas premier ni dernier) | `status = étape suivante` | Historique + libellé timeline du nouveau statut ; si PAID : suffixe ` — versement Mobile Money effectué`, célébration S40 (auto-fermée **2200ms**), re-tween |
| T17 | Tap scrim / célébration | `sheet=null` / `celebr=null` | — |
| T18 | Wizard « Continuer » (étape < 5, valide) | `wiz.step+1` | — |
| T19 | Wizard « Publier — c'est gratuit » (étape 5) | Nouveau produit `{id:'np'+pseq, glyph:'🧥', bg:dégradé nouveau produit, mod:true}` ; `view=null, tab='produits'` | Toast `Envoyé en modération — catégorie, allégations, photos` ; après **6000ms** : `mod=false` + toast `Modération : approuvé — en ligne chez les revendeuses` |
| T20 | « Ouvrir Boutik+ Studio » | `studio={step:0,low:false,proc:0,orig:false}, view={s:'studio'}` | — |
| T21 | [DEMO] toggle faible lumière | `low=!low` | Viseur/meters/bannière/CTA changent (S27) |
| T22 | « Capturer » (non-low) | `studio.step+1, proc=0` | Si step atteint 3 : ticks `proc=1..4` toutes les **620ms** (premier à 620ms) |
| T23 | Toggle « Couleurs d'origine » / « Voir la version traitée » | `orig=!orig` | Image « après » bascule (.3s) |
| T24 | « J'approuve ces photos » | `wiz.photos=true, view={s:'add'}` (étape 4/5) | Toast `Photos canoniques prêtes — sans prix, sans contact` |
| T25 | « Voir le parcours d'inscription vendeur » | `ob={step:0}, view={s:'onboard'}` | — |
| T26 | Inscription « Continuer » / « Créer mon compte gratuit » | `ob.step+1` (step 5 = écran succès) | — |
| T27 | « Explorer avec Boutique Wendkuni (démo) » | `view=null` | Toast `Compte provisoire créé — démo avec Boutique Wendkuni` |
| T28 | « Télécharger le relevé (PDF — démo) » | — | Toast `Relevé PDF généré — chaque franc a sa place (démo)` |
| T29 | Toast créé | — | Auto-retrait après **2800ms** |

### 4.4 Conditions de désactivation des CTA

| CTA | Désactivé quand | Apparence désactivée |
|---|---|---|
| Wizard « Continuer » | étape 4/5 sans photos (`wiz.photos=false`) — libellé devient `Photos requises` | C07 désactivé (disabledBg/disabledFg, sans ombre) |
| Sheet « Confirmer — envoyer à Séra » | `readyShot=false` | idem |
| Studio « Capturer » | `low=true` | idem |
| Stepper stock − (sheet) | valeur affichée = 0 (borne) | pas de style spécifique — le clic est sans effet |
| Steppers wizard | bornes : B ≥ 500 (pas 500) ; C ≥ 0 (pas 100) ; stock ≥ 1 (pas 1) | idem |

### 4.5 Flux de bout en bout (résumés opérationnels)

- **Publier un produit** : T04 → étapes 1..3 → T20 → 3 captures (T22×3) → traitement 4 ticks → T24 → étape 4/5 validée → étape 5/5 → T19 → atterrit sur Produits avec tuile « EN MODÉRATION » → +6s badge disparaît.
- **Honorer une commande** : Accueil todo CMD-2417 → T06 → S11 → T13 → S17 → T14 → S18 → T15 → S12 (READY) → [DEMO] T16 ×8 jusqu'à PAID → S40 célébration → S16.
- **Incident enlèvement** : o9 (S14) → T13 « Corriger et re-proposer » → même sheet S17/S18 → T15 → repart à READY.
- **Inscription vendeur** : T25 → S34..S38 → T26×5 → S39 → T27.


---

## §5 · ÉCRANS — anatomie exacte (ordre d'empilement haut → bas)

Tous les écrans commencent par C01+C02 (54px + liseré 6px) — non répété ci-dessous. « Scroll 16/20/150 » = padding top/latéral/bottom de la zone scrollable. Entrée d'écran : anim `fpIn` §7. Chaque `{{var}}` = variable template (valeur seed entre parenthèses).

### S01 · Chargement (skeleton)
Visible 750ms au boot. Colonne `padding:18px 20px`, gap 14. Blocs shimmer (§1.5), dans l'ordre :
1. 18×150 r9 · 2. 34×230 r12 · 3. H86 r20 · 4. H86 r20 · 5. rangée gap 12 : 2 blocs flex:1 H104 r20 · 6. H54 r16.
Signature : shimmer 1.2s linéaire ; aucune autre UI (pas de dock).

### S02 · Accueil
Route `tab=home` · dock visible (Accueil actif) · Scroll 16/20/150.
1. **C44 HeaderBoutique** — monogramme `BW` ; `Boutik+` ; `{{shopName}} (Boutique Wendkuni) · Rood Woko` ; ChipVerified `Vérifié` (→ T03).
2. Salutation mt 20 — PageTitle/28 lh 1.1 : `Nd'waoga, {{ownerName}} (Rasmané)`.
3. Sous-ligne mt 8 — IS400/14/1.5 `sub` : `Boutique ouverte · {{productCount}} (4) produits en ligne · aucun dépôt exigé, jamais.`
4. **Section À faire** (si ≥1 commande FUNDED/READY_FAILED) mt 22 : rangée space-between [Overline/11 `À FAIRE MAINTENANT` ↔ badge compteur `{{todoCount}} (2)` IS700/11 `dangerFg` fond `dangerBg` r99 `3px 9px`].
5. Liste todo mt 10 gap 10 — **C22 ×2** :
   - `CMD-2417 · Robe brodée bogolan · M` / `Commande payée — confirmez « Produit prêt »` / pill `À préparer`.
   - `CMD-2411 · Chemise Faso Dan Fani · L` / `Photo refusée — reprenez la photo du produit prêt` / pill `Photo à reprendre`.
6. Grille stats mt 16, 2 col gap 12 — **C18 ×2** : [`EN ATTENTE` / `{{pending}} (18 700 F)` / `Payé après livraison validée`] ; [`VERSÉ` / `{{paid}} (12 750 F)` en `green` / `Sous 24 h après acceptation`].
7. **C07** mt 16 : icône plus 18 + `Ajouter un produit` (→ T04).
8. **Carte Alerte stock** mt 14 — Card/L `15px 16px` : rangée space-between [titre IS700/14.5 nowrap avec alertTriangle 17 `warnFg` gap 8 : `Alerte stock` ↔ pill `{{lowStockPill}} (1 produit)` IS700/11 warnBg/warnFg] ; texte mt 7 IS400/13/1.5 `sub` : `{{lowStockText}} (Sac cuir artisanal (4)) — pensez à reconfirmer vos quantités.`
9. **Carte Échéances du jour** (si ≥1 commande FUNDED/READY_FAILED/READY) mt 12 — Card/L `16px 17px` : Overline/10.5 `ÉCHÉANCES DU JOUR` ; liste mt 10 gap 9 — **C45** : `11 h 30` + `CMD-2417 — préparer + photo « produit prêt »` ; `11 h 00` + `CMD-2411 — reprendre la photo (code lisible)`. (READY donnerait : `11–13 h` + `{code} — enlèvement Séra, soyez présent`.)
10. **Bannière info** mt 14 — C27/Info `14px 16px` 12.5/1.55 : `Inscription et publication gratuites. Boutik+ ne gagne que lorsque votre produit est vendu (5[NBSP]% du prix de base).` puis bouton-lien mt 9 (IS700/12.5 `greenDeep` souligné, sans fond) : `Voir le parcours d'inscription vendeur` (→ T25).
Signature : monogramme vert + chip Vérifié ; salutation mooré ; badge compteur rouge ; 2 stat-cards jumelles ; alerte stock avec triangle ; badges heure verts ; lien souligné dans la bannière.

### S03 · Produits
Route `tab=produits` · dock visible · Scroll 16/20/150.
1. PageTitle `Produits`.
2. Sous-ligne mt 4 IS400/13 `sub` : `{{productCount}} (4) en ligne · photos sans prix incrusté`.
3. **C08** mt 16 H50 : icône plus 17 + `Lister un produit — gratuit` (→ T04).
4. Grille mt 14, 2 col gap 12 — **C26 ×4** (ordre p1, p3, p7, p8) :
   | Tuile | prix | stock (couleur) |
   |---|---|---|
   | Robe brodée bogolan 👗 | 10 000 F | `stock 7` (`sub`) |
   | Sac cuir artisanal 👜 | 15 000 F | `stock 4` (`warnFg`) |
   | Foulard Faso Dan Fani 🧣 | 5 500 F | `stock 14` (`sub`) |
   | Chemise Faso Dan Fani 👔 | 12 000 F | `stock 5` (`sub`) |
Signature : grille 2×2 de tuiles texturées ; prix vert foncé tnum ; mention « sans prix incrusté ».

### S04 · Produits — après publication [état]
Identique S03 + 5e tuile (nouveau produit) : dégradé vert, glyphe 🧥 44, badge coin `EN MODÉRATION` (warnBg/warnDeep), nom saisi (déf. `Robe brodée bogolan`), prix = B saisi, `stock {n}`. Compteur passe à `5 en ligne`. Badge disparaît à +6s (T19).

### S05 · Fiche produit (p1, En ligne)
Route `view={s:'product',id:'p1'}` · dock MASQUÉ · Scroll 16/20/60.
1. **C43** : BackBtn + titre `{{prodName}} (Robe brodée bogolan)` ScreenTitle/19 nowrap-ellipsis + StatusPill produit `En ligne` (`5px 11px`).
2. **Héro** mt 14 — IconTile 180 r22 ombre heroImg, glyphe 68.
3. Chips mt 12 gap 8 wrap : `3 revendeuses le proposent` (IS700/11.5 `6px 11px` greenSoft/greenDeep) ; `{{cat}} (Mode femme)` (neutralPill/sub).
4. **C19 MoneyBreakdown** mt 14 — Overline `VOS GAINS SUR CE PRODUIT` ; lignes : `Prix de base` **10 000 F** / `Commission revendeuse` **−1 000 F** / `Frais Boutik+ (5[NBSP]%)` **−500 F** / `Vous recevez` **8 500 F** (NetL/20) ; note : `Montant verrouillé à la commande — payé sous 24[NBSP]h après livraison validée.`
5. **Carte Stock** mt 12 — Card/L : rangée [CardTitle `Stock` ↔ pill `{{stock}} (7) dispo.` IS700/11 tnum — successBg/successFg si stock > 4, warnBg/warnFg sinon] ; si sizes : ligne mt 7 IS400/13 `sub` `Variantes : S · M · L` ; **C09** mt 12 H46 `Ajuster le stock` (→ T08).
6. Grille actions mt 12, 2 col gap 10, H48 : **C08** `Modifier` (→ T12) + **C09** `Mettre en pause` (→ T11).
7. **C46 ActivityCard** mt 12.
Signature : héro texturé plein cadre ; bloc gains 4 lignes avec divider dashed ; pill stock ; journal d'activité à puces.

### S06 · Fiche produit — En pause [état]
Différences vs S05 : StatusPill header `En pause` (neutralPill/sub) ; bouton 6b libellé `Réactiver` ; sur S03 la tuile porte le badge `EN PAUSE` (fond pauseBadge, texte cream). Rien d'autre ne change (stock, gains identiques).

### S07 · Commandes — À traiter (défaut)
Route `tab=commandes` · dock visible · Scroll 16/20/150.
1. PageTitle `Commandes`.
2. Rangée chips mt 14 — scroll horizontal sans barre, gap 8, `padding-bottom:4px` — **C12 ×4** : `À traiter 2` (active) · `En cours 0` · `Terminées 1` · `Incidents 2`.
3. Liste mt 12 gap 10 — **C23 ×2** :
   - `CMD-2417` / `Robe brodée bogolan · M · produit payé à la porte` / pill `À préparer`.
   - `CMD-2411` / `Chemise Faso Dan Fani · L · payé en entier` / pill `Photo à reprendre`.
Signature : chips segmentées avec compteurs intégrés ; sous-titre = produit · variante · mode de paiement.

### S08 · Commandes — En cours [état] : chips (En cours active) ; liste remplacée par **C28** `Rien ici pour l'instant.`
### S09 · Commandes — Terminées [état] : 1 rangée `CMD-2409` / `Sac cuir artisanal · payé en entier` / pill `Versé`.
### S10 · Commandes — Incidents [état] : 2 rangées — `CMD-2398` / `Foulard Faso Dan Fani · produit payé à la porte` / pill `Refusé par la cliente` ; `CMD-2402` / `Chemise Faso Dan Fani · M · payé en entier` / pill `Refusé à l'enlèvement`.

### S11 · Détail commande — FUNDED (o1, mode B)
Route `view={s:'order',id:'o1'}` · dock MASQUÉ · Scroll 16/20/60.
1. **C43** : BackBtn + `CMD-2417` (ScreenTitle -.01em tnum) + pill `À préparer`.
2. **Rangée produit** mt 14 — Card/row `13px` r18 : IconTile 52 👗 + [`Robe brodée bogolan · taille M` IS700/14.5 ; `Qté 1 · zone {{zone}} (Ouaga 2000) · produit payé à la porte` IS400/12.5 `sub` mt 2].
3. **C19** mt 12 — Overline `VOTRE GAIN — VERROUILLÉ` ; `10 000 F / −1 000 F / −500 F / 8 500 F` ; note mode B : `Produit payé à la porte : vous êtes payé une fois le paiement confirmé et le colis remis.` (mode A : `Déjà payé, gardé en sécurité chez le partenaire de paiement.`)
4. **Bannière warn** mt 12 — C27/Warn 12.5/1.55 : `Préparez avant 11[NBSP]h[NBSP]30. Emballage ouvrable (le livreur vérifie avant de sceller) · emballage neutre, sans coordonnées.` (« ouvrable » et « 11 h 30 » en gras).
5. **C07** mt 12 : coche 18 + `Produit prêt` (→ T13).
6. **Carte Suivi** mt 12 — Card/L : Overline `SUIVI` ; **C29** mt 12, 10 étapes mode B (§4.2), étape 1 courante (pulse), 2–10 futures.
7. **Carte Historique** mt 12 — Card/L `16px 17px` sans ombre : Overline `HISTORIQUE` ; lignes mt 8 gap 6, HistTxt : ts + texte (ordre inversé, cf. §3.3).
Signature : pill statut dans le header ; bloc gain « verrouillé » ; bannière consignes d'emballage ; timeline 10 points avec pulse.

### S12 · Détail commande — READY (o1 après T15) [état]
Différences vs S11 : pill header `Prêt — enlèvement` ; bannière warn + CTA **supprimés** ; timeline : étape 1 faite (dot plein vert, connecteur vert), étape 2 courante (pulse) ; [DEMO] **C10** mt 12 : `▶ Simuler l'étape suivante — En route (démo)` ; historique enrichi : `{HH:MM} Produit prêt confirmé (code WK-472) — Séra assigne un livreur` en tête. Le libellé du bouton demo = libellé pill du statut suivant.

### S13 · Détail commande — READY_FAILED (o3, mode A)
1. Header : `CMD-2411` + pill `Photo à reprendre`.
2. Rangée produit : 👔 `Chemise Faso Dan Fani · taille L` ; `Qté 1 · zone Tampouy · payé en entier`.
3. C19 : `12 000 F / −1 200 F / −600 F / 10 200 F` ; note mode A.
4. **Bannière danger** mt 12 : `Photo de préparation refusée : trop sombre. Rapprochez-vous d'une fenêtre et reprenez — le code doit rester lisible.` (« trop sombre » gras).
5. **C07** : caméra 18 + `Reprendre la photo` (→ T13).
6. Suivi : flux mode A (8 étapes) — READY_FAILED est hors flux → timeline **toute grise** (étapes futures) + carte interrompue en fin de liste : `Commande interrompue : Photo à reprendre. Voir le détail ci-dessous.` (cf. §9.4).
7. Historique (§3.3).
Signature : bannière rouge avec cause + consigne de reprise ; CTA caméra.

### S14 · Détail commande — PICKUP_REFUSED (o9, mode A)
1. `CMD-2402` + pill `Refusé à l'enlèvement`. 2. 👔 `Chemise Faso Dan Fani · taille M` ; `Qté 1 · zone Tampouy · payé en entier`. 3. C19 p8 (identique S13). 4. **Bannière danger** : `Refusé à l'enlèvement : {{reason}} (variante M au lieu de L à l'enlèvement). La cliente est remboursée par le fonds de protection — corrigez, puis re-proposez le colis.` (raison en gras). 5. **C07** : retry 18 + `Corriger et re-proposer` (→ T13). 6. Suivi : 8 étapes toutes futures + carte `Commande interrompue : Refusé à l'enlèvement. Voir le détail ci-dessous.` 7. Historique.
Signature : mention fonds de protection ; CTA re-proposer.

### S15 · Détail commande — BUYER_REFUSED (o5, mode B)
1. `CMD-2398` + pill `Refusé par la cliente`. 2. 🧣 `Foulard Faso Dan Fani` ; `Qté 1 · zone Cissin · produit payé à la porte`. 3. C19 p7 : `5 500 F / −550 F / −275 F / 4 675 F` ; note mode B. 4. Pas de bannière/CTA d'action. 5. Suivi : 10 étapes toutes futures + carte `Commande interrompue : Refusé par la cliente. Frais de livraison gardés — le produit repart chez le vendeur.` 6. Historique.

### S16 · Détail commande — PAID (o7, mode A)
1. `CMD-2409` + pill `Versé`. 2. 👜 `Sac cuir artisanal` ; `Qté 1 · zone Cissin · payé en entier`. 3. C19 p3 : `15 000 F / −1 500 F / −750 F / 12 750 F` ; note mode A. 4. **Bannière succès** mt 12 : `Livraison validée. Argent versé sur votre Mobile Money.` (DELIVERED donnerait : `Livraison validée. Versement en cours (sous 24 h).`) 5. Suivi : 8 étapes TOUTES faites (dernière = PAID courante ? non : cur = dernière → étapes 1..7 faites, 8 courante avec pulse). 6. Pas de bouton demo (dernière étape). 7. Historique 3 lignes.
Signature : bannière verte de clôture ; timeline presque tout vert.

### S17 · Sheet « Produit prêt » — sans photo (défaut)
Ouvert sur S11/S13/S14 (T13). **C31** ; le scrim couvre l'écran (dock inclus).
1. Poignée. 2. SheetTitle : `Confirmer « Produit prêt »`.
3. Overline/11 mt 16 : `1 · CODE DE PRÉPARATION (VALABLE 15 MIN)`.
4. **C41** mt 9 : `{{challenge}} (WK-472)` ; note : `Écrivez ce code sur un papier posé à côté du produit.`
5. Overline mt 16 : `2 · PHOTO DE PRÉPARATION`.
6. **C08** mt 9 H50 : caméra 17 + `Prendre la photo (caméra intégrée)` (→ T14).
7. Overline mt 16 : `3 · DISPONIBILITÉ`.
8. Texte mt 8 IS400/13/1.5 `sub` : `Je confirme être présent à la boutique pour l'enlèvement (créneau 11 h – 13 h).`
9. **C07 désactivé** mt 16 : `Confirmer — envoyer à Séra`.
10. Footnote mt 9 IS400/12 `sub` centrée : `Le code client de livraison ne vous est jamais montré.`
Signature : code géant espacé (ls .14em) encadré vert ; 3 sections numérotées ; footnote sécurité.

### S18 · Sheet « Produit prêt » — photo OK [état]
Le bouton 6 est remplacé par un bloc succès (r16 `padding:13px 15px` successBg/successFg IS400/13, coche 17, gap 9, fpPop .3s) : `Photo nette — produit + code visibles.` CTA 9 **activé** (vert + ombre).

### S19 · Sheet « Ajuster le stock »
Ouvert sur S05 (T08). **C31** (pas de max-height nécessaire).
1. Poignée. 2. SheetTitle `Ajuster le stock`.
3. **C15** mt 16 : valeur `{{n}} (7) unités`.
4. Note mt 11 IS400/12.5/1.5 `sub` : `Chaque ajustement est daté et motivé. Le stock affiché aux revendeuses est calculé côté serveur.`
5. **C07** mt 16 : `Enregistrer` (→ T10).


### S20 · Assistant Nouveau produit — 1/5 Catégorie
Route `view={s:'add'}` · dock MASQUÉ · structure : header fixe (`padding:16px 20px 0`) + contenu scrollable 18/20/120 + **C33** footer.
1. **C43 wizard** : BackBtn + `Nouveau produit` CardHeadline/16 + compteur `1/5` `sub` tnum.
2. **C32** mt 14 : 5 segments, 1er vert.
3. Titre StepTitle/26 : `Catégorie`.
4. Nuage de chips mt 16 gap 9 wrap — **C13 ×8** dans l'ordre : `Mode femme` (active par défaut) · `Mode homme` · `Chaussures` · `Sacs` · `Tissus` · `Beauté scellée` · `Maison` · `Enfant`.
5. Footer : C07 `Continuer` (actif).
Signature : dots de progression fins ; nuage de catégories pill.

### S21 · Assistant — 2/5 Détails & stock
1–2. Header `2/5`, 2 dots verts. 3. Titre `Détails & stock`.
4. Overline/11 mt 18 `NOM DU PRODUIT` ; **C16** mt 8, valeur vide, placeholder `Ex. Robe brodée bogolan`.
5. Overline mt 16 `VARIANTES (TAILLES…)` ; C16 mt 8, valeur `S, M, L`.
6. Overline mt 16 `STOCK DISPONIBLE` ; **C15** mt 8 : `5 unités` (bornes §4.4).
7. Footer : `Continuer` (actif — le nom vide n'invalide PAS l'étape ; le recap retombe sur `Robe brodée bogolan`, §9.5).

### S22 · Assistant — 3/5 Prix & commission
1–2. Header `3/5`, 3 dots. 3. Titre `Prix & commission`.
4. Overline mt 18 `PRIX DE BASE (CE QUE VAUT LE PRODUIT)` ; C15 mt 8 : `10 000 F` (pas ±500, min 500).
5. Overline mt 16 `COMMISSION REVENDEUSE (VOUS LA FINANCEZ)` ; C15 mt 8 : `1 000 F` (pas ±100, min 0).
6. **C19** mt 16 (sans overline) : `10 000 F / −1 000 F / −500 F` / `Vous recevez` **8 500 F** en NetXL/22 — recalcul LIVE à chaque pas de stepper.
7. Note mt 10 IS400/12.5/1.55 `sub` : `La cliente paie : prix de base + marge de la revendeuse. Votre commission n'est jamais ajoutée une deuxième fois au prix client.` (« jamais » gras).
8. Footer : `Continuer`.
Signature : double stepper monétaire + simulation de gains en direct.

### S23 · Assistant — 4/5 Photos (sans photos)
1–2. Header `4/5`, 4 dots. 3. Titre `Photos — Studio`.
4. Intro mt 10 IS400/14/1.55 `inkSoft` : `Le Studio vous guide pour des photos nettes, honnêtes et sans prix incrusté.`
5. **C07** mt 14 : caméra 18 + `Ouvrir Boutik+ Studio` (→ T20).
6. Footer : **C07 désactivé**, libellé `Photos requises`.

### S24 · Assistant — 4/5 Photos validées [état]
Le bouton 5 est remplacé par une **bannière succès** (C27/Succès, coche 17 align flex-start, 13/1.55) : `3 photos capturées et validées (héro · preuve · détail) — cadre premium appliqué.` Footer : `Continuer` (actif).

### S25 · Assistant — 5/5 Vérifiez, puis publiez
1–2. Header `5/5`, 5 dots. 3. Titre `Vérifiez, puis publiez`.
4. **C47 RecapCard** mt 16 : nom saisi (déf. `Robe brodée bogolan`) ; `Mode femme · variantes S, M, L · stock 5` ; `Vous recevez / vente` **8 500 F** ; `Commission revendeuse` **1 000 F**.
5. **C48 PreviewRevendeuse** mt 12.
6. Note mt 12 IS400/12.5/1.55 `sub` : `La modération vérifie catégorie, allégations et photos avant mise en ligne (quelques instants dans la démo).`
7. Footer : C07 `Publier — c'est gratuit` (→ T19).
Signature : carte aperçu « côté revendeuses » avec tuile verte 🧥.

### S26 · Studio — capture 1/3 Héro (lumière OK)
Route `view={s:'studio'}` · dock MASQUÉ · Scroll 16/20/60.
1. **C43** : BackBtn + [`Boutik+ Studio` ScreenTitle/19 ; sous-ligne IS400/12 `sub` : `De vraies photos — aucune image inventée par IA`].
2. Titre de prise mt 16 StudioTitle/20 : `1 · Photo héro`.
3. Sous-titre mt 6 IS400/13.5/1.5 `sub` : `Sur une surface simple. Elle recevra la mise en forme premium.`
4. **C39 Viewfinder** mt 13 (dégradé Tuile p1, glyphe 👗 opacité 1).
5. **C37 MetersList** mt 13 : `Luminosité OK · Netteté OK · Stabilité OK · Fond OK`.
6. [DEMO] toggle mt 12 — pill bouton H40 `padding:0 15px` r99 border `borderCtl` fond `surface` IS600/13 : `Simuler : faible lumière`.
7. **C07** mt 12 : caméra 18 + `Capturer` (actif) (→ T22).
8. Footer d'écran mt 14 IS400/12.5/1.55 `sub` : `Cette photo prouve l'accès au produit — pas la quantité ni l'authenticité. L'originale est conservée, jamais écrasée.`
Signature : viseur à cadre pointillé blanc + légende ; meters à 4 lignes ; promesse anti-IA sous le titre.

### S27 · Studio — faible lumière [état, DEMO]
Différences vs S26 : viseur → dégradé faible-lumière, glyphe opacité .5 ; meters : `Luminosité / Netteté / Fond` → `À corriger` (warn), `Stabilité OK` ; **bannière warn** supplémentaire mt 11 (r16, `12px 15px`, 12.5/1.5) : `Trop sombre — rapprochez-vous d'une fenêtre ou d'une lampe.` ; toggle libellé `Simuler : bonne lumière` ; **Capturer désactivé** (disabledBg/disabledFg sans ombre).

### S28 · Studio — capture 2/3 Preuve [état]
Comme S26 avec : titre `2 · Photo preuve` ; sous-titre `L'article en main, dans votre boutique. Une photo réelle qui inspire confiance (le désordre est permis).` ; glyphe 🤳.

### S29 · Studio — capture 3/3 Détail [état]
Titre `3 · Détail catégorie` ; sous-titre `Mode : étiquette de taille bien lisible.` ; glyphe 🏷️.

### S30 · Studio — Traitement en cours (proc=2)
Après la 3e capture. Header identique.
1. Titre mt 16 StudioTitle : `Traitement (sur votre téléphone)`.
2. **C38 ProcessingList** mt 13, 4 lignes : `Rotation corrigée` ✓ · `Lumière équilibrée — sans exagérer` ✓ · `Recadrage sûr depuis le cadre` … (pulse) · `Analyse du fond` ·
3. Footer d'écran (identique S26.8).
Cadence : proc passe 0→4, un tick toutes les 620ms.

### S31 · Studio — Traitement terminé (proc=4)
1. Titre + liste : 4 ✓.
2. **Bannière warn** mt 12 (r16 `13px 15px` 12.5/1.55, fpIn .3s) : `Fond complexe détecté → cadre premium appliqué (votre vraie photo, joliment encadrée). Aucun détourage risqué, aucune retouche du produit.` (« cadre premium appliqué » gras).
3. **Carte Avant/Après** mt 12 — Card/L `16px` sans ombre (fpIn .3s) : rangée [Overline/10.5 `AVANT / APRÈS` ↔ toggle pill H34 `padding:0 12px` r99 border `borderCtl` IS600/12 : `Couleurs d'origine` ⇄ `Voir la version traitée`] ; **C40** mt 12.
4. **C07** mt 12 (fpIn .3s) : `J'approuve ces photos` (→ T24).
5. Footer d'écran.
Signature : avant/après avec cadre crème 5px ; bannière « cadre premium » ; approbation explicite.

### S32 · Argent
Route `tab=argent` · dock visible · Scroll 16/20/150.
1. PageTitle `Argent`.
2. Sous-ligne mt 4 IS400/13/1.45 `sub` : `Pas de compte interne — tout arrive sur votre Mobile Money.`
3. **C20 MoneyHero** mt 16 : `EN ATTENTE` / `{{pending}} (18 700 F)` / pied `Versé ces 7 jours` ↔ `{{paid}} (12 750 F)`.
4. Overline/11 mt 18 mb 8 : `DÉTAIL PAR COMMANDE`.
5. Liste gap 10 — **C24 ×5** (ordre o1, o3, o7, o5, o9) :
   | code | nom | net | pill |
   |---|---|---|---|
   | CMD-2417 | Robe brodée bogolan | 8 500 F | À préparer |
   | CMD-2411 | Chemise Faso Dan Fani | 10 200 F | Photo à reprendre |
   | CMD-2409 | Sac cuir artisanal | 12 750 F | Versé |
   | CMD-2398 | Foulard Faso Dan Fani | 4 675 F | Refusé par la cliente |
   | CMD-2402 | Chemise Faso Dan Fani | 10 200 F | Refusé à l'enlèvement |
6. Overline mt 18 mb 8 : `RELEVÉS HEBDOMADAIRES` ; liste gap 9 — **C25 ×3** (§3.3).
7. **C09** mt 10 H46 IS600/13.5 : `Télécharger le relevé (PDF — démo)` [DEMO] (→ T28).
8. **Bannière info** mt 14 : `En cas de faute de votre part (mauvais article…), la cliente est remboursée immédiatement par le fonds de protection — rien n'est prélevé sur vous ; vos privilèges peuvent être réduits.` (« fonds de protection » gras).
Signature : carte verte texturée à gros montant ; net par commande avec pill d'état ; relevés hebdo.

### S33 · Niveau de confiance
Route `view={s:'trust'}` · dock MASQUÉ · Scroll 16/20/60.
1. **C43** : BackBtn + `Niveau de confiance`.
2. Intro mt 12 IS400/13.5/1.5 `sub` : `Votre niveau progresse par des livraisons propres — jamais par un dépôt d'argent.`
3. Colonne mt 14 gap 11 — **C36 ×3** :
   - `Provisoire` : `1 commande à la fois · paiement complet uniquement · vérification à chaque enlèvement · catégories approuvées.`
   - `Vérifié` (NIVEAU COURANT : border 2px verte + ombre + pill `Votre niveau`) : `12 livraisons · 0 faute — paiement à la livraison débloqué · plusieurs commandes en parallèle · meilleure visibilité.` (« paiement à la livraison débloqué » gras `greenDeep`).
   - `De confiance` : `Après un solide historique : plus de commandes simultanées, contrôles allégés quand c'est sûr, campagnes prioritaires.`
4. **Bannière warn** mt 13 : `Une faute répétée réduit l'accès (retour au prépaiement, suspension) — c'est l'accès au marché qui compte, pas une caution.`
Signature : carte du niveau courant surélevée et bordée vert.

### S34 · Inscription — 1/5 Bienvenue
Route `view={s:'onboard'}` · même squelette que le wizard (header + dots + contenu 18/20/120 + footer).
1. Header : BackBtn + `Inscription` + `1/5`. 2. Dots (1 vert).
3. Titre StepTitle : `Bienvenue sur Boutik+`.
4. Corps mt 12 IS400/14.5/1.55 `inkSoft` : `Proposez vos produits aux revendeuses de Ma Boutique. Séra livre, vous encaissez.`
5. **Bannière info** mt 14 (`15px 16px`, 13/1.65) : `Inscription gratuite · aucun dépôt · aucune caution · aucun abonnement.` ↵ `Vous payez seulement 5[NBSP]% quand un produit est vendu avec succès.` (« 5 % » et « vendu avec succès » gras).
6. Footer : C07 `Continuer`.

### S35 · Inscription — 2/5 Votre numéro
3. Titre `Votre numéro`. 4. Overline mt 18 `TÉLÉPHONE` ; C16 mt 8 (inputMode tel), valeur `70 12 34 56`. 5. Bannière info mt 12 : `Un code de vérification arrive par WhatsApp (simulé ici).` [DEMO]. 6. Footer `Continuer`.

### S36 · Inscription — 3/5 Votre boutique
3. Titre `Votre boutique`. 4. `NOM DE LA BOUTIQUE` + C16 `Ma nouvelle boutique`. 5. `QUARTIER` (mt 16) + C16 `Rood Woko`. 6. `REPÈRE — PAS D'ADRESSE EXIGÉE` (mt 16) + C16 `Allée 4, face au grand portail est`. 7. Footer `Continuer`.
Signature : le champ « repère » remplace l'adresse.

### S37 · Inscription — 4/5 Compte de versement
3. Titre `Compte de versement`. 4. `MOBILE MONEY (ORANGE / MOOV)` + C16 tel `70 12 34 56`. 5. Bannière info mt 12 : `Vos gains y sont versés sous 24[NBSP]h après chaque livraison validée. Aucun rechargement demandé.` (« sous 24 h » gras). 6. Footer `Continuer`.

### S38 · Inscription — 5/5 Statut provisoire
3. Titre `Statut provisoire`. 4. Corps mt 12 IS400/14.5/1.55 `inkSoft` : `Pour commencer, votre compte est provisoire :` (« provisoire » gras).
5. **Card/L** mt 12 (`16px 17px`, IS400/14/1.8) : `• Une commande à la fois pour commencer` ↵ `• Seulement les catégories autorisées` ↵ `• La cliente paie tout à la commande` ↵ `• Une photo « produit prêt » est demandée` ↵ `• Le livreur vérifie chaque enlèvement`.
6. Note mt 12 IS400/13/1.55 `sub` : `Après quelques livraisons propres, vous devenez Vérifié : plus de commandes, paiement à la livraison débloqué.` (« Vérifié » gras `greenDeep`).
7. Footer : C07 `Créer mon compte gratuit`.

### S39 · Inscription — Compte créé
Plein écran centré (`padding:0 34px`, colonne centrée, texte centré), dock MASQUÉ.
1. Cercle 84×84 r99 fond `green`, ombre celebCircle, coche 40 stroke `cream` 2.4, entrée fpPop .45s.
2. Titre mt 20 StepTitle/26 : `Compte provisoire créé`.
3. Citation mt 10 IS400/14/1.6 `sub` : `« Listez gratuitement. Vous payez seulement lorsqu'un produit est vendu avec succès. »`
4. **C07** mt 24 pleine largeur BtnM/15.5 : `Explorer avec Boutique Wendkuni (démo)` [DEMO] (→ T27).

### S40 · Célébration versement
Overlay z90 plein cadre `celebScrim`, colonne centrée, `padding:0 32px`, fpFade .25s, tap = fermer, auto-fermeture 2200ms.
1. Tirets or 132×6 (§1.5).
2. Cercle mt 24, 78×78 r99 fond `cream`, coche 36 stroke `green` 2.6, fpPop .5s.
3. Montant mt 20 CelebAmount tnum `cream` : `{{net}} (12 750 F pour o7)`.
4. Label mt 8 CelebLabel `gold` : `VERSÉ SUR VOTRE MOBILE MONEY`.
5. Hint mt 14 IS400/12 `rgba(246,241,231,.65)` : `Toucher pour continuer`.
6. Tirets or mt 24.
Signature : rituel « tissé » or sur vert profond ; montant héroïque.

---

## §6 · ÉTATS & CAS LIMITES

| Contexte | Règle exacte |
|---|---|
| Accueil sans todo | Section 4–5 absente (header + liste). La grille stats remonte à mt 16 sous la sous-ligne. |
| Accueil sans échéance | Carte 9 absente. |
| Alerte stock | Peuplée par `stock ≤ 4` → seed : `1 produit`, texte `Sac cuir artisanal (4) — pensez à reconfirmer vos quantités.` Format item : `{name} ({stock})`, joints par ` · `. La carte est TOUJOURS affichée (fallback statique si liste vide, §9.6). |
| Segment vide (Commandes) | C28 `Rien ici pour l'instant.` — seul « En cours » est vide au seed. |
| Fiche : stock ≤ 4 | Pill stock warnBg/warnFg ; sinon successBg/successFg. Tuile : texte stock warnFg. |
| Fiche : sizes null | Ligne « Variantes : … » absente (p3, p7). |
| Wizard 4/5 | CTA footer désactivé + libellé `Photos requises` tant que Studio non approuvé. |
| Sheet Produit prêt | CTA désactivé sans photo ; le sheet s'ouvre TOUJOURS avec readyShot=false (reprise incluse). |
| Studio low | Capturer désactivé ; 3 meters en À corriger ; Stabilité reste OK. |
| Toasts multiples | Pile verticale (les plus récents dessous), chacun vit 2800ms indépendamment. |
| Détail : bouton [DEMO] | Visible ssi showDemoControls ∧ statut dans le flux ∧ index ≥ 1 ∧ non dernier. Jamais sur FUNDED, PAID, ni statuts hors flux. |
| Pills/chips/montants | `white-space:nowrap` obligatoire ; sous-titres de rangées : ellipsis 1 ligne. |
| Titres longs (fiche) | nowrap + ellipsis dans le header empilé. |
| Dock | Masqué dès que view≠null (fiche, détail, wizard, studio, trust, inscription, succès). Sheets/célébration/toasts le recouvrent sans le masquer. |
| Salutation | `Nd'waoga, {ownerName}` — apostrophe U+2019, virgule + espace. |
| Grands nombres | Steppers B sans borne haute — la valeur `999 500 F` doit tenir sans wrap (tnum, la carte s'élargit pas : texte centré, taille fixe 19). |
| prefers-reduced-motion | TOUTES animations et transitions coupées (`animation:none; transition:none`). |

## §7 · MOTION (exhaustif)

| Nom | Trigger | Propriétés (from → to) | Durée / easing |
|---|---|---|---|
| fpIn | Entrée de chaque écran ; blocs post-traitement Studio (.3s) | opacity 0→1 ; translateY 14px→0 | .32s cubic-bezier(.2,.8,.2,1) |
| fpUp | Entrée des sheets | opacity .4→1 ; translateY 44px→0 | .34s cubic-bezier(.32,.72,.25,1) |
| fpFade | Scrims (sheets .2s ; célébration .25s) | opacity 0→1 | ease |
| fpToast | Entrée toast | opacity 0→1 ; translateY −14px→0 ; scale .96→1 | .25s cubic-bezier(.2,.8,.2,1) |
| fpPop | Coches succès (célébration .5s, inscription .45s, photo OK .3s) | scale .6→1.06 (60%)→1 ; opacity 0→1 | cubic-bezier(.2,.8,.2,1) |
| fpShimmer | Skeleton | background-position −320px→320px | 1.2s linear infinite |
| fpPulse | Dot timeline courant (1.2s) ; marque « … » traitement (1s) | opacity 1→.35 (50%)→1 | ease infinite |
| Tween compteurs | T01/T02/T15/T16 | valeur 0/préc → cible, arrondi entier | 800ms, ease-out cubique `1−(1−k)³`, rAF |
| Press | touch-down boutons | scale (§1.7) | .15s |
| Ombre CTA Accueil | press | btnPrimary → btnPrimaryPressed | .2s |
| Dots wizard | changement d'étape | background | .3s |
| Chips/tabs | sélection | background/color | .2s |
| Viseur Studio | toggle low | background ; opacité glyphe | .4s |
| Avant/Après | toggle orig | background | .3s |
| Timers | — | skeleton 750ms · toast 2800ms · modération 6000ms · tick traitement 620ms ×4 · célébration 2200ms |

## §8 · QA / ACCEPTATION (vérifiable mécaniquement)

Premier rendu (après 750ms de skeleton, props par défaut) :
1. Accueil affiche exactement : `Nd'waoga, Rasmané` · `Boutique ouverte · 4 produits en ligne · aucun dépôt exigé, jamais.` · badge todo `2` · rangées `CMD-2417` (pill `À préparer`) puis `CMD-2411` (pill `Photo à reprendre`) · `18 700 F` (En attente) et `12 750 F` (Versé, en #0B5B47) après tween 800ms · pill stock `1 produit` · texte `Sac cuir artisanal (4) — pensez à reconfirmer vos quantités.` · échéances `11 h 30` et `11 h 00`.
2. Produits : 4 tuiles, prix `10 000 F / 15 000 F / 5 500 F / 12 000 F`, `stock 4` en #7A5104, les 3 autres en #6F6355.
3. Commandes : compteurs `2 / 0 / 1 / 2` ; « En cours » → `Rien ici pour l'instant.`
4. Argent : héro `18 700 F` ; 5 rangées avec nets `8 500 / 10 200 / 12 750 / 4 675 / 10 200 F` ; relevés `12 750 / 21 400 / 9 200 F`.
5. Fiche p1 : `10 000 F / −1 000 F / −500 F / 8 500 F` ; pill `7 dispo.` ; `Variantes : S · M · L`.
6. Détail o1 : timeline 10 étapes, 1re en pulse ; sheet → code `WK-472` ; CTA sheet inactif avant photo, actif après ; confirmation → pill `Prêt — enlèvement`, toast `Prêt — Issa (Séra) est notifié`.
7. Wizard : recap étape 3 = `8 500 F` avec défauts ; publication → tuile 5 `EN MODÉRATION`, badge disparu à +6s ±0,2s ; deux toasts T19 dans l'ordre.
8. Studio : 3 captures → 4 ticks à 620ms → avant/après → approbation → étape 4/5 verte, CTA `Continuer`.
9. Simulation jusqu'à PAID : célébration `8 500 F` (o1) visible ~2,2s ; Argent : En attente `10 200 F`, Versé `21 250 F`.
10. Invariants : aucune scrollbar visible ; aucun wrap dans pills/chips/montants ; dock absent sur fiche/détail/wizard/studio/trust/inscription ; zone 54px + liseré 6px sur tous les écrans ; séparateur de milliers insécable ; apostrophes U+2019.

## §9 · INCERTITUDES SIGNALÉES (décisions gelées, pas devinées)

1. **Séparateur de milliers** : `toLocaleString('fr-FR')` rend U+202F (moteurs récents) ou U+00A0 (anciens). Gelé : **U+202F**, fallback U+00A0 accepté.
2. **Line-heights non définis** en source (titres, montants) : gelés à 1.2 (§1.2).
3. **Zone statut** : le prototype la laisse vide (le cadre iPhone du démo web dessine l'heure/batterie). En RN : status bar système, fond `bg`, style dark-content.
4. **READY_FAILED / PICKUP_REFUSED / BUYER_REFUSED** partagent le rendu « timeline grise + carte interrompue » (le code traite tout statut hors flux ainsi). Assumé volontaire.
5. **Wizard 2/5** : nom vide n'empêche pas de continuer ; le recap et la publication retombent sur `Robe brodée bogolan`. Assumé volontaire (démo) — à revalider avant prod.
6. **Alerte stock** : si aucun produit ≤ 4, le code affiche quand même la carte avec un texte statique de secours (`Sac cuir artisanal (4) · Chemise Faso Dan Fani (5)`, pill `2 produits`). Incohérence potentielle assumée : conserver tel quel.
7. **Glyphes steppers** : moins U+2212, plus U+FF0B (pleine chasse) — intentionnel pour l'équilibre optique.
8. **Placeholder input** : couleur non définie en source ; gelée à `sub` 60 % (§C16).
9. **Toasts** : pas d'animation de sortie (retrait sec à 2800ms). Tel quel.
10. **Champs inscription/wizard** : `onChange` web = par frappe ; RN : `onChangeText`. Les valeurs préremplies de l'inscription sont des `defaultValue` non contrôlés (aucune validation).
