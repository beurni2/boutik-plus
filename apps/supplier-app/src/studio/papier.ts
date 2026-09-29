import type { ImageRef } from 'expo-image-manipulator';

/**
 * MEDIA-PORTE-1 (AUDIT-B+2 F-49) — THE NATIVE HALF: the picture goes on as it
 * is. Metro resolves `papier.web.ts` in a web bundle; this file on a phone.
 *
 * ⚠ WHY NOTHING HAPPENS HERE (verifier BLOCKER): expo-image-manipulator 57 has
 * `extent` on the WEB only — `src/ImageManipulatorContext.ts` tags it
 * `@platform web`, and the iOS and Android Context classes define resize,
 * rotate, flip, crop and render, nothing else. Calling it here threw on every
 * phone: every gallery pick was refused as unreadable and every publish with a
 * hero failed, camera shots included — shipped by OTA with no rebuild.
 *
 * F-49 is a WEB finding (the browser encodes an unfilled canvas). On a phone a
 * see-through picture is NOT laid on paper yet; that is said in the journal
 * rather than pretended here.
 */
export async function surPapier(image: ImageRef): Promise<ImageRef> {
  return image;
}
