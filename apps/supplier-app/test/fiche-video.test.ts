import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * VIDEO-PARTOUT (5/5) — his clip on HIS OWN product page (founder order
 * 2026-08-03: « on produits from my boutik+ as well »).
 *
 * This surface is also the answer to « did my clip ride? ». Before it existed
 * no screen anywhere could say, and the question cost a hunt through live JSON.
 * So the pins here are about HONESTY as much as pixels: the web half plays the
 * real element with the whole kit, the native half states the truth it can, and
 * a product without a clip renders NOTHING extra on either.
 */

const src = (f: string) => readFileSync(join(__dirname, '..', 'src', 'v2', f), 'utf8');
const web = src('fiche-video.web.tsx');
const nat = src('fiche-video.tsx');
const fiche = src('screens1.tsx');

describe('the web half — a real <video> with the whole honesty kit', () => {
  it('renders the element with muted, loop, playsinline, metadata-only and the photo as poster', () => {
    expect(web).toContain("createElement('video'");
    for (const attr of ['muted: true', 'loop: true', 'playsInline: true', "preload: 'metadata'", 'poster']) {
      expect(web, attr).toContain(attr);
    }
  });

  it('does NOT borrow the buyer PWA’s observer role — no machinery is implied that does not exist here', () => {
    // COMMENTS STRIPPED FIRST (the repo idiom): this file's own comment
    // EXPLAINS why the role is absent, so a raw scan reads the explanation as
    // the violation. The pin must read code, never prose — it caught me.
    const code = web.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.includes('video-hero')).toBe(false);
  });

  it('NO CLIP ⇒ null on both halves — never an empty frame pretending', () => {
    for (const half of [web, nat]) {
      expect(half).toMatch(/if \(src === undefined \|\| src === ''\) return null;/);
    }
  });
});

describe('the native half — states the truth it CAN state', () => {
  it('says the product has a clip, from the catalog, never an inline string', () => {
    expect(nat).toContain("tr('produits.video_presente')");
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{ key: string; fr: string }>;
    const entry = cat.find((e) => e.key === 'produits.video_presente');
    expect(entry, 'missing catalog key: produits.video_presente').toBeDefined();
    expect(entry!.fr.length).toBeGreaterThan(0);
  });
});

describe('the fiche wires it to the REAL row, through the same media base as the photos', () => {
  it('builds the clip url from row.videoRef and mediaBase — never a second base', () => {
    expect(fiche).toMatch(/row\.videoRef === undefined \|\| row\.videoRef === ''/);
    expect(fiche).toContain('`${mediaBase}/${row.videoRef}`');
    expect(fiche).toContain('<FicheVideo src={clipUri} poster={photos[0]?.uri} />');
  });
});
