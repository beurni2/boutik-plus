/**
 * WO-6.10 · ADOPT THE MINT RULE — the command_id seam now delegates to CANON.
 *
 * Canon (WO-5.9, docs/derivations/COMMAND-ID-MINT.md, @platform/contracts v0.9.5)
 * ruled the mint: `command_id` is a UUIDv4, minted CLIENT-side exactly ONCE at
 * command creation, PERSISTED with the command, and NEVER recomputed — with its
 * entropy from the OS CSPRNG. `Math.random()` is FORBIDDEN as an idempotency-key
 * source: it carries only its SEED's entropy (unproven on a cold-booted Android-Go
 * device), so two commands can collide into one idempotency key — a double-charge
 * or a lost action. The old Math.random v4-shape helper that lived here is DELETED;
 * this file now hands off to `@platform/contracts`' `mintCommandId`.
 *
 * `mintCommandId` reads the AMBIENT Web Crypto global (`globalThis.crypto.randomUUID`)
 * — never an import of the node `crypto` builtin. Node/web expose it natively; React
 * Native does NOT, so this module surfaces expo-crypto's OS CSPRNG under that shape.
 * We NEVER install a Math.random shim: if a real CSPRNG cannot be wired, the global
 * stays absent and canon's helper THROWS at command creation — which the caller
 * (App.confirmReady) surfaces as `queue_error`, never a fabricated key, never a faked
 * « en attente ». Same honesty contract as the queue's id-collision path.
 */
import * as Crypto from 'expo-crypto';
import { mintCommandId as canonMintCommandId, type CommandId } from '@platform/contracts';

// Wire expo-crypto's randomUUID (the OS CSPRNG) into the Web Crypto shape canon
// reads — once, as a module side-effect, before any mint. No-op when the runtime
// already exposes it. No Math.random fallback: if this cannot install a real
// CSPRNG, the global stays absent and mintCommandId throws (honest failure).
const g = globalThis as { crypto?: { randomUUID?: () => string } };
if (typeof g.crypto?.randomUUID !== 'function' && typeof Crypto.randomUUID === 'function') {
  const randomUUID = (): string => Crypto.randomUUID();
  if (g.crypto && Object.isExtensible(g.crypto)) {
    g.crypto.randomUUID = randomUUID;
  } else {
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...(g.crypto ?? {}), randomUUID },
      configurable: true,
      writable: true,
    });
  }
}

// SUPPLIER-AUTHORING-1 — the SAME surfacing for `getRandomValues`, which React
// Native also does not provide and which `src/supply/product-code.ts` draws its
// product-code suffix entropy from. Kept as a SEPARATE block on purpose: the one
// above is the proven command-id path and stays byte-identical. No Math.random
// fallback here either — if no CSPRNG can be wired the global stays absent and the
// draw THROWS, which the authoring screen surfaces as an honest failure rather
// than minting a code from a weak source.
const gr = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
if (typeof gr.crypto?.getRandomValues !== 'function' && typeof Crypto.getRandomValues === 'function') {
  const getRandomValues = (a: Uint8Array): Uint8Array => Crypto.getRandomValues(a);
  if (gr.crypto && Object.isExtensible(gr.crypto)) {
    gr.crypto.getRandomValues = getRandomValues;
  } else {
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...(gr.crypto ?? {}), getRandomValues },
      configurable: true,
      writable: true,
    });
  }
}

/**
 * Mint a fresh command_id ONCE, at command creation, from the OS CSPRNG (canon
 * `mintCommandId`). The caller MUST persist it (via the durable queue) and NEVER
 * recompute it, so it cannot collide with itself across an app-kill/reboot.
 * THROWS when no CSPRNG is available — the caller surfaces that honestly
 * (queue_error), never a Math.random fallback.
 */
export function mintCommandId(): CommandId {
  return canonMintCommandId();
}
