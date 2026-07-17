#!/usr/bin/env node
/**
 * WO-FP-PIXEL Phase 0 — extract the machine-checkable ground truth from the
 * founder's Pixel Source render (design-reference/pixel-source-v2).
 *
 * Loads the standalone board in headless Chromium (Playwright), waits for the
 * self-unpacker + fonts, then walks every `figure.frame#S01..#S40`'s `.phone`
 * subtree and records, per element:
 *   - a stable CSS path (nth-of-type chain, rooted at the figure id)
 *   - computed color / background-color / border-*-color (as computed rgb[a])
 *   - font-family / font-size / font-weight / letter-spacing / line-height
 *   - padding / margin / gap / row-gap / column-gap
 *   - width / height / min-width / min-height / border-radius (4 corners)
 *   - border widths/styles, box-shadow, opacity, text-transform,
 *     font-variant-numeric, background-image (gradients/textures), z-index,
 *     display / flex-direction / align-items / justify-content / flex
 *   - exact own-text (child text nodes only, NOT descendants), preserving
 *     U+202F / U+00A0
 *
 * Also emits a distinct-values census (colors, font sizes/weights, radii,
 * shadows, families) for the §1 token diff, and every money-looking string.
 *
 * THIS TABLE — not anyone's reading of the prose — is what the RN styles must
 * equal (the founder's Phase-0 law). Output: _review/WO-FP-PIXEL/values-table.json
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const SRC = resolve('design-reference/pixel-source-v2/Boutik Plus - Pixel Source.standalone.html');
const OUT_DIR = resolve('_review/WO-FP-PIXEL');
const OUT = resolve(OUT_DIR, 'values-table.json');
const CENSUS = resolve(OUT_DIR, 'values-census.json');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
await page.goto('file://' + SRC.replace(/ /g, '%20'), { waitUntil: 'load' });
// the self-unpacker builds the board, then fonts resolve
await page.waitForSelector('figure.frame#S40', { timeout: 60_000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(2500); // let shimmer/pulse settle to steady state; static values only

const data = await page.evaluate(() => {
  const PROPS = [
    'color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'gap', 'row-gap', 'column-gap',
    'width', 'height', 'min-width', 'min-height', 'max-width',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'border-top-width', 'border-top-style', 'border-bottom-width', 'border-left-width', 'border-right-width',
    'box-shadow', 'opacity', 'text-transform', 'font-variant-numeric', 'font-feature-settings',
    'background-image', 'z-index', 'position',
    'display', 'flex-direction', 'align-items', 'justify-content', 'flex-grow', 'flex-shrink', 'flex-basis',
    'text-align', 'white-space', 'overflow', 'text-overflow',
  ];
  const pathOf = (el, root) => {
    const segs = [];
    let n = el;
    while (n && n !== root) {
      const p = n.parentElement;
      if (!p) break;
      const same = Array.from(p.children).filter((c) => c.tagName === n.tagName);
      segs.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ''));
      n = p;
    }
    return segs.join('>');
  };
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('')
      .replace(/\s*\n\s*/g, ' ')
      .trim();

  const screens = {};
  const census = {
    colors: {}, fontSizes: {}, fontWeights: {}, fontFamilies: {}, radii: {}, shadows: {}, letterSpacings: {},
  };
  const bump = (bag, v) => { if (v && v !== 'none' && v !== 'normal' && v !== '0px') bag[v] = (bag[v] || 0) + 1; };
  const moneyStrings = [];
  const MONEY = /\d[\d   ]*\d\s*F\b|\d\s*F\b/;

  for (const fig of document.querySelectorAll('figure.frame')) {
    const id = fig.id;
    const caption = fig.querySelector('figcaption')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const phone = fig.querySelector('.phone');
    if (!phone) continue;
    const elements = [];
    const walk = [phone, ...phone.querySelectorAll('*')];
    for (const el of walk) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const props = {};
      for (const p of PROPS) {
        const v = cs.getPropertyValue(p);
        if (v !== '') props[p] = v;
      }
      const rect = el.getBoundingClientRect();
      const phoneRect = phone.getBoundingClientRect();
      const text = ownText(el);
      const entry = {
        path: el === phone ? '(phone)' : pathOf(el, phone),
        tag: el.tagName.toLowerCase(),
        cls: el.getAttribute('class') || undefined,
        box: {
          x: +(rect.x - phoneRect.x).toFixed(1),
          y: +(rect.y - phoneRect.y).toFixed(1),
          w: +rect.width.toFixed(1),
          h: +rect.height.toFixed(1),
        },
        props,
      };
      if (text) entry.text = text;
      elements.push(entry);
      // census
      bump(census.colors, props['color']);
      bump(census.colors, props['background-color']);
      bump(census.colors, props['border-top-color']);
      if (text) {
        bump(census.fontSizes, props['font-size']);
        bump(census.fontWeights, props['font-weight']);
        bump(census.fontFamilies, (props['font-family'] || '').split(',')[0].replace(/"/g, '').trim());
        bump(census.letterSpacings, props['letter-spacing']);
      }
      bump(census.radii, props['border-top-left-radius']);
      bump(census.shadows, props['box-shadow']);
      if (text && MONEY.test(text)) {
        moneyStrings.push({
          screen: id, path: entry.path, text,
          codepoints: Array.from(text).filter((ch) => /[  ]/.test(ch)).map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')),
        });
      }
    }
    screens[id] = { caption, phoneBox: { w: +phone.getBoundingClientRect().width.toFixed(1), h: +phone.getBoundingClientRect().height.toFixed(1) }, elementCount: elements.length, elements };
  }
  return { screens, census, moneyStrings };
});

await browser.close();

mkdirSync(OUT_DIR, { recursive: true });
const meta = {
  $note: 'WO-FP-PIXEL Phase 0 — machine ground truth extracted from the Pixel Source render (getComputedStyle). THIS is what RN styles must equal; prose loses on conflict.',
  source: 'design-reference/pixel-source-v2/Boutik Plus - Pixel Source.standalone.html',
  extractedAt: new Date().toISOString(),
  screenCount: Object.keys(data.screens).length,
  totalElements: Object.values(data.screens).reduce((s, x) => s + x.elementCount, 0),
};
writeFileSync(OUT, JSON.stringify({ ...meta, screens: data.screens, moneyStrings: data.moneyStrings }, null, 1));
writeFileSync(CENSUS, JSON.stringify({ ...meta, census: data.census, moneyStrings: data.moneyStrings }, null, 1));
console.log(JSON.stringify({ ...meta, money: data.moneyStrings.length, distinctColors: Object.keys(data.census.colors).length, distinctShadows: Object.keys(data.census.shadows).length }, null, 2));
