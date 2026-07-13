# Boutik+ — la galerie des états (WO-6.0, Grand Teint)

Le dépôt boutik est **RN-only, sans moteur de rendu web** : sa galerie est ce
document + l'aperçu Expo Go (loi WO-4.1). Chaque état ci-dessous nomme **comment
l'atteindre**, **ce qui s'affiche** (copie exacte du catalogue), et le test des
5 secondes. Tout l'argent vient de la cascade épinglée (`computeWaterfall` +
`assertQuoteReconciles`) et se réconcilie au franc.

**Portée des états (loi de l'état manquant).** Seuls **B4–B7 sont prototypés**
(`flows.md` : « Boutik+ B1–B3, B8–B11 · écrans restants à dessiner »). Leurs
états within-screen sont dictés par le rail du prototype et **tous couverts**
ci-dessous. B1–B3 et B8–B11 n'ont pas de maquette : ils reçoivent des états
honnêtes de base (vide/liste/état), **jamais des sous-états inventés**.

Cadre permanent : bandeau « Aperçu — bac à sable » (preview) ; sous chaque écran,
« Simuler hors ligne » et « Recommencer la démo » (remet tout à zéro, un geste).

---

## B1 · Accueil — data-driven (3 modes)
- **Normal.** Deux compteurs honnêtes (« Produits prêts » · « À corriger »),
  une action principale « Mes produits », l'inscription en second, et les liens
  discrets (Échéances · Mes recettes · Modération). *5 s : voilà ma boutique.*
- **Colis refusé** (un produit « À corriger » existe → seed p6). Un bandeau mène :
  « Un colis a été refusé. Vous pouvez corriger — la commande reste protégée. »
  *Trust : le refus mène, digne ; la commande reste protégée (jamais puni).*
- **Échéance urgente** (un délai ≤ 60 min ou dépassé → seed p7/p8). Un bandeau
  horloge : « Une échéance approche. Corrigez avant ce soir 18 h. »

## B2 · Mes produits — liste / vide
- **Liste** (défilante, `getItemLayout`) : 8 produits d'essai, repère de
  quartier, « Vous recevrez X F » (cascade réelle), chip d'état (Prêt · En
  attente · À corriger · Correction · Délai passé).
- **Vide** (`world.products.length === 0`) : état désigné, jamais triste —
  « Aucun produit pour l'instant. Ajoutez votre premier produit. » + l'action.

## B3 · Comment ça marche — inscription
L'inscription gratuite, une action ; « Boutik+ et Shop+ ne gagnent que lorsque
votre produit est vendu. »

## B4 · Le Studio *(prototypé — rail complet)*
- **Catégorie.** Neuf familles réelles (Mode · Tissus · Chaussures · Sacs &
  accessoires · Beauté scellée · Maison · Petit électroménager · Enfants & bébé ·
  Artisanat), chacune avec son conseil de cadrage.
- **Permission « ask »** (`canAskAgain`) : « Le Studio a besoin de la caméra… » +
  « Autoriser la caméra » ; « Continuer sans photo » chuchote.
- **Permission « refusée »** (`!canAskAgain`) : « Pas d'appareil photo ? Pas
  grave. Continuez sans photo pour la démo. » — le repli honnête MÈNE, réessayer
  chuchote. *(L'import galerie du prototype demande une dépendance hors WO-6.0 ;
  le repli « sans photo » tient sa place, honnêtement.)*
- **Cadrage 1/2 (héro)** puis **2/2 (preuve)** : la caméra DEVIENT l'écran ;
  conseil en bandeau + rappel de catégorie ; bouton de prise sous le pouce.
- **Échec capture** : chip digne « La photo n'a pas pu être prise — réessayez. »
  (aperçu : ligne « détail : … », preview-only).

## B5 · L'aperçu WYSIWYG *(prototypé)*
- **Héro** puis **preuve** : « Ce que l'acheteur verra » — exactement les octets
  gardés (EXIF retiré à la prise, WO-4.2E). « Reprendre » pèse le même geste que
  « Garder ».

## B6 · L'offre *(prototypé — rail complet)*
Deux champs : **Votre prix** (éditable, pavé numérique) · **La part de la
revendeuse** (fixée dans cette tranche) + « Une part motivante fait vendre plus
vite. C'est vous qui décidez. »
- **Vide (0 muet)** : champ effacé → « Vous recevrez » muet, CTA bloqué.
- **Saisie / filet d'eau en direct** : à 10 000 F → « Vous recevrez 8 500 F » ;
  réconcilie « 8 500 = 10 000 − 1 000 − 500 — chaque franc a sa place. »
- **Sous le plancher** (prix < 5 000 F) : refus doux (warningTint, jamais rouge)
  « Prix trop bas. Le minimum est 5 000 F. » ; CTA « Publier l'offre » bloqué,
  la raison portée sur le bouton.
- **Offre v2** (offre atteinte depuis un produit déjà listé) : bandeau « Version
  2 de votre offre. La v1 reste servie tant que la v2 n'est pas validée. »

> **⏳ ouvert (signalé) :** le plancher **5 000 F** est le MINIMUM du Build Spec
> B+4 (« category floor ≥5,000 FCFA »), déjà porté par `offer.floor_block`. La
> liste finale des planchers par catégorie est une Décision ouverte ; le bundle
> montre 8 000 F (vêtements, copy.md) et 4 000 F (exemple components.md, **sous**
> le minimum). **Le canon (Build Spec) gouverne le prototype** : la démo tient le
> minimum et n'invente aucune valeur par catégorie.

## B7 · Produit prêt *(prototypé — 4 états)*
Carte « Payée » (commande payée en amont — le vendeur prépare, ne revendique
jamais le paiement) : « Commande payée. Préparez le colis — Séra viendra le
chercher. »
- **À confirmer** : la barrière à deux points (« Le colis correspond à la
  photo » · « Fermé, prêt à partir ») ; « Confirmer : produit prêt » bloqué tant
  que les deux ne sont pas cochés (« Cochez les deux points d'abord. »).
- **Attente réseau** (en ligne → l'attente opérateur) : « Envoyé — en attente de
  confirmation. Le réseau est lent, rien n'est perdu. » **Aucun succès n'est
  revendiqué avant l'opérateur.**
- **Hors ligne (file)** (confirmer hors ligne) : « C'est noté. En attente du
  réseau — votre confirmation partira toute seule. » — file = en attente, jamais
  fait, **JAMAIS de célébration** (loi offline-first, `flows.md`).
- **Confirmé** (opérateur confirmé) : panneau « Produit prêt », « Dès que c'est
  confirmé, Séra vient chercher le colis. », « Vous recevrez, après livraison
  validée : 8 500 F », l'échéance — **et la célébration nommée** (halo/anneau/
  losanges, ≤ 800 ms, tap-to-skip, respect du reduced-motion). La célébration ne
  se déclenche QUE sur cet état.

## B8 · La commande refusée — cause / rien
- **Cause** (le produit « À corriger ») : la cause en mots simples (couleur,
  quantité), le temps restant, l'action digne « Corriger et redire prêt ».
- **Rien à corriger** : état honnête, jamais un refus synthétique.

## B9 · Mes échéances
La règle (« Après un refus, 6 heures pour corriger… »), trois produits montrant
les trois moments : à corriger (240 min) · correction en cours (45 min) · délai
passé (remboursement en cours).

## B10 · Mes recettes *(additif, ratifié)* — liste / vide
Une recette par produit prêt : son net (cascade), ReconcileLine, « jamais gardé
par Boutik+ ». Vide : « Pas encore de recette. Votre première vente s'affiche
ici. »

## B11 · Modération *(additif, ratifié)*
Chaque produit avec son état de revue honnête + une raison actionnable en clair
(approuvé · en revue · modifications · refusé). Jamais un rejet silencieux.

## Global · Hors ligne (offline-first)
Bouton « Simuler hors ligne » → bandeau ink sous l'en-tête « Hors ligne : vos
actions sont en attente, jamais perdues. » Les confirmations passent en file
(B7 « hors ligne »), jamais perdues, jamais « faites ».

---

## Ce qui est volontairement absent
Aucun paiement réel, aucun serveur : « En attente du réseau » / « en attente de
confirmation » restent affichés tant qu'un serveur n'existe pas. C'est la loi du
monde honnête, pas un oubli. L'import galerie (B4) et une valeur de plancher par
catégorie (B6) attendent, respectivement, une dépendance hors périmètre et une
Décision ouverte — l'un et l'autre signalés, jamais simulés.
