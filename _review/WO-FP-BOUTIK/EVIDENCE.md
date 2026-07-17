# WO-FP-BOUTIK — aesthetic evidence: on-device review guide

**The RN convention (founder-ruled):** aesthetic evidence is an **expo-preview
build reviewed on your device** — no react-native-web / react-dom is ever added
to produce screenshots, and there is no in-repo web harness for this app, so no
fixed-clock gallery is generated. Build health is proven by the native Metro
export (`logs/expo-export.txt`: Android + iOS bundle exit 0).

## Run the preview

```
cd apps/supplier-app
npx expo start            # scan the QR with Expo Go / a dev build on your device
```

`data-props`-style start controls live in the app's demo shell (the footer
« hors ligne » toggle makes the offline/queue states reachable; « recommencer »
resets the world).

## Name each app screen against its « Boutik Plus – Ecrans » frame

The app's screen model carries a few operational states the prototype folds into
its 11 frames (kept per the STATES-LAW ledger). Review each against its frame:

| App screen | « Ecrans » frame | What to check |
|---|---|---|
| `accueil` | **Accueil** | monogram + wordmark + « Vérifié » chip · woven band · greeting screen title · to-do banners · stat cards · the green **HeroLedgerBand** (weave + tnum, count-up) · CTAs |
| `produits` | **Produits** | 2-col **DuotoneTile** grid, corner pause/moderation badge, name + inline price |
| `offre` | **Assistant — Prix & commission** | two `MoneyField`s · live **MoneyHero** net (count-up) · `ReconcileLine` · below-floor `WarnNote` · Publier CTA (blocked states) |
| `pret` | **Sheet Produit prêt** | the payée card · B7 `CheckRow`s (accent fill + fpPop) · pending / **queued** / **queue_error** / confirmed blocks · `QuoteRule` deadline |
| `nouveau` | **Assistant — Catégorie** | **Selectable** category chips (border-swap + check bubble) |
| `photo` | **Studio** | camera with **CornerTicks** signature · guide banner · one primary capture action · preview with corner ticks |
| `recettes` | **Argent** | the **HeroLedgerBand** hero (EN ATTENTE, count-up, weave, divider row) · per-order receipt cards (DuotoneTile thumb + figure-alone + state line) |
| `moderation` | (Détail commande · moderation states) | pending / **changes_requested + reasons** / approved cards |
| `confiance` | **Niveau de confiance** | statement card (MoneyHero) · accent tier card (`scelle` badge) · restrictions |
| `echeances` | (Accueil § Échéances) | clock rows with remaining-minutes |
| `corrective` | (Détail commande · PICKUP_REFUSED) | **QuoteRule** cause · new-code line · fix-and-re-propose CTA |
| `onboarding` | **Inscription vendeur** | free-listing message + action |

## The five-second / trust checks to apply per screen

- One primary action, obvious within 5 seconds (secondary actions whisper).
- Money is the biggest ink; « 11 500 F » is tnum + unbreakable, counts up calmly.
- Every state is a *designed* state — offline (warn, « jamais perdu »),
  queue_error (honest, never a false « en attente »), empty (dashed encart).
- The refusal path (below-floor, PICKUP_REFUSED) is as dignified as the sale.
- Reduced-motion: turn it on — every fp* motion goes static, nothing breaks.

## What I could NOT self-verify (yours on device)

- The on-device *feel* of the seven motions at 60fps on a low-end Android.
- The tab-dock blur approximation (no true backdrop blur without expo-blur).
- The FP font byte-budget cold-start feel (+126 KB vs Archivo).
- The exact optical size of Bricolage at the money-hero (opsz flag).
