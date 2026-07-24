import { describe, expect, it } from 'vitest';
import {
  WRITE_KEY_HEADER,
  isWrite,
  keyAuthorizedAgainst,
  rejectUnauthorizedWriteAgainst,
  unauthorized,
} from '../src/index.js';

/**
 * SERVICE-WRITE-AUTH — the properties BOTH services now inherit from this one
 * module. Locked here, at the shared level, so neither binding can quietly lose
 * them: offer-service and media-service each supply only their own secret.
 */

const SECRET = 'a-real-write-secret';
const req = (method: string, key?: string): Request =>
  new Request('https://svc.test/anything', {
    method,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: 'x' }),
    ...(key !== undefined ? { headers: { [WRITE_KEY_HEADER]: key } } : {}),
  });

describe('FAIL CLOSED — an unset secret refuses every write', () => {
  it('no secret configured: even a plausible key is refused', async () => {
    expect(await keyAuthorizedAgainst(req('POST', SECRET), undefined)).toBe(false);
    expect(await keyAuthorizedAgainst(req('POST', SECRET), '')).toBe(false);
    const denied = await rejectUnauthorizedWriteAgainst(req('POST', SECRET), undefined);
    expect(denied?.status).toBe(401);
  });

  it('an empty presented key never matches an empty secret — empty is not a password', async () => {
    expect(await keyAuthorizedAgainst(req('POST', ''), '')).toBe(false);
    expect(await keyAuthorizedAgainst(req('POST'), undefined)).toBe(false);
  });

  it('a Worker deployed BEFORE its secret is set is shut, not open', async () => {
    // the deploy-order hazard, asserted: no secret => every write 401
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await rejectUnauthorizedWriteAgainst(req(m, SECRET), undefined))?.status).toBe(401);
    }
  });
});

describe('the correct key authorises, and nothing else does', () => {
  it('exact match passes; near-misses do not', async () => {
    expect(await keyAuthorizedAgainst(req('POST', SECRET), SECRET)).toBe(true);
    expect(await keyAuthorizedAgainst(req('POST', SECRET.toUpperCase()), SECRET)).toBe(false);
    expect(await keyAuthorizedAgainst(req('POST', SECRET.slice(0, -1)), SECRET)).toBe(false); // prefix
    expect(await keyAuthorizedAgainst(req('POST', `${SECRET}x`), SECRET)).toBe(false); // extension
    expect(await keyAuthorizedAgainst(req('POST', `x${SECRET}`), SECRET)).toBe(false); // prepend
  });

  /**
   * HTTP TRIMS HEADER WHITESPACE — a platform behaviour, not a gate decision, and
   * it bites in ONE direction that matters operationally.
   *
   * Harmless direction: a key SENT with surrounding whitespace is trimmed by the
   * HTTP layer before the gate sees it, so it still matches. Nothing is weakened —
   * the trimmed value must still equal the secret exactly.
   *
   * THE DIRECTION THAT BITES: a SECRET stored with a trailing space or newline
   * (easy to do by pasting into `wrangler secret put`) keeps that whitespace in
   * the env, while the presented header loses it — so the correct key 401s
   * forever and the deploy looks broken. Asserted so the behaviour is on record
   * before someone spends an hour on it.
   */
  it('a key sent with whitespace still matches (HTTP trims it) — but a SECRET stored with whitespace never will', async () => {
    expect(await keyAuthorizedAgainst(req('POST', ` ${SECRET} `), SECRET)).toBe(true); // trimmed in transit
    expect(await keyAuthorizedAgainst(req('POST', SECRET), `${SECRET} `)).toBe(false); // stored with a space → dead
    expect(await keyAuthorizedAgainst(req('POST', SECRET), `${SECRET}\n`)).toBe(false); // stored with a newline → dead
  });

  it('an authorised write returns null — the gate steps aside rather than rewriting the response', async () => {
    expect(await rejectUnauthorizedWriteAgainst(req('POST', SECRET), SECRET)).toBeNull();
  });
});

describe('ONE identical 401 — never an oracle', () => {
  it('missing key, wrong key and unset secret are byte-identical responses', async () => {
    const a = await rejectUnauthorizedWriteAgainst(req('POST'), SECRET);
    const b = await rejectUnauthorizedWriteAgainst(req('POST', 'wrong'), SECRET);
    const c = await rejectUnauthorizedWriteAgainst(req('POST', SECRET), undefined);
    const bodies = await Promise.all([a!.text(), b!.text(), c!.text()]);
    expect(new Set(bodies).size).toBe(1); // one body, three causes
    expect(new Set([a!.status, b!.status, c!.status])).toEqual(new Set([401]));
    expect(bodies[0]).toBe(await unauthorized().text());
  });

  it('the 401 body names no cause — it cannot say WHICH check failed', async () => {
    const body = await unauthorized().text();
    expect(body).not.toMatch(/secret|unset|missing|wrong|length|exist/i);
    expect(JSON.parse(body)).toEqual({ error: 'unauthorized' });
  });
});

describe('READS are never gated — the wire consumer holds no key', () => {
  it('GET/HEAD/OPTIONS pass with no key at all, even with a secret configured', async () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isWrite(m)).toBe(false);
      expect(await rejectUnauthorizedWriteAgainst(req(m), SECRET)).toBeNull();
    }
  });

  it('everything else is a write, including lowercase and unusual methods', async () => {
    expect(isWrite('post')).toBe(true); // case-insensitive
    expect(isWrite('PUT')).toBe(true);
    expect(isWrite('DELETE')).toBe(true);
    expect(isWrite('TRACE')).toBe(true); // unknown method defaults to WRITE, not to open
  });
});
