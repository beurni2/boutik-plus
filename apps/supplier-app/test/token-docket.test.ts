import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WO-6.0 — the TOKEN DOCKET (founder's amended token-fidelity gate).
 *
 * Ruling: a dimension STATED in a canon design doc is a DESIGNER VALUE; it
 * becomes a canon token, quoted from the doc's line — never arithmetic that
 * coincidentally equals it. These seven values are stated in components.md /
 * motion.md and become tokens at the v0.9.2 re-pin (the same re-pin that fills
 * the accueil/produits icon slots). Until then they are held raw in the kit,
 * and the zero-hardcode SIZE scan is legitimately RED (it goes green at that
 * pin, not before).
 *
 * This gate is the amended fidelity model in force NOW: every held raw value
 * must (a) be the ONLY hardcoded dimensions in the layer (App.tsx is fully
 * token-clean; the kit holds exactly these seven), and (b) BYTE-MATCH the
 * canon design-doc line it is quoted from. Nothing is invented; nothing drifts.
 * When v0.9.2 tokenizes them, this docket empties and the size scan turns green.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const DOCS = join(appDir, '../..', 'design-reference/grand-teint/docs');
const readDoc = (f: string) => readFileSync(join(DOCS, f), 'utf8');

const SIZE_PROP =
  /(?:fontSize|lineHeight|borderRadius|padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|margin[A-Za-z]*|minHeight|minWidth|maxWidth|height|width|gap|letterSpacing|top|bottom|left|right):\s*(\d+(?:\.\d+)?)\b/g;

const hardcodedDims = (src: string): number[] =>
  [...src.matchAll(SIZE_PROP)].map((m) => Number(m[1])).filter((n) => n !== 0);

/**
 * The docket: each held raw value, the canon doc it is quoted from, and the
 * exact byte-substring that must be present in that doc (the quote-verification).
 */
const DOCKET: { value: number; doc: string; quote: string; where: string }[] = [
  { value: 56, doc: 'components.md', quote: 'h 56', where: 'PrimaryButton/TabBar height' },
  { value: 50, doc: 'components.md', quote: 'h 50', where: 'SecondaryButton height' },
  { value: 44, doc: 'components.md', quote: 'h 44', where: 'AppHeader / hit-area padded to 44' },
  { value: 30, doc: 'components.md', quote: 'h 30', where: 'OfflineBanner height' },
  { value: 118, doc: 'components.md', quote: 'w 118', where: 'PriceBand honesty-note width' },
  { value: 220, doc: 'motion.md', quote: '220px', where: 'celebration halo diameter' },
  { value: 132, doc: 'motion.md', quote: '132px', where: 'celebration ring diameter' },
];

describe('WO-6.0 token docket — the a-class held values, pending v0.9.2 tokenization', () => {
  it('App.tsx is fully token-clean: ZERO hardcoded dimensions', () => {
    expect(hardcodedDims(read('App.tsx'))).toEqual([]);
  });

  it('the kit holds EXACTLY the seven docketed designer values — no invented hardcode', () => {
    const held = new Set(hardcodedDims(read('src/ui/kit.tsx')));
    const docketed = new Set(DOCKET.map((d) => d.value));
    // every held value is docketed (nothing invented) …
    for (const v of held) expect(docketed.has(v), `undocketed hardcode ${v} in the kit`).toBe(true);
    // … and every docketed value is actually still held (the docket is not stale)
    for (const v of docketed) expect(held.has(v), `docketed ${v} no longer in the kit`).toBe(true);
  });

  it('every docketed value BYTE-MATCHES the canon design-doc line it is quoted from', () => {
    for (const { value, doc, quote, where } of DOCKET) {
      const src = readDoc(doc);
      expect(src.includes(quote), `${value} (${where}): canon ${doc} must contain "${quote}"`).toBe(true);
      // the quote carries the value's own digits — the byte-match is the value
      expect(quote).toContain(String(value));
    }
  });
});
