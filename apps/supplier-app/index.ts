import { registerRootComponent } from 'expo';
import { AppV2 } from './src/v2/AppV2';

// WO-FP-PIXEL device walk (founder order 2026-07-17): a preview published with
// EXPO_PUBLIC_ROOT=v2 mounts the V2 build; any other value mounts E1.
//
// CORRECTED (JOURNAL:837 flagged this line as stale and deferred it "to the next
// app-code wave" — this is that wave): the sentence here used to claim the
// DEFAULT root remains the E1 app and that main-branch publishes leave the
// variable unset. Both are false. `expo-preview.yml` sets
// `EXPO_PUBLIC_ROOT: ${{ github.event.inputs.root || 'v2' }}`, so main-push and
// bare-dispatch publishes both mount AppV2 — which is where the real authoring
// screen lives. E1 is reachable dispatch-only, via root=e1.
// (EXPO_PUBLIC_* is inlined at bundle time by babel-preset-expo.)
//
// BOUTIK-WEB-W2: E1 is REQUIRED LAZILY so a web bundle never EVALUATES it.
// `App.tsx` imports `expo-camera` statically, and expo-camera's WEB build
// spawns a QR worker that fetches jsQR from a CDN at module evaluation (W1
// finding). Every web export builds with ROOT=v2, so the inlined ternary folds
// to AppV2 and this require never runs there; on a native e1 preview it runs
// at registration, exactly when the old top-level import evaluated.
declare const require: (id: string) => { default: typeof AppV2 };
registerRootComponent(
  process.env.EXPO_PUBLIC_ROOT === 'v2' ? AppV2 : require('./App').default,
);
