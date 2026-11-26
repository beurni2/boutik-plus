import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ A PRODUCT CLIP THAT STILL SAYS WHERE IT WAS FILMED IS REFUSED ═══
 *
 * Founder ruling 2026-11-26: « refuse any clip still carrying a location, with
 * a clear message, never edit the clip ». A phone with camera location on
 * writes the place into the MP4's metadata boxes. So the door reads those
 * boxes — and ONLY those boxes, never the picture's own bytes in `mdat` — and
 * refuses before anything is stored.
 *
 * Driven against the REAL bundle (`dist/worker/worker.mjs`, built by
 * `pretest`) on workerd, and the outcome is asked of the BUCKET, never taken
 * from the answer.
 *
 * The controls matter as much as the refusals: a clean clip in each real
 * phone layout (Android's writer, the iPhone's `moov/meta`), a QuickTime
 * `udta` with its 4-byte zero terminator, and a clean clip whose `mdat`
 * happens to contain every marker — all still stored, byte-identical.
 */

const BUNDLE = fileURLToPath(new URL('../dist/worker/worker.mjs', import.meta.url));
const WRITE = 'test-media-write-lieu';

/* ----------------------------------------------------- mp4 fixture forge -- */

const enc = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0) & 255));
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const u16 = (v: number): Uint8Array => new Uint8Array([(v >>> 8) & 255, v & 255]);
const u32 = (v: number): Uint8Array => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const zeros = (n: number): Uint8Array => new Uint8Array(n);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** A box whose 4-byte type is given as raw bytes (an `ilst` item is a key index). */
const rawBox = (type: Uint8Array, ...payload: Uint8Array[]): Uint8Array => {
  const body = concat(...payload);
  return concat(u32(8 + body.length), type, body);
};
/** Types are latin-1, so `©xyz` is A9 78 79 7A, as phones write it. */
const box = (type: string, ...payload: Uint8Array[]): Uint8Array => rawBox(enc(type), ...payload);
/** An ISO full box: version + flags (0) before the payload. */
const fullBox = (type: string, ...payload: Uint8Array[]): Uint8Array => box(type, zeros(4), ...payload);

const FTYP = box('ftyp', enc('isom'), zeros(4), enc('isommp41'));
const FTYP_QT = box('ftyp', enc('qt  '), zeros(4), enc('qt  '));

function mvhd(seconds: number): Uint8Array {
  const p = zeros(100);
  p.set(u32(1_000), 12);
  p.set(u32(Math.round(seconds * 1_000)), 16);
  return box('mvhd', p);
}
function mdhd(seconds: number): Uint8Array {
  const p = zeros(24);
  p.set(u32(1_000), 12);
  p.set(u32(Math.round(seconds * 1_000)), 16);
  return box('mdhd', p);
}
const hdlr = (handler: string): Uint8Array => fullBox('hdlr', zeros(4), enc(handler), zeros(12), utf8('Core Media\0'));

/** QuickTime user-data text (`©xyz`, `©mak`, …): length, language, text. */
const udtaTexte = (type: string, text: string): Uint8Array => box(type, u16(utf8(text).length), u16(0x15c7), utf8(text));
/** 3GPP `loci`: language, name, role, longitude, latitude, altitude, body, notes. */
const loci = (): Uint8Array =>
  fullBox('loci', u16(0x15c7), utf8('Atelier\0'), new Uint8Array([0]), u32(0xfffe7c00), u32(0x000c5f00), u32(0x00012c00), utf8('earth\0'), utf8('\0'));

/** Apple `mdta` metadata: `keys` (full box) + `ilst` items addressed by key index. */
const keys = (...names: string[]): Uint8Array =>
  fullBox('keys', u32(names.length), ...names.map((n) => concat(u32(8 + utf8(n).length), enc('mdta'), utf8(n))));
const ilstDe = (...values: string[]): Uint8Array =>
  box('ilst', ...values.map((v, i) => rawBox(u32(i + 1), box('data', u32(1), u32(0), utf8(v)))));
/** iPhone layout: QuickTime `meta` (NO version/flags), hdlr mdta, keys, ilst. */
const metaQt = (entries: Array<[string, string]>): Uint8Array =>
  box('meta', hdlr('mdta'), keys(...entries.map(([k]) => k)), ilstDe(...entries.map(([, v]) => v)));
/** Android writer layout: ISO full-box `meta`, hdlr mdta, keys, ilst. */
const metaIso = (entries: Array<[string, string]>): Uint8Array =>
  fullBox('meta', hdlr('mdta'), keys(...entries.map(([k]) => k)), ilstDe(...entries.map(([, v]) => v)));

const XMP_UUID = new Uint8Array([0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac]);
const xmpPaquet = (inner: string): Uint8Array =>
  utf8(`<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description ${inner}/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`);

/** A `mebx` timed-metadata sample entry: SampleEntry fields, then its key table. */
const mebx = (...keyNames: string[]): Uint8Array =>
  box('mebx', zeros(6), u16(1), box('keys', ...keyNames.map((k, i) => rawBox(u32(i + 1), box('keyd', enc('mdta'), utf8(k))))));
/** A track the duration walk accepts: mdia carries mdhd; extra boxes ride beside it. */
const trak = (opts: { udta?: Uint8Array; meta?: Uint8Array; stsdEntry?: Uint8Array } = {}): Uint8Array =>
  box(
    'trak',
    ...(opts.udta !== undefined ? [opts.udta] : []),
    ...(opts.meta !== undefined ? [opts.meta] : []),
    box(
      'mdia',
      mdhd(4),
      hdlr(opts.stsdEntry !== undefined ? 'meta' : 'vide'),
      box('minf', box('stbl', fullBox('stsd', u32(1), opts.stsdEntry ?? box('avc1', zeros(78))))),
    ),
  );

/** ftyp · [top-level boxes] · [mdat] · moov{ mvhd, …children } */
const clip = (children: Uint8Array[], o: { top?: Uint8Array[]; mdat?: Uint8Array; ftyp?: Uint8Array } = {}): Uint8Array =>
  concat(o.ftyp ?? FTYP, ...(o.top ?? []), ...(o.mdat !== undefined ? [box('mdat', o.mdat)] : []), box('moov', mvhd(4), ...children));

const LIEU = '+12.3714-001.5197/';
const ANDROID_PROPRE = metaIso([['com.android.version', '14']]);
const IPHONE_CLES: Array<[string, string]> = [
  ['com.apple.quicktime.make', 'Apple'],
  ['com.apple.quicktime.model', 'iPhone 13'],
  ['com.apple.quicktime.software', '17.5'],
  ['com.apple.quicktime.creationdate', '2026-11-20T10:12:00+0000'],
];

/** Located clips: each MUST be refused, by name, with nothing stored. */
const LOCALISEES: Array<[string, Uint8Array]> = [
  ['the movie user data carries ©xyz (Android writer layout)', clip([ANDROID_PROPRE, box('udta', udtaTexte('©xyz', LIEU)), trak()])],
  ['a TRACK user data carries ©xyz', clip([trak({ udta: box('udta', udtaTexte('©xyz', LIEU)) })])],
  ['the FILE-level user data carries ©xyz', clip([trak()], { top: [box('udta', udtaTexte('©xyz', LIEU))] })],
  ['the movie user data carries a 3GPP loci', clip([box('udta', loci()), trak()])],
  [
    'the iPhone moov/meta names com.apple.quicktime.location.ISO6709',
    clip([trak(), metaQt([...IPHONE_CLES, ['com.apple.quicktime.location.ISO6709', LIEU]])], { ftyp: FTYP_QT }),
  ],
  ['an Apple location key under another name of the family', clip([trak(), metaQt([['com.apple.quicktime.location.accuracy.horizontal', '14.2']])])],
  ['a TRACK meta names an Apple location key', clip([trak({ meta: metaQt([['com.apple.quicktime.location.ISO6709', LIEU]]) })])],
  [
    'an iTunes-style ilst item ©xyz inside udta/meta',
    clip([box('udta', fullBox('meta', hdlr('mdir'), box('ilst', box('©xyz', box('data', u32(1), u32(0), utf8(LIEU)))))), trak()]),
  ],
  ['a udta/XMP_ packet names exif:GPSLatitude', clip([box('udta', box('XMP_', xmpPaquet('exif:GPSLatitude="12,22.284N" exif:GPSLongitude="1,31.182W"'))), trak()])],
  ['a file-level XMP uuid names GPSLongitude', clip([trak()], { top: [box('uuid', XMP_UUID, xmpPaquet('exif:GPSLongitude="1,31.182W"'))] })],
  ['a mebx timed-metadata track declares an Apple location key', clip([trak(), trak({ stsdEntry: mebx('com.apple.quicktime.location.ISO6709') })])],
];

/** Clean clips: each MUST be stored and read back byte-identical. */
const PROPRES: Array<[string, Uint8Array]> = [
  ['a bare clip', clip([trak()])],
  ['the Android writer layout without location', clip([ANDROID_PROPRE, trak()])],
  ['the iPhone layout with make, model, software and creation date', clip([trak(), metaQt(IPHONE_CLES)], { ftyp: FTYP_QT })],
  [
    'a QuickTime udta (make, model) ending with its 4-byte zero terminator',
    clip([box('udta', udtaTexte('©mak', 'samsung'), udtaTexte('©mod', 'SM-A155F'), zeros(4)), trak()]),
  ],
  ['an XMP packet with no coordinates', clip([box('udta', box('XMP_', xmpPaquet('xmp:CreatorTool="Montage"'))), trak()])],
  ['a mebx track whose keys name no location', clip([trak(), trak({ stsdEntry: mebx('com.apple.quicktime.still-image-time') })])],
  [
    'a clean clip whose PICTURE bytes happen to contain every marker',
    clip([trak()], {
      mdat: concat(
        box('udta', udtaTexte('©xyz', LIEU)),
        enc('loci'),
        utf8('com.apple.quicktime.location.ISO6709 GPSLatitude GPSLongitude'),
        box('meta', hdlr('mdta'), keys('com.apple.quicktime.location.ISO6709')),
      ),
    }),
  ],
];

/** Metadata that cannot be walked: refused under its own name, nothing stored. */
const ILLISIBLES: Array<[string, Uint8Array]> = [
  ['a udta whose child box is undersized', clip([box('udta', u32(4), enc('©xy')), trak()])],
  ['a meta with no handler where either layout puts it', clip([box('meta', zeros(4), box('free', zeros(8))), trak()])],
  // The terminator's edge: 4 zero bytes are accepted ONLY as the last thing in a udta.
  ['a udta child claiming size 4 with a whole box after it', clip([box('udta', udtaTexte('©mak', 'samsung'), u32(4), udtaTexte('©mod', 'SM-A155F')), trak()])],
  ['a udta zero « terminator » with a whole box after it', clip([box('udta', udtaTexte('©mak', 'samsung'), zeros(4), udtaTexte('©mod', 'SM-A155F')), trak()])],
];

/* --------------------------------------------------------- the real door -- */

let mf!: Miniflare;
let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'video-lieu-'));
  mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(BUNDLE, 'utf8') }],
    compatibilityDate: '2025-07-05',
    r2Buckets: { BUCKET: 'video-lieu-bucket' },
    r2Persist: dir,
    bindings: { MEDIA_WRITE_SECRET: WRITE },
  });
});
afterAll(async () => {
  await mf?.dispose();
  rmSync(dir, { recursive: true, force: true });
});

const envoyer = (bytes: Uint8Array): Promise<Response> =>
  mf.dispatchFetch('http://media/media/video', { method: 'POST', headers: { 'X-Write-Key': WRITE }, body: bytes }) as unknown as Promise<Response>;
/** ASK THE BUCKET: how many objects it holds right now. */
const compte = async (): Promise<number> => (await (await mf.getR2Bucket('BUCKET')).list()).objects.length;

describe('the media Worker refuses a clip that still says where it was filmed — asked of the bucket', () => {
  for (const [quoi, bytes] of LOCALISEES) {
    it(`refused, nothing stored: ${quoi}`, async () => {
      const avant = await compte();
      const res = await envoyer(bytes);
      const corps = (await res.json()) as Record<string, unknown>;
      expect({ status: res.status, corps }).toEqual({ status: 400, corps: { error: 'rejected', reason: 'location_present' } });
      expect(await compte(), 'ASK THE BUCKET: nothing was written').toBe(avant);
    });
  }

  for (const [quoi, bytes] of PROPRES) {
    it(`stored and read back byte-identical: ${quoi}`, async () => {
      const avant = await compte();
      const res = await envoyer(bytes);
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
      const { ref } = (await res.json()) as { ref: string };
      expect(await compte(), 'ASK THE BUCKET: one object more').toBe(avant + 1);
      const lu = await mf.dispatchFetch(`http://media/${ref}`);
      expect(lu.status).toBe(200);
      expect(new Uint8Array(await lu.arrayBuffer())).toEqual(bytes);
    });
  }

  for (const [quoi, bytes] of ILLISIBLES) {
    it(`refused as unreadable metadata, nothing stored: ${quoi}`, async () => {
      const avant = await compte();
      const res = await envoyer(bytes);
      const corps = (await res.json()) as Record<string, unknown>;
      expect({ status: res.status, corps }).toEqual({ status: 400, corps: { error: 'rejected', reason: 'unreadable_metadata' } });
      expect(await compte(), 'ASK THE BUCKET: nothing was written').toBe(avant);
    });
  }
});
