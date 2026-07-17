import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { createElement } from 'react';
import App from './App';

// WO-FP-PIXEL — the pixel harness mounts INSTEAD of the app when the web URL
// carries ?pixel=C## (Phase-1 diff runner only; native is untouched). The RN
// tsconfig has no DOM lib — the one browser global is declared minimally.
declare const window: { location: { search: string } } | undefined;
let Root: React.ComponentType = App;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const caseId = new URLSearchParams(window!.location.search).get('pixel');
  if (caseId !== null) {
    const { PixelHarness } = require('./src/pixel/PixelHarness') as typeof import('./src/pixel/PixelHarness');
    Root = () => createElement(PixelHarness, { caseId });
  }
}

registerRootComponent(Root);
