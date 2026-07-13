import { describe, expect, it } from 'vitest';
import {
  ExifLeakError,
  MAX_JPEG_EDGE_PX,
  jpegCarriesExif,
  stripJpegMetadata,
} from '../src/studio/normalization';

/**
 * WO-6.5 · B1.3 — THE HOSTILE-IMAGE CORPUS (the trust factory's immune
 * system). Threat model: a HOSTILE ENCODER, not a benign camera. Each fixture
 * below has a NAMED expected outcome — clean (the payload does not survive) or
 * fail-closed (a refusal, never a crash). Nothing silently passes. The final
 * block proves NON-VACUITY: the OLD drop-list stripper LEAKS on fixtures the
 * allow-list keeps clean — a hardening that changes nothing is not a hardening.
 */

// ── fixture grammar (real JPEG segments, deterministic bytes) ──────────────
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}
const chars = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const DQT = seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]);
const SOF0 = seg(0xc0, [8, 0, 16, 0, 16, 1, 0x11, 0]); // 16×16 baseline
const DHT = seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]);
const SOS_HEADER = seg(0xda, [1, 0, 0, 0, 63, 0]);
const ENTROPY = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd3, 0x78]; // stuffed FF00 + RST3
function jpeg(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}
const CORE = [DQT, SOF0, DHT, SOS_HEADER, ENTROPY]; // the allow-listed image core (pre-EOI)
const CLEAN_CORE = jpeg(SOI, ...CORE, EOI);

// hostile carriers
const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const APP1_EXIF = seg(0xe1, [...EXIF_ID, 0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
const APP2_ICC = seg(0xe2, chars('ICC_PROFILE\0secret-location-payload'));
const APP15 = seg(0xef, chars('APP15-HOSTILE-BLOB'));
const COM_PAYLOAD = seg(0xfe, chars('ship-this-to-the-buyer'));
const ZIP_LOCAL = chars('PKhidden.zip-entry'); // a real ZIP local-file signature
const HTML_POLYGLOT = chars('<html><script>steal()</script>');

// a byte-subsequence search (did a payload survive?)
function contains(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// the OLD DROP-LIST stripper, reproduced faithfully (pre-WO-6.5): copy every
// segment except APP1/APP13/COM; at SOS copy the rest of the stream VERBATIM.
function legacyDropListStrip(bytes: Uint8Array): Uint8Array {
  const STRIPPED = new Set([0xe1, 0xed, 0xfe]);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not jpeg');
  const out = new Uint8Array(bytes.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  let o = 2;
  let i = 2;
  while (i + 2 <= bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('bad marker');
    const marker = bytes[i + 1]!;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out[o++] = 0xff;
      out[o++] = marker;
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      out.set(bytes.subarray(i), o); // ← copies EVERYTHING after SOS, incl. post-EOI
      o += bytes.length - i;
      return out.subarray(0, o);
    }
    if (marker === 0xd9) {
      out[o++] = 0xff;
      out[o++] = 0xd9;
      return out.subarray(0, o);
    }
    if (i + 4 > bytes.length) throw new Error('trunc');
    const len = ((bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    if (len < 2 || i + 2 + len > bytes.length) throw new Error('overrun');
    if (!STRIPPED.has(marker)) {
      out.set(bytes.subarray(i, i + 2 + len), o); // ← keeps APP2/ICC, APP15, APP0…
      o += 2 + len;
    }
    i += 2 + len;
  }
  throw new Error('no scan');
}

// ── THE CORPUS — each fixture with its ONE named expected outcome ──────────
type Outcome = 'clean' | 'fail-closed';
interface Fixture {
  name: string;
  bytes: Uint8Array;
  outcome: Outcome;
  /** For 'clean': byte payloads that MUST NOT survive into the output. */
  mustNotSurvive?: number[][];
}

const CORPUS: Fixture[] = [
  {
    name: 'metadata in a segment the old drop-list ignored (APP2/ICC + APP15)',
    bytes: jpeg(SOI, APP2_ICC, DQT, SOF0, DHT, APP15, SOS_HEADER, ENTROPY, EOI),
    outcome: 'clean',
    mustNotSurvive: [chars('ICC_PROFILE'), chars('secret-location-payload'), chars('APP15-HOSTILE-BLOB')],
  },
  {
    name: 'a COM payload injected AFTER the scan, before EOI',
    bytes: jpeg(SOI, ...CORE, COM_PAYLOAD, EOI),
    outcome: 'clean',
    mustNotSurvive: [chars('ship-this-to-the-buyer')],
  },
  {
    name: 'post-EOI polyglot payload (valid JPEG + appended ZIP)',
    bytes: jpeg(SOI, ...CORE, EOI, ZIP_LOCAL),
    outcome: 'clean',
    mustNotSurvive: [chars('PK'), chars('hidden.zip-entry')],
  },
  {
    name: 'post-EOI polyglot payload (valid JPEG + appended HTML)',
    bytes: jpeg(SOI, ...CORE, EOI, HTML_POLYGLOT),
    outcome: 'clean',
    mustNotSurvive: [chars('<html>'), chars('steal()')],
  },
  {
    name: 'multi-APP1 (three Exif carriers in a row)',
    bytes: jpeg(SOI, APP1_EXIF, APP1_EXIF, APP1_EXIF, DQT, SOF0, DHT, SOS_HEADER, ENTROPY, EOI),
    outcome: 'clean',
    mustNotSurvive: [EXIF_ID],
  },
  {
    name: 'fill-bytes (a run of 0xFF) before the real markers',
    bytes: jpeg(SOI, [0xff, 0xff, 0xff], DQT, SOF0, DHT, SOS_HEADER, ENTROPY, EOI),
    outcome: 'clean',
  },
  {
    name: 'a valid-looking APP1 marker embedded INSIDE the entropy stream',
    // FF E1 with a valid length carrying "Exif\0\0…"; a real EOI follows.
    bytes: jpeg(SOI, DQT, SOF0, DHT, SOS_HEADER, [0x12, 0x34], seg(0xe1, [...EXIF_ID, 1, 2, 3, 4]), EOI),
    outcome: 'clean',
    mustNotSurvive: [EXIF_ID],
  },
  {
    name: 'lying-length header (APP1 claims a length that overruns the buffer)',
    bytes: new Uint8Array([...SOI, 0xff, 0xe1, 0xff, 0xf0, 0x45, 0x78, ...DQT, ...SOS_HEADER, ...EOI]),
    outcome: 'fail-closed',
  },
  {
    name: 'decompression bomb (SOF declares 65535×65535)',
    bytes: jpeg(SOI, DQT, seg(0xc0, [8, 0xff, 0xff, 0xff, 0xff, 1, 0x11, 0]), DHT, SOS_HEADER, ENTROPY, EOI),
    outcome: 'fail-closed',
  },
  {
    name: 'dimension overflow past the ceiling (SOF declares 0x8000 on an edge)',
    bytes: jpeg(SOI, DQT, seg(0xc0, [8, 0x80, 0x00, 0x00, 0x10, 1, 0x11, 0]), DHT, SOS_HEADER, ENTROPY, EOI),
    outcome: 'fail-closed',
  },
  {
    name: 'zero dimension (SOF declares width 0)',
    bytes: jpeg(SOI, DQT, seg(0xc0, [8, 0, 16, 0, 0, 1, 0x11, 0]), DHT, SOS_HEADER, ENTROPY, EOI),
    outcome: 'fail-closed',
  },
  {
    name: 'a corrupt file (JPEG SOI then garbage, no valid marker) — must fail closed, never crash',
    bytes: new Uint8Array([...SOI, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55]),
    outcome: 'fail-closed',
  },
  {
    name: 'not a JPEG at all (PNG signature)',
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    outcome: 'fail-closed',
  },
];

describe('WO-6.5 B1.3 — the hostile-image corpus, each with a named outcome', () => {
  for (const fx of CORPUS) {
    it(`${fx.name} → ${fx.outcome}`, () => {
      if (fx.outcome === 'fail-closed') {
        let caught: unknown;
        try {
          stripJpegMetadata(fx.bytes);
        } catch (error) {
          caught = error;
        }
        expect(caught, 'must refuse, not pass').toBeInstanceOf(ExifLeakError);
        expect((caught as ExifLeakError).detail).toBe('strip_failed');
        return;
      }
      // 'clean': it produces output, carries NO EXIF, and drops every payload.
      const out = stripJpegMetadata(fx.bytes);
      expect(jpegCarriesExif(out), 'no EXIF survives').toBe(false);
      for (const payload of fx.mustNotSurvive ?? []) {
        expect(contains(out, payload), `payload survived: ${String.fromCharCode(...payload.slice(0, 12))}…`).toBe(false);
      }
      // the output is a well-formed SOI…EOI envelope
      expect([out[0], out[1]]).toEqual([0xff, 0xd8]);
      expect([out[out.length - 2], out[out.length - 1]]).toEqual([0xff, 0xd9]);
    });
  }

  it('the ceiling constant is a real bound the SOF guard enforces', () => {
    expect(MAX_JPEG_EDGE_PX).toBe(8192);
    // exactly at the ceiling passes; one past it refuses
    const atCeiling = jpeg(SOI, DQT, seg(0xc0, [8, 0x20, 0x00, 0x00, 0x10, 1, 0x11, 0]), DHT, SOS_HEADER, ENTROPY, EOI);
    expect(() => stripJpegMetadata(atCeiling)).not.toThrow(); // 0x2000 = 8192
    const pastCeiling = jpeg(SOI, DQT, seg(0xc0, [8, 0x20, 0x01, 0x00, 0x10, 1, 0x11, 0]), DHT, SOS_HEADER, ENTROPY, EOI);
    expect(() => stripJpegMetadata(pastCeiling)).toThrow(ExifLeakError); // 0x2001 = 8193
  });
});

describe('WO-6.5 B1.3 — NON-VACUITY: the old drop-list LEAKS where the allow-list is clean', () => {
  it('APP2/ICC survives the old drop-list, and is dropped by the allow-list', () => {
    const fx = jpeg(SOI, APP2_ICC, DQT, SOF0, DHT, APP15, SOS_HEADER, ENTROPY, EOI);
    const legacy = legacyDropListStrip(fx);
    const hardened = stripJpegMetadata(fx);
    expect(contains(legacy, chars('ICC_PROFILE')), 'old drop-list LEAKS the ICC payload').toBe(true);
    expect(contains(legacy, chars('APP15-HOSTILE-BLOB')), 'old drop-list LEAKS the APP15 blob').toBe(true);
    expect(contains(hardened, chars('ICC_PROFILE')), 'allow-list drops it').toBe(false);
    expect(contains(hardened, chars('APP15-HOSTILE-BLOB')), 'allow-list drops it').toBe(false);
  });

  it('a post-EOI polyglot payload survives the old drop-list (SOS-to-end verbatim), and is dropped by the allow-list', () => {
    const fx = jpeg(SOI, ...CORE, EOI, ZIP_LOCAL);
    const legacy = legacyDropListStrip(fx);
    const hardened = stripJpegMetadata(fx);
    expect(contains(legacy, chars('PK')), 'old drop-list SHIPS the appended ZIP').toBe(true);
    expect(contains(hardened, chars('PK')), 'allow-list discards it at EOI').toBe(false);
    expect(hardened).toEqual(CLEAN_CORE); // exactly the image core survives
  });
});
