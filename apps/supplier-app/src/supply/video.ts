import type { ProductAssetsInput, ProductVideoInput } from './assets';
import type { VideoRefInput } from './media';

/**
 * VIDEO-PRODUIT-1c — the DEVICE-side decisions for the ≤ 6 s product clip
 * (founder order 2026-08-02: « a short video of like 6 second max »).
 *
 * Pure, so every rule is testable without a DOM: the pick surface measures
 * (bytes + duration off the file's own metadata) and THIS module decides.
 * The service re-measures from the container at upload and canon re-refuses
 * at parse — three gates, one bound, no goodwill anywhere.
 */

/** Mirror of the service's `VIDEO_MAX_BYTES` — refusing here saves him the
 *  upload; the service ceiling remains the authority. */
export const VIDEO_APP_MAX_BYTES = 12 * 1024 * 1024;
export const VIDEO_MAX_SEC = 6;

export type VideoChoixRefus = 'trop_longue' | 'trop_lourde' | 'illisible';

export type VideoChoix =
  | { readonly ok: true; readonly durationSec: number }
  | { readonly ok: false; readonly reason: VideoChoixRefus };

/**
 * Judge a picked clip BEFORE any byte leaves the phone. `durationSeconds` is
 * what the device's own decoder reported (`null` when it could not) —
 * unreadable is a refusal, same law as the service: a bound you cannot check
 * is a bound you do not have. The canon integer is the CEILING of the measure
 * (5.3 s ⇒ 6), so « 6 seconds max » can never round down into a 7th second.
 */
export function decideVideoChoisie(durationSeconds: number | null, byteLength: number): VideoChoix {
  if (durationSeconds === null || !(durationSeconds > 0)) return { ok: false, reason: 'illisible' };
  const durationSec = Math.ceil(durationSeconds);
  if (durationSec > VIDEO_MAX_SEC) return { ok: false, reason: 'trop_longue' };
  if (byteLength > VIDEO_APP_MAX_BYTES) return { ok: false, reason: 'trop_lourde' };
  return { ok: true, durationSec };
}

/** The refusal's own sentence — every reason names a catalog key. */
export function videoRefusKey(reason: VideoChoixRefus): string {
  switch (reason) {
    case 'trop_longue':
      return 'publier.video_trop_longue';
    case 'trop_lourde':
      return 'publier.video_trop_lourde';
    case 'illisible':
      return 'publier.video_illisible';
  }
}

/**
 * Weld the UPLOADED video onto assembled assets. `durationSec` is the ceiling
 * of the SERVICE's measured duration — the authoritative clock, never the
 * device's (the device's measure only decided whether to upload at all).
 * Called ONLY with assembled photo assets: canon `ProductAssets` requires the
 * photo roles, so a video cannot exist on a product whose photos did not
 * arrive — it rides the completion path with them instead.
 */
export function avecVideo(assets: ProductAssetsInput, uploaded: VideoRefInput): ProductAssetsInput {
  const video: ProductVideoInput = {
    ref: uploaded.ref,
    sha256: uploaded.sha256,
    mimeType: uploaded.mimeType,
    // CLAMPED (verifier BLOCKER 2026-08-03): the service's accept set now
    // equals canon's, but this weld must be UNABLE to produce an integer canon
    // refuses regardless of what any measurement says — a 6.02 s measure must
    // weld to 6, never ceil to the 7 that turned a publish into a raw 500.
    durationSec: Math.min(VIDEO_MAX_SEC, Math.max(1, Math.ceil(uploaded.durationSeconds))),
  };
  return { ...assets, video };
}

/**
 * The service's TYPED refusal, surfaced in his own words (verifier minor: every
 * failure used to collapse into « la vidéo n'est pas partie », so a too-long
 * clip read as a network problem). The reason rides the HTTP 400 body verbatim.
 */
export function videoEchecKey(httpReason: string): string {
  if (httpReason.includes('"too_long"')) return 'publier.video_trop_longue';
  if (httpReason.includes('"too_large"')) return 'publier.video_trop_lourde';
  if (httpReason.includes('"unsupported_type"') || httpReason.includes('"unreadable_duration"')) return 'publier.video_illisible';
  return 'publier.video_echec_envoi';
}
