/**
 * VIDEO-PRODUIT-1c — the video pick seam, WEB half (the real one: the listing
 * surface is a webapp by founder ruling). A plain `<input type="file">`
 * accepting MP4, then the browser's OWN decoder measures the duration off a
 * `blob:` URI (`loadedmetadata`) — deterministic playback machinery, no
 * inference (loi 5). The measure travels up as `durationSeconds` and
 * `supply/video.ts` DECIDES; a decoder that cannot read the clip reports
 * `null`, which upstream refuses (`illisible`) — the same
 * unreadable-is-a-refusal law the service applies with its own `mvhd` read.
 *
 * RN's TS lib has NO DOM (the standing pattern of `operations/service.ts`'s
 * `window` access): every browser API below is reached through one structural
 * seam on `globalThis`, typed to exactly what this file touches. On web these
 * globals exist at runtime; on any platform where they do not, the pick
 * answers the honest « indisponible ».
 */

import type { PickedVideo, PickVideoOutcome } from './pick-video';

interface VideoElLike {
  preload: string;
  duration: number;
  src: string;
  onloadedmetadata: (() => void) | null;
  onerror: (() => void) | null;
  removeAttribute(name: string): void;
}

interface FileLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface InputElLike {
  type: string;
  accept: string;
  files: { readonly length: number; [i: number]: FileLike } | null;
  onchange: (() => void) | null;
  oncancel: (() => void) | null;
  click(): void;
}

interface WebGlobals {
  document?: { createElement(tag: string): unknown };
  URL?: { createObjectURL(blob: unknown): string; revokeObjectURL(url: string): void };
  Blob?: new (parts: unknown[], options?: { type?: string }) => unknown;
}

const web = (): Required<WebGlobals> | null => {
  const g = globalThis as WebGlobals;
  return g.document !== undefined && g.URL !== undefined && g.Blob !== undefined
    ? (g as Required<WebGlobals>)
    : null;
};

const METADATA_TIMEOUT_MS = 10_000;

function measureDuration(bytes: Uint8Array): Promise<number | null> {
  return new Promise((resolve) => {
    const g = web();
    if (g === null) {
      resolve(null);
      return;
    }
    const url = g.URL.createObjectURL(new g.Blob([bytes], { type: 'video/mp4' }));
    const el = g.document.createElement('video') as VideoElLike;
    el.preload = 'metadata';
    let done = false;
    const finish = (d: number | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      g.URL.revokeObjectURL(url);
      el.removeAttribute('src');
      resolve(d);
    };
    // A decoder that never answers is an unreadable clip, not a hung screen.
    const timer = setTimeout(() => finish(null), METADATA_TIMEOUT_MS);
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    el.onerror = () => finish(null);
    el.src = url;
  });
}

export async function pickVideo(): Promise<PickVideoOutcome> {
  const g = web();
  if (g === null) return { ok: false, reason: 'indisponible' };
  const file = await new Promise<FileLike | null>((resolve) => {
    const input = g.document.createElement('input') as InputElLike;
    input.type = 'file';
    input.accept = 'video/mp4,video/*';
    input.onchange = () => resolve(input.files !== null && input.files.length > 0 ? input.files[0]! : null);
    // A dismissed sheet answers null — the honest « annulé », never a hang.
    // (`cancel` fires on modern browsers; older ones simply never resolve a
    // pick the user abandoned, which leaves no pending UI: the tap opens the
    // OS sheet and the screen state only changes on a real file.)
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (file === null) return { ok: false, reason: 'annule' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const video: PickedVideo = { bytes, durationSeconds: await measureDuration(bytes) };
  return { ok: true, video };
}

export type { PickedVideo, PickVideoOutcome };
