import { describe, expect, it } from 'vitest';
import { uploadRole, type RenderThumb, type RoleSource } from '../src/supply/upload-role';
import type { MediaServicePort } from '../src/supply/media';
import type { MediaRefInput } from '../src/supply/assets';

/**
 * THUMB-PRODUIT-1 — « A VIGNETTE CAN NEVER COST HIM A PUBLISH », DRIVEN.
 *
 * This file exists because a verifier found that the only thing standing behind
 * that sentence was a regex matching the text of a comment inside a component
 * closure (§9.7: a test that passes without asserting the invariant it claims to
 * protect). It stayed green if the guard was moved, emptied, or bypassed.
 *
 * So the function is called, with ports that fail in each of the ways the real
 * world fails, and the ROLE'S OUTCOME is the assertion every time.
 */

const SOURCE: RoleSource = {
  bytes: new Uint8Array([1, 2, 3]),
  uri: 'data:image/jpeg;base64,AAAA',
  width: 1280,
  height: 1280,
};
const REF: MediaRefInput = { ref: 'media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' };

/** A port whose two calls are recorded, so « was it CALLED, and with what » is assertable. */
function port(over: Partial<MediaServicePort> = {}): MediaServicePort & { calls: string[]; thumbFor: string[] } {
  const calls: string[] = [];
  const thumbFor: string[] = [];
  const base: MediaServicePort = {
    uploadImage: async () => {
      calls.push('image');
      return { ok: true, value: REF };
    },
    uploadThumb: async (parentRef) => {
      calls.push('thumb');
      thumbFor.push(parentRef);
      return { ok: true, value: { status: 'stored', for: parentRef, byteLength: 8_000 } };
    },
    uploadVideo: async () => ({ ok: false, cause: 'network', reason: 'not used here' }),
    revokeImage: async () => ({ ok: false, cause: 'network', reason: 'not used here' }),
  };
  return Object.assign(base, over, { calls, thumbFor });
}

const vignette: RenderThumb = async () => ({ bytes: new Uint8Array([9, 9, 9, 9]) });

describe('uploadRole — the photograph is the outcome, always', () => {
  it('uploads the photograph, then its vignette FOR THE REF THAT UPLOAD RETURNED', async () => {
    const p = port();
    const out = await uploadRole(p, SOURCE, vignette);
    expect(out.upload).toEqual({ ok: true, ref: REF });
    expect(p.calls).toEqual(['image', 'thumb']);
    // Naming the wrong parent is the one way to get this wrong and still look
    // right — it would answer 404 forever, invisibly.
    expect(p.thumbFor).toEqual([REF.ref]);
    expect(out.vignette).toBe('stored');
  });

  it('a vignette the SERVICE refuses does not touch the role’s outcome', async () => {
    const p = port({ uploadThumb: async () => ({ ok: false, cause: 'http', reason: 'HTTP 409: already_set' }) });
    const out = await uploadRole(p, SOURCE, vignette);
    expect(out.upload).toEqual({ ok: true, ref: REF });
    expect(out.vignette).toBe('refused');
  });

  it('a vignette the DEVICE cannot render does not touch the role’s outcome', async () => {
    // expo-image-manipulator refusing this data URI, or memory pressure on a
    // 1 GB phone — the exact class that would otherwise throw into the publish.
    const p = port();
    const out = await uploadRole(p, SOURCE, async () => {
      throw new Error('decode failed');
    });
    expect(out.upload).toEqual({ ok: true, ref: REF });
    expect(out.vignette).toBe('device');
    expect(p.calls).toEqual(['image']);
  });

  it('a vignette upload that THROWS does not touch the role’s outcome', async () => {
    const p = port({
      uploadThumb: async () => {
        throw new Error('socket closed');
      },
    });
    const out = await uploadRole(p, SOURCE, vignette);
    expect(out.upload).toEqual({ ok: true, ref: REF });
    expect(out.vignette).toBe('device');
  });

  it('a FAILED photograph never attempts a vignette — there is no parent to attach one to', async () => {
    const p: ReturnType<typeof port> = port();
    // The override still RECORDS, or « the thumb was not called » would be
    // proven by a counter nobody incremented — an assertion about nothing.
    p.uploadImage = async () => {
      p.calls.push('image');
      return { ok: false, cause: 'network', reason: 'réseau: down' };
    };
    const out = await uploadRole(p, SOURCE, vignette);
    expect(out.upload).toEqual({ ok: false });
    expect(out.vignette).toBeNull();
    expect(p.calls).toEqual(['image']);
  });

  it('the vignette is rendered from the role’s OWN uri and dimensions, never re-derived', async () => {
    const seen: unknown[] = [];
    await uploadRole(port(), SOURCE, async (uri, w, h) => {
      seen.push([uri, w, h]);
      return { bytes: new Uint8Array([1]) };
    });
    // A vignette framed differently from the photograph behind it is a small
    // lie; these are the exact bytes' own uri and the decode's own dimensions.
    expect(seen).toEqual([[SOURCE.uri, SOURCE.width, SOURCE.height]]);
  });
});
