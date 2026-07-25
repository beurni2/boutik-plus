import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEARER_HEADER,
  BEARER_PREFIX,
  bearerAuthorizedAgainst,
  bearerTokenFrom,
  rejectUnauthorizedBearer,
  rejectUnauthorizedWriteAgainst,
  WRITE_KEY_HEADER,
} from '../src/index.js';

/**
 * SUPPLY-READ-AUTH — the SERVICE-TO-SERVICE read gate.
 *
 * The route it protects carries `basePrice` and `resellerCommission`, and product
 * version ids are guessable, so an open route hands a supplier's cost structure to
 * anyone who guesses one. These lock the properties the gate must not lose.
 */

const SECRET = 'a-real-service-to-service-read-secret';
const get = (headers?: Record<string, string>): Request =>
  new Request('https://svc.test/supply-projection/pv-1', { method: 'GET', ...(headers ? { headers } : {}) });
const bearer = (token: string) => get({ [BEARER_HEADER]: `${BEARER_PREFIX}${token}` });

describe('THE WIRE CONTRACT — read from the CALLER’s source, not agreed in prose', () => {
  /**
   * Both halves of a wire in this project were built to different specs once
   * already (they disagreed on path, envelope AND freshness at the same time).
   * A header/scheme mismatch here would not error anywhere: shop treats any
   * non-2xx as `undefined` and simply OMITS the product, so every product would
   * silently vanish from every vitrine with both repos green. So the constants
   * are asserted against shop-plus's own client rather than trusted.
   */
  it('matches what shop-plus actually sends (storefront-service/src/supply-source.ts)', () => {
    const shopSource = '/home/user/shop-plus/services/storefront-service/src/supply-source.ts';
    let src: string;
    try {
      src = readFileSync(shopSource, 'utf8');
    } catch {
      // The consumer repo is not always checked out beside this one. Skipping is
      // honest; asserting a copy of the string would prove nothing about the wire.
      return;
    }
    expect(src).toMatch(/Authorization:\s*`Bearer \$\{this\.readSecret\}`/);
    expect(BEARER_HEADER).toBe('Authorization');
    expect(BEARER_PREFIX).toBe('Bearer ');
    // …and the secret is named identically on both sides
    expect(src).toMatch(/SUPPLY_READ_SECRET/);
  });

  it('accepts the exact header shop builds, byte for byte', async () => {
    const req = new Request('https://svc.test/supply-projection/pv-1', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${SECRET}` }, // shop sends both
    });
    expect(await bearerAuthorizedAgainst(req, SECRET)).toBe(true);
  });
});

describe('FAIL CLOSED — an unset secret refuses every supply read', () => {
  it('no secret configured: even a plausible bearer is refused', async () => {
    expect(await bearerAuthorizedAgainst(bearer(SECRET), undefined)).toBe(false);
    expect(await bearerAuthorizedAgainst(bearer(SECRET), '')).toBe(false);
    expect((await rejectUnauthorizedBearer(bearer(SECRET), undefined))?.status).toBe(401);
  });

  it('an empty presented token can never match an unset secret (both are "")', async () => {
    expect(await bearerAuthorizedAgainst(get(), undefined)).toBe(false);
    expect(await bearerAuthorizedAgainst(get({ [BEARER_HEADER]: 'Bearer ' }), '')).toBe(false);
  });
});

describe('EXACT MATCH ONLY', () => {
  it('authorises the right token and refuses every near-miss', async () => {
    expect(await bearerAuthorizedAgainst(bearer(SECRET), SECRET)).toBe(true);
    for (const wrong of [` ${SECRET}`, SECRET.toUpperCase(), SECRET.slice(0, -1), `${SECRET}x`, '']) {
      expect(await bearerAuthorizedAgainst(bearer(wrong), SECRET), JSON.stringify(wrong)).toBe(false);
    }
  });

  /**
   * THE OPERATIONAL TRAP, asserted in the direction that actually bites — and
   * this test was RED-first for the wrong reason: I asserted a trailing space in
   * the header was refused, and it was accepted. **HTTP trims header values.**
   * The platform is right and my assumption was wrong, so the assertion now
   * matches reality rather than what I expected.
   *
   * The asymmetry is what costs an hour: whitespace SENT is trimmed away and
   * still matches (harmless), but whitespace STORED in the secret — trivially
   * easy when pasting into `wrangler secret put` — stays in the env while the
   * header loses it. The correct secret then 401s FOREVER, and on this wire a
   * 401 is silent: shop omits the product and the vitrine simply empties.
   */
  it('whitespace SENT is trimmed by HTTP and still matches; whitespace STORED breaks it forever', async () => {
    expect(await bearerAuthorizedAgainst(bearer(`${SECRET} `), SECRET)).toBe(true); // trimmed in transit
    expect(await bearerAuthorizedAgainst(bearer(SECRET), `${SECRET}\n`)).toBe(false); // stored newline: dead
    expect(await bearerAuthorizedAgainst(bearer(SECRET), `${SECRET} `)).toBe(false); // stored space: dead
  });

  it('the SCHEME is case-insensitive (RFC 7235) but the TOKEN is not', async () => {
    expect(await bearerAuthorizedAgainst(get({ [BEARER_HEADER]: `bearer ${SECRET}` }), SECRET)).toBe(true);
    expect(await bearerAuthorizedAgainst(get({ [BEARER_HEADER]: `BEARER ${SECRET}` }), SECRET)).toBe(true);
    expect(await bearerAuthorizedAgainst(get({ [BEARER_HEADER]: `Bearer ${SECRET.toUpperCase()}` }), SECRET)).toBe(false);
  });

  it('a non-Bearer scheme is not a credential here', async () => {
    for (const raw of [`Basic ${SECRET}`, SECRET, `Token ${SECRET}`, '']) {
      expect(await bearerAuthorizedAgainst(get({ [BEARER_HEADER]: raw }), SECRET), raw).toBe(false);
    }
    expect(bearerTokenFrom(get({ [BEARER_HEADER]: `Basic ${SECRET}` }))).toBe('');
  });
});

describe('THE TWO CREDENTIALS ARE NOT INTERCHANGEABLE', () => {
  it('the app WRITE key does not open the supply read, and the read secret does not open a write', async () => {
    const writeKeyOnly = get({ [WRITE_KEY_HEADER]: SECRET });
    expect(await bearerAuthorizedAgainst(writeKeyOnly, SECRET)).toBe(false); // wrong header entirely

    // …and a bearer on a write is not a write key
    const post = new Request('https://svc.test/offers', {
      method: 'POST',
      body: '{}',
      headers: { [BEARER_HEADER]: `${BEARER_PREFIX}${SECRET}` },
    });
    expect((await rejectUnauthorizedWriteAgainst(post, SECRET))?.status).toBe(401);
  });
});

describe('ONE IDENTICAL 401 — never an oracle', () => {
  it('a missing header, a wrong token and an unset secret are byte-identical responses', async () => {
    const bodies = await Promise.all([
      (await rejectUnauthorizedBearer(get(), SECRET))!.text(),
      (await rejectUnauthorizedBearer(bearer('wrong'), SECRET))!.text(),
      (await rejectUnauthorizedBearer(bearer(SECRET), undefined))!.text(),
      (await rejectUnauthorizedBearer(get({ [BEARER_HEADER]: 'Basic x' }), SECRET))!.text(),
    ]);
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toBe(JSON.stringify({ error: 'unauthorized' }));
  });

  it('names no cause — not the header, not the scheme, not whether a secret is set', async () => {
    const body = await (await rejectUnauthorizedBearer(get(), SECRET))!.text();
    expect(body).not.toMatch(/bearer|authorization|secret|header|scheme|unset|missing/i);
  });
});

describe('SAFE METHODS ARE **NOT** EXEMPT HERE — that is the whole point', () => {
  it('a GET without the secret is refused (unlike the write gate, which ignores GETs)', async () => {
    expect((await rejectUnauthorizedBearer(get(), SECRET))?.status).toBe(401);
    // the write gate, by contrast, still lets a GET through untouched
    expect(await rejectUnauthorizedWriteAgainst(get(), SECRET)).toBeNull();
  });

  it('HEAD and OPTIONS are refused too — no method sneaks a projection out', async () => {
    for (const method of ['HEAD', 'OPTIONS', 'GET']) {
      const r = new Request('https://svc.test/supply-projection/pv-1', { method });
      expect((await rejectUnauthorizedBearer(r, SECRET))?.status, method).toBe(401);
    }
  });
});
