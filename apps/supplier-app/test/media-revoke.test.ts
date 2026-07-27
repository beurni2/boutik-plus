import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRevokeResult } from '../src/supply/media-wire';

/**
 * MEDIA-REVOKE-1 — the app side of the byte cleanup (founder 2026-07-27:
 * *"continue the cleaning of the bytes after the delete"*).
 *
 * INSTRUMENTS, stated per the standing rule so the weaker one is never mistaken
 * for the stronger: the boundary reader is tested BY VALUE. The fetch shell
 * (`HttpMediaService.revokeImage`) lives in `media.ts`, which imports
 * `expo-crypto` at module top and therefore CANNOT be imported under plain
 * node — the same constraint that shaped every media test before this one — so
 * the shell is covered by `[source-text check]`s, exactly like the fiche walk.
 */

const media = readFileSync(join(import.meta.dirname, '..', 'src/supply/media.ts'), 'utf8');
const produits = readFileSync(join(import.meta.dirname, '..', 'src/v2/produits-real.tsx'), 'utf8');

describe('the revoke response boundary — validated, never cast', () => {
  it('accepts exactly the media worker revoke shape and refuses everything near it', () => {
    const good = { status: 'revoked', ref: 'media/abc' };
    expect(readRevokeResult(good)).toEqual(good);
    for (const bad of [
      null, undefined, [], 'revoked', 42, {},
      { status: 'REVOKED', ref: 'media/abc' },
      { status: 'deleted', ref: 'media/abc' }, // the offer route's word, not this route's
      { status: 'revoked' }, // no ref
      { status: 'revoked', ref: 'not-a-media-key' }, // outside the media/ namespace
      { status: 'revoked', ref: 42 },
    ]) {
      expect(readRevokeResult(bad), JSON.stringify(bad) ?? 'undefined').toBeNull();
    }
  });
});

describe('the fetch shell [source-text checks — media.ts is expo-bound, unimportable here]', () => {
  it('POSTs JSON {ref} to /media/revoke with the write key header', () => {
    expect(media).toContain("}/media/revoke`");
    expect(media).toContain('JSON.stringify({ ref })');
    // the one revokeImage method carries the key header and the JSON content type
    const revokeBlock = media.slice(media.indexOf('async revokeImage'));
    expect(revokeBlock).toContain("'Content-Type': 'application/json', [MEDIA_WRITE_KEY_HEADER]: this.writeKey");
  });

  it('every exit is a TYPED result — network, http, and unreadable each named, reader-guarded success', () => {
    const revokeBlock = media.slice(media.indexOf('async revokeImage'), media.indexOf('async revokeImage') + 1600);
    expect(revokeBlock).toContain("cause: 'network'");
    expect(revokeBlock).toContain("cause: 'http'");
    expect(revokeBlock).toContain("cause: 'unreadable'");
    expect(revokeBlock).toContain('readRevokeResult(parsed)');
    // and no fabricated success: the only ok:true carries the validated outcome
    expect(revokeBlock.match(/ok: true/g)).toHaveLength(1);
    expect(revokeBlock).toContain('return { ok: true, value: outcome }');
  });
});

describe('the delete flow cleans the bytes [source-text checks on produits-real.tsx]', () => {
  const deleteBlock = produits.slice(produits.indexOf('const deleteOpen'));

  it('revoke fires STRICTLY AFTER the offer delete succeeded — never before, never on failure', () => {
    const deleteCall = deleteBlock.indexOf('service.deleteOffer');
    const failGuard = deleteBlock.indexOf('if (!res.ok) return false;');
    const revokeCall = deleteBlock.indexOf('revokeImage');
    expect(deleteCall).toBeGreaterThan(-1);
    expect(failGuard).toBeGreaterThan(deleteCall); // the guard reads the delete's answer
    expect(revokeCall).toBeGreaterThan(failGuard); // and only past it can a byte be destroyed
  });

  it('a failed revoke cannot un-succeed the delete: the result is unread and no false exit follows', () => {
    // between the revoke loop and `return true` there is no `return false` —
    // the delete's outcome is already decided when cleanup starts.
    const afterRevoke = deleteBlock.slice(deleteBlock.indexOf('revokeImage'));
    const nextReturnFalse = afterRevoke.indexOf('return false');
    const returnTrue = afterRevoke.indexOf('return true');
    expect(returnTrue).toBeGreaterThan(-1);
    expect(nextReturnFalse === -1 || nextReturnFalse > returnTrue).toBe(true);
    // (the result-unread property is the exact-line assertion in the next test:
    // `await mediaService.revokeImage(ref);` — awaited, never assigned)
  });

  it('refs are prefix-filtered to media/ and the whole cleanup is gated on a resolved media service', () => {
    expect(deleteBlock).toContain("if (ref.startsWith('media/')) await mediaService.revokeImage(ref);");
    expect(deleteBlock).toContain('if (mediaService !== null) {');
  });
});
