# FONT RENDER CHECK — boutik vs shop finding #1 (silent system fallback)

**Trigger:** shop-plus confirmed a REAL silent-font-fallback defect (font internal name-table
family ≠ the `fontFamily` key) and fixed it at `beurni2/shop-plus@1100278`. Directive: check boutik
for the SAME defect class; a frame is not planche-faithful if Bricolage isn't actually rendering.

## Shop's defect (root cause, from 1100278)

Shop loads faces with `useFonts` under human-readable keys (`'Bricolage Grotesque'`,
`'Instrument Sans Bold'`). Two faces' **internal name-table family** drifted from their key:
- Bricolage-ExtraBold internal `'Bricolage Grotesque ExtraBold'` ≠ key `'Bricolage Grotesque'`
- Instrument-Bold internal `'Instrument Sans'` ≠ key `'Instrument Sans Bold'`

RN matches custom fonts by that internal name → **matched nothing → silent system fallback** on
every header + money hero. Body faces (Instrument 400/600) matched, masking it.

## Boutik: NOT this defect (byte-verified, all six faces)

Boutik's architecture is the inverse and structurally immune:
- **No `useFonts`.** Faces are embedded NATIVELY by the `expo-font` config plugin (app.json) — no
  async load, no key-vs-internal-name matching step of the shop kind.
- **Distinct per-face family names** (the WO-5.1 collision scheme): each face's internal name-table
  family IS its `fontFamily` key. `ts()` (`src/ui/fp.ts`) sets `fontFamily: fontFamily(kind, wght)`,
  the resolver returning those exact strings.

`fc-scan` on the real shipped `.ttf` bytes — every face, internal family == the `FP_FACES` key
`fontFamily()` emits:

| face | internal name-table family (fc-scan) | key `fontFamily()` returns | match |
|---|---|---|---|
| BricolageGrotesque-Bold.ttf | `BricolageGrotesque-Bold` | `BricolageGrotesque-Bold` | ✓ |
| BricolageGrotesque-ExtraBold.ttf | `BricolageGrotesque-ExtraBold` | `BricolageGrotesque-ExtraBold` | ✓ |
| InstrumentSans-Regular.ttf | `InstrumentSans-Regular` | `InstrumentSans-Regular` | ✓ |
| InstrumentSans-Medium.ttf | `InstrumentSans-Medium` | `InstrumentSans-Medium` | ✓ |
| InstrumentSans-SemiBold.ttf | `InstrumentSans-SemiBold` | `InstrumentSans-SemiBold` | ✓ |
| InstrumentSans-Bold.ttf | `InstrumentSans-Bold` | `InstrumentSans-Bold` | ✓ |

The display faces (Bricolage 700/800 — the headers + money heroes shop saw missing) match. There is
no partial-match masking: all six use the one scheme.

## Guards (the regression stays LOUD)

- `test/font-embedding.test.ts` reads the **real `.ttf` bytes** (`readSfntIdentity`) and asserts each
  embedded name-table family == `FP_FACES[].family` (the key `fontFamily()` uses), with a
  planted-collision negative proving the reader is non-vacuous. This is the render-name guard shop
  had to ADD — boutik already carried it, over all six faces, from the real bytes.
- **NEW this commit:** a render-layer guard — the ONLY `fontFamily` assignment is `ts()` through the
  `fontFamily(kind, wght)` resolver; a raw `fontFamily: '…'` string literal (e.g. the space-form
  `'Bricolage Grotesque'`, which NO embedded face carries — shop's exact vector) can never be
  introduced in App/kit/signature/anim. Makes the defect class impossible, not just absent.

## On-device proof

Static/byte proof is the strongest possible off-device, but per the directive the pixels are proven
on the **preview**: Bricolage renders through the ONE `ts()` resolver on every screen, so the money
heroes + hub titles exercise the display faces directly. The republished preview at the current head
is the device artifact.

**Verdict: boutik does not carry shop finding #1. Keys == loaded faces on the real bytes, all six;
guarded against regression. Confirm the pixels on the preview.**
