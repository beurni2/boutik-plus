/**
 * COMBINED SLICE — the supplier app's client to the LIVE media-service upload
 * (`POST /media`, MEDIA-UPLOAD-ROUTE-1). The seam mirrors `service.ts` exactly,
 * because the properties are the same ones:
 *
 * · UNSET RESOLVES TO NULL, NEVER TO A FAKE. `resolveMediaService()` returns the
 *   real HTTP client or null; there is no demo branch and no import of one. A
 *   null service means photographs cannot upload — the product publishes with
 *   `assetRefs: []` (the honest empty) and the completion path adds them later.
 * · TYPED FAILURE CAUSES: only `http` may claim the service answered.
 * · THE RESPONSE IS VALIDATED AT THE BOUNDARY — `readUploadResult` by hand
 *   (Metro law: no `@platform/*` runtime import).
 *
 * THE WIRE, read from the service's own source, not from memory
 * (`services/media-service/worker/index.ts`): POST raw image bytes to `/media`
 * with `X-Write-Key`; the declared Content-Type is IGNORED (the sniff decides);
 * 201 answers `{ref, contentType, width, height, byteLength}` where `ref` is an
 * opaque `media/{uuid}` key; a 400 carries a TYPED reason (empty ·
 * unsupported_type · too_large · bad_dimensions).
 *
 * SHA256 IS COMPUTED ON-DEVICE, per ref, over the EXACT bytes uploaded —
 * expo-crypto's `digest` (the OS digest), never a JS reimplementation. The hash
 * lands in canon `MediaRef.sha256`, so what the offer record claims about a
 * photograph is derived from the bytes his phone actually sent.
 *
 * ENV NAMES (repo secrets, inlined at bundle time by babel-preset-expo — DOT
 * access only): `EXPO_PUBLIC_MEDIA_BASE` (the media-service URL) and
 * `EXPO_PUBLIC_MEDIA_WRITE_KEY` (the value of MEDIA_WRITE_SECRET). Mirrors the
 * offer pair. Same key limitation, founder-accepted: it ships inside the bundle.
 */
import * as Crypto from 'expo-crypto';
import { hexOfDigest, MEDIA_WRITE_KEY_HEADER, readRevokeResult, readUploadResult, type RevokedImage } from './media-wire';
import type { FailureCause, ServiceResult } from './service';
import type { MediaRefInput } from './assets';

export interface MediaServicePort {
  /** Upload one image's bytes; the returned MediaRef carries the ON-DEVICE sha256. */
  uploadImage(bytes: Uint8Array): Promise<ServiceResult<MediaRefInput>>;
  /**
   * MEDIA-REVOKE-1 (founder 2026-07-27: *"continue the cleaning of the bytes
   * after the delete"*). Destroys a deleted product's photograph at the origin
   * — BOUNDED-LATENCY, never instant (caches drain within their TTLs), and
   * idempotent, so a replay after a lost answer converges.
   */
  revokeImage(ref: string): Promise<ServiceResult<RevokedImage>>;
}

/** The OS digest over the exact bytes — lowercase hex, canon's sha256 shape. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hexOfDigest(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
}

/** How long a fire-and-forget revoke may hold the delete flow's pending state. */
const REVOKE_TIMEOUT_MS = 10_000;

export class HttpMediaService implements MediaServicePort {
  /**
   * MEDIA-KEY-SPLIT (2026-08-02): upload and revoke are now DIFFERENT
   * credentials on the service — the upload key ships in bundles (including
   * every supplier's), the revoke key rides ONLY this founder surface. An
   * unset revoke key travels as '' and the service answers its one identical
   * 401 — a typed `http` failure, the wire's own truth, never a fake locally
   * minted one; the delete flow already absorbs a failed revoke (bytes
   * orphan, journalled behaviour).
   */
  constructor(private readonly base: string, private readonly writeKey: string, private readonly revokeKey: string = '') {}

  async uploadImage(bytes: Uint8Array): Promise<ServiceResult<MediaRefInput>> {
    // The hash is computed BEFORE the upload, over the same bytes handed to
    // fetch — so a transport that mangled the body would be caught by the
    // service's own sniff/decode, never papered over by hashing what came back.
    const sha256 = await sha256Hex(bytes);
    let res: Response;
    try {
      res = await fetch(`${this.base.replace(/\/+$/, '')}/media`, {
        method: 'POST',
        headers: { [MEDIA_WRITE_KEY_HEADER]: this.writeKey },
        // raw bytes — no multipart, no filename (the route reads no name). RN's
        // fetch types predate BufferSource bodies; the runtime accepts them.
        body: bytes as unknown as Parameters<typeof fetch>[1] extends { body?: infer B } ? B : never,
      });
    } catch (err) {
      return { ok: false, cause: 'network', reason: `réseau: ${String((err as Error)?.message ?? err)}` };
    }
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      // Response.text() rejects when the body stream dies after the status
      // line — a TYPED network failure, never a throw into the UI (verifier
      // finding 2026-07-27, all read-the-body sites hardened together).
      return { ok: false, cause: 'network', reason: `réseau: ${String((err as Error)?.message ?? err)}` };
    }
    if (!res.ok) {
      // 401 unauthorized · 400 with the validator's typed reason — verbatim.
      return { ok: false, cause: 'http', reason: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, cause: 'unreadable', reason: `réponse illisible: ${text.slice(0, 300)}` };
    }
    const image = readUploadResult(parsed);
    if (image === null) {
      return { ok: false, cause: 'unreadable', reason: `réponse inattendue: ${text.slice(0, 300)}` };
    }
    return { ok: true, value: { ref: image.ref, sha256, mimeType: image.contentType } };
  }

  async revokeImage(ref: string): Promise<ServiceResult<RevokedImage>> {
    // BOUNDED WAIT (verifier finding 2026-07-27): this call runs INSIDE the
    // delete's pending state and its result is deliberately ignored — a hung
    // media service must not hold a SUCCESSFUL delete's UI hostage for
    // minutes. Ten seconds, then a typed network failure and the flow moves
    // on; the bytes orphan exactly as any other failed revoke leaves them.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), REVOKE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.base.replace(/\/+$/, '')}/media/revoke`, {
        method: 'POST',
        // The REVOKE credential — never the upload key (which the service now
        // refuses on this route; MEDIA-KEY-SPLIT).
        headers: { 'Content-Type': 'application/json', [MEDIA_WRITE_KEY_HEADER]: this.revokeKey },
        body: JSON.stringify({ ref }),
        signal: ctl.signal,
      });
    } catch (err) {
      return { ok: false, cause: 'network', reason: `réseau: ${String((err as Error)?.message ?? err)}` };
    } finally {
      clearTimeout(timer);
    }
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      // Response.text() rejects when the body stream dies after the status
      // line — a TYPED network failure, never a throw into the UI (verifier
      // finding 2026-07-27, all read-the-body sites hardened together).
      return { ok: false, cause: 'network', reason: `réseau: ${String((err as Error)?.message ?? err)}` };
    }
    if (!res.ok) return { ok: false, cause: 'http', reason: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, cause: 'unreadable', reason: `réponse illisible: ${text.slice(0, 300)}` };
    }
    const outcome = readRevokeResult(parsed);
    if (outcome === null) return { ok: false, cause: 'unreadable', reason: `réponse inattendue: ${text.slice(0, 300)}` };
    return { ok: true, value: outcome };
  }
}

/**
 * Resolve the LIVE media service, or null when unconfigured. Dot access so
 * babel-preset-expo inlines at bundle time; bracket access would survive to a
 * runtime lookup that is always undefined in a release bundle.
 */
/**
 * THE READ BASE ONLY (PRODUITS-READ-1). Media READS are UNAUTHENTICATED — the
 * media Worker's write gate short-circuits GETs, so `${base}/${ref}` renders a
 * product photograph with NO key. This deliberately does not touch the write
 * key: displaying an image must never require the credential that uploads one.
 * `null` when unset ⇒ the tile shows its « Sans photo » placeholder rather than
 * a broken image.
 */
export function resolveMediaBase(): string | null {
  const base = process.env.EXPO_PUBLIC_MEDIA_BASE;
  return typeof base === 'string' && base.trim() !== '' ? base.replace(/\/+$/, '') : null;
}

export function resolveMediaService(): MediaServicePort | null {
  const base = process.env.EXPO_PUBLIC_MEDIA_BASE;
  const key = process.env.EXPO_PUBLIC_MEDIA_WRITE_KEY;
  // The revoke key is OPTIONAL by design: uploads (the app's core function)
  // never wait on it, and without it the service refuses each revoke with the
  // same 401 it gives everyone — fail-closed on the WIRE, not simulated here.
  const revokeKey = process.env.EXPO_PUBLIC_MEDIA_REVOKE_KEY ?? '';
  if (base && key) return new HttpMediaService(base, key, revokeKey);
  return null;
}

// referenced so the type-only import is load-bearing for the cause taxonomy
export type { FailureCause };
