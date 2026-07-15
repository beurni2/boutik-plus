# ANATOMY DERIVATION — Prix & commission (frame « Nouveau produit » wiz2)

**Frame:** `data-screen-label="Nouveau produit"`, step 2 (`wiz2` « Prix & commission ») — `Boutik Plus
- Redesign.dc.html` lines **370–391**.
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'offre'` block.
**Money surface.** Every figure is the LIVE pinned waterfall (`livePreviewNet`) — reconciles to the
franc. Rows grep-evidenced from wiz2 only (no sibling frame imported).

---

## Element-by-element (each row: `awk 'NR==<n>'` on Redesign.dc.html)

| # | Frame element (grepped verbatim from wiz2) | → line | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | `Prix &amp; commission` title Bricolage 800 26px | **371** | `ViewHeader` title (SCREEN_TITLE_KEY.offre) | **divergence A** (title copy/scale) |
| 2 | `Prix de base (ce que vaut le produit)` label + **stepper** (− val +) | **372**–377 | `<MoneyField label={t('offre.champ_prix')} value={priceInput} onChangeText…>` — editable text field | **divergence B** (DF-1: field, not stepper) |
| 3 | `Commission revendeuse (vous la financez)` label + **stepper** | **378**–383 | `<MoneyField label={t('offre.champ_commission')} value={commissionInput} onChangeText…>` — editable, drives `offerC` live | **divergence B** (DF-1) |
| 4 | Breakdown `Prix de base` = `{{wizBF}}` | **385** | `styles.netRow`: `t('offre.champ_prix')` + `formatFcfa(priceB)` (live) | frame |
| 5 | Breakdown `Commission revendeuse` = `−{{wizCF}}` (sub) | **386** | `netRow`: `t('offre.champ_commission')` + `− formatFcfa(offerC)` (sub) | frame |
| 6 | Breakdown `Frais Boutik+ (5 %)` = `−{{wizFeeF}}` (sub) | **387** | `netRow`: `t('offre.ligne_frais')` + `− formatFcfa(offerFee)` (sub) | frame |
| 7 | `Vous recevez` = `{{wizNetF}}` Bricolage 800 22px green (dashed rule above) | **388** | `<MoneyHero label={t('offer.net_label')} amount={offerNet} pending={belowMin}>` — the guarded net hero, count-up | frame; **divergence C** (hero, not inline line) |
| 8 | Note `La cliente paie … votre commission n'est jamais ajoutée une deuxième fois` | **390** | `t('offre.commission_aide')` + the floor/part guards (`belowFloor`/`partSwallowsNet`) | frame; catalogue copy |

---

## Lawful divergences (the complete list)

- **A — Title via ViewHeader, not a 26px wiz step title.** offre is a stacked view in the app's E1
  journey (back law); the wizard-step title chrome maps to the view header. Catalogue copy.
- **B — Editable `MoneyField` text inputs, NOT the frame's steppers.** Founder device review DF-1
  C.1/C.2: « la part de la revendeuse is EDITABLE and the waterfall recomputes live » + « the keypad
  is handled ». Steppers are slow for FCFA magnitudes on a low-end phone; the text field + numeric
  keypad won on device. Guarded by `df1-device-feedback` C.1/C.2. The frame's stepper is the
  overridden control; the frame's **breakdown + net composition** (rows 4–7) is adopted.
- **C — The net is the `MoneyHero` (count-up), not an inline « Vous recevez » line.** DF-1 B (« the
  figure ALONE at display scale ») + `ui-kit` guard (`<MoneyHero label={t('offer.net_label')}
  amount={offerNet}`). Same role as the frame's emphasized net line, at the app's confident hero
  scale; placed after the breakdown as the frame composes it (breakdown → net).

**This commit replaced the single reconciliation SENTENCE with the frame's structured breakdown
(base − commission − frais), each figure live from the pinned waterfall, then the net in majesty.**
Divergences are two device-validated control choices (DF-1: field over stepper, hero over inline) and
catalogue copy — the money composition now matches wiz2, and every figure reconciles.
