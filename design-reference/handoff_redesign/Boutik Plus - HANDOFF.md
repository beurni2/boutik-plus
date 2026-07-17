# BOUTIK+ — Spec d'implémentation complète (redesign premium)

Prototype pixel-vérité : `Boutik Plus - Redesign.dc.html` (styles inline, greppables) · Planche : `Boutik Plus - Ecrans.dc.html` (11 vues) · Rôle : app **vendeur**.

---

## 1 · Tokens

| Token | Valeur |
|---|---|
| Papier (fond app) | `#F4EFE6` |
| Carte | `#FFFFFF` |
| Encre (texte fort) | `#1C1710` |
| Corps | `#4A3F33` · Sous-texte `#6F6355` · Inactif `#8A7D6B` |
| Hairline carte | `#EDE4D3` · bordure chip/input `#E5DCC9` · divider interne `#F3EDDE` |
| Fond dim | `#EFE8DA` · CTA désactivé `#DDD5C3` / texte `#8A7D6B` |
| **Accent** | `#0B5B47` · deep `#073B2E` · soft `#E4EFE9` · sur-accent `#F6F1E7` |
| Or (bande) | `#C89A3F` |
| ok | fg `#14603A` bg `#DFEEE3` · warn | fg `#7A5104`/`#5F4403` bg `#F6E9C8` · danger | fg `#8C1D18`/`#7E1A15` bg `#F8E1DE` · muted | fg `#6F6355` bg `#EFE8DA` |

**Type** — Bricolage Grotesque (display) / Instrument Sans (UI). Argent & codes : toujours `font-feature-settings:'tnum'` + `white-space:nowrap`, format `fr-FR` + " F".

| Style | Spec |
|---|---|
| Titre écran | Bricolage 800 · 28px · ls −.02em |
| Titre vue (avec retour) | Bricolage 800 · 19px |
| Héros argent | Bricolage 800 · 38px (carte stat : 24px) |
| Wordmark | Bricolage 800 · 19px · monogramme 40px radius 14 accent |
| Titre rangée | 700 · 14.5px · Corps | 13–14.5px lh 1.5 |
| Label caps | 700 · 10.5–11px · ls .1em · uppercase · `#6F6355` |
| Pilule statut | 700 · 11px · padding 5×10 · radius 99 · nowrap |
| CTA | Bricolage 700 · 16px |

**Géométrie** — cadre 402×874 · spacer statut 54px · **bande tissée 6px** `repeating-linear-gradient(90deg,#0B5B47 0 18px,#F4EFE6 18px 24px,#C89A3F 24px 32px,#F4EFE6 32px 38px)` · padding contenu 20px · bas de scroll 150px (onglets) / 60px (vues) · radii : carte 20, rangée 18, art 13–14, bouton 16 (sec. 14), sheet 30 haut, pilule 99.

**Ombres** — carte `0 1px 2px rgba(28,22,15,.04)` (+`0 10px 30px -16px rgba(28,22,15,.14)` si cliquable) · CTA `0 12px 26px -10px rgba(11,91,71,.5)` · héros `0 16px 36px -14px rgba(11,91,71,.55)` · art héro `0 16px 36px -16px rgba(28,22,15,.35)` · sheet `0 -18px 50px rgba(24,18,11,.25)`.

## 2 · Recettes de composants (CSS exact)

- **Carte** : `padding:16–17px;border-radius:20px;border:1px solid #EDE4D3;background:#FFF;box-shadow:(carte)`.
- **Rangée liste** : bouton flex `gap:12px;padding:13px;border-radius:18px` ; art 48–52 radius 13–14 ; colonne `flex:1;min-width:0` (titre 14.5/700, sous-titre 12.5 `#6F6355` ellipsis) ; pilule à droite. Press `scale(.98)` .15s.
- **Tuile produit** (grille 2 col, gap 12) : radius 18 overflow hidden ; art h108 ; badge coin `top:8;left:8` 10/700 radius 99 (`EN PAUSE` bg `rgba(28,23,16,.72)` fg `#F6F1E7` ; `EN MODÉRATION` warn) ; corps padding 11 12 12 : nom 13.5/700 lh1.25, ligne prix : prix Bricolage 800 14 deep ↔ `stock N` 11.5/600 (warn si ≤4, `nowrap;flex:none`).
- **Art produit** : `background:linear-gradient(140deg,A,B)` + calque `repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 8px,transparent 8px 20px)` (10/26 sur grands) + glyphe `drop-shadow(0 3px 6px rgba(0,0,0,.25))` — *placeholder photo réelle*.
- **Chip segment** : h38 padding 0 14 radius 99 `1.5px` bordure ; actif : bordure accent + bg soft + texte deep ; compteur 11/700 tnum opacité .75.
- **Stepper** : boutons − / ＋ cercles 52px bordure `#E5DCC9` (press scale .9) ; valeur `flex:1;text-align:center;padding:13px;radius:16;` Bricolage 800 19 tnum.
- **Lignes d'argent** : rangée `font-size:14px;padding:6px 0` (déductions : couleur `#6F6355`, préfixe −) ; **total** `border-top:1.5px dashed #E5DCC9;padding-top:12px`, libellé 700 15, valeur Bricolage 800 20–22 deep.
- **Timeline** : puce 14px bordure 2.5 (`#0B5B47` fait/courant, `#E0D6C2` à venir), fait = remplie, courant = `fpPulse 1.2s` ; barre 2.5px (`#0B5B47` fait, `#E8DFCC`) min-h 16 ; libellé 13.5 (700 fait/courant encre ; 500 `#8A7D6B`).
- **Sheet** : scrim `rgba(24,18,11,.45)` fade .2s ; panneau `#FCF9F2` radius 30 haut, padding `10px 22px 44px`, poignée 40×5 `#DDD2BC`, entrée `fpUp .34s cubic-bezier(.32,.72,.25,1)`.
- **Toast** : pilule encre `#1C1710` fg `#F6F0E4` 13/600, check vert clair, top 66, `fpToast .25s`, TTL 2 800 ms.
- **Dock onglets** : abs bas, `padding:8px 10px 28px;background:rgba(252,249,242,.88);backdrop-filter:blur(18px);border-top:1px solid #EBE2D0` ; item colonne gap 3, radius 14, label 10.5/700 ; actif bg `#E4EFE9` fg `#073B2E` ; icônes 24px stroke 1.9 currentColor (maison, étiquette, cube, franc). Jamais d'emoji.
- **Champ** : 16px, padding 14–15, radius 14, bordure 1.5 `#E5DCC9` ; focus bordure accent + `box-shadow:0 0 0 3px rgba(11,91,71,.12)`.
- **CTA sticky** : `position:absolute;left/right/bottom:0;padding:14px 20px 40px;background:linear-gradient(transparent,#F4EFE6 32%)`.
- **Barre d'assistant** : 5 segments h4 radius 99, accent jusqu'à l'étape courante.
- **Bouton démo** : h46 radius 14 `1.5px dashed #C9BDA3` fg `#6F6355` — flag `showDemoControls`, à retirer en prod.
- **Squelette** : blocs aux dimensions réelles, `linear-gradient(90deg,#ECE4D4 25%,#F6F1E7 50%,#ECE4D4 75%);background-size:640px 100%;animation:fpShimmer 1.2s linear infinite`, 750 ms.
- **Célébration versement** : scrim `rgba(7,59,46,.95)` ; 2 barres 132×6 `repeating-linear-gradient(90deg,#C89A3F 0 12px,transparent 12px 20px)` ; disque 78 `#F6F1E7` + check vert `fpPop .5s` ; montant Bricolage 800 34 `#F6F1E7` ; caps or « VERSÉ SUR VOTRE MOBILE MONEY » ; « Toucher pour continuer » ; auto 2 200 ms, tap = skip.

## 3 · Modèle de données & math

```
Produit { id, name, cat, B, C, stock, sizes?, glyph, bg(duotone), paused, mod }
Commande { id, code, pid, mode:'A'|'B', variant?, status, challenge, reason?, buyer{name,zone}, history[{ts,l}] }
```
- `fee = round(B × 0.05)` · `net = B − C − fee`.
- **En attente** = Σ net hors {PAID, BUYER_REFUSED, PICKUP_REFUSED, RETURNED} (READY_FAILED **compte**) · **Versé** = Σ net des PAID.
- Seed : p1 10 000/1 000 (net 8 500) · p3 15 000/1 500 (12 750) · p7 5 500/550 (4 675) · p8 12 000/1 200 (10 200). o1 FUNDED (p1·M, WK-472) · o3 READY_FAILED (p8·L) · o7 PAID (p3) · o5 BUYER_REFUSED (p7) · **o9 PICKUP_REFUSED** (p8·M, « variante M au lieu de L », WK-655). ⇒ attente **18 700 F**, versé **12 750 F**.
- Flux statut A : FUNDED→READY→TRANSIT→ARRIVED→INSPECT→HANDOFF→DELIVERED→PAID · B : + AWAIT_PAY→PAY_OK avant HANDOFF. Libellés/couleurs : cf. `stMeta` dans le prototype.
- Compte-à-rebours argent : rAF 800 ms, easing `1−(1−k)³` ; relancé à l'entrée d'onglet et à tout changement de statut.

## 4 · Machine d'état & transitions

`{ loading, tab, view, seg, sheet, readyShot, stkDelta, products, orders, wiz, studio, ob, toasts, counters, celebr, pseq }`

| Événement | Transition | Effets |
|---|---|---|
| mount | loading 750 ms → false | syncMoney() |
| tab (dock) | `{tab, view:null}` | tween héros si home/argent |
| ouvrir vue | `view:{s,…}` | dock masqué, `fpIn` |
| retour | `view:null` | — |
| « Produit prêt »/« Reprendre »/« Corriger » | `sheet:'ready', readyShot:false` | — |
| « Prendre la photo » | `readyShot:true` | pop ok |
| Confirmer | status→READY, sheet null | history + toast « Prêt — Issa (Séra) est notifié » |
| Ajuster stock | `sheet:'stock', stkDelta:0` ; ± ; Enregistrer | stock += delta, toast |
| Pause produit | `paused:!paused` | toast (2 libellés) |
| Assistant : Continuer | step+1 ; étape 4 verrouillée tant que `!wiz.photos` (CTA « Photos requises » désactivé) | — |
| Studio : Capturer ×3 | step 0→1→2→3 ; désactivé si `low` | à l'étape 3 : chaîne 620 ms ×4 (`proc` 0→4) |
| Studio : J'approuve | `wiz.photos=true`, retour vue add | toast « Photos canoniques prêtes… » |
| Publier | crée produit `mod:true`, tab produits | toast modération ; **6 000 ms** → `mod:false` + toast « approuvé — en ligne » |
| Simuler (démo) | status → étape suivante du flux | history ; si PAID → `celebr` (2 200 ms) + syncMoney |
| Inscription | ob.step 0→4 → écran succès (step 5) | Terminer → toast |

Steppers : B ±500 (min 500) · C ±100 (min 0) · stock ±1 (min 1). Fiche stock : min 0.

## 5 · Écrans (anatomie, ordre exact d'empilement)

**Accueil** — en-tête (monogramme BW · wordmark · `{shopName} · Rood Woko` ellipsis · chip ✓ Vérifié→Confiance) ; « Nd'waoga, {ownerName} » 28 ; phrase d'état ; **À faire maintenant** (caps + compteur danger ; rangées : art 52, `code · nom · variante`, consigne selon statut, pilule) ; stats 2 col (En attente / **Versé** en deep) ; CTA « + Ajouter un produit » ; carte **Alerte stock** (triangle warn 17px, pilule pluralisée `1 produit`/`N produits`, noms + stocks) ; carte **Échéances du jour** (chips horaires : `11 h 30` préparer+photo si FUNDED · `11 h 00` reprendre si READY_FAILED · `11–13 h` enlèvement si READY) ; note verte gratuité + lien souligné « Voir le parcours d'inscription vendeur ».

**Produits** — titre + `{n} en ligne · photos sans prix incrusté` ; CTA soft « Lister un produit — gratuit » ; grille tuiles (badges pause/modération).

**Fiche produit** — retour · nom ellipsis · pilule (En ligne ok / En pause muted / **En modération** warn) ; art héro h180 r22 ; chips « 3 revendeuses le proposent » (soft) + catégorie (muted) ; carte **Vos gains sur ce produit** (B, −C, −5 %, total « Vous recevez » + note verrouillage/24 h) ; carte **Stock** (pilule `N dispo.` ok/warn, variantes, ghost « Ajuster le stock ») ; Modifier (soft) / Pause (ghost) ; carte **Activité** (3 puces).

**Commandes** — titre ; chips segments + compteurs (À traiter=FUNDED+READY_FAILED · En cours · Terminées · Incidents=refus/retours) ; rangées ; vide = encart pointillé « Rien ici pour l'instant. »

**Détail commande** — retour · code tnum · pilule ; carte produit (art 52, `nom · taille`, `Qté 1 · zone · mode`) ; carte **Votre gain — verrouillé** ; blocs d'état : FUNDED (note warn préparation 11 h 30 + CTA ✓ Produit prêt) · READY_FAILED (note danger « trop sombre » + CTA 📷) · **PICKUP_REFUSED** (note danger motif + fonds de protection + CTA ↻ « Corriger et re-proposer ») · DELIVERED/PAID (note ok) ; carte **Suivi** (timeline ; interrompu → note danger dans la carte) ; bouton démo « ▶ Simuler l'étape suivante — {label} » ; carte **Historique** (récent d'abord, `ts` tnum 600).

**Sheet Produit prêt** — titre ; caps « 1 · Code de préparation (valable 15 min) » ; cadre bordé accent : `WK-472` Bricolage 800 34 ls .14em + « Écrivez ce code sur un papier posé à côté du produit. » ; caps « 2 · Photo de préparation » → bouton soft caméra ⇄ note ok pop « Photo nette — produit + code visibles. » ; caps « 3 · Disponibilité » (créneau 11 h–13 h) ; CTA « Confirmer — envoyer à Séra » (désactivé sans photo) ; footer « Le code client de livraison ne vous est jamais montré. »

**Assistant Nouveau produit** — header retour + « Nouveau produit {i}/5 » + barre 5 segments ; étapes : ① Catégorie (8 chips) ② Détails & stock (nom, variantes, stepper) ③ **Prix & commission** (2 steppers + carte récap live + « jamais ajoutée une deuxième fois ») ④ Photos — Studio (CTA vert / note ok 3 photos) ⑤ Vérifiez puis publiez (récap + **Aperçu — ce que verront les revendeuses** : art 56, nom, « photo premium, sans prix incrusté », commission) ; CTA sticky (« Continuer » / « Photos requises » désactivé / « Publier — c'est gratuit »).

**Studio** — header + « De vraies photos — aucune image inventée par IA » ; 3 prises (`1 · Photo héro` / `2 · Photo preuve` (désordre permis) / `3 · Détail catégorie` (étiquette taille)) : cadre h230 r22, pointillés blancs inset 20, légende à bottom:30 **dans** le cadre, glyphe opacité .5 si sombre ; carte 4 vumètres (OK ok-pill / À corriger warn) ; chip « Simuler : faible/bonne lumière » ; CTA 📷 Capturer (désactivé si sombre) ; **Traitement** : 4 lignes (✓ / … pulsé / ·) → note warn « **cadre premium appliqué** — aucun détourage risqué » + carte Avant/Après (originale conservée en privé / publique **sans prix**, bordure 5px papier + ombre, toggle « couleurs d'origine ») + CTA « J'approuve ces photos » ; footer loi (« prouve l'accès… l'originale jamais écrasée »).

**Argent** — titre + « Pas de compte interne — tout arrive sur votre Mobile Money. » ; **héros vert** (weave, caps EN ATTENTE, 38px, divider, « Versé ces 7 jours » 17px) ; « Détail par commande » (net + pilule par rangée) ; **Relevés hebdomadaires** (3 rangées semaine/versements/total) + ghost « Télécharger le relevé (PDF — démo) » ; note protection (fonds — « rien n'est prélevé sur vous ; vos privilèges peuvent être réduits »).

**Niveau de confiance** — 3 cartes ; « Vérifié » = bordure 2px accent + ombre + pilule « Votre niveau » + « **paiement à la livraison débloqué** » ; note warn « l'accès au marché, pas une caution ».

**Inscription vendeur** — 5 étapes (Bienvenue/gratuité 5 % · Numéro/WhatsApp · Boutique avec **repère, pas d'adresse exigée** · Mobile Money 24 h · Statut provisoire 5 règles) + succès (disque check pop, citation, CTA démo).

## 6 · Motion

| Nom | Durée / easing | Usage |
|---|---|---|
| fpIn | .32s `cubic-bezier(.2,.8,.2,1)` | entrée d'écran (opacity + 14px) |
| fpUp | .34s `cubic-bezier(.32,.72,.25,1)` | sheets |
| fpPop | .3–.5s overshoot | checks, disque succès |
| fpPulse | 1.2s | étape courante, traitement |
| fpToast | .25s | toasts |
| fpShimmer | 1.2s linear | squelettes |
| press | scale .98 (chips .95–.96, ronds .9–.92) .15s | tout tappable |
| compte-à-rebours | 800 ms rAF cubic-out | héros argent |
| célébration | fade .25 + pop .5, auto 2 200 ms | versement |
`prefers-reduced-motion:reduce` ⇒ tout à `none`.

## 7 · Props / QA / checklist

Props : `shopName`, `ownerName`, `startTab`, **`startView`** (home·produits·commandes·argent·product·order·incident·add·studio·trust·onboard — monte n'importe quelle vue, utilisé par la planche), `showDemoControls`.
**Acceptance** : totaux 18 700/12 750 au premier rendu après compte-à-rebours · flux o1 jusqu'à PAID déclenche la célébration et bascule les totaux · publication passe par EN MODÉRATION 6 s · étape 4 de l'assistant impubliable sans Studio · o9 propose « Corriger et re-proposer » et repasse READY via la sheet · aucun scrollbar visible · aucun texte français coupé en 2 lignes dans pilules/chips (nowrap) · dock absent sur toutes les vues empilées.
