import * as Crypto from 'expo-crypto';
import { MEDIA_WRITE_KEY_HEADER, hexOfDigest, readUploadResult } from '../supply/media-wire';
import type { MediaRefInput } from '../supply/assets';

/**
 * READINESS-WIRE-1b-ii verifier M1 — UPLOAD, AND NOTHING ELSE.
 *
 * The fournisseur surface first reused `resolveMediaService()`, and the
 * verifier measured the consequence on the real export: the WHOLE
 * `HttpMediaService` class rode the artifact — `uploadImage` (granted:
 * « upload photo prove of readiness ») AND `revokeImage` + its
 * `/media/revoke` route (NOT granted, and destructive: with the shared media
 * key inlined in every supplier's bundle, a supplier reading their own bundle
 * held a delete client for the founder's product photographs).
 *
 * So this module exists: the same upload wire, byte for byte — hash BEFORE
 * the fetch over the exact bytes sent, raw body, typed failures, strict
 * response read — with NO import path to the class that carries revoke. The
 * fournisseur artifact gate fingerprints '/media/revoke' and 'revokeImage'
 * as FORBIDDEN, so this separation is measured on every run, not trusted.
 *
 * HONEST RESIDUE, journalled and told to the founder: the shared media KEY
 * still rides this bundle (upload is granted, and the key is what grants
 * it). Someone who extracts the key can speak to the media service directly,
 * routes included — closing THAT needs the media-service key split
 * (upload-key vs founder-only revoke), which is its own slice on another
 * Worker. What this module closes is the CARRIED capability, the ruling's
 * own standard.
 */

export type UploadResult =
  | { readonly ok: true; readonly value: MediaRefInput }
  | { readonly ok: false };

export function resolveReadinessUpload(): ((bytes: Uint8Array) => Promise<UploadResult>) | null {
  const base = process.env.EXPO_PUBLIC_MEDIA_BASE;
  const key = process.env.EXPO_PUBLIC_MEDIA_WRITE_KEY;
  if (base === undefined || base === '' || key === undefined || key === '') return null;
  const trimmed = base.replace(/\/+$/, '');
  return async (bytes: Uint8Array): Promise<UploadResult> => {
    const sha256 = hexOfDigest(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${trimmed}/media`, {
        method: 'POST',
        headers: { [MEDIA_WRITE_KEY_HEADER]: key },
        body: bytes as unknown as Parameters<typeof fetch>[1] extends { body?: infer B } ? B : never,
      });
      text = await res.text();
    } catch {
      return { ok: false };
    }
    if (!res.ok) return { ok: false };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false };
    }
    // The SAME strict boundary reader the founder's app uses — media-wire.ts
    // is pure wire vocabulary (no class, no revoke route), safe to share.
    const image = readUploadResult(parsed);
    if (image === null) return { ok: false };
    return { ok: true, value: { ref: image.ref, sha256, mimeType: image.contentType } };
  };
}
