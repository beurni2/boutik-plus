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

/**
 * FOUNDER REPORT 2026-08-03 — « video is not playing … only the buyer's pwa ».
 * The cause was PLACEMENT, not plumbing: on Boutik+ the clip lived on the fiche
 * only, so the Produits LIST — the screen he actually watches — showed nothing
 * until he tapped into a product. The supplier surface already played it on the
 * card. These pin the list row, so the two surfaces cannot drift apart again.
 */
describe('the Produits LIST row plays the clip, not only the fiche', () => {
  const screens = readFileSync(join(__dirname, '..', 'src', 'v2', 'screens1.tsx'), 'utf8');
  const comps = readFileSync(join(__dirname, '..', 'src', 'v2', 'components.tsx'), 'utf8');

  it('the row passes its clip through the SAME media base as its photograph', () => {
    expect(screens).toContain('clipUri: `${mediaBase}/${r.videoRef}`');
    // no base ⇒ no clip prop at all, exactly as photoSlot answers « unavailable »
    expect(screens).toMatch(/r\.videoRef === undefined \|\| r\.videoRef === '' \|\| mediaBase === null/);
  });

  it('the tile plays the clip WITH the photograph as poster, and falls back to the photo', () => {
    expect(comps).toContain('<FicheVideo src={clipUri} poster={photo.uri} />');
    // the photo branch survives untouched for every product without a clip
    expect(comps).toMatch(/photo\.kind === 'photo' && !broken \? \(\s*<Image/);
  });

  it('a broken photograph still wins over the clip — the tile never shows a player over a dead frame', () => {
    // `!broken` guards BOTH branches: an image that failed to load falls to the
    // designed placeholder rather than a video floating on nothing.
    expect(comps).toMatch(/photo\.kind === 'photo' && !broken && clipUri !== undefined/);
  });
});

/**
 * CADRE-SUPPLIER (founder report 2026-08-03): « On produits when I tap the
 * video product to see it, the frame becomes too big and filling the screen
 * which is inappropriate to see and it's the same thing on the supplier's mes
 * produits screen too and on there I can not tap to see other photos. »
 *
 * Two defects, and the first one's shape is the reason he saw it twice: both
 * screens render THIS component, so an unbounded clip was one bug reported as
 * two. The second is its own miss — the fournisseur card carried every capture
 * on the wire and offered no way to open any of them.
 */
describe('CADRE-SUPPLIER — the clip is bounded, and his photos are reachable', () => {
  const code = web.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const carte = readFileSync(join(__dirname, '..', 'src', 'fournisseur', 'FournisseurApp.tsx'), 'utf8');

  it('THE CLIP WEARS THE PHOTOGRAPH’S FRAME — asserted against the photo’s OWN style', () => {
    // PIN EVOLVED (founder order 2026-08-03: « make it be like photo frame but
    // playing the video »). The first fix was a bare `maxHeight`, and he was
    // right to reject it: it stopped the clip filling the screen but left it a
    // DIFFERENT SHAPE from the photographs beside it.
    //
    // This does not hardcode the frame twice. It READS the photo's real style
    // out of screens1.tsx and requires the clip to carry the same four values,
    // so if the photo's frame ever changes and the clip's does not, THIS fails
    // rather than the founder noticing months later.
    const photo = /style=\{\{ width: '100%', maxWidth: PHOTO_COLUMN_MAX[^}]*\}\}/.exec(fiche)?.[0] ?? '';
    expect(photo, 'the photo style moved — re-anchor this pin').not.toBe('');
    expect(photo).toContain('aspectRatio: 1');
    expect(photo).toContain('borderRadius: GEO.r.iconTile');

    // …and now the clip, value for value.
    expect(code).toMatch(/width: '100%'/);
    expect(code).toMatch(/maxWidth: PHOTO_FRAME_MAX/);
    expect(code).toMatch(/aspectRatio: 1/);
    expect(code).toMatch(/borderRadius: GEO\.r\.iconTile/);
    // `cover` is the photo's `resizeMode="cover"` in DOM vocabulary — without
    // it a non-square clip letterboxes inside the square frame.
    expect(code).toMatch(/objectFit: 'cover'/);
    // the column cap is the SAME NUMBER the photo uses (680), not a lookalike
    const photoMax = /const PHOTO_COLUMN_MAX = (\d+);/.exec(fiche)?.[1];
    const clipMax = /const PHOTO_FRAME_MAX = (\d+);/.exec(web)?.[1];
    expect(clipMax, 'the clip and the photo cap at different widths').toBe(photoMax);
    // and the old cap is gone — a leftover maxHeight would fight the square
    expect(code).not.toMatch(/maxHeight/);
  });

  it('ONE COMPONENT SERVES BOTH SCREENS — which is why the cap fixes both reports', () => {
    expect(fiche).toContain('<FicheVideo');
    expect(carte).toContain('<FicheVideo');
  });

  it('THE FOURNISSEUR CARD OPENS HIS PHOTOS — the identity thumb is a tap target', () => {
    expect(carte).toContain('galleryPhotos(produit.assetRefs, mediaBase)');
    expect(carte).toContain('<PhotoViewer photo={viewing} onClose={() => setViewing(null)} />');
    // the 74px thumbnail opens the first photo…
    expect(carte).toMatch(/onPress=\{\(\) => setViewing\(photos\[0\] \?\? null\)\}/);
    // …and it must not offer a tap when there is nothing to open, which is the
    // dead-affordance the honest-states law forbids.
    expect(carte).toContain('disabled={photos.length === 0}');
  });

  it('EVERY OTHER CAPTURE IS REACHABLE — the actual sentence he wrote', () => {
    // A strip of all photos, each its own tap target. Rendered only when there
    // is more than one: repeating the single photo above it would be noise.
    expect(carte).toMatch(/photos\.length > 1 &&/);
    expect(carte).toMatch(/photos\.map\(\(ph\) => \([\s\S]{0,200}onPress=\{\(\) => setViewing\(ph\)\}/);
  });

  it('IT REUSES THE FICHE’S OWN VIEWER — the two surfaces cannot drift apart', () => {
    // Both screens open photos through the same `galleryPhotos` + `PhotoViewer`
    // pair, so labels, ordering and the private-ref filter stay identical.
    expect(fiche).toContain('galleryPhotos(');
    expect(fiche).toContain('PhotoViewer');
    expect(carte).toContain('PhotoViewer');
    // …and no second viewer was invented for this card
    expect(carte).not.toContain('<Modal');
  });
});
