import { File } from 'expo-file-system';

/**
 * BOUTIK-WEB-W2 — THE ONE FILE-SYSTEM TOUCH IN THE PUBLISH PATH, made a
 * platform seam. The master's own bytes are read back at publish time so the
 * record carries the REAL master hash (`lister-real.tsx` — hashing the
 * derivative and calling it the master would be a false record).
 *
 * On native the master URI is a file the picker/camera wrote —
 * `expo-file-system`'s `File.bytes()` reads it. On web there is no file
 * system and the master URI is a `data:`/`blob:` URI; `uri-bytes.web.ts`
 * reads the SAME bytes through `fetch`. Metro resolves per platform; tsc and
 * vitest resolve here, so native stays the typechecked default.
 */
export async function bytesFromUri(uri: string): Promise<Uint8Array> {
  return await new File(uri).bytes();
}
