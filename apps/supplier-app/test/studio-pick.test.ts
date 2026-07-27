import { describe, expect, it } from 'vitest';
import {
  decodeRefusalSentence,
  pickShots,
  shotFromAsset,
  shotsFromAssets,
  pickedFormatLabel,
  type ImageSourcePort,
  type PickedAsset,
} from '../src/studio/pick';
import { base64ToBytes, bytesToBase64, jpegCarriesExif, ExifLeakError } from '../src/studio/normalization';
import { heroSquareCrop, heroVerticalCrop } from '../src/studio/crops';
import { t } from '../src/i18n';

/**
 * STUDIO-PICK-1 / STUDIO-BATCH-1 — the gallery seam, multi-select since the
 * founder's 2026-07-27 reshape. The properties under test are his rulings: the
 * dimensions come from the DECODE and never from the picker, the shipped bytes
 * go through the same strip as capture, a decode fault is a typed refusal that
 * NAMES the format — and a BATCH is processed one at a time through the same
 * funnel, first refusal keeping the successes and dropping the rest.
 */

// --- a real JPEG carrying metadata, same segment grammar as exif-strip -------
const seg = (marker: number, payload: number[]): number[] => {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
};
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const APP1_XMP = seg(0xe1, [...'http://ns.adobe.com/xap/1.0/\0<x>35.1,-1.5</x>'].map((c) => c.charCodeAt(0)));
const APP13_IPTC = seg(0xed, [...'Photoshop 3.0\0'].map((c) => c.charCodeAt(0)));
const DQT = seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]);
const SOF0 = seg(0xc0, [8, 0, 16, 0, 16, 1, 0x11, 0]);
const DHT = seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]);
const SOS = seg(0xda, [1, 0, 0, 0, 63, 0]);
const ENTROPY = [0x12, 0x34, 0xff, 0x00, 0x56];
/** What a phone gallery hands back: XMP (which carries GPS) and IPTC. */
const GALLERY_JPEG = new Uint8Array([SOI, APP1_XMP, DQT, SOF0, DHT, APP13_IPTC, SOS, ENTROPY, EOI].flat());

const ASSET: PickedAsset = { uri: 'file:///cache/IMG_2031.heic', mimeType: 'image/heic', fileName: 'IMG_2031.HEIC' };

/**
 * A port whose DECODE disagrees with the picker on purpose. `decodeW/decodeH`
 * are the truth; the picker's own numbers never appear anywhere in this file's
 * expectations, which is the whole point.
 */
function fakePort(over: Partial<{
  decodeW: number; decodeH: number; bytes: Uint8Array;
  failDecode: boolean; failEncode: boolean; assets: readonly PickedAsset[] | null;
  failDecodeFor: string;
}> = {}): ImageSourcePort & { actionsSeen: unknown[]; maxSeen: number[] } {
  const actionsSeen: unknown[] = [];
  const maxSeen: number[] = [];
  return {
    actionsSeen,
    maxSeen,
    async pickManyFromLibrary(max: number) {
      maxSeen.push(max);
      return over.assets === undefined ? [ASSET] : over.assets;
    },
    async decode(uri: string) {
      if (over.failDecode === true || uri === over.failDecodeFor) throw new Error('native decode failed');
      return { image: { handle: uri }, width: over.decodeW ?? 4000, height: over.decodeH ?? 3000 };
    },
    async encode(image, actions) {
      if (over.failEncode === true) throw new Error('native encode failed');
      actionsSeen.push({ image, actions });
      return { base64: bytesToBase64(over.bytes ?? GALLERY_JPEG), width: 1280, height: 960 };
    },
  };
}

describe('THE DIMENSIONS COME FROM THE DECODE, NEVER FROM THE PICKER', () => {
  it('reports the DECODED size as the master, not the picker’s (which its own types say may be 0)', async () => {
    // the picker's asset carries a degenerate 0x0 — the exact value its .d.ts warns about
    const claimsZero = { ...ASSET, ...({ width: 0, height: 0 } as unknown as PickedAsset) };
    const out = await pickShots(fakePort({ decodeW: 4032, decodeH: 3024, assets: [claimsZero] }), 4);
    expect(out.shots[0]!.master).toEqual({ width: 4032, height: 3024 });
  });

  it('DERIVES THE RESIZE from the decoded size — a 0x0 picker claim would have produced NO resize at all', async () => {
    const port = fakePort({ decodeW: 4000, decodeH: 3000 });
    await pickShots(port, 4);
    // 4000 is above the 1280 ceiling and landscape ⇒ resize by WIDTH
    expect(port.actionsSeen).toEqual([{ image: { handle: ASSET.uri }, actions: [{ resize: { width: 1280 } }] }]);
  });

  it('a PORTRAIT decode resizes by HEIGHT — the branch a wrong-orientation source would flip', async () => {
    const port = fakePort({ decodeW: 3000, decodeH: 4000 });
    await pickShots(port, 4);
    expect(port.actionsSeen).toEqual([{ image: { handle: ASSET.uri }, actions: [{ resize: { height: 1280 } }] }]);
  });

  it('an already-small image gets NO resize action', async () => {
    const port = fakePort({ decodeW: 900, decodeH: 700 });
    await pickShots(port, 4);
    expect(port.actionsSeen).toEqual([{ image: { handle: ASSET.uri }, actions: [] }]);
  });

  it('the master dimensions it reports are the ones the CROPS will be carved from — square and 4:5 both land in bounds', async () => {
    const out = await pickShots(fakePort({ decodeW: 4032, decodeH: 3024 }), 4);
    const { width, height } = out.shots[0]!.master;
    for (const rect of [heroSquareCrop(width, height), heroVerticalCrop(width, height)]) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.originX + rect.width).toBeLessThanOrEqual(width);
      expect(rect.originY + rect.height).toBeLessThanOrEqual(height);
    }
  });

  it('the ENCODE runs on the DECODED image handle — one decode, not a second pass over the URI', async () => {
    const port = fakePort();
    await pickShots(port, 4);
    expect(port.actionsSeen).toHaveLength(1);
    expect((port.actionsSeen[0] as { image: unknown }).image).toEqual({ handle: ASSET.uri });
  });
});

describe('THE SAME STRIP FUNNEL AS CAPTURE — no laxer path for a library photo', () => {
  it('XMP and IPTC are GONE from the shipped bytes (XMP is where a gallery app writes GPS)', async () => {
    expect(jpegCarriesExif(GALLERY_JPEG)).toBe(true); // the fixture really is dirty
    const out = await pickShots(fakePort(), 4);
    // decoded with OUR decoder, not `atob` — normalization.ts removed that
    // dependency by construction after the founder's device failed on it
    const shipped = base64ToBytes(out.shots[0]!.derivative.uri.split(',')[1]!);
    expect(jpegCarriesExif(shipped)).toBe(false);
    expect(shipped.length).toBeLessThan(GALLERY_JPEG.length); // segments were actually removed
  });

  it('the PREVIEW URI is built from the stripped bytes — what he sees is what uploads', async () => {
    const out = await pickShots(fakePort(), 4);
    expect(out.shots[0]!.derivative.uri.startsWith('data:image/jpeg;base64,')).toBe(true);
    // and the master is the ORIGINAL file, kept apart from the derivative
    expect(out.shots[0]!.masterUri).toBe(ASSET.uri);
    expect(out.shots[0]!.derivative.uri).not.toContain(ASSET.uri);
    // where it came from is RECORDED — the parked proof-camera rule's hook
    expect(out.shots[0]!.source).toBe('gallery');
  });

  it('BYTES THAT CANNOT BE PROVEN CLEAN FAIL CLOSED — the strip error is not swallowed into a refusal', async () => {
    const notAJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(pickShots(fakePort({ bytes: notAJpeg }), 4)).rejects.toBeInstanceOf(ExifLeakError);
  });
});

describe('A DECODE FAULT IS A TYPED REFUSAL THAT NAMES THE FORMAT', () => {
  it('a decode failure refuses with the format the phone reported', async () => {
    const out = await pickShots(fakePort({ failDecode: true }), 4);
    expect(out).toEqual({ shots: [], refusal: { messageKey: 'studio.image_illisible', format: 'heic' }, cancelled: false, overflow: 0 });
  });

  it('an ENCODE failure refuses the same way — he cannot tell the two apart and should not have to', async () => {
    const out = await pickShots(fakePort({ failEncode: true }), 4);
    expect(out).toEqual({ shots: [], refusal: { messageKey: 'studio.image_illisible', format: 'heic' }, cancelled: false, overflow: 0 });
  });

  it('backing out of the picker is a CANCEL, not a fault — no refusal sentence, nothing kept', async () => {
    expect(await pickShots(fakePort({ assets: null }), 4)).toEqual({ shots: [], refusal: null, cancelled: true, overflow: 0 });
    expect(await pickShots(fakePort({ assets: [] }), 4)).toEqual({ shots: [], refusal: null, cancelled: true, overflow: 0 });
  });
});

describe('NAMING THE FORMAT — pure, and null is a real answer', () => {
  it('an image/* MIME is trimmed to the part a person reads', () => {
    expect(pickedFormatLabel({ uri: 'x', mimeType: 'image/heic' })).toBe('heic');
    expect(pickedFormatLabel({ uri: 'x', mimeType: 'image/webp' })).toBe('webp');
  });

  it('a NON-image MIME travels whole rather than being trimmed into a lie', () => {
    expect(pickedFormatLabel({ uri: 'x', mimeType: 'video/quicktime' })).toBe('video/quicktime');
  });

  it('falls back to the filename extension when the MIME is missing', () => {
    expect(pickedFormatLabel({ uri: 'x', fileName: 'IMG_0042.HEIC' })).toBe('heic');
  });

  it('returns NULL when the phone gave nothing usable — the ph:// and limited-permission cases', () => {
    expect(pickedFormatLabel({ uri: 'ph://ABC-123' })).toBeNull();
    expect(pickedFormatLabel({ uri: 'x', mimeType: '', fileName: null })).toBeNull();
    expect(pickedFormatLabel({ uri: 'x', fileName: 'no-extension-here' })).toBeNull();
    // a "." that is not an extension must not be read as one
    expect(pickedFormatLabel({ uri: 'x', fileName: 'photo.' })).toBeNull();
    expect(pickedFormatLabel({ uri: 'x', fileName: '.hidden' })).toBeNull();
    expect(pickedFormatLabel({ uri: 'x', fileName: 'archive.tarball' })).toBeNull(); // >5 chars
  });
});

describe('THE REFUSAL SENTENCE — rendered from the catalog, never assembled inline', () => {
  it('substitutes the named format into the approved string', () => {
    const sentence = decodeRefusalSentence({ messageKey: 'studio.image_illisible', format: 'heic' });
    expect(sentence).toBe(t('studio.image_illisible').replace('{format}', 'heic'));
    expect(sentence).toContain('(heic)');
    expect(sentence).not.toContain('{format}'); // the placeholder never reaches his screen
  });

  it('an UNNAMEABLE format renders « format inconnu », never an empty « () »', () => {
    const sentence = decodeRefusalSentence({ messageKey: 'studio.image_illisible', format: null });
    expect(sentence).toContain(`(${t('studio.format_inconnu')})`);
    expect(sentence).not.toContain('()');
  });

  it('the sentence gives BOTH ways out — the shape ruled on the commission refusal', () => {
    const sentence = decodeRefusalSentence({ messageKey: 'studio.image_illisible', format: 'heic' });
    expect(sentence).toContain('une autre'); // choose a different image
    expect(sentence).toContain('maintenant'); // or take it now
  });
});

describe('THE BATCH (STUDIO-BATCH-1) — one funnel, one at a time, honest about a bad file', () => {
  const A2: PickedAsset = { uri: 'file:///cache/IMG_2032.jpg', mimeType: 'image/jpeg', fileName: 'IMG_2032.jpg' };
  const A3: PickedAsset = { uri: 'file:///cache/IMG_2033.jpg', mimeType: 'image/jpeg', fileName: 'IMG_2033.jpg' };

  it('a batch of three lands as three shots, in pick order, each stripped and each tagged gallery', async () => {
    const out = await pickShots(fakePort({ assets: [ASSET, A2, A3] }), 4);
    expect(out.refusal).toBeNull();
    expect(out.shots.map((sh) => sh.masterUri)).toEqual([ASSET.uri, A2.uri, A3.uri]);
    for (const sh of out.shots) {
      expect(jpegCarriesExif(base64ToBytes(sh.derivative.uri.split(',')[1]!))).toBe(false);
      expect(sh.source).toBe('gallery');
    }
  });

  it('FIRST REFUSAL keeps the successes BEFORE it and DROPS the rest — never a set he did not choose', async () => {
    const out = await pickShots(fakePort({ assets: [ASSET, A2, A3], failDecodeFor: A2.uri }), 4);
    expect(out.shots.map((sh) => sh.masterUri)).toEqual([ASSET.uri]); // A3 dropped WITH the refusal
    expect(out.refusal).toEqual({ messageKey: 'studio.image_illisible', format: 'jpeg' });
  });

  it('the MAX bound is enforced in the funnel, not trusted to the picker — and the turned-away count is REPORTED', async () => {
    const port = fakePort({ assets: [ASSET, A2, A3] });
    const out = await shotsFromAssets(port, [ASSET, A2, A3], 2);
    expect(out.shots).toHaveLength(2);
    expect(out.overflow).toBe(1); // never silent — the screen owes him a sentence
    // and the pick dialog is ASKED for only the remaining room
    await pickShots(port, 1);
    expect(port.maxSeen).toEqual([1]);
  });

  it('pickShots ITSELF bounds a picker that ignores selectionLimit (verifier finding: the composition, not just the helper)', async () => {
    // a misbehaving picker returns 3 despite being asked for 1
    const port = fakePort({ assets: [ASSET, A2, A3] });
    const out = await pickShots(port, 1);
    expect(port.maxSeen).toEqual([1]); // it WAS asked for 1
    expect(out.shots).toHaveLength(1); // over-returned files are never decoded past the bound
    expect(out.overflow).toBe(2);
    expect(port.actionsSeen).toHaveLength(1); // exactly ONE decode+encode ran
  });
});

describe('A DROPPED FILE WALKS THE SAME FUNNEL (BOUTIK-WEB-W3 — shotFromAsset)', () => {
  const DROPPED: PickedAsset = { uri: 'blob:https://boutik/0f3a', mimeType: 'image/png', fileName: 'produit.png' };

  it('same discipline: master from the DECODE, derivative stripped, master kept apart from it', async () => {
    const out = await shotFromAsset(fakePort({ decodeW: 3024, decodeH: 4032 }), DROPPED);
    if (out.kind !== 'picked') throw new Error('expected picked');
    expect(out.shot.master).toEqual({ width: 3024, height: 4032 });
    expect(out.shot.masterUri).toBe(DROPPED.uri);
    const shipped = base64ToBytes(out.shot.derivative.uri.slice('data:image/jpeg;base64,'.length));
    expect(jpegCarriesExif(shipped)).toBe(false);
  });

  it('pickShots IS this funnel behind the dialog — same assets in, deep-equal outcome out (no second path can drift)', async () => {
    expect(await pickShots(fakePort({ assets: [DROPPED] }), 4)).toEqual(await shotsFromAssets(fakePort(), [DROPPED]));
  });

  it("the ceiling sentence exists in the catalog — the limite banner's key resolves", () => {
    expect(t('studio.limite')).toContain('4 photos');
  });

  it("a decode fault refuses naming the DROPPED file's format", async () => {
    const out = await shotFromAsset(fakePort({ failDecode: true }), DROPPED);
    expect(out).toEqual({ kind: 'refused', refusal: { messageKey: 'studio.image_illisible', format: 'png' } });
  });

  it('bytes that cannot be proven clean fail closed on the drop path too — no laxer entry exists', async () => {
    const notAJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await expect(shotFromAsset(fakePort({ bytes: notAJpeg }), DROPPED)).rejects.toBeInstanceOf(ExifLeakError);
  });
});
