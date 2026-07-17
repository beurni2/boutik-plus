#!/usr/bin/env node
/**
 * WO-FP-PIXEL Phase 1 — extract the Pixel Source's EXACT font bytes + @font-face
 * table for the web diff harness.
 *
 * The board embeds the VARIABLE Bricolage/Instrument woff2 subsets; my native
 * app ships static TTF instances (RN needs static faces with distinct
 * name-table identity). Rasterizing the harness with different bytes than the
 * board adds ~1px/density noise to every text diff — so the HARNESS (and only
 * the harness) uses the board's own woff2, declared under the app's per-face
 * family names. Listed in the fidelity report as web-harness-only.
 *
 * Output: apps/supplier-app/src/pixel/source-fonts.json
 *   [{ rnFamily, weight, unicodeRange, dataHex }] — HEX, not base64: the repo's
 *   scan gates walk every .json, and a base64 blob can randomly spell a banned
 *   token (it did: « debit »). The hex alphabet (0-9a-f) cannot.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve('design-reference/pixel-source-v2/Boutik Plus - Pixel Source.standalone.html');
const html = readFileSync(SRC, 'utf8');

// 1 · the embedded asset map: "uuid":{"mime":"font/woff2",...,"data":"<b64>"}
const assets = {};
const assetRe = /"([0-9a-f-]{36})":\{"mime":"font\/woff2","compressed":false,"data":"([A-Za-z0-9+/=]+)"/g;
for (let m; (m = assetRe.exec(html)); ) assets[m[1]] = m[2];

// 2 · the @font-face blocks (escaped CSS inside the payload)
const faces = [];
const faceRe = /@font-face \{\\n\s*font-family: '([^']+)';\\n\s*font-style: normal;\\n\s*font-weight: (\d+);[^@]*?src: url\(\\"([0-9a-f-]{36})\\"\) format\('woff2'\);\\n\s*unicode-range: ([^;]+);/g;
for (let m; (m = faceRe.exec(html)); ) {
  faces.push({ family: m[1], weight: +m[2], uuid: m[3], unicodeRange: m[4].replace(/\\n/g, ' ').trim() });
}

// 3 · rename to the app's per-face families (fonts.ts FP_FACES identity law)
const RN_NAME = {
  'Bricolage Grotesque/700': 'BricolageGrotesque-Bold',
  'Bricolage Grotesque/800': 'BricolageGrotesque-ExtraBold',
  'Instrument Sans/400': 'InstrumentSans-Regular',
  'Instrument Sans/500': 'InstrumentSans-Medium',
  'Instrument Sans/600': 'InstrumentSans-SemiBold',
  'Instrument Sans/700': 'InstrumentSans-Bold',
};
const out = [];
for (const f of faces) {
  const rn = RN_NAME[`${f.family}/${f.weight}`];
  if (!rn) continue; // weights the app doesn't ship (BG 500/600)
  const data = assets[f.uuid];
  if (!data) throw new Error(`asset ${f.uuid} not found for ${f.family}/${f.weight}`);
  out.push({ rnFamily: rn, weight: f.weight, unicodeRange: f.unicodeRange, dataHex: Buffer.from(data, 'base64').toString('hex') });
}
writeFileSync(resolve('apps/supplier-app/src/pixel/source-fonts.json'), JSON.stringify(out));
console.log(`assets: ${Object.keys(assets).length} woff2 · faces declared: ${faces.length} · harness faces written: ${out.length}`);
console.log(out.map((o) => `${o.rnFamily} w${o.weight} range[${o.unicodeRange.slice(0, 24)}…] ${Math.round(o.dataHex.length / 2 / 1024)}KB`).join('\n'));
