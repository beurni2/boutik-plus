import { registerRootComponent } from 'expo';
import type { AppV2 } from './src/v2/AppV2';

// WO-FP-PIXEL device walk (founder order 2026-07-17): a preview published with
// EXPO_PUBLIC_ROOT=v2 mounts the V2 build; any other value mounts E1.
// READINESS-WIRE-1b-ii adds the THIRD root: EXPO_PUBLIC_ROOT=fournisseur
// mounts the fulfillment-only supplier surface (founder ruling 2026-08-02).
//
// ═══ EVERY ROOT IS A LAZY REQUIRE BEHIND THE INLINED CONSTANT — THE FOLD IS
// THE CAPABILITY BOUNDARY ═══ (BOUTIK-WEB-W2 precedent, now three-way.)
// babel-preset-expo inlines EXPO_PUBLIC_ROOT at bundle time, the ternary
// folds, and the DEAD arms' requires never execute OR BUNDLE. The old static
// `import { AppV2 }` would have put the whole authoring graph in every
// artifact regardless of folding — which is why it became a require: the
// fournisseur export must not merely not-mount authoring, it must not CARRY
// it (« i do not want other suppliers boutik+ webapp be able to list new
// products »). The fournisseur-bundle-absence gate proves the fold held on
// the real exported artifact — trust the measurement, not the bundler.
declare const require: (id: string) => {
  default: typeof AppV2;
  AppV2: typeof AppV2;
  FournisseurApp: typeof AppV2;
};
registerRootComponent(
  process.env.EXPO_PUBLIC_ROOT === 'fournisseur'
    ? require('./src/fournisseur/FournisseurApp').FournisseurApp
    : process.env.EXPO_PUBLIC_ROOT === 'v2'
      ? require('./src/v2/AppV2').AppV2
      : require('./App').default,
);
