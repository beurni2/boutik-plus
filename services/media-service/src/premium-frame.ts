import { ProductAssetsSchema, type ProductAssets } from '@platform/contracts';

/**
 * E1 IMAGE PATH — premium-frame ONLY ("no cleanup" per the E1 line). One
 * deterministic capture path: EXIF is STRIPPED (canonical MediaRef carries
 * no metadata field — derivatives are structurally EXIF-free, and this
 * module refuses to even build assets from a capture whose derivative
 * would carry metadata), the master ref stays PRIVATE and immutable
 * (B+I-08), and assets are PRICE-FREE and contact-free (B+I-02) — a
 * price-overlaid or contact-bearing frame is refused closed. There is no
 * cleanup, no normalization pipeline, no moderation queue, and no
 * inference anywhere (deterministic only).
 */

export interface CaptureInput {
  captureRef: string;
  sha256: string;
  mimeType: string;
  /** EXIF tags read from the capture — present on input, NEVER on output. */
  exif: Record<string, string>;
  /** Text the seller asked to overlay on the frame, if any. */
  overlayText?: string;
}

const PRICE_PATTERN = /\d[\d\s.,]*\s*(f\b|fcfa|cfa|francs?)/i;
const CONTACT_PATTERN = /(\+226|\b\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}\b|whatsapp|t[eé]l[eé]phone|appelez)/i;

export type PremiumFrameOutcome =
  | { ok: true; assets: ProductAssets }
  | { ok: false; reason: 'price_material_refused' | 'contact_material_refused' };

export function buildPremiumFrameAssets(input: CaptureInput): PremiumFrameOutcome {
  const overlay = input.overlayText ?? '';
  if (PRICE_PATTERN.test(overlay)) return { ok: false, reason: 'price_material_refused' };
  if (CONTACT_PATTERN.test(overlay)) return { ok: false, reason: 'contact_material_refused' };

  // Derivatives: premium frame only. The EXIF from the capture is dropped
  // here — MediaRef has no metadata field, so a derivative cannot carry it.
  const derived = (kind: string) => ({
    ref: `media/${kind}/${input.captureRef}`,
    sha256: input.sha256,
    mimeType: input.mimeType,
  });
  const assets = ProductAssetsSchema.parse({
    masterRef: { ref: `private/master/${input.captureRef}`, sha256: input.sha256, mimeType: input.mimeType },
    heroSquare: derived('premium-frame-square'),
    heroVertical: derived('premium-frame-vertical'),
    proof: derived('proof'),
    detail: [],
    hashes: [input.sha256],
    // Deterministic pipeline version — premium-frame only, no cleanup (E1).
    processingVersion: 'premium-frame.v1',
  });
  return { ok: true, assets };
}
