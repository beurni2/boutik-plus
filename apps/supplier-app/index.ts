import { registerRootComponent } from 'expo';
import { enregistrerCoquille } from './src/offline/coquille';
import { avecLimite } from './src/ui/limite-erreur';
import type { AppV2 } from './src/v2/AppV2';

// Two roots: EXPO_PUBLIC_ROOT=fournisseur mounts the fulfillment-only
// supplier surface (founder ruling 2026-08-02); anything else mounts the
// founder's console. AUDIT-B+2 F-60 retired the E1 root (the July walking
// skeleton, reachable only by a dispatch-only preview): no deploy mounted it,
// and it carried dead controls, a fake queue flush and a superseded refusal
// flow.
//
// ═══ EVERY ROOT IS A LAZY REQUIRE BEHIND THE INLINED CONSTANT — THE FOLD IS
// THE CAPABILITY BOUNDARY ═══ (BOUTIK-WEB-W2 precedent.)
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
// COQUILLE-WEB-1 — the offline shell, web production builds only (no-op on
// a phone and in development).
enregistrerCoquille();
// LISTER-VRAI-1 (AUDIT-B+2 F-56) — every page mounts inside ONE boundary: a
// throw during a render shows « Recharger » instead of a white page.
registerRootComponent(
  avecLimite(
    process.env.EXPO_PUBLIC_ROOT === 'fournisseur'
      ? require('./src/fournisseur/FournisseurApp').FournisseurApp
      : require('./src/v2/AppV2').AppV2,
  ),
);
