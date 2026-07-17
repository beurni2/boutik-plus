import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { P } from '../ui/v2/palette';
import { FP_FACES } from '../ui/fonts';
import { HARNESS } from './registry';

/**
 * WO-FP-PIXEL Phase 1 — the web pixel harness. Mounted INSTEAD of the app when
 * the page URL carries `?pixel=C##` (web only; see index.ts). Renders the
 * registry case at its exact source box on the §1.1 `bg` paper, inside a
 * `#pixel-stage` node the diff runner screenshots.
 *
 * Fonts: the six embedded TTFs are declared to the browser via injected
 * @font-face rules under their EXACT name-table families (fonts.ts FP_FACES),
 * so react-native-web's fontFamily resolves identically to native.
 */
// Web-only file (mounted behind Platform.OS === 'web' + ?pixel=): the RN
// tsconfig has no DOM lib, so the browser globals it touches are declared
// minimally here rather than widening the whole app's lib.
declare const document: {
  createElement: (tag: string) => { textContent: string };
  head: { appendChild: (node: unknown) => void };
  fonts: { load: (spec: string) => Promise<unknown>; ready: Promise<unknown> };
};
declare const btoa: (bin: string) => string;

// The board's OWN woff2 subsets, renamed to the app's per-face families
// (scripts/pixel/extract-source-fonts.mjs) — the diff must not measure
// TTF-instance vs variable-font rasterization noise; layout is the subject.
// NATIVE ships the static TTFs unchanged (font-embedding tests).
const SOURCE_FACES = require('./source-fonts.json') as {
  rnFamily: string;
  weight: number;
  unicodeRange: string;
  dataHex: string; // hex, not base64 — the scan gates walk .json (see extractor)
}[];

function hexToB64(hex: string): string {
  let bin = '';
  for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(bin);
}

function useWebFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const css = SOURCE_FACES.map(
        (f) =>
          `@font-face{font-family:'${f.rnFamily}';font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${hexToB64(f.dataHex)}) format('woff2');unicode-range:${f.unicodeRange};}`,
      ).join('\n');
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      // force-load every face, then signal readiness for the screenshotter
      await Promise.all(FP_FACES.map((f) => document.fonts.load(`${f.wght} 16px '${f.family}'`)));
      await document.fonts.ready;
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

export function PixelHarness({ caseId }: { caseId: string }) {
  const fontsReady = useWebFonts();
  const c = HARNESS[caseId];
  if (!c) {
    return (
      <View style={styles.page}>
        <Text>unknown case: {caseId}</Text>
      </View>
    );
  }
  return (
    <View style={styles.page} testID="pixel-page">
      {fontsReady && (
        <View nativeID="pixel-stage" style={[styles.stage, { width: c.box.w, height: c.box.h }]} testID="pixel-stage">
          {c.render()}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: P.bg, alignItems: 'flex-start', padding: 40 },
  stage: { backgroundColor: P.bg, overflow: 'visible' },
});
