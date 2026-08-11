/**
 * RENDU-RÉEL — the expo-crypto double. A NATIVE BOUNDARY: the real module is
 * the OS digest, and the app deliberately never reimplements SHA-256 in JS.
 *
 * ⚠ THE DIGEST HERE IS NOT SHA-256 AND MUST NEVER BE READ AS ONE. It is a
 * deterministic byte-mixer whose only contract is « same bytes ⇒ same 32-byte
 * answer, different bytes ⇒ different answer », which is exactly what a walk
 * needs to see an idempotency key stay stable across a retry. The REAL hash's
 * correctness is proved where it belongs: `command-id-mint.test.ts` and the
 * media-upload suites, against known vectors.
 *
 * `randomUUID` and `getRandomValues` are DETERMINISTIC by counter — a walk
 * that produced a fresh id every mount could never assert « the same command
 * was resent », and a random one would make failures unreproducible.
 */

export enum CryptoDigestAlgorithm {
  SHA1 = 'SHA-1',
  SHA256 = 'SHA-256',
  SHA384 = 'SHA-384',
  SHA512 = 'SHA-512',
}

export async function digest(_algorithm: CryptoDigestAlgorithm, data: Uint8Array): Promise<ArrayBuffer> {
  const out = new Uint8Array(32);
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    h = (h ^ (data[i] as number)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    out[i % 32] = (out[i % 32]! ^ (h & 0xff)) >>> 0;
  }
  // Length is mixed in so two different-length runs of the same byte differ.
  for (let i = 0; i < 32; i += 1) out[i] = (out[i]! ^ ((data.length >>> (i % 4) * 8) & 0xff)) >>> 0;
  return out.buffer;
}

let counter = 0;
export function randomUUID(): string {
  counter += 1;
  const n = counter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
}

export function getRandomValues<T extends ArrayBufferView>(array: T): T {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let i = 0; i < bytes.length; i += 1) {
    counter += 1;
    bytes[i] = counter & 0xff;
  }
  return array;
}
