# COMPOSITION PROPOSAL — the Studio REVIEW screen (real image · both guides · keep-or-choose-another)

> **STATUS: APPROVED AND BUILT 2026-07-25**, subject to the founder's pane ruling —
> *"DERIVE THE PANE FROM THE REMAINING SPACE AFTER CHROME, CAPPED AT THE IMAGE'S NATURAL SIZE,
> CONTAINED FOR TALL SENSORS"* — which replaces §2's fixed-budget reading and closes §3 with one
> mechanism. §2's arithmetic is kept as the DERIVATION'S INPUT and as the record of why the
> mechanism was needed; it is no longer a number the code contains.
> Built: `src/studio/review.ts` (pure) · `src/v2/studio-review.tsx` (screen) · `C39G` (guide styles).

**Planche:** `design-reference/handoff_redesign/Boutik Plus - Redesign.dc.html`,
`data-screen-label="Boutik+ Studio"` — lines **432–497**. Every row below is grepped from that
frame; no sibling import.
**Device:** the D17 founder-signed reference profile — viewport **360 × 800**, Android Go class
2 GB, `docs/PERF-BUDGETS.md` lines 6–14.
**Consumes:** `StudioShot` (`src/studio/pick.ts`) — as merged, unchanged.
**Supersedes:** `studio-real-composition-PROPOSAL.md`, which is marked superseded in place.

---

## 0. THREE FINDINGS THAT CHANGE THE SHAPE — read these before the layout

### A. THE GUIDES BELONG ON THE HERO REVIEW ONLY, and only the hero is cropped

Canon `ProductAssets` (`src/supply/assets.ts:42-45`) carries `heroSquare`, `heroVertical`, `proof`
and `detail[]`. In `studio-real.tsx:83-85` **only the hero master is cropped** — `renderCropDerivative`
runs twice on it. **The proof and detail images are uploaded whole.**

So « both guides, nesting concentrically » is the **hero** review. Drawing guides on the proof or
detail review would claim a cropping that does not happen — the exact class of lie the guide work
exists to prevent. **Proof and detail get the same screen with the pane and no guides.** Flagged
because the ruling did not distinguish them and the distinction is load-bearing.

### B. THE PANE SHOWS THE DERIVATIVE, NOT THE MASTER

`capture.ts:86-88` states the standing law: *"The data URI IS the stripped artifact: previewed and
stored alike — the file at `derivative.uri` … never ships."* Showing the master here would preview
bytes that do not exist downstream, and would hide any rotation or colour defect the strip
introduced. **The pane renders `shot.derivative.uri`.**

**The one cost, measured rather than waved past:** the guide rects are computed in MASTER space, and
the derivative's aspect can differ from the master's by integer rounding at the 1280 resize. Swept
over ~2 000 master shapes at 4:3, 3:4 and 16:9, the **worst relative aspect drift is 0.069 %** —
**0.33 px of cover-crop on a 360-wide pane**. Sizing the pane from the master's aspect and rendering
the derivative with `cover` is therefore exact to a third of a pixel, and the guide geometry stays
the proved invariant rather than a second derivation.

### C. THE SCREEN NEEDS FOUR NEW STRINGS, AND NO MORE

Reused as-is, zero new copy: **`studio.apercu`** « Ce que l'acheteur verra » as the in-frame caption,
**`studio.confirmer`** « Garder cette photo » as the primary, **`studio.reprendre`** « Reprendre » as
the camera-source secondary, **`studio.honnete_original`** as the footer.

Proposed (lint-probed: **265 entries, 0 violations**; positive control — planting « Veuillez
sélectionner une autre photographie conforme. » fails on *veuillez* **and** on reading level, so the
gate genuinely reads the new keys):

| key | fr | register | screenClass |
|---|---|---|---|
| `studio.role_hero` | Photo héro | neutral | label |
| `studio.role_preuve` | Photo preuve | neutral | label |
| `studio.role_detail` | Photo détail | neutral | label |
| `studio.choisir_autre` | Choisir une autre photo | neutral | general |

`studio.reprendre` is kept for the camera source and `studio.choisir_autre` for the gallery,
**because « Reprendre » on a library photo asks him to re-take something he did not take**, and
« Choisir une autre » on a fresh capture points at a library he is not in. One label each, chosen
from the source — a pure decision returning a key, like `galleryRefusalKey`.

*(The three role titles are new because the existing `studio.shot_hero`/`studio.shot_preuve` say
« Photo 1 sur 2 » — there are three shots — and are instructions, not titles. Today's titles are
INLINE in `studio-real.tsx:43-46`, a Law 6 gap already named and still open.)*

---

## 1. Frame anatomy, grepped verbatim

| # | Planche element (verbatim byte) | → line | Proposal |
|---|---|---|---|
| 1 | shell `position:absolute;inset:0;overflow:auto;padding:16px 20px 60px` | **433** | 16 top / 20 side kept; **bottom 60 → 16** — the footer note is the last element and needs no scrolled tail |
| 2 | back button `40px;border-radius:99px;border:1px solid #E5DCC9` | **435** | `HeaderStacked` (`C43.row`, `GEO.hit.back: 40`), unchanged |
| 3 | title `Boutik+ Studio` — BG 800 19px `-.02em` | **437** | unchanged |
| 4 | honesty sub `De vraies photos — aucune image inventée par IA` — 12px `#6F6355` | **438** | unchanged — **as `t('studio.honnete_ia')`, not the inline string it is today** |
| 5 | shot title `{{ stTitle }}` — `margin-top:16`, BG 700 20px | **442** | the ROLE title (`studio.role_*`); **margin-top 16 → 14** |
| 6 | shot sub `{{ stSub }}` — `margin-top:6`, 13.5/1.5 | **443** | **dropped.** The capture instruction has no job on a review of an image already taken |
| 7 | viewfinder `margin-top:13;height:230px;border-radius:22px;box-shadow:0 16px 36px -16px rgba(28,22,15,.4)` | **444** | **the IMAGE PANE.** Radius, shadow and the 13 gap kept; **height 230 → derived** (§2); full-bleed to the screen edges, the 20pt side pad suspended for this element only |
| 8 | texture `repeating-linear-gradient(135deg,…)` | **445** | not copied — a real photograph fills the pane |
| 9 | **`position:absolute;inset:20px;border:2.5px dashed rgba(255,255,255,.75);border-radius:16px`** | **446** | **the SQUARE guide.** Border weight, colour, dash and radius survive verbatim; only the *rect* changes from a fixed 20pt inset to `guideForCrop(heroSquareCrop(...), master, pane)` |
| 10 | *(no planche element)* | — | **the VERTICAL guide** — same rect function, `heroVerticalCrop`. Drawn as a **1.5 px continuous** hairline in the same cream, so the two read as primary + secondary rather than two competing dashes. **Composed, not grepped: listed divergence D-1** |
| 11 | glyph `font-size:72px` | **447** | not copied — mock |
| 12 | caption `bottom:30;left:30;right:30;center;#FFF6E8;12px/700/.02em;text-shadow:0 1px 4px rgba(0,0,0,.4)` | **448** | geometry kept exactly; text becomes **`studio.apercu`** — « Ce que l'acheteur verra » |
| 13 | meters card + toggle | **449–459**, **461** | not copied — mock instruments (standing divergence B) |
| 14 | approve CTA `height:54;border-radius:16;background:#0B5B47;BG 700 16px` | **492** | **`C07BtnPrimary`** with `studio.confirmer` — « Garder cette photo » |
| 15 | ghost pill `height:40;padding:0 15px;border-radius:99px;border:1px solid #E5DCC9;background:#FFF;13px/600` | **461** | **the SECONDARY**, whispering: `studio.reprendre` or `studio.choisir_autre` by source |
| 16 | footer honesty `margin-top:14;12.5px/1.55` — « Cette photo prouve l'accès au produit… » | **495** | **`studio.honnete_original`. This is where it lands** — journaled as a move, not a deletion |

---

## 2. The budget, on D17 (360 × 800)

Fixed heights are planche bytes. The footer height is an **estimate** (~0.5 em average advance over a
320 px column); nothing here was measured on a device.

```
 16   top pad                                     (planche 433)
 40   header: back · « Boutik+ Studio » · honesty sub   (434–441)
 14   gap
 24   role title « Photo héro »                    (442, BG700 20px)
 13   gap                                          (444)
  ?   THE PANE, full-bleed 360 wide                ← §3
        · square guide, 2.5px dashed               (446 verbatim)
        · vertical guide, 1.5px hairline           (D-1)
        · caption « Ce que l'acheteur verra »      (448 geometry)
 12   gap
 54   « Garder cette photo »                       (492)
 10   gap
 46   « Choisir une autre photo » / « Reprendre »  (461 → kit C09 BtnGhost, 46)
 14   gap
 58   « … votre photo d'origine est gardée, jamais remplacée. »   (495, 3 lines)
 16   bottom safe area
```

**Chrome without the pane: 317. Pane budget: 483.**

**CORRECTED FROM MY OWN FIRST NUMBER:** I budgeted the secondary at the planche's 40 px pill.
The kit's docketed ghost (`C09`) is **46**, and §5 says screens compose kit components rather than
grow snowflakes — so the kit value wins and the chrome is 6 px heavier than I first reported.
That takes the 4:3 portrait margin from 9 px to **3**, which is the best argument for the derivation
the founder ruled: a screen budgeted at a fixed 480 would have been three pixels from scrolling and
nobody would have known until a device.

| master | aspect | pane at 360 wide | fits 489? |
|---|---|---|---|
| 4000×3000 · 4032×3024 (4:3 landscape) | 0.750 | 360×270 | yes, 213 spare |
| **3000×4000 · 3024×4032 (4:3 portrait)** | 1.333 | **360×480** | **yes, 3 spare** |
| 1080×1080 | 1.000 | 360×360 | yes |
| 1920×1080 | 0.563 | 360×203 | yes |
| 1080×1920 (16:9 portrait) | 1.778 | 360×640 | **no — contains to 275×489** |

**The 4:3 portrait case fits with 3 px to spare.** That is thin enough to be honest about: a footer
that wraps to four lines on a device with wider metrics pushes it over, and the screen scrolls.
A scrolling review is not the failure a scrolling live camera was — the image is static — but it is
worth knowing before it is built.

**Guide sizes at full width, the proved invariant:**

| master | square guide | 4:5 vertical guide | pane |
|---|---|---|---|
| 3000×4000 | 360×360 | 360×450 | 360×480 |
| 4032×3024 | 270×270 | 216×270 | 360×270 |
| 1080×1080 | 360×360 | 288×360 | 360×360 |

Both always fit, both always nest concentrically, at every aspect — that is the property already
merged and swept.

---

## 3. Decision A — the tall-sensor cap (the only decision left in this screen)

A 16:9-portrait image wants 640 px and 483 are available. Same two options as before, same
recommendation:

1. **Contain.** The pane is the largest rect with the image's aspect fitting `360 × 489`. **4:3
   portrait is unchanged at 360×480**; 16:9 portrait becomes **275×489, inset 43 px each side**.
   Uniform scale, whole image visible, no guide can overhang — the guarantee survives intact.
2. Keep filling the width and let the screen scroll on tall images only.

**Recommendation: (1).** Everything else on this screen is a decision he is making about one
photograph; making him scroll to find the button is the wrong tax.

**No other decision is left open.** Both guides is ruled. Keep-or-choose-another is ruled. Where the
footer note lands is ruled. What the pane shows is settled by the standing WYSIWYG law, not by taste.

---

## 4. Lawful divergences and gaps, complete list

- **D-1 — the vertical guide is composed, not grepped.** The planche has ONE decorative inset (446)
  because it had one mock viewfinder. A second rect is required by the ruling; it takes the same
  cream and radius at 1.5 px continuous so the pair reads as a hierarchy. **The only element on this
  screen with no planche line behind it, and it is named rather than smuggled into the table.**
- **D-2 — the mock instruments (449–459, 461-as-toggle) and the glyph (447) are not copied.**
  Standing divergence B (§2.5).
- **D-3 — the planche's `Avant / Après` card (476–491) is not on this screen.** It compares master to
  derivative. This screen shows **the derivative alone, at full width** — larger, and the same truth
  without asking him to compare two thumbnails. The card stays available for a later « voir
  l'originale » if he ever wants it; it is not proposed now.
- **D-4 — the capture instruction (443) is dropped on review.** It tells him how to take a photograph
  he has already taken.
- **GAP (open, not filled): the inline strings in `studio-real.tsx`.** `SHOTS[].title` / `[].sub`,
  `'Capturer'`, `'Traitement (sur votre téléphone)'`, `PROC_ROWS`, `'Avant / Après'`,
  `"J'approuve ces photos"` and the honesty sub are inline, against Law 6. The review screen uses
  catalog strings throughout; **moving the existing ones is its own slice** and would bury this diff.
- **GAP (open): `pick-native.ts` is untested** — three native calls, unrunnable in node. It will first
  be exercised on his device, and this screen is the surface that exercises it.
