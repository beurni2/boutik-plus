# Ruling ② — Archivo embedded NATIVELY, present at first frame (proof)

**Mechanism (not asserted — proven in the built artifact).** `app.json` declares
the `expo-font` config plugin with the five static Archivo instances. `expo
prebuild` applies it and copies the fonts into the **native** Android project —
`android/app/src/main/assets/fonts/` — so they are compiled into the APK and are
present **before the JS bundle runs** (first frame). There is **no** `useFonts`,
`loadAsync`, or `Font.load` anywhere in the app: the typeface is never loaded
asynchronously, so nothing can flash-of-unstyled-text or splash-hold on it.

**The built artifact (`expo prebuild -p android`), inspected by name table:**

| embedded file | family (RN addresses this) | OS/2 weight |
|---|---|---|
| `Archivo-Black.ttf` | `Archivo-Black` | 900 |
| `Archivo-Bold.ttf` | `Archivo-Bold` | 700 |
| `Archivo-ExtraBold.ttf` | `Archivo-ExtraBold` | 800 |
| `Archivo-Medium.ttf` | `Archivo-Medium` | 500 |
| `Archivo-Regular.ttf` | `Archivo-Regular` | 400 |

**Name-table fix (WO-5.1 defect, found + fixed here).** The WO-5.1 subset left all
five instances named « Archivo SemiBold Regular » / PostScript `ArchivoSemiBold-Regular`
— a collision that would make native embedding unable to address the five weights.
The glyph outlines were correct (weight classes 400/500/700/800/900, distinct
hashes); only the name tables were wrong. They were rewritten to the distinct
weight-specific families above; `src/ui/fonts.ts` `fontFamilyForWeight(wght)` maps
each design weight to its family (the type scale's wght 600 → nearest shipped, 700).

**Method limit (stated plainly).** `expo prebuild` proves the fonts land in the
native assets → the APK → first frame. The device stopwatch (D17 < 5 s) remains
the founder's Expo Go / build pass; the mechanism here removes the async-load risk
that ruling ② exists to close.
