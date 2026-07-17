# WO-FP-BOUTIK · STEP 0 — the Faso Premium font pipeline (🟠 AMBER · DO NOT MERGE)

**Branch:** `fp-font-pipeline` · **Code HEAD:** `93a3b67` · **Base:** `main`
**Scope:** token-independent STEP 0, authorized by the founder while the lane HOLDS on canon WO-FP-0. **NOTHING ELSE MOVES** — no view/styling/token/`app.json`/kit changes; Archivo stays the shipped face.

## What this delivers
Two families acquired from **github.com/google/fonts** (OFL 1.1; both license texts committed), instanced to static per-weight cuts, subset to Latin+French+money, with **DISTINCT per-weight name-table identities** (the Archivo WO-5.1 collision lesson), and **guarded on the new bytes**:

| file | family (nameID 1) | usWeightClass |
|---|---|---|
| BricolageGrotesque-Bold.ttf | BricolageGrotesque-Bold | 700 |
| BricolageGrotesque-ExtraBold.ttf | BricolageGrotesque-ExtraBold | 800 |
| InstrumentSans-Regular.ttf | InstrumentSans-Regular | 400 |
| InstrumentSans-Medium.ttf | InstrumentSans-Medium | 500 |
| InstrumentSans-SemiBold.ttf | InstrumentSans-SemiBold | 600 |
| InstrumentSans-Bold.ttf | InstrumentSans-Bold | 700 |

Six distinct families, correct weight classes. Reproducible pipeline + sha256 in `assets/fonts/faso-premium/BUILD.md`; generator `build_fp_fonts.py` in this packet.

## STAGED, not embedded
The bytes exist + are guarded; they are **not** wired into `app.json`/the kit — that's the v2-token adoption step (gated on canon WO-FP-0). `git diff main` on `app.json`, `src/ui/fonts.ts`, `src/ui/kit.tsx`, `src/ui/sfnt.ts`, `src/demo/store.ts` (formatFcfa), `readModel.ts`, `journey.ts`, `moderation.ts`, and the Archivo guards `font-embedding.test.ts` / `money-render.test.ts` — **all 0 lines**. The shipped Archivo TTFs are byte-unchanged.

## The money-render / cmap guard, rebuilt on the new bytes
`formatFcfa` is **CONSUMED, untouched**. Guard findings (`test/fp-font-pipeline.test.ts`):
- **U+00A0 present in ALL SIX weights** → « 11 500 F » drawable in every weight via the shipped formatter. Every codepoint `formatFcfa(11500)` emits (digits + U+00A0) is in every cmap. **No codepoint the formatter emits is missing → no STOP-AND-FLAG.**
- **The U+202F question, answered by the bytes and consciously pinned:** Bricolage 700/800 **HAVE** U+202F; Instrument Sans 400/500/600/700 **LACK** it. So the U+00A0 fallback (ruling ③) **remains necessary** — the body face can't draw U+202F. A future bytes change flips the guard loudly.

## The one flagged production choice — `opsz=36`
Bricolage has an optical-size axis; the web pixel source uses auto optical sizing (no static-RN equivalent), so one cut must be pinned. Derived **`opsz=36`** from the dominant, trust-critical Bricolage use — the money hero at 36–38px (README:20 · HANDOFF:27). Not invented; anchored + flagged. **Founder/designer call at adoption:** accept `opsz=36` or add a second text-optical cut for the 14–16px uses (CTA/price).

## Size note (flagged)
FP static set = **292.9 KB** (2 families / 6 cuts) vs the Archivo single-family 166.7 KB. The **adoption slice** re-checks the cold-start byte budget when it wires `app.json` — STEP 0 stages the bytes, it does not embed them.

## Fixtures (`test/fp-font-pipeline.test.ts`, 9)
distinct-identity table (readSfntIdentity over real bytes) · 6-distinct-families Set · exact WO-named weight set · formatFcfa output drawable in all six · full « 11 500 F » glyph set drawable · U+00A0 in every weight · U+202F split pinned (Bricolage has / Instrument lacks) · assets present + non-trivial · OFL ships for both. (The sfnt reader's non-vacuity — planted collision DETECTED, unmapped codepoint REJECTED — is locked by the untouched `font-embedding.test.ts` + `money-render.test.ts`, which exercise the same reader.)

## Evidence
- `logs/run-gates.txt` — full **warm** run-gates: **ALL GATES GREEN, exit 0** (every money/moderation/settlement/neutral-packaging/no-emoji gate unchanged).
- `logs/coldgates.log` — cold-gates proof (fresh HOME, HTTPS→proxy not ssh, empty store, `--frozen-lockfile` exit 0, fresh clone, cold HEAD `93a3b67`): **cold guards 19 passed** (fp 9 + Archivo 10) · **cold run-gates exit 0 · ALL GATES GREEN** · the committed FP font sha256s **match BUILD.md** exactly.
- `logs/verifier-report.md` — fresh-context verifier (ran on `93a3b67`): **VERDICT PASS · BLOCKERS 0**. By its own fontTools reads + independent `formatFcfa` execution + mutation tests: scope contained (10 protected files 0-diff), 6 distinct static families/weights, U+00A0 in all six + the U+202F split independently confirmed, guard bites (weight 700→701 flips identity; U+202F false→true flips the split), Archivo 10/10 + typecheck 11/11 + run-gates ALL GREEN, tree left clean.
- `build_fp_fonts.py` — the deterministic generator.

## Test counts
supplier-app +9 (fp-font-pipeline) · Archivo font-embedding 6 + money-render 4 unchanged · typecheck 11/11 · full suite 19/19 tasks.

## When canon WO-FP-0's sha lands
gate-check (installed ui-tokens = v2 MAJOR + fasoPremium) → STEP 1 re-pin → the 11-view build, per the parent WO. This STEP 0 is the font substrate that build consumes.
