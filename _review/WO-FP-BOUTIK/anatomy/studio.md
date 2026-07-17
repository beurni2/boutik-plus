# ANATOMY DERIVATION — Boutik+ Studio

**Frame:** `data-screen-label="Boutik+ Studio"` — `Boutik Plus - Redesign.dc.html` lines **432–497**.
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'photo'` (permission · camera · preview).
Rows grep-evidenced from THIS frame only (no sibling import).

**The decisive relationship (canon §2.5):** the prototype Studio is a **MOCK** — a fake viewfinder
with emoji glyphs, fake light meters, a fake before/after with 👗 glyphs. The prototype is a "feel
and flow reference only … never copied as implementation." The app's Studio is the **REAL** thing:
`expo-camera` `CameraView`, a real capture, real on-device premium-frame processing, real EXIF strip.
So Studio fidelity is the **feel + the honesty**, NOT the mock's fake instruments — matching the
mock's meters would be *less* honest, not more.

---

## Element-by-element (each row: `awk 'index($0,p)'` → line)

| # | Frame element (grepped verbatim) | → line | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Header `Boutik+ Studio` (back) | **437** | `ViewHeader` (preview state) + the in-camera guide banner | frame; **divergence A** |
| 2 | Honesty sub `De vraies photos — aucune image inventée par IA` | **438** | `<NoteCard>{t('studio.honnete_ia')}</NoteCard>` — « De vraies photos — aucune image inventée par une IA. » (Law 5, deterministic) | **exact (added this commit)** |
| 3 | Viewfinder — dashed frame + `Placez l'article dans le cadre` | **448** | `<CameraView>` + `<CornerTicks colour={C.onPrimary} inset={20}>` + `guideBanner` (`frameGuideKey(category, shot)` — the real per-category guide) | frame (real camera) |
| 4 | Fake light meters card | 450–457 | *(not copied — real capture has no fake meters)* | **divergence B** (mock) |
| 5 | `Traitement (sur votre téléphone)` — on-device | **465** | real on-device premium-frame processing (`media`/premium-frame pipeline) | frame (real, on-device) |
| 6 | `Avant / Après` + `Originale (conservée en privé)` (fake 👗) | **478**/**484** | preview shows the REAL `pending.derivative.uri` in the premium frame; the master is retained by the pipeline | **divergence B** (real, not mock) |
| 7 | Footer `Cette photo prouve l'accès au produit … L'originale est conservée, jamais écrasée.` | **495** | `<NoteCard>{t('studio.honnete_original')}</NoteCard>` — « … pas l'authenticité. Votre photo d'origine est gardée, jamais remplacée. » | **exact (added this commit)** |
| — | states law: permission-null skeleton · denied (canAskAgain/not) · granted camera · preview | — | four designed `screen === 'photo'` states + `skipPhoto` escape | exact |

---

## Lawful divergences (the complete list)

- **A — Header split across states.** The real camera runs full-bleed (no chrome over the viewfinder,
  5-second capture clarity); the « Boutik+ Studio » title + honesty live on the framed states
  (permission / preview) and the in-camera guide banner. The frame's single scrolling header is a mock
  affordance; the real capture surface is a live camera.
- **B — The prototype's MOCK instruments are not copied (§2.5).** The fake light meters (450–457) and
  the fake 👗 before/after (478–491) are demo glyphs in the prototype. The app captures a REAL photo,
  processes it on-device into the price-free premium-frame derivative, retains the master, and strips
  EXIF — proven by `exif-strip` · `reencode-order` · `capture-incident` · `ui-studio` (already green).
  Copying the mock would replace real imaging invariants with theatre.
- **THIS COMMIT — the imaging HONESTY the frame states, the app now states too:** « aucune image
  inventée par une IA » (Law 5 — deterministic, no generative imaging) and « votre photo d'origine
  est gardée, jamais remplacée » (the master is retained), shown at the moment the derivative appears.
  Copy only — no camera / EXIF / imaging-logic change.

**Studio's FEEL — the framed viewfinder, the per-category guide, the on-device premium-frame preview,
and now the no-AI + original-retained honesty — matches the frame; the prototype's mock instruments
are deliberately not copied because the app does the real, invariant-guarded thing.** A fuller
frame-styling pass of the live camera overlay (meters-as-real-guidance, an explicit before/after of
real assets) is the founder's flagged « Studio, its own care » follow-up — it touches the capture
surface and is left for a dedicated pass, not rushed here.
