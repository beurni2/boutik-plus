/**
 * BOUTIK-WEB-W2 — the web half of the byte-read seam (see `uri-bytes.ts`). On
 * web the master URI is a `data:` or `blob:` URI, and `fetch` is the one
 * standard reader for both. No expo-file-system import may enter this file:
 * that package has no web behaviour to fall back on, and this seam exists
 * precisely so nothing upstream has to know that.
 */
export async function bytesFromUri(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`bytesFromUri: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
