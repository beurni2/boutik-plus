import { ImageManipulator, type ImageRef } from 'expo-image-manipulator';
import { fondPapier } from './normalization';

/**
 * MEDIA-PORTE-1 (AUDIT-B+2 F-49) — lay a rendered picture on paper before it
 * becomes a JPEG (see `fondPapier`). Every path that starts from a file he
 * PICKED passes through here — a gallery PNG or WebP can be see-through; the
 * camera's own frames cannot, and the vignette starts from a JPEG already laid.
 *
 * AFTER the resize, at the RENDERED image's own size: the library's second
 * pass is derivative-sized, never another full-resolution canvas on a 1 GB
 * phone, and the fill can never disagree with the resize's rounding by a row.
 *
 * Its own module on purpose: the supplier's page picks photos but never
 * shoots, so importing this from `capture.ts` would ship the camera's
 * guidance code to every supplier for one fill.
 */
export async function surPapier(image: ImageRef): Promise<ImageRef> {
  const { extent } = fondPapier(image.width, image.height);
  return ImageManipulator.manipulate(image).extent(extent).renderAsync();
}
