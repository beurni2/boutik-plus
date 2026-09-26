import { createRequire } from 'node:module';

/**
 * ═══ RENDU-RÉEL — expo-font, doubled so the suppliers' page can MOUNT ═══
 *
 * FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-28) puts the web-font loader at the root of
 * the suppliers' page, so every walk that mounts it now reaches this module —
 * and the real one reaches the Metro-only Expo runtime at import, exactly like
 * the manipulator before it (the growth rule in `vitest.config.ts`).
 *
 * The loader's map is six literal `require('….ttf')` rows — Metro turns each
 * into an asset id at build time. Node has no such loader, so this file
 * registers the one thing Metro would: a `.ttf` require answers a number (an
 * asset id), never the file's bytes parsed as script.
 *
 * ═══ BOUNDS (§9.8) ═══
 *
 * · IT LOADS NO FONT. `useFonts` answers « loaded » at once and records the map
 *   it was asked for — enough to mount a screen, never enough to claim a face
 *   was fetched, displayed or swapped. The display strategy is pinned where it
 *   can be read truthfully: `web-fonts.test.ts`, on the map itself.
 * · `FontDisplay` carries the REAL values — the loader passes them straight
 *   into `@font-face`, and a drifted string is what a double must not hide.
 * · APPEARANCE: nothing. Which face paints is the founder's eyes' question.
 */

export enum FontDisplay {
  AUTO = 'auto',
  SWAP = 'swap',
  BLOCK = 'block',
  FALLBACK = 'fallback',
  OPTIONAL = 'optional',
}

/** Every map a screen asked to load, in call order. */
export const demandes: Record<string, unknown>[] = [];

export function useFonts(map: Record<string, unknown>): [boolean, Error | null] {
  demandes.push(map);
  return [true, null];
}

// The asset loader Metro provides and Node does not: `.ttf` → an asset id.
const nodeRequire = createRequire(import.meta.url) as NodeJS.Require & {
  extensions: Record<string, (m: { exports: unknown }, filename: string) => void>;
};
let prochainActif = 1;
nodeRequire.extensions['.ttf'] ??= (m) => {
  m.exports = prochainActif;
  prochainActif += 1;
};
