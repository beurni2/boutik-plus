# COMPOSITION PROPOSAL — Boutik+ Studio (S26StudioReal), fill-the-width viewfinder

> ## ⛔ SUPERSEDED 2026-07-25 — THE SLICE WAS RESHAPED, NOT DEFERRED
>
> **The founder cancelled the guided viewfinder.** Most product pictures come from the
> gallery, not the camera, so **the crop guides move off the live preview and onto the
> chosen picture**, in a review step that serves both sources. A chosen image's dimensions
> are KNOWN, so the aspect assumption in §6-E stops being a problem to solve and becomes
> the reason not to draw guides on a live camera at all.
>
> **Dead here:** the §2 budget arithmetic (there is no 480 px camera pane to fit around),
> and decisions **A**, **B** and **C** — all three were about a live viewfinder. **C
> re-emerges on the review screen and is ruled: BOTH GUIDES, nesting concentrically.**
>
> **Live and carried forward:** the §1 anatomy table and its planche line citations, the
> divergence list in §6, and the ruling that the footer honesty note (planche 495) belongs
> on the review surface. **The camera preview still gets bigger — fill the width, no
> guides, no derived geometry, no aspect assumption.** It was only ever hard because of
> the guides.
>
> The replacement proposal is the REVIEW SCREEN composition, which follows the picker seam.

**STATUS: PROPOSAL. NOTHING BUILT FROM IT.** The founder ruled the layout is his
(*"THE LAYOUT IS A FOUNDER RULING, NOT YOURS OR MINE… Propose the composition against D17 and
let him rule it"*). This derives the anatomy from the planche with cited lines, states the
budget arithmetic, and names the three decisions that are his.

**Planche:** `design-reference/handoff_redesign/Boutik Plus - Redesign.dc.html`,
`data-screen-label="Boutik+ Studio"` — lines **432–497**.
**Implementation to rebuild:** `apps/supplier-app/src/v2/studio-real.tsx`.
**Device:** the D17 founder-signed reference profile — viewport **360 × 800**, Android Go class 2 GB
(Tecno Spark Go / Itel A-series), `docs/PERF-BUDGETS.md` lines 6–14.
**Recolour is not rebuild, and this is a rebuild** — hence the full derivation below.

---

## 1. Frame anatomy, grepped verbatim

| # | Planche element (verbatim byte) | → line | Today in `studio-real.tsx` | Proposal |
|---|---|---|---|---|
| 1 | shell `position:absolute;inset:0;overflow:auto;padding:16px 20px 60px` | **433** | `ScrollView` + `SCROLL.stacked` (`bottomStacked: 60`) | **keep the 16/20 pads; bottom 60 → 16** (the CTA is the last element and no longer needs clearance for a scrolled tail) |
| 2 | back button `width:40px;height:40px;border-radius:99px;border:1px solid #E5DCC9` | **435** | `HeaderStacked` (`C43.row`, `GEO.hit.back: 40`) | unchanged |
| 3 | title `Boutik+ Studio` — BG 800, 19px, `-.02em` | **437** | `HeaderStacked title` (`C43.title` = `T.ScreenTitle`) | unchanged |
| 4 | honesty sub `De vraies photos — aucune image inventée par IA` — 12px `#6F6355` | **438** | inline `role({f:'IS',w:400,s:12}, P.sub)` | unchanged (**note:** this is inline, not `t('studio.honnete_ia')` — a separate copy-lint gap, listed §6) |
| 5 | shot title `{{ stTitle }}` — `margin-top:16`, BG 700, 20px | **442** | `'1 · Photo héro'` etc. from `SHOTS` | keep, **margin-top 16 → 14** |
| 6 | shot sub `{{ stSub }}` — `margin-top:6`, 13.5px / 1.5, `#6F6355` | **443** | `SHOTS[i].sub` | **MOVES INTO THE FRAME** as the caption (decision **B**) |
| 7 | viewfinder `margin-top:13;height:230px;border-radius:22px;box-shadow:0 16px 36px -16px rgba(28,22,15,.4)` | **444** | `C39.frame` (`C21.viseur.h: 230`, `r: 22`) | **height 230 → `fullWidthPreviewSize(master, windowWidth).height`**; full-bleed to the screen edges (the 20pt side pad is suspended for this element only) |
| 8 | texture `repeating-linear-gradient(135deg,rgba(255,255,255,.06) 0 10px,transparent 10px 26px)` | **445** | absent (the real camera fills the frame) | unchanged — a live camera has no placeholder texture |
| 9 | **`position:absolute;inset:20px;border:2.5px dashed rgba(255,255,255,.75);border-radius:16px`** | **446** | `C39.inset` — the fixed 20pt rect | **REPLACED by the derived guide** (founder ruling). Border weight, colour, dash and radius all survive; only the *rect* changes from decoration to `guideForCrop(...)` |
| 10 | glyph `font-size:72px` `{{ stGlyph }}` | **447** | absent (mock) | unchanged — divergence B (§2.5, mock instruments not copied) |
| 11 | caption `bottom:30;left:30;right:30;text-align:center;color:#FFF6E8;12px/700/.02em;text-shadow:0 1px 4px rgba(0,0,0,.4)` — « Placez l'article dans le cadre » | **448** | `C39.caption` / `C39.CAPTION` | **geometry kept exactly; the TEXT becomes the per-shot instruction** (decision **B**) |
| 12 | meters card + `{{ stMeters }}` rows | **449–459** | absent | unchanged — divergence B (fake instruments) |
| 13 | low-light banner `margin-top:11;padding:12px 15px;border-radius:16px;background:#F6E9C8;color:#5F4403;12.5px/1.5` | **460** | `Banner tone="warn"` carrying the real `guidanceFor` verdict | unchanged — real guidance in the mock's slot |
| 14 | simulate-low toggle | **461** | absent | unchanged — divergence B |
| 15 | capture CTA `margin-top:12;height:54;border-radius:16;BG 700 16px` + camera icon | **462** | `C07BtnPrimary label="Capturer" icon="camera"` | unchanged |
| 16 | footer honesty `margin-top:14;12.5px/1.55` — « Cette photo prouve l'accès au produit… » | **495** | **ABSENT** | **listed divergence, §6** — the string exists (`studio.honnete_original`) and there is no room for it in the 320 |

---

## 2. The budget, on D17 (360 × 800)

Fixed heights are planche bytes. **Text-block heights are ESTIMATES** — computed at ~0.5 em average
glyph advance over a 320 px content column (≈47 characters per line at 13.5 px). Nothing here was
measured on a device; a device pass would settle them.

**What the preview costs, per master (`fullWidthPreviewSize`, exact):**

| master | aspect | preview at 360 wide | remaining of 800 |
|---|---|---|---|
| 4000×3000 (4:3 landscape) | 0.750 | 360×270 | 530 |
| **3000×4000 (4:3 portrait)** | 1.333 | **360×480** | **320** ← the founder's number |
| 1080×1080 | 1.000 | 360×360 | 440 |
| 1080×1920 (16:9 portrait) | 1.778 | 360×640 | **160** |

**Today's composition, with the preview forced to 480:**

| shot | clean | with the guidance banner |
|---|---|---|
| 1 héro | 762 — fits | 834 — **over by 34** |
| 2 preuve | 782 — fits | 854 — **over by 54** |
| 3 détail | 741 — fits | 814 — **over by 14** |

It is a `ScrollView`, so overflow *scrolls* rather than clips — which is the DF-1 #5 complaint
(« each screen = ONE scroll surface », no small window) reappearing on the one screen where a
scrolling live camera is worst.

**Proposed composition (per-shot instruction moves into the frame):**

```
 16   top pad                                (planche 433)
 40   header row: back · « Boutik+ Studio » · honesty sub   (434–441)
 14   gap
 24   shot title « 1 · Photo héro »          (442, BG700 20px)
 13   gap                                    (444)
480   PREVIEW, full-bleed 360 wide           ← fullWidthPreviewSize(master, 360)
        · derived square guide (replaces 446)
        · derived 4:5 vertical guide, nested concentrically
        · caption slot at bottom:30 (448) carrying the per-shot instruction
 11 + 62   guidance banner, ONLY when a verdict fires   (460)
 12   gap
 54   CTA « Capturer »                       (462)
 16   bottom safe area
```

**clean 669 — fits, 131 spare · with the banner 742 — fits, 59 spare.**
Chrome alone: **189 clean / 261 with the banner** → the preview may be **611 px** tall clean,
**538** with a banner, before anything overflows.

---

## 3. Decision A — what happens on a sensor taller than 1.70

At 360 wide, a 16:9-portrait master wants 640 px and only 611 are available; **fill-the-width
overflows.** Two honest options, and only these two:

1. **Cap by containing.** Preview = the largest rect with the master's aspect that fits
   `360 × availableHeight`. On the 4:3 portrait master this is **unchanged — 360×480, exactly the
   founder's number**; on 16:9 portrait it becomes **344×611, inset 8 px each side**.
   **The structural guarantee survives**: still a uniform scale, still the whole sensor visible,
   still no guide can overhang. It stops being *fill the width* and becomes *fit the box* — the same
   rule with a different binding dimension.
2. **Keep filling the width and let the screen scroll** on tall sensors only.

**Recommendation: (1).** It preserves the ruling exactly where the ruling was aimed, and it never
puts a live camera inside a scroll.

## 4. Decision B — the instruction moves onto the viewfinder

The per-shot sub (planche 443) is the single biggest chrome block — up to 61 px for shot 2 — and it
sits *above* the frame, away from where the eye is. The planche already has a caption slot **inside**
the frame at line 448 with a generic sentence. **Proposal: the per-shot instruction takes that slot**,
and the generic « Placez l'article dans le cadre » retires.

- **Buys 67 px** and is what makes the budget fit with the guidance banner up.
- **Better on the 5-second test:** Aïcha reads the instruction while looking at the frame, not before it.
- **Cost, named:** shot 2's instruction is 104 characters — at 12 px over a 300 px caption column that is
  ~3 lines of cream-on-photo text. Legibility over a live camera is a device question, not a desk one.

Alternative if he refuses: keep the sub above the frame and drop the shot title into the header
as a counter instead (buys 38, not 67 — the banner case then has 21 px spare, which is thin).

## 5. Decision C — one guide or two

The hero has **two** crops. On every sensor they nest **concentrically**: on 3000×4000 the square is
360×360 and the vertical 360×450; on a 1:1 sensor the square is 360×360 and the vertical 288×360.

**Recommendation: draw both** — square as the planche's 2.5 px dashed rect (line 446 weight/colour/radius
kept), vertical as a thinner continuous hairline. Both crops are produced whether or not he saw them;
showing one and shipping two is the silent-disappearance family in a viewfinder.

**Below the 5:4 boundary no extra state is needed** — the vertical guide is simply drawn narrower and
centred (288 of 360 at 1:1). **No sentence should be added for it**: the drawn rectangle already states
the fact, and words for something the picture says are chrome the 5-second test charges for.

---

## 6. Lawful divergences and gaps, complete list

- **A — the meters card and the simulate-low toggle (449–459, 461) are not copied.** Standing divergence
  B (§2.5): the app runs real `guidanceFor` metrics; copying fake instruments would be *less* honest.
- **B — the glyph and the placeholder texture (445, 447) are not copied.** A live camera fills the frame.
- **C — the footer honesty note (495) is absent from `studio-real.tsx` and stays absent.** The string
  exists (`studio.honnete_original`) and there is no room for its ~58 px in the 320. **This is a real
  loss, not a neutral one** — it is the sentence that tells him his original is never overwritten.
  Recommendation: it belongs on the **review** state (which has room), not the shooting state.
- **D — the honesty sub at line 438 is an inline string in `studio-real.tsx`, not `t('studio.honnete_ia')`.**
  Law 6 says strings live in the catalog. So do `SHOTS[].title` / `SHOTS[].sub`, `'Capturer'`,
  `'Traitement (sur votre téléphone)'`, `PROC_ROWS`, `'Avant / Après'`, `"J'approuve ces photos"`.
  **Named, not fixed** — moving them is its own slice and would bury the rebuild's diff.
- **E — the preview aspect is assumed, not known, before the first shot.** See JOURNAL.md, same date.
  `ratio` is Android-only and sets the *preview* aspect; `pictureSize` sets the *still* and makes `ratio`
  ignored; neither is set today, and no API reports the still's size in advance.
