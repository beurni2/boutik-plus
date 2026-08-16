import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * ═══ RENDU-RÉEL (Boutik+) — why this app finally has a vitest config ═══
 *
 * It had none: tests ran on defaults, which is why every one of them was a
 * source scan or a pure-model unit. The screens import `react-native`, and
 * `react-native` cannot load under vitest — so no screen in this app had ever
 * been MOUNTED, and « does this screen work » was proven by nobody.
 *
 * The founder's standing order of 2026-08-10 names this app as one of the three
 * with no harness. The aliases below are what close the hole.
 *
 * ⚠ THE ALIASES ARE NATIVE BOUNDARIES ONLY. Each stands in for a module that
 * needs a phone. NOTHING of this app's own code is aliased — the screens, the
 * ports, the view decisions and the catalog under test are the real files, and
 * the doubles' bounds are stated in `test/doubles/react-native.tsx` and
 * enforced by `test/rendu-harness.test.ts`.
 *
 * ⚠ AND THE LIST IS DELIBERATELY SHORT. `expo-camera`,
 * `expo-image-manipulator`, `expo-font` and `expo-status-bar` are NOT aliased:
 * no screen walked today reaches them, and an unaliased native module fails
 * LOUDLY at import rather than silently rendering nothing. The first walk that
 * needs one adds its double and its entry in the certification sweep — that is
 * the growth rule, not an oversight.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      'react-native-svg': at('./test/doubles/react-native-svg.tsx'),
      'react-native': at('./test/doubles/react-native.tsx'),
      'expo-crypto': at('./test/doubles/expo-crypto.ts'),
      // ONGLETS-FOURNISSEUR (2026-08-15) — THE GROWTH RULE ABOVE, EXECUTED.
      // The first walk to mount the supplier console reaches both of these
      // eagerly (the capture seam and the publish/queue seam), and through them
      // the Metro-only Expo runtime. Each double states its own bounds and
      // THROWS rather than faking, so a walk that wanders into capture or into
      // a real byte read fails loudly instead of passing over a fiction.
      'expo-image-manipulator': at('./test/doubles/expo-image-manipulator.ts'),
      'expo-file-system': at('./test/doubles/expo-file-system.ts'),
    },
  },
});
