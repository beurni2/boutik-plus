import { ImageManipulator, type ImageRef } from 'expo-image-manipulator';
import { fondPapier } from './normalization';

/** The one DOM name this web-resolved file touches (the project has no `dom` lib). */
declare const URL: { revokeObjectURL(url: string): void };

/**
 * MEDIA-PORTE-1 (AUDIT-B+2 F-49) — lay a rendered picture on paper before it
 * becomes a JPEG (see `fondPapier`). The web library draws onto an unfilled
 * canvas, so every clear pixel of a see-through PNG or WebP came out black.
 * Every path that starts from a file he PICKED passes through here; the
 * vignette starts from a JPEG already laid. (`papier.ts` is the phone's half:
 * the library has no `extent` there.)
 *
 * AFTER the resize, at the RENDERED image's own size: the second pass is
 * derivative-sized, never another full-resolution canvas on a 1 GB phone, and
 * the fill can never disagree with the resize's rounding by a row.
 *
 * Its own module on purpose: the supplier's page picks photos but never
 * shoots, so importing this from `capture.ts` would ship the camera's
 * guidance code to every supplier for one fill.
 */
export async function surPapier(image: ImageRef): Promise<ImageRef> {
  const { extent } = fondPapier(image.width, image.height);
  const pose = await ImageManipulator.manipulate(image).extent(extent).renderAsync();
  // The input's PNG was only ever read to make this one. The library keeps
  // every render's object URL for the page's life; freeing this one keeps the
  // fill from adding a derivative-sized blob per photograph (verifier NIT).
  const uri = (image as unknown as { uri?: unknown }).uri;
  if (typeof uri === 'string' && uri.startsWith('blob:')) URL.revokeObjectURL(uri);
  return pose;
}
