import { registerRootComponent } from 'expo';
import App from './App';
import { AppV2 } from './src/v2/AppV2';

// WO-FP-PIXEL device walk (founder order 2026-07-17): a preview published with
// EXPO_PUBLIC_ROOT=v2 mounts the V2 board build. The DEFAULT root remains the
// E1 app — the permanent root switch is a LISTED founder decision, not taken
// here. (EXPO_PUBLIC_* is inlined at bundle time; main-branch publishes leave
// it unset.)
registerRootComponent(process.env.EXPO_PUBLIC_ROOT === 'v2' ? AppV2 : App);
