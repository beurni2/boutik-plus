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
 * this module exists to hold. `expo-image-picker@17.0.11`
 * (`build/ImagePicker.types.d.ts:248-252`) says of `width`, verbatim:
 * *"Can be `0` if the system did not provide the width."* Same for `height`.
 * Feeding a zero into `heroSquareCrop` yields a degenerate rect, and a wrong
 * one yields the corner-fragment defect the crop-space fix already cost us
 * once. `ImageRef.width/height` — what the manipulator actually decoded — is
 * the only honest source, and the orchestration below reads it from there.
 */

/**
 * WHERE A PHOTOGRAPH CAME FROM. Recorded on every shot (STUDIO-BATCH-1) —
 * because roles are now assigned at the VERIFY step, not at intake, the old
 * "proof shot is camera-only on native" rule has no intake hook left to hang
 * on. The SOURCE is the data that rule would need if the parked native app
 * revives: a publish-time check can then require the preuve-assigned photo to
 * carry `source: 'camera'`. Not enforced today (web is upload-only by W-D1);
 * carried so the ruling stays enforceable rather than quietly destroyed.
 */
export type ShotSource = 'camera' | 'gallery';

/**
 * WHAT THE SHOOTING SCREEN SAYS AFTER A PICK THAT BROUGHT NOTHING BACK
 * (device incident 2026-07-25 — a silent cancel is indistinguishable from a
 * dead button; the picker reports a deliberate back-out and an OS refusal the
 * same way, so the sentence must be true of both). Moved here from review.ts
 * when the per-role review walk retired (STUDIO-BATCH-1).
 */
export function noPhotoSentenceKey(): string {
  return 'studio.aucune_photo';
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
  /** Where it came from — see {@link ShotSource} for why this is recorded. */
  readonly source: ShotSource;
}

export type PickOutcome =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'picked'; readonly shot: StudioShot }
  | { readonly kind: 'refused'; readonly refusal: DecodeRefusal };

/**
 * What the SHOOTING SCREEN has to say, if anything, after the last attempt.
 * Lives here (not in the screen) because both platform shoot screens render it
 * and the phase machine stores it — the pick path's own outcome vocabulary,
 * BOUTIK-WEB-W2.
 */
export type ShootBanner =
  | { readonly kind: 'decode'; readonly refusal: DecodeRefusal }
  | { readonly kind: 'no_photo' };

/**
 * The two native operations, injected — so the ORCHESTRATION below (which is
 * where the dimension discipline lives) is testable by value with a fake that
 * disagrees with the picker on purpose.
 */
export interface ImageSourcePort {
  /** Launch the phone's library, MULTI-SELECT up to `max` (STUDIO-BATCH-1 —
   * founder: *"select ... and upload at the same time instead just doing it
   * one by one"*). `null` when he backed out — a cancel, not a fault. */
  pickManyFromLibrary(max: number): Promise<readonly PickedAsset[] | null>;
  /** DECODE the image. `width`/`height` are the decoded truth, not a file header claim. */
  decode(uri: string): Promise<{ image: unknown; width: number; height: number }>;
  /** Resize the ALREADY-DECODED image and encode it as JPEG base64. */
  encode(
    image: unknown,
    actions: readonly ResizeAction[],
  ): Promise<{ base64: string; width: number; height: number }>;
}

/**
 * A BATCH brought through the funnel — every photograph still walks the ONE
 * funnel, one at a time (peak memory on a 2 GB phone is one decode, exactly as
 * before; "at the same time" is the SELECTION, not the processing).
 *
 * `refusal` carries the FIRST undecodable file, and the REST OF THE BATCH IS
 * DROPPED with it — stated plainly: the alternative (skip and continue) would
 * silently publish a set he did not choose. The successes BEFORE the refusal
 * are kept; re-picking the rest is one multi-select away.
 */
export interface BatchOutcome {
  readonly shots: readonly StudioShot[];
  readonly refusal: DecodeRefusal | null;
  /** True when the library dialog brought nothing back at all. */
  readonly cancelled: boolean;
}

/**
 * Pick up to `max` photographs and bring each through the funnel.
 *
 * A decode or encode fault is a TYPED REFUSAL naming the format, never a throw
 * that reaches the screen as English. A strip fault is NOT caught here: an
 * image whose bytes cannot be proven clean must fail closed exactly as it does
 * on the camera path — that error class already has its designed state.
 */
export async function pickShots(port: ImageSourcePort, max: number): Promise<BatchOutcome> {
  const picked = await port.pickManyFromLibrary(max);
  if (picked === null || picked.length === 0) return { shots: [], refusal: null, cancelled: true };
  return await shotsFromAssets(port, picked);
}

/** The batch funnel over assets already in hand (drops arrive here too). The
 * `max` bound is enforced HERE, not trusted to any picker or drag source. */
export async function shotsFromAssets(
  port: ImageSourcePort,
  assets: readonly PickedAsset[],
  max: number = assets.length,
): Promise<BatchOutcome> {
  const shots: StudioShot[] = [];
  for (const asset of assets.slice(0, max)) {
    const out = await shotFromAsset(port, asset);
    if (out.kind === 'refused') return { shots, refusal: out.refusal, cancelled: false };
    shots.push(out.shot);
  }
  return { shots, refusal: null, cancelled: false };
}

/**
 * THE FUNNEL ITSELF, from an asset already in hand — extracted (BOUTIK-WEB-W3)
 * so a DRAG-AND-DROPPED file walks the EXACT code path a library pick walks:
 * decode → actions from the DECODE's dimensions → our strip → `assertExifFree`
 * on the shipped bytes. There is deliberately no second funnel for drops, and
 * no branch in which unstripped bytes exist — a laxer drop path would quietly
 * reopen everything this module closed.
 *
 * `cancelled` cannot come out of this half: an asset in hand is past the point
 * of backing out. Only the library dialog above can answer `cancelled`.
 */
export async function shotFromAsset(
  port: ImageSourcePort,
  picked: PickedAsset,
): Promise<Exclude<PickOutcome, { kind: 'cancelled' }>> {
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
      // a picked file and a dropped file are both library material.
      source: 'gallery',
    },
  };
}
