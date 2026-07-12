#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { countScannedFiles, walkFiles } from './scan.mjs';

/**
 * CI gate: no-emoji (WO-6.0 ruling ①, cross-repo emoji debt named at WO-4.2R
 * ruling ③). ZERO emoji in the RENDERED chrome — the UI speaks in the canon
 * 26/29 icon set (react-native-svg, currentColor), never a platform emoji.
 * An emoji reintroduced in any rendered surface fails the build; the debt is
 * unkillable-in-reverse.
 *
 * SCOPE (flagged decision): the gate polices CODE, not comments. `⚠` and `⏳`
 * are established documentation MARKERS across the specs and source (open
 * Decision / safest-default flags) — they never render. Comments are stripped
 * before the scan so the gate targets chrome (JSX text, string literals) and
 * not the docket vocabulary. `Extended_Pictographic` is the precise emoji
 * property: it catches 📷 🏠 🏷️ ⏱ ✓ ⭐ but not typographic arrows (←).
 */

const EMOJI = /\p{Extended_Pictographic}/u;
const roots = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['apps'];

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

if (countScannedFiles(roots) === 0) {
  console.error(`no-emoji ERROR — no scannable files under ${roots.join(', ')}; refusing to pass on an empty scan`);
  process.exit(2);
}

const hits = [];
for (const root of roots) {
  for (const file of walkFiles(root)) {
    const raw = readFileSync(file, 'utf8');
    // JSON has no comments (the i18n catalog renders verbatim) — scan raw;
    // code (.ts/.tsx/.js) is stripped of comments so doc markers are exempt.
    const scanned = file.endsWith('.json') ? raw : stripComments(raw);
    scanned.split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) hits.push({ file: relative(process.cwd(), file), lineNo: i + 1, line: line.trim() });
    });
  }
}

if (hits.length === 0) {
  console.log(`no-emoji OK — no emoji in rendered chrome under ${roots.join(', ')} (WO-6.0 ruling ①)`);
  process.exit(0);
}
console.error(`no-emoji FAILED (WO-6.0 ruling ① — zero emoji in app chrome) — ${hits.length} hit(s):`);
for (const h of hits) console.error(`  ${h.file}:${h.lineNo} ${h.line}`);
process.exit(1);
