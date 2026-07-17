# FASO PREMIUM — Redesign Handoff (4 apps)

**Package:** premium redesign of the four surfaces — Boutik+ (vendeur), Shop+ / Ma Boutique (revendeuse), PWA Cliente (acheteuse), Séra (livreur).
Each app ships as one self-contained interactive prototype (`*.dc.html`, open directly in a browser) plus one implementation spec (`* - HANDOFF.md`). The prototype is the source of truth for every pixel value — all styles are inline in the markup, greppable.

## Files
Chaque app a trois fichiers : le prototype interactif, la planche « Ecrans » (toutes les vues côte à côte, pan/zoom), et la spec.
- `Boutik Plus - Redesign.dc.html` + `Boutik Plus - Ecrans.dc.html` (11 vues) + `Boutik Plus - HANDOFF.md`
- `Shop Plus - Redesign.dc.html` + `Shop Plus - Ecrans.dc.html` (17 vues) + `Shop Plus - HANDOFF.md`
- `PWA Cliente - Redesign.dc.html` + `PWA Cliente - Ecrans.dc.html` (10 vues) + `PWA Cliente - HANDOFF.md`
- `Sera - Redesign.dc.html` + `Sera - Ecrans.dc.html` (13 vues) + `Sera - HANDOFF.md`
- `ios-frame.jsx` (device frame used by the prototypes), `support.js` (runtime — do not modify)

## The shared system ("Faso Premium")

### Type
- **Bricolage Grotesque** — display: screen titles, money, CTAs, big codes. Weights 700/800, letter-spacing −.02em on titles.
- **Instrument Sans** — everything else. Weights 400–700.
- **Every money value and code:** `font-feature-settings:'tnum'` + `white-space:nowrap`. Format `fr-FR` grouping + " F" (e.g. `11 500 F`).
- Scale: screen title 28/800 · view title 19–20/800 · hero money 36–38/800 · card money 24/800 · row title 14.5/700 · body 13–14.5 · caps label 10.5–11/700/letter-spacing .1em/uppercase · pill 11/700.

### Color (shared)
- Paper `#F4EFE6` (Séra: `#EFE8DA`) · Card `#FFFFFF` · Ink `#1C1710` · Body `#4A3F33` · Sub `#6F6355` · Hairline `#EDE4D3` (strong `#E5DCC9`, input `#E0D6C2`) · Dim `#EFE8DA` · Disabled CTA `#DDD5C3` fg `#8A7D6B`.
- Status: ok `#14603A` on `#DFEEE3` · warn `#5F4403`/`#7A5104` on `#F6E9C8` · danger `#8C1D18` on `#F8E1DE` (border `#C4574B`) · muted `#6F6355` on `#EFE8DA`.

### Accent per app (one accent per screen, never two)
| App | Primary | Deep (text) | Soft bg | On-primary |
|---|---|---|---|---|
| Boutik+ | `#0B5B47` | `#073B2E` | `#E4EFE9` | `#F6F1E7` |
| Shop+ | `#A31D4E` | `#701134` | `#F8E4EC` | `#FCF4EE` |
| PWA Cliente | `#C2571B` | `#7A340E` | `#F7E7D8` | `#FFF6EC` |
| Séra | `#D9A441` | `#8F6812`/`#5F4403` | `#F6E9C8` (tint card `#FBF3DF`) | `#241A05` |

### Signature elements
1. **Woven band** — 6px strip under the status bar: `repeating-linear-gradient(90deg, ACCENT 0 18px, PAPER 18px 24px, GOLD 24px 32px, PAPER 32px 38px)`; gold = `#C89A3F` (Boutik), `#E0A11B` (Shop), `#C89A3F` (PWA), `#C2571B` as third color (Séra).
2. **Hero ledger band** — full-width accent card, radius 22, weave overlay `repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 12px, transparent 12px 30px)`, caps label + 36–38px tnum amount + hairline divider row.
3. **Product art tile** — duotone `linear-gradient(140deg, A, B)` + weave overlay (.07 white) + emoji glyph with `drop-shadow(0 3–6px … rgba(0,0,0,.25))`. Placeholder until real photos.
4. **Selection = border swap + check bubble** — selected card: `2px solid ACCENT` + 26px accent circle top-right with white check (`fpPop .3s`). Unselected: `1.5px solid #E0D6C2`.
5. **Corner ticks** — 12–14px L-marks inside photo/code frames ("documentary evidence").
6. **Quote rule** — `border-left:3px solid INK; padding-left:13px` for the one sentence that matters.

### Geometry
- Frame 402×874 (iPhone), status spacer 54px, content padding 20px, list bottom pad 150px (tabbed) / 46–110px (flow).
- Radii: card 20 · tile 18 · art 13–14 · button 16 (secondary 14–15) · sheet 30 top · pill/chip 99.
- Buttons: primary h54–56 accent bg + `box-shadow: 0 12px 26px -10px rgba(ACCENT,.5)` · secondary soft-bg h48–50 · ghost 1.5px hairline · dashed demo `1.5px dashed #C9BDA3`.
- Tab bar: blur dock `rgba(252,249,242,.88)` + `backdrop-filter:blur(18px)`, top hairline, padding `8px 6px 28px`; active item = soft-accent pill bg + deep text; icons 24px line SVG, stroke 1.9, currentColor. **Never emoji in chrome.**
- Sheets: scrim `rgba(24,18,11,.45)`, panel `#FCF9F2`, grab handle 40×5.
- Toasts: ink pill `#1C1710`, top 66, auto-dismiss 2 800 ms.

### Motion (all respect `prefers-reduced-motion`)
- `fpIn` screen entry: opacity+14px rise, .32s `cubic-bezier(.2,.8,.2,1)` — on every screen mount.
- `fpUp` sheet: 44px rise, .34s `cubic-bezier(.32,.72,.25,1)`.
- `fpPop` checks/success: .3–.45s overshoot. `fpPulse` 1.2s: current timeline step, live dots. `fpBar` 1.3s: server waits. `fpShimmer` 1.2s: skeletons. `fpShake` .4s: wrong code.
- Press: `transform:scale(.96–.98)` .15s on everything tappable.
- Count-up: 800 ms cubic ease-out on money heroes (rAF), re-runs on tab entry and when totals change.
- Celebration overlay (payout / validated): full-screen accent-dark scrim, gold dashes, check pop, amount; auto-dismiss ~2s, tap-to-skip.
- Skeleton-first load: 750 ms shimmer layout matching real dimensions.

### Engineering shape (all four apps)
- Single state machine per app: `{ tab?, view|screen, …domain state }`; screens are conditional blocks; back = pop view.
- Timers: 1s heartbeat where countdowns exist (Séra, PWA dwell); server waits are explicit states (`pending/submitting/provider/acking/sealing`), never optimistic.
- Offline is a **state, not an error**: queued banners (warn), "jamais perdu" copy; server-confirmed transitions only.
- Demo affordances (dashed buttons) are flagged `showDemoControls` — strip in production.
- Tweakable props are declared on each file's `data-props` (start screen, state toggles, names).

## Laws carried from Grand Teint (still binding)
Money is the biggest ink on screen · every franc reconciles visibly (`total = produit + livraison — chaque franc a sa place`) · pending is calm, never a spinner-apology · refusal paths get equal visual weight · icon + word, never icon alone · touch ≥ 44px · French never truncates mid-word (nowrap + ellipsis on the flexible span only) · no emoji in chrome (product-art glyphs are placeholders for photos).
