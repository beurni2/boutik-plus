import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductAssetsInput } from '../src/supply/assets';
import { avecVideo, decideVideoChoisie, VIDEO_APP_MAX_BYTES, VIDEO_MAX_SEC, videoEchecKey, videoRefusKey } from '../src/supply/video';

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

  // Verifier M5 (2026-08-03): these three points pin the CLAMPED CEIL as a
  // function, not a constant — a mutation that welds a hardcoded 6 dies on
  // 2.3⇒3; one that drops the ceiling dies on 6.02⇒6; one that drops the
  // floor dies on 0.4⇒1 (canon refuses 0 — positive int 1..6).
  const welded = (durationSeconds: number): number => {
    const out = avecVideo(assets, { ref: 'media/v', sha256: 'c'.repeat(64), mimeType: 'video/mp4', durationSeconds });
    return out.video!.durationSec;
  };

  it('2,3 s welds to 3 — the ceil is a MEASURE, never a constant', () => {
    expect(welded(2.3)).toBe(3);
    expect(welded(1.0)).toBe(1);
    expect(welded(4.999)).toBe(5);
  });

  it('6,02 s welds to 6 — the clamp keeps the weld inside canon whatever the clock said', () => {
    expect(welded(6.02)).toBe(6); // the exact measure that turned a publish into a raw 500 (verifier B1)
    expect(welded(6.0)).toBe(6);
  });

  it('0,4 s welds to 1 — the floor; canon refuses zero', () => {
    expect(welded(0.4)).toBe(1);
  });
});

describe('videoEchecKey — the service 400 surfaces in its OWN sentence', () => {
  // The worker's refusal body is `{"error":"rejected","reason":"<typed>"}` and
  // the HTTP adapter carries it verbatim inside `HTTP 400: …` — the mapper
  // reads THAT string. Every branch pinned, else-branch included.
  it('maps each typed reason to its catalog sentence', () => {
    expect(videoEchecKey('HTTP 400: {"error":"rejected","reason":"too_long"}')).toBe('publier.video_trop_longue');
    expect(videoEchecKey('HTTP 400: {"error":"rejected","reason":"too_large"}')).toBe('publier.video_trop_lourde');
    expect(videoEchecKey('HTTP 400: {"error":"rejected","reason":"unsupported_type"}')).toBe('publier.video_illisible');
    expect(videoEchecKey('HTTP 400: {"error":"rejected","reason":"unreadable_duration"}')).toBe('publier.video_illisible');
  });

  it('an untyped failure (401, empty body, network text) falls back to the generic sentence', () => {
    expect(videoEchecKey('HTTP 401: {"error":"unauthorized"}')).toBe('publier.video_echec_envoi');
    expect(videoEchecKey('HTTP 400: ')).toBe('publier.video_echec_envoi');
  });

  it('every sentence the mapper can answer EXISTS in the catalog', () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'catalog.json'), 'utf8')) as Array<{ key: string; fr: string }>;
    const keys = new Set(cat.map((e) => e.key));
    for (const k of ['publier.video_trop_longue', 'publier.video_trop_lourde', 'publier.video_illisible', 'publier.video_echec_envoi']) {
      expect(keys.has(k), `missing catalog key: ${k}`).toBe(true);
    }
  });
});
