import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEARER_HEADER, BEARER_PREFIX, WRITE_KEY_HEADER, bearerAuthorizedAgainst, keyAuthorizedAgainst } from '../src/index.js';

/**
 * CLE-FONDATEUR-1 (AUDIT-B+2 F-76) — THE FOLD SEES EVERY BYTE.
 *
 * The compare HMACs both sides under a fresh key and folds the two 32-byte
 * digests with `diff |= a[i] ^ b[i]`. The shipped fold is right, but random
 * wrong keys almost never tell a correct fold from a broken one: the audit's
 * mutants — `diff =` instead of `diff |=` (only the LAST byte decides), and a
 * fold over byte 0 only — each let about one wrong credential in 256 through
 * on every gate, and survived all three suites.
 *
 * So the digests are made to differ in EXACTLY ONE byte, k = 0…31, by standing
 * in for `crypto.subtle.sign` (the platform's HMAC — a host boundary; the fold
 * under test is the package's own code, untouched). Any fold that ignores any
 * byte admits one of them. Deterministic: no randomness decides this test.
 */

const SECRET = 'une-cle-de-test-assez-longue';

/** The next two HMACs return 32 equal bytes, except the second differs at `k` (or nowhere). */
function digestsQuiDifferentA(k: number | null): void {
  let appel = 0;
  vi.spyOn(crypto.subtle, 'sign').mockImplementation(async () => {
    const d = new Uint8Array(32).fill(0x5a);
    if (appel % 2 === 1 && k !== null) d[k] = 0x5b;
    appel += 1;
    return d.buffer;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const parCle = (): Request => new Request('https://svc.test/x', { method: 'POST', headers: { [WRITE_KEY_HEADER]: 'presente' } });
const parBearer = (): Request => new Request('https://svc.test/x', { headers: { [BEARER_HEADER]: `${BEARER_PREFIX}presente` } });

describe('the constant-time compare refuses a difference in ANY single byte of the digests (F-76)', () => {
  it('control: identical digests match — the stand-in is not refusing everything', async () => {
    digestsQuiDifferentA(null);
    expect(await keyAuthorizedAgainst(parCle(), SECRET)).toBe(true);
    digestsQuiDifferentA(null);
    expect(await bearerAuthorizedAgainst(parBearer(), SECRET)).toBe(true);
  });

  for (let k = 0; k < 32; k += 1) {
    it(`byte ${k} differs → refused, on the key gate and on the Bearer gate`, async () => {
      digestsQuiDifferentA(k);
      expect(await keyAuthorizedAgainst(parCle(), SECRET)).toBe(false);
      digestsQuiDifferentA(k);
      expect(await bearerAuthorizedAgainst(parBearer(), SECRET)).toBe(false);
    });
  }

  it('and the stand-in is gone after each test: the real HMAC still decides the real case', async () => {
    const juste = new Request('https://svc.test/x', { headers: { [BEARER_HEADER]: `${BEARER_PREFIX}${SECRET}` } });
    const faux = new Request('https://svc.test/x', { headers: { [BEARER_HEADER]: `${BEARER_PREFIX}${SECRET}x` } });
    expect(await bearerAuthorizedAgainst(juste, SECRET)).toBe(true);
    expect(await bearerAuthorizedAgainst(faux, SECRET)).toBe(false);
  });
});
