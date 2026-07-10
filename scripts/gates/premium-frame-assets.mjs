#!/usr/bin/env node
// CI gate (B+I-02/B+I-08 grown teeth, WO-1.4 §3): a derivative carrying
// EXIF/metadata FAILS; a price- or contact-overlaid asset FAILS; the
// canonical premium-frame asset set passes (strict ProductAssetsSchema,
// private master). Exit 1 = violation. Exit 2 = unusable input.
import { readFileSync } from 'node:fs';
import { ProductAssetsSchema } from '@platform/contracts';

const path = process.argv[2];
if (!path) { console.error('usage: premium-frame-assets.mjs <asset-fixture.json>'); process.exit(2); }

let fixture;
try { fixture = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`unreadable fixture: ${e.message}`); process.exit(2); }

let failed = false;
const parsed = ProductAssetsSchema.safeParse(fixture.assets);
if (!parsed.success) {
  console.error('VIOLATION: not the canonical strict ProductAssets — undeclared keys (e.g. exif) or missing fields');
  failed = true;
}
// Metadata sweep across every nested value — EXIF has no home anywhere.
const flat = JSON.stringify(fixture);
if (/exif|gpslatitude|gpslongitude/i.test(flat)) {
  console.error('VIOLATION: EXIF/GPS metadata material present in the asset record');
  failed = true;
}
if (/\d[\d\s.,]*\s*(f\b|fcfa|cfa|francs?)/i.test(fixture.overlayText ?? '')) {
  console.error('VIOLATION: price material overlaid on the asset (assets are PRICE-FREE, B+I-02)');
  failed = true;
}
if (/(\+226|\b\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}\b|whatsapp)/i.test(fixture.overlayText ?? '')) {
  console.error('VIOLATION: contact material overlaid on the asset');
  failed = true;
}
if (!failed && !String(fixture.assets?.masterRef?.ref ?? '').startsWith('private/')) {
  console.error('VIOLATION: master ref is not private (B+I-08)');
  failed = true;
}
if (failed) process.exit(1);
console.log('OK: canonical premium-frame assets — EXIF-free, price-free, contact-free, private master');
