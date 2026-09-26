import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * ═══ RENDU-RÉEL — expo-image-picker, stood in at the REQUIRE level ═══
 *
 * FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-21, F-22). `src/studio/pick-native.ts`
 * requires this module LAZILY, inside the tap, on purpose (its docblock: a
 * top-level import once blanked the device-pass build). A lazy `require()` is
 * resolved by Node at call time, so neither a vite alias nor `vi.mock` reaches
 * it — measured by the audit, and why no walk had ever pressed « Choisir la
 * photo du colis ». This stand-in goes where that `require()` actually looks:
 * Node's module cache, under the path the app's own file resolves.
 *
 * ═══ BOUNDS (§9.8) ═══
 *
 * · IT ANSWERS WHAT THE OS SHEET ANSWERS, AND NOTHING MORE: « cancelled », or
 *   a list of `{uri, mimeType, fileName}`. It decodes nothing and makes no
 *   pixels — the decode and the strip are the app's real code, fed through the
 *   manipulator double, which must be armed on its own.
 * · UNARMED, IT THROWS. A walk that taps the picker without saying what the
 *   sheet returns fails loudly instead of passing over an invented choice.
 * · APPEARANCE: nothing. The OS sheet is not ours and nothing here draws it.
 */

export interface ChoixDuSelecteur {
  readonly uri: string;
  readonly mimeType?: string;
  readonly fileName?: string;
}

type Reponse = { readonly canceled: true } | { readonly canceled: false; readonly assets: readonly ChoixDuSelecteur[] };

let reponse: Reponse | null = null;
/** Every time the app opened the sheet — « was the picker actually CALLED ». */
export const ouvertures: number[] = [];

const stand = {
  async launchImageLibraryAsync(options: { selectionLimit?: number }): Promise<Reponse> {
    ouvertures.push(options.selectionLimit ?? 0);
    if (reponse === null) {
      throw new Error('expo-image-picker stand-in: not armed — say what the sheet returns before tapping the picker.');
    }
    return reponse;
  },
};

const appRequire = createRequire(join(import.meta.dirname, '..', '..', 'src', 'studio', 'pick-native.ts'));
const chemin = appRequire.resolve('expo-image-picker');
(appRequire.cache as Record<string, unknown>)[chemin] = {
  id: chemin,
  filename: chemin,
  loaded: true,
  exports: stand,
};

/** The sheet returns these files (or, with `null`, the person backs out). */
export function armerSelecteur(choix: readonly ChoixDuSelecteur[] | null): void {
  reponse = choix === null ? { canceled: true } : { canceled: false, assets: choix };
  ouvertures.length = 0;
}

export function desarmerSelecteur(): void {
  reponse = null;
  ouvertures.length = 0;
}

/** For the harness's own certification: the path the app's require resolves. */
export const cheminResolu = chemin;
