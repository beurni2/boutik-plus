import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUDIT-B+1 F26 — `src/offline/commandId.ts` HAD NO BEHAVIOURAL TEST.
 *
 * 18 test files mentioned `mintCommandId`; not one CALLED it. They pinned that
 * call sites SPELL it — string assertions over source — so the module that
 * mints every write command's idempotency key was executed by nothing, and the
 * CSPRNG-surfacing block at its top was exercised by nothing.
 *
 * What that block is for: React Native exposes neither `crypto.randomUUID` nor
 * `crypto.getRandomValues`, and canon's `mintCommandId` reads the AMBIENT Web
 * Crypto global. So this module wires expo-crypto's OS CSPRNG into that shape
 * at import. If it wires it wrongly the app cannot publish at all — and if it
 * ever wired `Math.random` instead, two commands could collide onto ONE
 * idempotency key. That is a double-charge or a lost action.
 *
 * These tests execute the module, one runtime shape per case. `vi.resetModules`
 * before each is load-bearing: the wiring is an import-time side effect, so a
 * cached module would test nothing.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let compteur = 0;
const faireUuid = (): string => {
  compteur += 1;
  const n = compteur.toString(16).padStart(12, '0');
  return `aaaaaaaa-bbbb-4ccc-8ddd-${n}`;
};

vi.mock('expo-crypto', () => ({
  randomUUID: (): string => faireUuid(),
  getRandomValues: (a: Uint8Array): Uint8Array => {
    for (let i = 0; i < a.length; i += 1) a[i] = (i * 7 + 13) % 256;
    return a;
  },
}));

const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function poserCrypto(value: unknown): void {
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
}

beforeEach(() => {
  compteur = 0;
  vi.resetModules();
});

afterEach(() => {
  if (original !== undefined) Object.defineProperty(globalThis, 'crypto', original);
});

describe('the command_id mint — the idempotency key for every write command', () => {
  it('mints a UUIDv4, and a DIFFERENT one each time (a repeat is a collided idempotency key)', async () => {
    poserCrypto(undefined);
    const { mintCommandId } = await import('../src/offline/commandId');
    const un = mintCommandId();
    const deux = mintCommandId();
    expect(un).toMatch(UUID_V4);
    expect(deux).toMatch(UUID_V4);
    expect(un, 'two commands minted the SAME key — that is a double-charge or a lost action').not.toBe(deux);
  });

  it('surfaces the OS CSPRNG when the runtime has no crypto at all (React Native)', async () => {
    poserCrypto(undefined);
    await import('../src/offline/commandId');
    const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: unknown } };
    expect(typeof g.crypto?.randomUUID, 'randomUUID was not wired — publishing would throw').toBe('function');
    expect(typeof g.crypto?.getRandomValues, 'getRandomValues was not wired — the product code draw would throw').toBe('function');
  });

  it('leaves a runtime that ALREADY has a real CSPRNG untouched', async () => {
    const propre = { randomUUID: (): string => 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb', getRandomValues: (a: Uint8Array) => a };
    poserCrypto(propre);
    const { mintCommandId } = await import('../src/offline/commandId');
    expect(mintCommandId()).toBe('ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb');
  });

  /**
   * THE DEFECT THE MODULE'S OWN COMMENT NAMES, now actually executed.
   *
   * A NON-EXTENSIBLE `crypto` that carries `randomUUID` on its PROTOTYPE: the
   * first block skips (randomUUID already present), the second must REPLACE the
   * object to add `getRandomValues` — and a spread (`{ ...g.crypto }`) copies
   * own enumerable properties only, so it would silently DROP the prototype's
   * `randomUUID`. `mintCommandId()` would then throw and the supplier could
   * never publish. Nothing tested this until now.
   */
  it('a non-extensible crypto with randomUUID on the PROTOTYPE keeps it after getRandomValues is added', async () => {
    class VraiCrypto {
      randomUUID(): string {
        return 'deadbeef-0000-4111-8222-333333333333';
      }
    }
    const gele = Object.preventExtensions(new VraiCrypto());
    expect(Object.isExtensible(gele), 'the fixture must be non-extensible or it tests nothing').toBe(false);
    expect(Object.prototype.hasOwnProperty.call(gele, 'randomUUID'), 'randomUUID must be on the PROTOTYPE').toBe(false);
    poserCrypto(gele);

    const { mintCommandId } = await import('../src/offline/commandId');
    const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: unknown } };
    expect(typeof g.crypto?.getRandomValues, 'getRandomValues was not added').toBe('function');
    expect(
      typeof g.crypto?.randomUUID,
      'randomUUID was DROPPED by the replacement — the supplier can no longer publish',
    ).toBe('function');
    expect(mintCommandId()).toBe('deadbeef-0000-4111-8222-333333333333');
  });

  it('NEVER falls back to Math.random — the module draws only from the wired CSPRNG', async () => {
    poserCrypto(undefined);
    const hasard = vi.spyOn(Math, 'random');
    const { mintCommandId } = await import('../src/offline/commandId');
    mintCommandId();
    mintCommandId();
    expect(hasard, 'Math.random carries only its seed entropy — forbidden as an idempotency-key source').not.toHaveBeenCalled();
    hasard.mockRestore();
  });
});
