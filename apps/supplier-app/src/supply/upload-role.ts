import type { MediaServicePort } from './media';
import type { RoleUpload } from './assets';

/**
 * ═══ ONE ROLE'S UPLOAD, AND ITS VIGNETTE ═══
 *
 * Extracted from `lister-real.tsx` for one reason, and it is a finding rather
 * than a preference: as a closure inside the component, NOTHING could drive it.
 * The only thing standing behind « a vignette can never cost him a publish » was
 * a regex matching the text of a comment — which stays green if the guard it
 * describes is moved, emptied, or bypassed. §9.7, exactly. Here it is a function
 * with arguments, so the guarantee is proven by calling it.
 *
 * WHAT IT GUARANTEES, and every one of these has a test:
 *   · the photograph's outcome is the ROLE's outcome — always, whatever the
 *     vignette does;
 *   · the vignette is uploaded FOR THE REF THIS UPLOAD JUST RETURNED (naming
 *     the wrong parent would 404 forever, invisibly);
 *   · a vignette that throws, refuses, or times out changes nothing;
 *   · a FAILED photograph never triggers a vignette at all — there is no parent
 *     to attach one to.
 */

/** One role's upload source: the bytes that ship, plus what the vignette needs. */
export interface RoleSource {
  readonly bytes: Uint8Array;
  /** The stripped data URI those exact bytes came from — what the vignette is made of. */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

/** The on-device vignette renderer, injected — `capture.ts` binds the real one. */
export type RenderThumb = (uri: string, width: number, height: number) => Promise<{ bytes: Uint8Array }>;

/**
 * What happened to the vignette, for the caller that wants to SAY so. The
 * publish path does not block on it; it surfaces it, because a vignette that
 * never lands is permanent (the service's write window shuts) and silence about
 * that is how a board stays heavy for months with nobody knowing why.
 */
export type VignetteOutcome = 'stored' | 'refused' | 'device';

export interface RoleResult {
  readonly upload: RoleUpload;
  /** `null` when no vignette was attempted — i.e. the photograph itself failed. */
  readonly vignette: VignetteOutcome | null;
}

export async function uploadRole(
  media: MediaServicePort,
  source: RoleSource,
  renderThumb: RenderThumb,
): Promise<RoleResult> {
  const res = await media.uploadImage(source.bytes);
  // A FAILED PHOTOGRAPH HAS NO PARENT TO HANG A VIGNETTE ON. Attempting one
  // anyway would burn a request and, worse, could only ever answer `no_parent`.
  if (!res.ok) return { upload: { ok: false }, vignette: null };

  let vignette: VignetteOutcome;
  try {
    const petite = await renderThumb(source.uri, source.width, source.height);
    const stored = await media.uploadThumb(res.value.ref, petite.bytes);
    vignette = stored.ok ? 'stored' : 'refused';
  } catch {
    // A device that cannot re-encode — `expo-image-manipulator` refusing this
    // data URI, memory pressure on a 1 GB phone. The photograph is up; the row
    // is simply heavier.
    vignette = 'device';
  }
  return { upload: { ok: true, ref: res.value }, vignette };
}
