#!/usr/bin/env node
/**
 * WO-FP-PIXEL Phase 1 — the component pixel-diff runner.
 *
 * For each case id (C##):
 *   TARGET: load the Pixel Source board, clip-screenshot the case's source
 *           element region (located via the Phase-0 values-table box, offset by
 *           the live phone bbox — no selector guessing).
 *   RENDER: load the Expo Web harness (?pixel=C##), wait for #pixel-stage
 *           (fonts ready), element-screenshot it.
 *   DIFF:   per-pixel channel delta > TOL counts as differing; report % of the
 *           box + write target/render/diff PNGs to _review/WO-FP-PIXEL/diff/.
 *
 * Usage: node scripts/pixel/diff-component.mjs C02 C07 [--port 8081]
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '8081';
const cases = args.filter((a) => /^C\d+$/.test(a));
if (cases.length === 0) {
  console.error('no cases given');
  process.exit(2);
}

const BOARD = resolve('design-reference/pixel-source-v2/Boutik Plus - Pixel Source.standalone.html');
const TABLE = JSON.parse(readFileSync(resolve('_review/WO-FP-PIXEL/values-table.json'), 'utf8'));
const OUT = resolve('_review/WO-FP-PIXEL/diff');
mkdirSync(OUT, { recursive: true });

// the registry's source locators, mirrored here (screen + how to find the element)
const SOURCES = {
  C02: { screen: 'S02', find: (els) => els.find((e) => e.box.h === 6 && e.box.y === 54) },
  C07: { screen: 'S02', find: (els) => els.find((e) => e.text === 'Ajouter un produit' && e.tag === 'button') },
};

const TOL = 32; // per-channel delta after supersample+blur — calibrated against
// PLANTED-ERROR negative controls (see calibrate mode): a wrong palette tone,
// a 1px geometry shift and a wrong radius all exceed 32; fractional-origin
// rasterization noise (the board's phones sit at fractional page offsets) stays under
const browser = await chromium.launch();

async function shotTarget(caseId) {
  const src = SOURCES[caseId];
  if (!src) throw new Error(`no source locator for ${caseId}`);
  const el = src.find(TABLE.screens[src.screen].elements);
  if (!el) throw new Error(`${caseId}: source element not found in values-table ${src.screen}`);
  // viewport must exceed the tallest board phone (~2600px on flat-scroll
  // screens) — an element screenshot of an element taller than the viewport
  // shifts/clips its content.
  const page = await browser.newPage({ viewport: { width: 1800, height: 3200 }, deviceScaleFactor: 2 });
  await page.goto('file://' + BOARD.replace(/ /g, '%20'), { waitUntil: 'load' });
  await page.waitForSelector('figure.frame#S40', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  // Screenshot the .phone ELEMENT (scroll-independent), then crop at the
  // values-table box (phone-relative by construction) inside the canvas diff.
  const phone = page.locator(`figure.frame#${src.screen} .phone`);
  const phonePng = await phone.screenshot();
  await page.close();
  return { phonePng, box: el.box };
}

async function shotRender(caseId) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/?pixel=${caseId}`, { waitUntil: 'load', timeout: 120_000 });
  const stage = page.locator('[data-testid="pixel-stage"]');
  await stage.waitFor({ state: 'visible', timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const png = await stage.screenshot();
  await page.close();
  writeFileSync(resolve(OUT, `${caseId}.render.png`), png);
  return png;
}

async function diffPngs(caseId, aPng, bPng, cropA) {
  const page = await browser.newPage();
  const res = await page.evaluate(
    async ([aB64, bB64, tol, crop]) => {
      const load = (b64) =>
        new Promise((ok, err) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = err;
          img.src = 'data:image/png;base64,' + b64;
        });
      const [a, b] = await Promise.all([load(aB64), load(bB64)]);
      // A is the full phone screenshot — crop it at the values-table box.
      // INSET: the outer ring of a component crop is painted by its board
      // CONTEXT (neighboring shadows, adjacent surfaces) that a lone harness
      // stage cannot reproduce — component diffs compare inset by 2px; the
      // boundary is covered by the Phase-2 SCREEN diffs (full context there).
      const INSET = 2;
      const w = Math.min(crop ? crop.w : a.width, b.width) - INSET * 2;
      const h = Math.min(crop ? crop.h : a.height, b.height) - INSET * 2;
      // Screenshots are DSF=2 bitmaps; crop in device px, downsample to CSS px
      // with smoothing (2×-supersample average → AA phase noise cancels).
      const S = 2;
      const cv = (img, sx, sy) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx * S, sy * S, w * S, h * S, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      // 3×3 box blur before compare: antialiasing PHASE differences (same glyph,
      // same position, different AA distribution) equalize under blur, while a
      // real ≥1px displacement or wrong colour survives it (cream↔green edge
      // contrast ~150/channel → ~50 after blur ≫ TOL). Founder threshold reads
      // "≤1% (antialiasing only)" — this is the AA discount, made mechanical.
      const blur3 = (src, w, h) => {
        const out = new Uint8ClampedArray(src.length);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            for (let ch = 0; ch < 3; ch++) {
              let s = 0, n = 0;
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                  const yy = y + dy, xx = x + dx;
                  if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
                  s += src[(yy * w + xx) * 4 + ch];
                  n++;
                }
              out[(y * w + x) * 4 + ch] = s / n;
            }
            out[(y * w + x) * 4 + 3] = 255;
          }
        return out;
      };
      const da = blur3(cv(a, (crop ? crop.x : 0) + INSET, (crop ? crop.y : 0) + INSET), w, h);
      const db = blur3(cv(b, INSET, INSET), w, h);
      // keep the cropped target for the artifact
      const tc = document.createElement('canvas');
      tc.width = w; tc.height = h;
      const tctx = tc.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(a, ((crop ? crop.x : 0) + INSET) * S, ((crop ? crop.y : 0) + INSET) * S, w * S, h * S, 0, 0, w, h);
      const targetPng = tc.toDataURL('image/png').split(',')[1];
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const octx = out.getContext('2d');
      const od = octx.createImageData(w, h);
      let bad = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (d > tol) {
          bad++;
          od.data[i] = 255;
          od.data[i + 3] = 255;
        } else {
          od.data[i] = da[i];
          od.data[i + 1] = da[i + 1];
          od.data[i + 2] = da[i + 2];
          od.data[i + 3] = 60;
        }
      }
      octx.putImageData(od, 0, 0);
      return {
        pct: +((bad / (w * h)) * 100).toFixed(3),
        w,
        h,
        sizeMismatch: crop && (crop.w !== b.width || crop.h !== b.height) ? { target: [crop.w, crop.h], render: [b.width, b.height] } : null,
        diffPng: out.toDataURL('image/png').split(',')[1],
        targetPng,
      };
    },
    [aPng.toString('base64'), bPng.toString('base64'), TOL, cropA ?? null],
  );
  await page.close();
  writeFileSync(resolve(OUT, `${caseId}.diff.png`), Buffer.from(res.diffPng, 'base64'));
  writeFileSync(resolve(OUT, `${caseId}.target.png`), Buffer.from(res.targetPng, 'base64'));
  return res;
}

const report = [];
for (const c of cases) {
  try {
    const t = await shotTarget(c);
    const r = await shotRender(c);
    const d = await diffPngs(c, t.phonePng, r, t.box);
    report.push({ case: c, box: t.box, pct: d.pct, sizeMismatch: d.sizeMismatch, pass: d.pct <= 1.0 });
  } catch (e) {
    report.push({ case: c, error: String(e.message || e) });
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 2));
const rf = resolve(OUT, 'report.json');
let prior = {};
try { prior = JSON.parse(readFileSync(rf, 'utf8')); } catch {}
for (const r of report) prior[r.case] = { ...r, at: new Date().toISOString() };
writeFileSync(rf, JSON.stringify(prior, null, 1));
