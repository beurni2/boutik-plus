import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * PORTE-CODE (FOURNISSEUR-VRAI-1, audit AUDIT-B+2 F-06) — THE SUPPLIER'S CODE
 * IS ACCEPTED THE WAY A PHONE TYPES IT, on real workerd.
 *
 * The code is minted in capitals (`BF-XXXX-XXXX-XXXX-XXXX`, base32 A–Z 2–7)
 * and handed over in person, to be typed once on a low-end phone — whose
 * keyboard capitalises the first letter and lowers the rest, and may put
 * spaces where the dashes were. The door used to hash the presented string
 * exactly as typed, so « Bf-qzhg-… » was « Ce code n'est pas le bon » for a
 * code that WAS right. The door now reads the code the way a person means it
 * — capitals or not, dashes or spaces or neither, 0 for O, with or without
 * « BF » — and anything that is still not a code answers the ONE uniform 401,
 * byte for byte, exactly as before.
 *
 * Both roads a supplier's phone takes are driven: his orders
 * (`GET /fulfillment/mine`) and his products (`GET /offers/mine`), plus one
 * act (`POST /fulfillment/accept`) — every door that resolves a code shares
 * the one lookup, and each is asked here rather than assumed.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'code-porte-'));
const OPS_SECRET = 'test-fulfillment-ops-secret-0006';
const SUPPLIER = 'supplier-porte-alpha';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: { FULFILLMENT_OPS_SECRET: OPS_SECRET },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

async function call(path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await mf.dispatchFetch(`http://o${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(init.headers ?? {}) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}

async function mint(supplierId: string): Promise<string> {
  const res = await call('/fulfillment/supplier-code', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPS_SECRET}` },
    body: { supplierId },
  });
  expect(res.status, `mint for ${supplierId}: ${res.text}`).toBe(200);
  return res.json['code'] as string;
}

const commandes = (code: string) => call('/fulfillment/mine', { headers: { Authorization: `Bearer ${code}` } });
const produits = (code: string) => call('/offers/mine', { headers: { Authorization: `Bearer ${code}` } });

/** Sentence case, the way a phone keyboard types a word: first letter up. */
const phrase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

describe('PORTE-CODE — the right code, however his phone typed it, opens his door', () => {
  let code = '';
  /** A minted code whose body carries an « O », so « 0 for O » is really asked. */
  let codeAvecO = '';

  it('sets the stage: a real minted code, in its canonical form', async () => {
    // Re-mint until the body holds an O (each draw has ~40% odds; the loop is
    // bounded and says so if it ever runs dry, rather than skipping the case).
    for (let i = 0; i < 40 && codeAvecO === ''; i += 1) {
      const c = await mint(SUPPLIER);
      if (c.slice(3).includes('O')) codeAvecO = c;
    }
    expect(codeAvecO, 'forty mints and no code carried an « O »').not.toBe('');
    code = codeAvecO; // the LAST mint is the one live (a re-mint kills the one before)
    expect(code).toMatch(/^BF-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect((await commandes(code)).status).toBe(200);
  });

  it('every way a phone types the RIGHT code is accepted, on his orders AND his products', async () => {
    const corps = code.slice(3).replace(/-/g, ''); // the 16 letters, no prefix
    const variantes: readonly (readonly [string, string])[] = [
      ['as minted', code],
      ['sentence case (the phone capitalised the first letter)', phrase(code)],
      ['all lowercase', code.toLowerCase()],
      ['spaces instead of dashes', code.replace(/-/g, ' ')],
      ['no dashes at all', code.replace(/-/g, '')],
      ['without « BF- »', code.slice(3)],
      ['without « BF », lowercase, no separators', corps.toLowerCase()],
      ['groups of four with spaces, no prefix', corps.match(/.{4}/g)!.join(' ')],
      ['« 0 » typed for every « O »', code.slice(0, 3) + code.slice(3).replace(/O/g, '0')],
      ['dots between the groups', code.replace(/-/g, '.')],
    ];
    for (const [nom, tape] of variantes) {
      const c = await commandes(tape);
      expect(c.status, `« ${tape} » (${nom}) on his orders: ${c.text}`).toBe(200);
      expect(c.json['ok'], nom).toBe(true);
      const p = await produits(tape);
      expect(p.status, `« ${tape} » (${nom}) on his products: ${p.text}`).toBe(200);
    }
  });

  it('an ACT resolves the same way — a lowercase code reaches the order lookup, not the 401', async () => {
    // No order exists, so the honest answer is the order refusal (404), which
    // can only be reached once the code has been ACCEPTED as his.
    const res = await call('/fulfillment/accept', {
      method: 'POST',
      headers: { Authorization: `Bearer ${code.toLowerCase().replace(/-/g, ' ')}` },
      body: { orderId: 'ord-porte-inconnue' },
    });
    expect(res.status, res.text).toBe(404);
  });

  it('a WRONG code stays refused however it is typed — and every refusal is the ONE uniform 401, byte for byte', async () => {
    const autre = code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'); // one letter off
    const manquant = await commandes('');
    const refus: readonly string[] = [
      autre,
      autre.toLowerCase(),
      code.slice(0, -1), // one letter short
      `${code}A`, // one letter too many
      `BF-${code.slice(3)}-AAAA`, // twenty letters
      "n'importe quoi",
      `${code.slice(0, 3)}1${code.slice(4)}`, // a digit the alphabet never mints, in place of a letter
    ];
    for (const tape of refus) {
      const c = await commandes(tape);
      expect(c.status, `« ${tape} » opened his orders`).toBe(401);
      expect(c.text, `« ${tape} » is not the uniform refusal`).toBe(manquant.text);
      const p = await produits(tape);
      expect(p.status, `« ${tape} » opened his products`).toBe(401);
    }
  });

  it('a code cut off by the founder stays cut off in every spelling', async () => {
    const coupe = await mint('supplier-porte-beta');
    const revoke = await call('/fulfillment/supplier-code/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
      body: { supplierId: 'supplier-porte-beta' },
    });
    expect(revoke.status, revoke.text).toBe(200);
    for (const tape of [coupe, coupe.toLowerCase(), phrase(coupe), coupe.replace(/-/g, ' ')]) {
      expect((await commandes(tape)).status, `« ${tape} » still opens after the cut`).toBe(401);
    }
  });
});
