import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WO-6.5 · B1.3 — the RE-ENCODE ORDER is LOAD-BEARING and now ENFORCED (not
 * prose). The allow-list stripper is a byte-level segment rewriter: it drops
 * every metadata segment and every post-EOI payload, but it cannot tell bytes
 * hidden INSIDE the compressed entropy stream from real pixel data — no
 * segment-level stripper can (verifier concern #2). What makes that acceptable
 * against the hostile-encoder threat is that the capture path RE-ENCODES the
 * pixels through expo-image-manipulator (decode → re-encode JPEG) BEFORE the
 * stripper runs — the re-encode regenerates the entropy stream from decoded
 * pixels, destroying any bytes smuggled in the original's entropy. A safety
 * property held by prose is a vacuous test; this gate pins the ordering in the
 * source so it cannot silently regress.
 */

const appDir = join(import.meta.dirname, '..');
const capture = readFileSync(join(appDir, 'src/studio/capture.ts'), 'utf8');

describe('WO-6.5 B1.3 — the capture path re-encodes BEFORE it strips', () => {
  it('renderDerivative (the expo-image-manipulator re-encode) runs before stripJpegMetadata', () => {
    const iReencode = capture.indexOf('renderDerivative(');
    const iStrip = capture.indexOf('stripJpegMetadata(');
    expect(iReencode, 'renderDerivative is called').toBeGreaterThan(-1);
    expect(iStrip, 'stripJpegMetadata is called').toBeGreaterThan(-1);
    expect(iReencode, 'the re-encode precedes the strip').toBeLessThan(iStrip);
  });

  it('renderDerivative IS a real re-encode: ImageManipulator.manipulate → renderAsync → saveAsync(JPEG)', () => {
    const body = capture.slice(capture.indexOf('function renderDerivative'), capture.indexOf('function renderMetricsFrame'));
    expect(body).toMatch(/ImageManipulator\.manipulate\(/);
    expect(body).toMatch(/renderAsync\(/);
    expect(body).toMatch(/saveAsync\(\{[^}]*format:\s*SaveFormat\.JPEG/);
  });

  it('the stripper is fed the RE-ENCODED derivative bytes, never the raw camera master', () => {
    // bytes come from the derivative's base64 (the re-encode output) …
    expect(capture).toMatch(/const\s+bytes\s*=\s*base64ToBytes\(derivative\.base64/);
    expect(capture).toMatch(/stripJpegMetadata\(bytes\)/);
    // … and the master (photo.uri) is NEVER handed to the stripper directly.
    expect(capture).not.toMatch(/stripJpegMetadata\([^)]*photo/);
  });

  it('the post-condition (assertExifFree) runs on the STRIPPED bytes, after the strip', () => {
    const iStrip = capture.indexOf('stripJpegMetadata(bytes)');
    const iAssert = capture.indexOf('assertExifFree(stripped)');
    expect(iStrip).toBeGreaterThan(-1);
    expect(iAssert).toBeGreaterThan(iStrip);
  });
});
