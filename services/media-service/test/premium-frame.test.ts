import { describe, expect, it } from 'vitest';
import { ProductAssetsSchema } from '@platform/contracts';
import { buildPremiumFrameAssets } from '../src/premium-frame.js';

const SHA = 'a3f5c9d21e8b47061234567890abcdef1234567890abcdef1234567890abcdef';
const capture = {
  captureRef: 'cap-001.jpg',
  sha256: SHA,
  mimeType: 'image/jpeg',
  exif: { GPSLatitude: '12.37', GPSLongitude: '-1.52', Make: 'TechnoCam' },
};

describe('premium-frame image path — EXIF stripped, price-free, contact-free, no cleanup', () => {
  it('builds canonical ProductAssets: EXIF is structurally ABSENT from every derivative; master is private', () => {
    const outcome = buildPremiumFrameAssets(capture);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(ProductAssetsSchema.safeParse(outcome.assets).success).toBe(true);
    // Canonical MediaRef has no metadata field — assert none leaked through.
    for (const ref of [outcome.assets.heroSquare, outcome.assets.heroVertical, outcome.assets.proof]) {
      expect(Object.keys(ref).sort()).toEqual(['mimeType', 'ref', 'sha256']);
      expect(JSON.stringify(ref)).not.toMatch(/GPS|exif|Make/i);
    }
    expect(outcome.assets.masterRef.ref.startsWith('private/master/')).toBe(true);
  });

  it('a PRICE overlay is refused closed — assets are price-free (B+I-02)', () => {
    for (const overlayText of ['Prix 5 000 F', 'Seulement 12500 FCFA', '3.000 francs']) {
      expect(buildPremiumFrameAssets({ ...capture, overlayText })).toEqual({ ok: false, reason: 'price_material_refused' });
    }
  });

  it('CONTACT material is refused closed — assets are contact-free', () => {
    for (const overlayText of ['Appelez le 70 12 34 56', 'WhatsApp +226 70 12 34 56']) {
      expect(buildPremiumFrameAssets({ ...capture, overlayText })).toEqual({ ok: false, reason: 'contact_material_refused' });
    }
  });

  it('a harmless overlay passes — refusals are about price/contact, not decoration', () => {
    expect(buildPremiumFrameAssets({ ...capture, overlayText: 'Fait main au Faso' }).ok).toBe(true);
  });
});
