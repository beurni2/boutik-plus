import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExifLeakError,
  assertExifFree,
  base64ToBytes,
  bytesToBase64,
  failureDetailOf,
  jpegCarriesExif,
  stripJpegMetadata,
} from '../src/studio/normalization';

/**
 * WO-4.2E Part A — STRIP, DON'T TRUST. Founder device evidence:
 * « détail : exif_leak » — the iOS encoder preserves EXIF through
 * saveAsync's re-encode; the WO-4.2C/D fail-closed guard correctly
 * refused. The stripper REWRITES the stream (drop APP1/APP13/COM, keep
 * structure + rendering segments) and the guard becomes a TRUE
 * POST-CONDITION on the stripped bytes — the bytes that ship.
 */

// --- fixture builders: real segment grammar, deterministic bytes ---------
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}
const APP0_JFIF = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 2, 0, 0, 1, 0, 1, 0, 0]);
const APP1_EXIF = seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]); // Exif\0\0 + TIFF header
const APP1_XMP = seg(0xe1, [...'http://ns.adobe.com/xap/1.0/\0'].map((c) => c.charCodeAt(0)));
const APP2_ICC = seg(0xe2, [...'ICC_PROFILE\0'].map((c) => c.charCodeAt(0)));
const APP13_IPTC = seg(0xed, [...'Photoshop 3.0\0'].map((c) => c.charCodeAt(0)));
const COM = seg(0xfe, [...'shot on my phone at home'].map((c) => c.charCodeAt(0)));
const DQT = seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]);
const SOF0 = seg(0xc0, [8, 0, 16, 0, 16, 1, 0x11, 0]);
const DHT = seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]);
const SOS_HEADER = seg(0xda, [1, 0, 0, 0, 63, 0]);
const ENTROPY = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd3, 0x78]; // incl. a stuffed FF00 and an RST3

function jpeg(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

const DIRTY = jpeg(SOI, APP0_JFIF, APP1_EXIF, COM, DQT, SOF0, DHT, APP13_IPTC, SOS_HEADER, ENTROPY, EOI);
const CLEAN = jpeg(SOI, APP0_JFIF, APP2_ICC, DQT, SOF0, DHT, SOS_HEADER, ENTROPY, EOI);
// WO-6.5 B1.3: the allow-list keeps ONLY DQT·SOF·DHT·SOS+entropy·EOI. A JPEG
// carrying nothing else is what survives byte-identical.
const CLEAN_ALLOWLISTED = jpeg(SOI, DQT, SOF0, DHT, SOS_HEADER, ENTROPY, EOI);

afterEach(() => vi.unstubAllGlobals());

describe('WO-6.5 B1.3 — the stripper rewrites the stream by ALLOW-LIST', () => {
  it('keeps ONLY DQT/SOF/DHT/SOS+entropy/EOI; drops APP0/JFIF, APP1, APP13 and COM by default', () => {
    const out = stripJpegMetadata(DIRTY);
    expect(out).toEqual(CLEAN_ALLOWLISTED); // APP0/JFIF now dropped too (was kept under the drop-list)
    expect(jpegCarriesExif(out)).toBe(false);
    expect(() => assertExifFree(out)).not.toThrow();
  });

  /**
   * THE POST-CONDITION NOW COVERS WHAT THE STRIP REMOVES (founder ruling
   * 2026-07-25, gallery slice). The STRIP already dropped XMP and IPTC — that
   * was proven. The DETECTOR did not see them: it matched only APP1 carrying
   * the literal `Exif\0\0`, so `assertExifFree` proved strictly less than
   * `stripJpegMetadata` removed. On camera output that gap was theoretical; a
   * gallery image is where it bites, because phone gallery apps rewrite XMP and
   * XMP carries GPS.
   *
   * These are the assertions the widening exists for. Without them the widened
   * matcher would never fire in the suite, and a matcher that never fires is
   * not a matcher.
   */
  it('WIDENED — an XMP-bearing APP1 is DETECTED as metadata, not only dropped', () => {
    const xmpOnly = jpeg(SOI, APP1_XMP, DQT, SOS_HEADER, ENTROPY, EOI);
    expect(jpegCarriesExif(xmpOnly)).toBe(true);               // the old detector said false
    expect(() => assertExifFree(xmpOnly)).toThrow(ExifLeakError);
    // and the post-condition holds on the stripped bytes
    expect(jpegCarriesExif(stripJpegMetadata(xmpOnly))).toBe(false);
  });

  it('WIDENED — an IPTC-bearing APP13 is DETECTED as metadata', () => {
    const iptcOnly = jpeg(SOI, APP13_IPTC, DQT, SOS_HEADER, ENTROPY, EOI);
    expect(jpegCarriesExif(iptcOnly)).toBe(true);              // the old detector said false
    expect(() => assertExifFree(iptcOnly)).toThrow(ExifLeakError);
    expect(jpegCarriesExif(stripJpegMetadata(iptcOnly))).toBe(false);
  });

  it('WIDENED — a vendor APP1 with an UNKNOWN identifier cannot slip past on the identifier', () => {
    // the whole point of dropping the identifier check: a flavour we have never
    // seen is still an APP1, and APP1 is a metadata carrier
    const vendor = seg(0xe1, [...'com.vendor.private\0GPS 12.37 -1.53'].map((c) => c.charCodeAt(0)));
    const dirty = jpeg(SOI, vendor, DQT, SOS_HEADER, ENTROPY, EOI);
    expect(jpegCarriesExif(dirty)).toBe(true);
    expect(jpegCarriesExif(stripJpegMetadata(dirty))).toBe(false);
  });

  it('THE WIDENING DID NOT BECOME "everything is metadata" — the rendering segments still pass', () => {
    // APP2/ICC and APP0/JFIF are dropped by the strip but are NOT privacy
    // carriers, so the DETECTOR must not claim they are — otherwise every
    // untouched JPEG would fail the post-condition and the guard would be noise.
    expect(jpegCarriesExif(CLEAN)).toBe(false);          // carries APP0/JFIF + APP2/ICC
    expect(jpegCarriesExif(CLEAN_ALLOWLISTED)).toBe(false);
    expect(() => assertExifFree(CLEAN)).not.toThrow();
  });

  it('an XMP-bearing APP1 (no Exif identifier) is dropped — the whole APP1 class is a metadata carrier', () => {
    const out = stripJpegMetadata(jpeg(SOI, APP1_XMP, DQT, SOS_HEADER, ENTROPY, EOI));
    expect(out).toEqual(jpeg(SOI, DQT, SOS_HEADER, ENTROPY, EOI));
  });

  it('APP2/ICC and APP0/JFIF are NOT rendering-exempt under the allow-list — both are dropped', () => {
    // CLEAN carries APP0/JFIF + APP2/ICC; the allow-list strips them to the image core.
    expect(stripJpegMetadata(CLEAN)).toEqual(CLEAN_ALLOWLISTED);
    // and a JPEG that already carries only allow-listed segments passes BYTE-IDENTICAL.
    expect(stripJpegMetadata(CLEAN_ALLOWLISTED)).toEqual(CLEAN_ALLOWLISTED);
  });

  it('the WO-4.2D verifier\'s own crafted layouts strip clean (APP0/JFIF now dropped)', () => {
    const theirClean = jpeg(SOI, APP0_JFIF, DQT, SOS_HEADER, ENTROPY, EOI);
    expect(stripJpegMetadata(theirClean)).toEqual(jpeg(SOI, DQT, SOS_HEADER, ENTROPY, EOI));
    const theirDirty = jpeg(SOI, APP1_EXIF, DQT, SOS_HEADER, ENTROPY, EOI);
    expect(jpegCarriesExif(theirDirty)).toBe(true);
    expect(jpegCarriesExif(stripJpegMetadata(theirDirty))).toBe(false);
  });

  it('a standalone TEM before the scan carries nothing the header needs → dropped, never mis-read', () => {
    const withTem = jpeg(SOI, [0xff, 0x01], DQT, SOF0, DHT, SOS_HEADER, ENTROPY, EOI);
    expect(stripJpegMetadata(withTem)).toEqual(CLEAN_ALLOWLISTED);
  });

  it('FAIL-CLOSED (strip_failed): non-JPEG, garbage segment, truncated header, overrunning length, and no-SOS streams all REFUSE', () => {
    const bad: Uint8Array[] = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG
      jpeg(SOI, [0x00, 0x00, 0x00]), // not a segment marker
      new Uint8Array([...SOI, 0xff, 0xe1, 0x00]), // truncated length
      new Uint8Array([...SOI, 0xff, 0xe1, 0xff, 0xff, 0x00]), // length overruns
      jpeg(SOI, DQT), // ends before SOS
    ];
    for (const bytes of bad) {
      let caught: unknown;
      try {
        stripJpegMetadata(bytes);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ExifLeakError);
      expect((caught as ExifLeakError).detail).toBe('strip_failed');
    }
    expect(failureDetailOf(new ExifLeakError('x', 'strip_failed'))).toBe('strip_failed');
  });
});

describe('WO-4.2E — the encoder is the decoder\'s true inverse (the data URI ships the stripped bytes)', () => {
  it('bytesToBase64 matches the reference encoder and round-trips through OUR decoder, every length remainder', () => {
    for (let n = 0; n <= 9; n++) {
      const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 89 + 13) & 0xff));
      const encoded = bytesToBase64(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
      if (n > 0) expect(base64ToBytes(encoded)).toEqual(bytes);
    }
    expect(bytesToBase64(stripJpegMetadata(DIRTY))).toBe(
      Buffer.from(stripJpegMetadata(DIRTY)).toString('base64'),
    );
  });

  it('the FULL path runs with NO runtime global: encode → decode → strip → post-condition → data URI, atob deleted', () => {
    vi.stubGlobal('atob', undefined);
    const fromEncoder = Buffer.from(DIRTY).toString('base64'); // what saveAsync would hand us
    const bytes = base64ToBytes(fromEncoder);
    const stripped = stripJpegMetadata(bytes);
    expect(() => assertExifFree(stripped)).not.toThrow(); // the post-condition
    const uri = `data:image/jpeg;base64,${bytesToBase64(stripped)}`;
    expect(uri.startsWith('data:image/jpeg;base64,/9j')).toBe(true); // FFD8 → '/9j'
    // decoding the URI's payload returns EXACTLY the shipped bytes:
    expect(base64ToBytes(uri.slice('data:image/jpeg;base64,'.length))).toEqual(stripped);
  });
});

/**
 * DEVICE INCIDENT 2026-07-26 — the founder's captured photograph rendered as a
 * strip of real image over flat grey. That is what a JPEG looks like when the
 * decoder stops part-way, and the stripper was the only thing rewriting those
 * bytes.
 *
 * THE CAUSE: `nextEntropyMarker` walks PAST `RST0`–`RST7`, so the code already
 * knew restart markers occur in these streams — while the allow-list DROPPED
 * `DRI`, the segment that declares the restart interval. A decoder that meets a
 * restart marker it was never told about stops there.
 *
 * EVERY FIXTURE ABOVE HAS A HAND-BUILT ENTROPY STREAM WITH NO RESTART INTERVAL,
 * which is exactly why 460 green tests said nothing about it.
 */
const DRI = seg(0xdd, [0x00, 0x08]); // restart interval = 8 MCUs
const ENTROPY_WITH_RESTARTS = [
  0x12, 0x34, 0xff, 0x00, 0x56, // stuffed FF00
  0xff, 0xd0, 0x9a, 0xbc,       // RST0 then more entropy
  0xff, 0xd1, 0xde, 0xf0,       // RST1 then more entropy
];
const RESTART_JPEG = jpeg(SOI, APP1_EXIF, DQT, DRI, SOF0, DHT, SOS_HEADER, ENTROPY_WITH_RESTARTS, EOI);

describe('RESTART INTERVALS SURVIVE THE STRIP — the grey-photograph defect', () => {
  it('DRI is KEPT, so a stream carrying restart markers is still decodable', () => {
    const out = stripJpegMetadata(RESTART_JPEG);
    // the DRI segment is present, byte for byte
    expect([...out].join(',')).toContain([...DRI].join(','));
  });

  it('and the ENTROPY past each restart marker survives — truncation is the actual failure', () => {
    const out = stripJpegMetadata(RESTART_JPEG);
    // every entropy byte after RST0 and RST1 must still be there
    expect([...out].join(',')).toContain([...ENTROPY_WITH_RESTARTS].join(','));
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9); // still terminated at a real EOI
  });

  it('the privacy property is UNCHANGED by admitting DRI — EXIF still goes', () => {
    const out = stripJpegMetadata(RESTART_JPEG);
    expect(jpegCarriesExif(out)).toBe(false);
    expect(() => assertExifFree(out)).not.toThrow();
  });

  it('DRI carries no user data — it is two bytes of restart count, nothing else', () => {
    expect(DRI).toHaveLength(6); // FF DD len_hi len_lo + 2 payload bytes
    expect(DRI.slice(4)).toEqual([0x00, 0x08]);
  });
});
