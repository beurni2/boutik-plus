/**
 * VIDEO-PRODUIT-1c — the video pick seam, NATIVE half (see `pick-video.web.ts`
 * for the real one). The console/listing surface is a WEBAPP by founder
 * ruling and the native app is parked (journalled), so this half answers with
 * the honest named absence rather than a dead control pretending to work:
 * the screen shows « indisponible » copy, never a button that does nothing.
 * Metro resolves per platform; tsc and vitest resolve here.
 */

export interface PickedVideo {
  readonly bytes: Uint8Array;
  /** The device decoder's own measure — `null` when it could not read one. */
  readonly durationSeconds: number | null;
}

export type PickVideoOutcome =
  | { readonly ok: true; readonly video: PickedVideo }
  /** `trop_lourde` fires on the FILE SIZE, before a byte is buffered (verifier
   *  M3: a 200 MB pick used to be read fully into memory — twice — before the
   *  refusal could render, on the 1 GB Androids this project targets). */
  | { readonly ok: false; readonly reason: 'annule' | 'indisponible' | 'trop_lourde' };

export async function pickVideo(): Promise<PickVideoOutcome> {
  return { ok: false, reason: 'indisponible' };
}
