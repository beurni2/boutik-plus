/**
 * ═══ RENDU-RÉEL — expo-file-system, doubled so the console can MOUNT ═══
 *
 * Two files import it eagerly, so mounting the supplier console loads it:
 * `src/supply/uri-bytes.ts` (the publish path reads the master's real bytes)
 * and `src/offline/expoStore.ts` (the queue's file). Its own module scope calls
 * `requireNativeModule('FileSystem')`, which in a JS-only process finds nothing.
 *
 * ═══ BOUNDS (§9.8) ═══
 *
 * · THERE IS NO FILE SYSTEM HERE. `bytes()` THROWS rather than returning empty
 *   or fabricated bytes: what it reads becomes the MASTER HASH on a real supply
 *   record, so a walk reaching the publish path must fail loudly rather than
 *   pass over a fiction.
 * · ARMED (`armerLectureDataUri`), it reads ONE kind of address: a base64
 *   `data:` URI — a photo the app itself encoded, which carries its bytes in
 *   the address. It decodes exactly those bytes and invents none; any other
 *   address still throws. The shipped supplier page is the web build, whose
 *   reader (`uri-bytes.web.ts`) reads the same `data:` URI through `fetch`;
 *   `rendu-harness.test.ts` certifies the two read byte for byte.
 * · `Paths.document` is a sentinel string, not a path. Nothing here writes.
 * · APPEARANCE: nothing. This is a byte pipe, not a screen.
 */

let lectureDataUri = false;

/** PREUVE-PRETE-1 — let `bytes()` read a base64 `data:` URI, and nothing else. */
export function armerLectureDataUri(): void {
  lectureDataUri = true;
}

export function desarmerLecture(): void {
  lectureDataUri = false;
}

export class File {
  readonly uri: string;

  constructor(...parts: readonly unknown[]) {
    this.uri = parts.map((p) => String(p)).join('/');
  }

  async bytes(): Promise<Uint8Array> {
    const inline = /^data:[^,;]*;base64,([A-Za-z0-9+/=]*)$/.exec(this.uri);
    if (lectureDataUri && inline !== null) return new Uint8Array(Buffer.from(inline[1]!, 'base64'));
    throw new Error(
      `expo-file-system double: no file system under vitest (asked for « ${this.uri} »). ` +
        'A walk that means to read real bytes must arm this double explicitly.',
    );
  }
}

export const Paths = {
  document: '<document>',
} as const;
