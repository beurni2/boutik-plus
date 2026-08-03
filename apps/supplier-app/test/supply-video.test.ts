import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductAssetsInput } from '../src/supply/assets';
import { avecVideo, decideVideoChoisie, VIDEO_APP_MAX_BYTES, VIDEO_MAX_SEC, videoRefusKey } from '../src/supply/video';

/**
 * VIDEO-PRODUIT-1c — the device-side half of the founder's 6-second bound.
 *
 * What must hold: the canon integer is the CEILING of the measured duration
 * (« 6 seconds max » can never round down into a 7th second); unreadable is a
 * refusal, same law as the service's mvhd read; every refusal names a real
 * catalog sentence; and the weld writes the SERVICE's measured clock into
 * canon's `durationSec`, never the device's.
 */

describe('decideVideoChoisie — ceil, bound, honesty', () => {
  it('5,3 s ceils to 6 and passes; 6,0 passes; 6,05 ceils to 7 and REFUSES', () => {
    expect(decideVideoChoisie(5.3, 1_000)).toEqual({ ok: true, durationSec: 6 });
    expect(decideVideoChoisie(6.0, 1_000)).toEqual({ ok: true, durationSec: 6 });
    expect(decideVideoChoisie(6.05, 1_000)).toEqual({ ok: false, reason: 'trop_longue' });
    expect(decideVideoChoisie(9, 1_000)).toEqual({ ok: false, reason: 'trop_longue' });
    expect(decideVideoChoisie(0.4, 1_000)).toEqual({ ok: true, durationSec: 1 }); // canon floor is 1 — ceil provides it
  });

  it('an UNREADABLE measure refuses — null, zero, negative, NaN', () => {
    for (const bad of [null, 0, -1, Number.NaN]) {
      expect(decideVideoChoisie(bad, 1_000)).toEqual({ ok: false, reason: 'illisible' });
    }
  });

  it('the byte ceiling refuses at the mirror of the service bound', () => {
    expect(decideVideoChoisie(5, VIDEO_APP_MAX_BYTES)).toEqual({ ok: true, durationSec: 5 });
    expect(decideVideoChoisie(5, VIDEO_APP_MAX_BYTES + 1)).toEqual({ ok: false, reason: 'trop_lourde' });
  });

  it('every refusal names a catalog sentence that EXISTS', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{ key: string; fr: string }>;
    const keys = new Set(cat.map((e) => e.key));
    for (const reason of ['trop_longue', 'trop_lourde', 'illisible'] as const) {
      const k = videoRefusKey(reason);
      expect(keys.has(k), `missing catalog key: ${k}`).toBe(true);
    }
    // …and the whole video vocabulary the screen can emit is real too.
    for (const k of [
      'publier.video_titre', 'publier.video_ajouter', 'publier.video_hint', 'publier.video_prete',
      'publier.video_retirer', 'publier.video_indisponible', 'publier.video_echec_envoi', 'publier.video_sans_photos',
    ]) {
      expect(keys.has(k), `missing catalog key: ${k}`).toBe(true);
    }
    expect(VIDEO_MAX_SEC).toBe(6); // the founder's number, pinned as itself
  });
});

describe('avecVideo — the weld writes the SERVICE clock into canon durationSec', () => {
  const mref = (ref: string) => ({ ref, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });
  const assets: ProductAssetsInput = {
    masterRef: mref('private/device/x'),
    heroSquare: mref('media/h1'),
    heroVertical: mref('media/h2'),
    proof: mref('media/p1'),
    detail: [mref('media/d1')],
    hashes: ['a'.repeat(64)],
    processingVersion: 'premium-frame.v1',
  };

  it('welds ref/sha/mime verbatim, durationSec = ceil(SERVICE measure), photos untouched', () => {
    const out = avecVideo(assets, { ref: 'media/v1', sha256: 'b'.repeat(64), mimeType: 'video/mp4', durationSeconds: 5.83 });
    expect(out.video).toEqual({ ref: 'media/v1', sha256: 'b'.repeat(64), mimeType: 'video/mp4', durationSec: 6 });
    expect(out.heroSquare).toEqual(assets.heroSquare); // nothing else moved
    expect(assets.video).toBeUndefined(); // pure — the input was not mutated
  });
});
