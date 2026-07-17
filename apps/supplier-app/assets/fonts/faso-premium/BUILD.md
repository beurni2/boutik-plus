# Faso Premium — font pipeline (WO-FP-BOUTIK STEP 0)

Two families, subset to Latin + French typographic, pinned to static instances
with **distinct per-weight name-table identities** (the Archivo WO-5.1 collision
lesson). Produced from the Google Fonts variable sources under the SIL Open Font
License 1.1 (OFL texts committed alongside: `OFL-BricolageGrotesque.txt`,
`OFL-InstrumentSans.txt`).

> **STAGED, not yet embedded.** These bytes exist + are guarded (`test/fp-font-pipeline.test.ts`); they are **not** wired into `app.json`/the kit. That is the v2-token adoption step (gated on canon WO-FP-0's merge). Archivo remains the shipped typeface until then.

## Sources (github.com/google/fonts, raw @ main)
- **Bricolage Grotesque** — `ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf` — axes `opsz 12..96` (default 96) · `wght 200..800` · `wdth 75..100`. © The Bricolage Grotesque Project Authors. Display: titles · money · CTAs · codes (README weights **700/800**).
- **Instrument Sans** — `ofl/instrumentsans/InstrumentSans[wdth,wght].ttf` — axes `wght 400..700` · `wdth 75..100`. © The Instrument Sans Project Authors. UI/body (README weights **400–700**).

## Pipeline (deterministic — `build_fp_fonts.py` in the packet)
1. `fontTools.varLib.instancer.instantiateVariableFont` → pin ALL axes to a static cut:
   - Bricolage: `{opsz:36, wdth:100, wght:700|800}`
   - Instrument Sans: `{wdth:100, wght:400|500|600|700}`
2. `fontTools.subset` → keep U+0020–007E · U+00A0–00FF · Œœı · curly quotes · «» · – — … € · **U+202F U+2009** (the money spaces — added to the keep-list so each font's ACTUAL coverage is preserved and the guard pins the truth). `layout_features=['*']` keeps `tnum`/`kern`.
3. **Distinct name-table identity per weight** — nameID 1/4/16 = the hyphenated family (e.g. `BricolageGrotesque-ExtraBold`), subfamily `Regular`, `usWeightClass` = the weight. So `readSfntIdentity` reads six distinct families (the collision that broke WO-5.1 is guarded here).
4. Save as plain TTF (RN asset loader). Toolchain: **fontTools 4.63.0**.

## The `opsz` choice (flagged — one open production decision)
The web pixel source (`Redesign.dc.html`) renders Bricolage with the browser's **auto optical sizing** — no static-RN equivalent, so one cut must be pinned. I derived **`opsz=36`** from the dominant, trust-critical Bricolage use: the **money hero at 36–38px** (README:20 · HANDOFF:27 « Héros argent Bricolage 800 · 38px »). This serves the 24–38px hero/title band faithfully; the 14–16px uses (price, CTA) render slightly display-cut. **Founder/designer call at adoption:** accept `opsz=36`, or add a second text-optical cut for the small sizes. Not invented — anchored to the spec's money-hero size + flagged.

## The U+202F / U+00A0 question — answered by the bytes, consciously pinned
`formatFcfa` (CONSUMED, untouched) normalizes the fr-FR group separator to **U+00A0** (ruling ③). Coverage of the new bytes:
- **U+00A0 present in ALL SIX weights** → « 11 500 F » is drawable in every weight through the existing formatter. No codepoint the formatter emits is missing — no STOP-AND-FLAG.
- **U+202F present in Bricolage 700/800; ABSENT in Instrument Sans 400/500/600/700.** So the U+00A0 fallback **remains necessary** — the body face (Instrument Sans, « everything else ») cannot draw U+202F; a direct U+202F would tofu there. The guard pins this split so any future bytes change flips loudly.

## Weights · bytes · sha256
| file | wght | bytes | sha256 |
|---|---|---|---|
| BricolageGrotesque-Bold.ttf | 700 | 53832 | `1734a352ee605769362b9007fb757ce1906f6d2c4adc40efca4b65d9734ed15d` |
| BricolageGrotesque-ExtraBold.ttf | 800 | 53844 | `211c79e5806dbf3c0bcaa6fb55d9235bfac7ade8203bf2babfa407de381fba6e` |
| InstrumentSans-Regular.ttf | 400 | 48028 | `fcb3668c7ca8e12a5cb4c6aaaa3143060cb92359563b58b591aa31a66463e1ba` |
| InstrumentSans-Medium.ttf | 500 | 48064 | `22defdb38770658e243944c05cef07b5c4141ad0dd42068b57dbd81c7fad9e60` |
| InstrumentSans-SemiBold.ttf | 600 | 48076 | `953880fe884caee46e184092632558d49a4648112ac74be8ea6c66b6ca63f04b` |
| InstrumentSans-Bold.ttf | 700 | 48060 | `e146e339d6af583516221470783caf77df4ab45e204edc83a61effdd2966ad9e` |

**FP static set total: 299904 bytes (292.9 KB)** — two families / six cuts. Above the Archivo single-family 166.7 KB; the adoption slice re-checks the cold-start byte budget against the design estimate when it wires app.json (STEP 0 stages the bytes; it does not embed them).
