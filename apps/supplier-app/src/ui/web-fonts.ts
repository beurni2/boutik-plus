import { FontDisplay, useFonts, type FontSource } from 'expo-font';
import { Platform } from 'react-native';

/**
 * BOUTIK-WEB-W1 — the Faso Premium faces on the WEB target. On Android/iOS the
 * expo-font CONFIG PLUGIN embeds the six files in the binary and the family
 * names resolve at the first frame (`fonts.ts`, the cold-start law). The plugin
 * does nothing for a web export — the W1 export produced ONE js file and no
 * font assets — so without this module every web screen silently paints in a
 * browser fallback face and stays there. Not sparse; wrong.
 *
 * THE COLD-START LAW HOLDS ON WEB TOO: this hook never gates a render, and
 * every face is declared `font-display: swap` (FOURNISSEUR-VRAI-1, AUDIT-B+2
 * F-29). Without it expo-font writes `font-display: auto`, which most browsers
 * treat as « hide the text until the font arrives » — labels and FCFA amounts
 * blank for seconds on 3G while ~300 KB of type downloads. With `swap` the
 * screen paints in the fallback face at once and changes face when the files
 * arrive. A brief font swap is the law-compliant behaviour — invisible text
 * until type resolves is not.
 *
 * THE MAP IS STATIC ON PURPOSE: Metro only bundles assets it can see at build
 * time, so each face is a literal `require`. `web-fonts.test.ts` welds this
 * map to `FP_FACES` — a face added or renamed there without a row here fails
 * the suite rather than silently falling back on web.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
export const WEB_FONT_SOURCES: Readonly<Record<string, FontSource>> = {
  'BricolageGrotesque-Bold': { uri: require('../../assets/fonts/faso-premium/BricolageGrotesque-Bold.ttf'), display: FontDisplay.SWAP },
  'BricolageGrotesque-ExtraBold': { uri: require('../../assets/fonts/faso-premium/BricolageGrotesque-ExtraBold.ttf'), display: FontDisplay.SWAP },
  'InstrumentSans-Regular': { uri: require('../../assets/fonts/faso-premium/InstrumentSans-Regular.ttf'), display: FontDisplay.SWAP },
  'InstrumentSans-Medium': { uri: require('../../assets/fonts/faso-premium/InstrumentSans-Medium.ttf'), display: FontDisplay.SWAP },
  'InstrumentSans-SemiBold': { uri: require('../../assets/fonts/faso-premium/InstrumentSans-SemiBold.ttf'), display: FontDisplay.SWAP },
  'InstrumentSans-Bold': { uri: require('../../assets/fonts/faso-premium/InstrumentSans-Bold.ttf'), display: FontDisplay.SWAP },
};

/**
 * Load the faces on web; a no-op map on native, where the binary already
 * carries them and a second runtime load would be pure boot cost. The hook is
 * called unconditionally (rules of hooks); the MAP is what the platform picks.
 */
export function useWebFonts(): void {
  useFonts(Platform.OS === 'web' ? WEB_FONT_SOURCES : {});
}
