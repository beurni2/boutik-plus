#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/**
 * WEB SIZE — POIDS-WEB-1 (AUDIT-B+2 F-85). Both Boutik+ web pages have been
 * live since July/August and nothing ever measured what a phone downloads to
 * open them.
 *
 * WHAT IS MEASURED — the FIRST LOAD, the way Shop+'s pwa-payload-budget
 * measures it: index.html + the scripts and styles index.html references +
 * the fonts, each gzip -9 (and brotli -11, printed for reference). That is
 * what a phone fetches before the person sees anything. The service worker
 * (sw.js) is not counted: it installs after the page has opened.
 *
 * WHAT IS ENFORCED — ONLY A SIGNED CEILING. PERF-BUDGETS.md names the web
 * numbers ⏳ W-D3, « proposed … for founder ruling »; they are not this
 * repo's to invent (CLAUDE.md §9.3). gates/web-budgets.json holds one ceiling
 * per surface; while it is null the size is measured and PRINTED on every
 * board and every deploy, and nothing fails on it. The moment he signs a
 * number it is enforced — the negative fixture proves that branch fires.
 *
 * Usage: web-size.mjs <distDir> <surface> [--budgets <file>]
 * Exit 0 within (or no signed ceiling) · 1 over a signed ceiling · 2 could not measure.
 */
export function mesurerWeb(dist, surface, budgetsPath = 'gates/web-budgets.json') {
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return { code: 2, lines: [`web-size ERROR — no index.html in ${dist}; nothing was measured`] };
  let budgets;
  try {
    budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
  } catch (err) {
    return { code: 2, lines: [`web-size ERROR — cannot read ${budgetsPath}: ${String(err)}`] };
  }
  const entry = budgets[surface];
  if (entry === undefined || !('firstLoadGzipBytes' in entry)) {
    return { code: 2, lines: [`web-size ERROR — ${budgetsPath} names no surface « ${surface} »`] };
  }

  const html = readFileSync(index, 'utf8');
  const referenced = [...html.matchAll(/(?:src|href)="\/?([^"?#]+\.(?:js|css))"/g)].map((m) => m[1]);
  const fonts = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ttf|otf|woff2?)$/i.test(e)) fonts.push(relative(dist, p));
    }
  };
  walk(dist);
  const files = ['index.html', ...referenced, ...fonts.sort()];

  const lines = [];
  let gz = 0;
  let br = 0;
  let raw = 0;
  for (const f of files) {
    const p = join(dist, f);
    if (!existsSync(p)) return { code: 2, lines: [`web-size ERROR — index.html references ${f}, which is not in ${dist}`] };
    const bytes = readFileSync(p);
    const g = gzipSync(bytes, { level: 9 }).length;
    const b = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    raw += bytes.length;
    gz += g;
    br += b;
    lines.push(`  ${f} — ${bytes.length} B raw · ${g} B gzip · ${b} B brotli`);
  }
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const total = `${surface} first load: ${kb(gz)} gzip (${gz} B) · ${kb(br)} brotli · ${kb(raw)} raw · ${files.length} file(s)`;
  const ceiling = entry.firstLoadGzipBytes;
  if (ceiling === null) {
    lines.push(`web-size MEASURED — ${total}. No signed ceiling for « ${surface} » (⏳ W-D3, PERF-BUDGETS.md): printed, not enforced.`);
    return { code: 0, lines };
  }
  if (typeof ceiling !== 'number' || !Number.isInteger(ceiling) || ceiling <= 0) {
    return { code: 2, lines: [`web-size ERROR — the ceiling for « ${surface} » is not a positive whole number of bytes`] };
  }
  if (gz > ceiling) {
    lines.push(`web-size FAILED — ${total}, over the signed ceiling of ${kb(ceiling)} (${ceiling} B) by ${gz - ceiling} B.`);
    return { code: 1, lines };
  }
  lines.push(`web-size OK — ${total}, within the signed ceiling of ${kb(ceiling)} (${ceiling} B).`);
  return { code: 0, lines };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dist, surface] = process.argv.slice(2);
  const at = process.argv.indexOf('--budgets');
  if (!dist || !surface) {
    console.error('usage: web-size.mjs <distDir> <surface> [--budgets <file>]');
    process.exit(2);
  }
  const { code, lines } = mesurerWeb(dist, surface, at === -1 ? undefined : process.argv[at + 1]);
  (code === 0 ? console.log : console.error)(lines.join('\n'));
  process.exit(code);
}
