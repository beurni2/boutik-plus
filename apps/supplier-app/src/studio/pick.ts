import {
  assertExifFree,
  base64ToBytes,
  bytesToBase64,
  derivativeActions,
  stripJpegMetadata,
  type ResizeAction,
} from './normalization';
import { t } from '../i18n';

/**
 * STUDIO-PICK-1 — CHOOSING A PHOTOGRAPH FROM THE PHONE (founder reshape,
 * 2026-07-25: *"MOST PRODUCT PICTURES WILL COME FROM THE GALLERY, not the
 * camera"*). This is now THE path, not a side option.
 *
 * IT IS THE SAME FUNNEL AS CAPTURE, DELIBERATELY. A picked image is a
 * derivative like any other: decode → bounded resize → **our own** segment
 * strip → `assertExifFree` as a post-condition on the exact bytes that ship.
 * There is no laxer path for a library photograph, and there is no branch in
 * which unstripped bytes exist.
 *
 * **THE EXIF WIDENING IS MORE LOAD-BEARING HERE THAN WHERE IT LANDED.** The
 * detector now catches any APP1 (EXIF *and* XMP) and any APP13 (IPTC), and it
 * was widened precisely because **phone gallery apps rewrite XMP routinely and
 * XMP carries GPS**. On the camera path that was mostly theoretical. On this
 * path it is the normal case.
 *
 * **THE DIMENSIONS COME FROM THE DECODE, NEVER FROM THE PICKER** — the rule
 * this module exists to hold. `expo-image-picker@57.0.6`
 * (`build/ImagePicker.types.d.ts:248-254`) says of `width`, verbatim:
 * *"Can be `0` if the system did not provide the width."* Same for `height`.
 * Feeding a zero into `heroSquareCrop` yields a degenerate rect, and a wrong
 * one yields the corner-fragment defect the crop-space fix already cost us
 * once. `ImageRef.width/height` — what the manipulator actually decoded — is
 * the only honest source, and the orchestration below reads it from there.
 */

/** The three shots, in his sequence. `preuve` keeps `guidance.ts`'s spelling. */
export type StudioRole = 'hero' | 'preuve' | 'detail';

/**
 * CAMERA-ONLY FOR THE PROOF SHOT (standing founder ruling). Returns the catalog
 * KEY of the refusal, or `null` when the gallery is allowed.
 *
 * **Stated in words, never by a missing button.** A control that silently is
 * not there reads as a bug; a control that says why reads as care. And the
 * sentence claims only what is true — the proof shot is taken now, with the
 * camera, because that is what makes it evidence of possession. It does NOT
 * claim the platform can verify that, because it cannot (see JOURNAL.md,
 * burned-in prices: provenance is the only real control we have).
 */
export function galleryRefusalKey(role: StudioRole): string | null {
  return role === 'preuve' ? 'studio.preuve_appareil_seul' : null;
}

/** What the picker hands back, narrowed to the fields this seam reads. */
export interface PickedAsset {
  readonly uri: string;
  /** The picker's OWN label for the file. Used for the REFUSAL SENTENCE only —
   * never for geometry, never for the strip decision. */
  readonly mimeType?: string | undefined;
  readonly fileName?: string | null | undefined;
}

/**
 * NAME THE FORMAT IN THE REFUSAL (founder ruling). Pure — asset in, label out.
 *
 * `image/heic` becomes « heic », because the sentence is read by a market
 * seller and « image/heic » is machine punctuation. A MIME type that is not
 * `image/*` travels whole rather than being trimmed into a lie.
 *
 * **`null` IS A REAL ANSWER, NOT A MISS.** The picker's types say `mimeType`
 * may be absent and `fileName` may be null "when the name is unavailable or
 * user gave limited permission"; a `ph://` asset carries no extension at all.
 * The caller renders « format inconnu » rather than an empty « () ».
 */
export function pickedFormatLabel(asset: PickedAsset): string | null {
  const mime = asset.mimeType?.trim() ?? '';
  if (mime !== '') {
    const slash = mime.indexOf('/');
    const sub = slash >= 0 && mime.startsWith('image/') ? mime.slice(slash + 1).trim() : mime;
    if (sub !== '') return sub.toLowerCase();
  }
  const name = asset.fileName?.trim() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
  }
  return null;
}

/** The typed decode refusal — a VALUE, so the sentence is testable by value. */
export interface DecodeRefusal {
  readonly messageKey: 'studio.image_illisible';
  /** The named format, or null when the phone told us nothing usable. */
  readonly format: string | null;
}

/** The refusal, rendered. Follows `studio.erreur_detail`'s `{token}` precedent. */
export function decodeRefusalSentence(refusal: DecodeRefusal): string {
  return t(refusal.messageKey).replace('{format}', refusal.format ?? t('studio.format_inconnu'));
}

/**
 * One image accepted into the Studio, from EITHER source.
 *
 * `CaptureResult` (capture.ts) is structurally one of these plus its camera
 * `guidance`. **The gallery path deliberately carries NO guidance**, and that
 * is an honesty choice rather than a saving: « Rapprochez-vous ou ajoutez un
 * peu de lumière » is advice he cannot act on for a photograph taken last week.
 * The useful next move on a picked image is « choisissez-en une autre », which
 * is the review screen's own secondary action.
 */
export interface StudioShot {
  /** The private master — retained on device, never uploaded, never published. */
  readonly masterUri: string;
  /** THE DECODE'S dimensions. Every crop rect aimed at the master comes from these. */
  readonly master: { readonly width: number; readonly height: number };
  /** The stripped, upload-ready derivative: the exact bytes AND their preview URI. */
  readonly derivative: { readonly uri: string; readonly width: number; readonly height: number };
}

export type PickOutcome =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'picked'; readonly shot: StudioShot }
  | { readonly kind: 'refused'; readonly refusal: DecodeRefusal };

/**
 * The two native operations, injected — so the ORCHESTRATION below (which is
 * where the dimension discipline lives) is testable by value with a fake that
 * disagrees with the picker on purpose.
 */
export interface ImageSourcePort {
  /** Launch the phone's library. `null` when he backed out — a cancel, not a fault. */
  pickFromLibrary(): Promise<PickedAsset | null>;
  /** DECODE the image. `width`/`height` are the decoded truth, not a file header claim. */
  decode(uri: string): Promise<{ image: unknown; width: number; height: number }>;
  /** Resize the ALREADY-DECODED image and encode it as JPEG base64. */
  encode(
    image: unknown,
    actions: readonly ResizeAction[],
  ): Promise<{ base64: string; width: number; height: number }>;
}

/**
 * Pick one photograph and bring it through the funnel.
 *
 * A decode or encode fault is a TYPED REFUSAL naming the format, never a throw
 * that reaches the screen as English. A strip fault is NOT caught here: an
 * image whose bytes cannot be proven clean must fail closed exactly as it does
 * on the camera path — that error class already has its designed state.
 */
export async function pickShot(port: ImageSourcePort): Promise<PickOutcome> {
  const picked = await port.pickFromLibrary();
  if (picked === null) return { kind: 'cancelled' };

  let decoded: { image: unknown; width: number; height: number };
  let encoded: { base64: string; width: number; height: number };
  try {
    decoded = await port.decode(picked.uri);
    // THE DISCIPLINE, in one line: the action list is derived from the DECODE's
    // dimensions. `picked.width`/`picked.height` are never read anywhere.
    encoded = await port.encode(decoded.image, derivativeActions(decoded.width, decoded.height));
  } catch {
    return {
      kind: 'refused',
      refusal: { messageKey: 'studio.image_illisible', format: pickedFormatLabel(picked) },
    };
  }

  // Identical to capture: strip ourselves, then assert on the SHIPPED bytes.
  const stripped = stripJpegMetadata(base64ToBytes(encoded.base64));
  assertExifFree(stripped);
  return {
    kind: 'picked',
    shot: {
      masterUri: picked.uri,
      master: { width: decoded.width, height: decoded.height },
      derivative: {
        uri: `data:image/jpeg;base64,${bytesToBase64(stripped)}`,
        width: encoded.width,
        height: encoded.height,
      },
    },
  };
}
