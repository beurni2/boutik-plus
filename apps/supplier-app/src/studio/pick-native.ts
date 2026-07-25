import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { DERIVATIVE_SPEC_V1, type ResizeAction } from './normalization';
import type { ImageSourcePort } from './pick';

/**
 * STUDIO-PICK-1 — THE NATIVE HALF, kept in its own file for one reason: a
 * module that imports `expo-image-picker` cannot be loaded in node, and the
 * decisions worth testing must be loadable in node.
 *
 * `capture.ts` is the cautionary case — it is proved today by GREPPING ITS
 * SOURCE, because its native import makes it unimportable in a test. That is
 * exactly the shape the founder ruled against (*"a decision that renders
 * differently should be a function that returns a value, not a shape a test
 * can only describe"*). So `pick.ts` holds the orchestration and every decision
 * and imports nothing native; this file holds three native calls and no
 * branching at all, and is deliberately the untested part.
 */

/**
 * The real port. Thin by design — every decision worth testing was lifted out
 * of it, so what remains is three native calls and no branching.
 *
 * `manipulate()` accepts `string | SharedRef<'image'>` and `ImageRef` IS a
 * `SharedRef<'image'>` (`expo-image-manipulator@14.0.8`,
 * `build/ImageManipulator.types.d.ts:118`, `build/ImageRef.d.ts`), so the
 * decoded image is handed straight to the encode step — **one decode, not two**,
 * which matters on a 2 GB Android holding a 12 MP bitmap.
 *
 * `SaveFormat.JPEG` is pinned here as at the three capture sites: the
 * manipulator decodes to a platform bitmap and re-encodes, so whatever the
 * library file was — HEIC included — the strip only ever sees JPEG.
 */
export const nativeImageSource: ImageSourcePort = {
  async pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (asset === undefined) return null;
    return { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName };
  },
  async decode(uri: string) {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    return { image, width: image.width, height: image.height };
  },
  async encode(image: unknown, actions: readonly ResizeAction[]) {
    const ctx = ImageManipulator.manipulate(image as Parameters<typeof ImageManipulator.manipulate>[0]);
    for (const action of actions) ctx.resize(action.resize);
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({
      compress: DERIVATIVE_SPEC_V1.compress,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return { base64: saved.base64 ?? '', width: saved.width, height: saved.height };
  },
};
