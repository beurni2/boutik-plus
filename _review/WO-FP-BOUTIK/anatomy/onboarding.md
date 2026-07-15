# ANATOMY DERIVATION — Inscription vendeur (frame « Inscription vendeur » ob0)

**Frame:** `data-screen-label="Inscription vendeur"`, step 0 (`ob0` welcome) — `Boutik Plus -
Redesign.dc.html` lines **512–516** (wizard shell 501–510).
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'onboarding'` block.
Rows grep-evidenced from ob0 only (no sibling import).

---

## Element-by-element (each row: `awk 'index($0,p)'` → line)

| # | Frame element (grepped verbatim from ob0) | → line | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Wizard header (back + `Inscription` + step + dots) | 501–509 | `<ViewHeader title={t(SCREEN_TITLE_KEY.onboarding)} backLabel onBack>` | **divergence A** (E1: welcome step only, no dots) |
| 2 | Welcome title `Bienvenue sur Boutik+` Bricolage 800 26px | **513** | `<Text style={ts('screen', C.ink)}>{t('onboarding.welcome')}</Text>` (28px display 800) | exact scale/family |
| 3 | Welcome text `Proposez vos produits aux revendeuses de Ma Boutique. Séra livre, vous encaissez.` | **514** | *(folded into the promise card — see divergence B)* | **divergence B** (legacy name) |
| 4 | Soft promise card `Inscription gratuite · aucun dépôt · aucune caution · aucun abonnement. Vous payez seulement 5 % quand un produit est vendu…` | **515** | `<NoteCard><Text style={ts('body', C.deep)}>{t('onboarding.free_listing')}</Text></NoteCard>` — « Listez vos produits gratuitement. Boutik+ et Shop+ ne gagnent que lorsque votre produit est vendu. » | frame; **divergence C** (gate reword) |
| 5 | Fixed-bottom CTA (`obNext`) | 545–546 | `<PrimaryButton label={t('onboard.action')} onPress={…go('produits')}>` | frame; **divergence A** (in-flow CTA) |

---

## Lawful divergences (the complete list)

- **A — The welcome STEP only, not the frame's 5-step signup wizard.** The frame is a 5-step flow
  (welcome → phone → shop → payout account → provisional status). At E1 the app's onboarding is an
  **explainer** reached from the Accueil gratuité link — not the real signup. Building the wizard
  (phone verification, payout account, provisional-status rules) jumps E1 scope. ob0's welcome
  composition (title + promise card + CTA) is matched; the CTA is in-flow (→ Produits) rather than a
  bottom « Continuer ».
- **B — No legacy shop name.** The frame welcome text names « **Ma Boutique** » — a **retired name**
  (Law §3.10; canon §2.5: the prototype "still carries legacy branding"). New copy never uses it; the
  welcome collapses to the title + the gate-clean promise (canon names only: Boutik+ · Shop+).
- **C — Promise card rewords « dépôt » / « caution ».** The frame's promise (« aucun dépôt · aucune
  caution ») uses tokens the no-seller-deposit gate (B+I-12) bans in any new string. The app's
  gate-clean promise carries the same guarantee — free listing, the platform earns only on a sale
  (5 %) — via `onboarding.free_listing`. Copy-lint 0 violations.

**ob0's welcome composition — the big Bricolage welcome title, the soft free-listing promise card,
the CTA — is matched.** Divergences are the E1 welcome-only scope, the retired-name drop, and the
gate reword — all standing-law or scope, none a styling drift.
