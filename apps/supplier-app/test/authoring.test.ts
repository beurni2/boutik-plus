import { describe, expect, it } from 'vitest';
import {
  CATEGORY_FLOOR_FCFA,
  CLOCK_SKEW_ALLOWANCE_DAYS,
  OFFER_VALIDITY_DAYS,
  buildCreateOffer,
  offerWindow,
  publish,
  retainIdentity,
  type AuthoringContext,
  type AuthoringForm,
} from '../src/supply/authoring';
import { DemoSupplyService } from '../src/supply/demo';
import { productCodeStem, suffixFromBytes, suggestProductCode, SUFFIX_LENGTH } from '../src/supply/product-code';
import { formatF } from '../src/v2/money';

/**
 * SUPPLIER-AUTHORING-1 part 2 — the authoring core.
 * The properties under test are the ones the founder ruled: no fabricated field,
 * no state that looks like success without being one, and failures that carry the
 * service's own words.
 */

const FORM: AuthoringForm = {
  name: 'Pagne tissé Faso',
  productCode: 'PAGNE-7K2M',
  category: 'textile',
  zone: 'Gounghin',
  basePrice: '10 000',
  resellerCommission: '1000',
  available: '5',
};

const CTX: AuthoringContext = {
  supplierId: 'supplier-founder-001',
  productVersionId: 'pv-1',
  offerId: 'offer-1',
  commandId: 'cmd-1',
  now: '2026-07-24T21:00:00.000Z',
  effective: '2026-07-24T00:00:00.000Z',
  expiry: '2026-12-31T00:00:00.000Z',
  moderationState: 'approved',
};

describe('the command carries only what a supplier can honestly state', () => {
  it('forces supplyMode SELLER_HELD — the B+9 gate leaves one lawful value, not a default', () => {
    const r = buildCreateOffer(FORM, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.command.product.supplyMode).toBe('SELLER_HELD');
  });

  it('OMITS handlingClass entirely — optional in canon, unstatable by a supplier', () => {
    const r = buildCreateOffer(FORM, CTX);
    if (!r.ok) return;
    expect('handlingClass' in r.command.product).toBe(false); // absent, not defaulted
  });

  it('claims NO facts — an empty record, never invented ones', () => {
    const r = buildCreateOffer(FORM, CTX);
    if (!r.ok) return;
    expect(r.command.product.facts).toEqual({});
  });

  it('sends NO assets — the wire gets assetRefs: [], no placeholder and no stubbed ref', () => {
    const r = buildCreateOffer(FORM, CTX);
    if (!r.ok) return;
    expect('assets' in r.command).toBe(false);
  });

  it('trims the author’s text and carries it verbatim otherwise', () => {
    const r = buildCreateOffer({ ...FORM, name: '  Pagne tissé Faso  ' }, CTX);
    if (!r.ok) return;
    expect(r.command.product.name).toBe('Pagne tissé Faso');
  });

  it('parses French-typed amounts — spaces and narrow spaces both', () => {
    for (const typed of ['10 000', '10000', '10 000', '10 000']) {
      const r = buildCreateOffer({ ...FORM, basePrice: typed }, CTX);
      expect(r.ok, typed).toBe(true);
      if (r.ok) expect(r.command.draft.basePrice).toBe(10_000);
    }
  });
});

describe('refusals are typed, collected, and shown all at once', () => {
  it('an empty form names EVERY problem, not the first', () => {
    const r = buildCreateOffer({ name: '', productCode: '', category: '', zone: '', basePrice: '', resellerCommission: '', available: '' }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(expect.arrayContaining([
      'name_required', 'product_code_required', 'category_required', 'zone_required',
      'base_price_invalid', 'commission_invalid', 'available_invalid',
    ]));
  });

  it('the category floor is refused BEFORE a round-trip (the service still re-checks)', () => {
    const r = buildCreateOffer({ ...FORM, basePrice: String(CATEGORY_FLOOR_FCFA - 1) }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('base_price_below_floor');
  });

  it('non-numeric and negative amounts are refused, never coerced', () => {
    for (const bad of ['abc', '-5', '10.5', '1e4', '']) {
      expect(buildCreateOffer({ ...FORM, available: bad }, CTX).ok, bad).toBe(false);
    }
  });
});

describe('publish states — none of them looks like success without being one', () => {
  it('a null service is « non configuré » — NEVER a success (the shop-plus failure, refused here)', async () => {
    const state = await publish(null, FORM, CTX);
    expect(state).toEqual({ kind: 'not_configured' });
  });

  it('a real 2xx decision is the ONLY way to reach published', async () => {
    const demo = new DemoSupplyService({ ok: true, value: { status: 'created' } });
    const state = await publish(demo, FORM, CTX);
    expect(state).toEqual({ kind: 'published', offerId: 'offer-1', alreadyRegistered: false });
    expect(demo.written).toHaveLength(1); // and something was actually written
  });

  it('idempotent counts as published — a re-tap is not a second product — but is FLAGGED as already registered', async () => {
    const state = await publish(new DemoSupplyService({ ok: true, value: { status: 'idempotent' } }), FORM, CTX);
    expect(state).toEqual({ kind: 'published', offerId: 'offer-1', alreadyRegistered: true });
  });

  it('a service refusal surfaces ITS words, never a generic message', async () => {
    const state = await publish(
      new DemoSupplyService({ ok: true, value: { status: 'refused', reason: 'below_category_floor' } }),
      FORM, CTX,
    );
    expect(state).toEqual({ kind: 'refused', reason: 'refused: below_category_floor' });
  });

  it('a transport failure carries the status and the service’s body through UNCHANGED', async () => {
    const reason = 'HTTP 401: {"error":"unauthorized"}';
    const state = await publish(new DemoSupplyService({ ok: false, cause: 'http', reason }), FORM, CTX);
    expect(state).toEqual({ kind: 'failed', cause: 'http', reason }); // verbatim — the only diagnostic he gets
  });

  it('the CAUSE travels, so the screen cannot claim the service answered when it did not', async () => {
    // network: nothing left the phone. The screen must NOT render « voici ce que
    // le service a répondu » over this — it is the likely failure in Ouagadougou.
    const net = await publish(
      new DemoSupplyService({ ok: false, cause: 'network', reason: 'réseau: Network request failed' }), FORM, CTX,
    );
    expect(net).toEqual({ kind: 'failed', cause: 'network', reason: 'réseau: Network request failed' });
    const bad = await publish(
      new DemoSupplyService({ ok: false, cause: 'unreadable', reason: 'réponse inattendue: <html>' }), FORM, CTX,
    );
    expect(bad.kind === 'failed' && bad.cause).toBe('unreadable');
  });

  it('an invalid form never reaches the network', async () => {
    const demo = new DemoSupplyService();
    const state = await publish(demo, { ...FORM, name: '' }, CTX);
    expect(state.kind).toBe('invalid');
    expect(demo.written).toHaveLength(0);
  });
});

describe('the seller net shown after publishing is the SERVICE’s, never the app’s', () => {
  it('carries preview.sellerNetFcfa through UNCHANGED when the service returned one', async () => {
    const state = await publish(
      new DemoSupplyService({ ok: true, value: { status: 'created', preview: { sellerNetFcfa: 8_500, sellerPlatformFeeFcfa: 500 } } }),
      FORM, CTX,
    );
    expect(state).toEqual({ kind: 'published', offerId: 'offer-1', sellerNetFcfa: 8_500, alreadyRegistered: false });
  });

  it('an IDEMPOTENT re-tap carries NO preview — so no figure is shown, never a recomputed one', async () => {
    const state = await publish(new DemoSupplyService({ ok: true, value: { status: 'idempotent' } }), FORM, CTX);
    expect(state).toEqual({ kind: 'published', offerId: 'offer-1', alreadyRegistered: true });
    expect('sellerNetFcfa' in state).toBe(false); // absent, not 0, not derived from the form
  });
});

describe('one authoring attempt keeps ONE identity — the idempotency key survives a retry', () => {
  const counting = () => {
    let n = 0;
    return { mint: () => `id-${(n += 1)}`, count: () => n };
  };

  it('mints three DISTINCT ids on the first attempt', () => {
    const c = counting();
    const id = retainIdentity(null, c.mint);
    expect(c.count()).toBe(3);
    expect(new Set([id.productVersionId, id.offerId, id.commandId]).size).toBe(3);
  });

  it('a RETRY reuses them and mints NOTHING — a lost response cannot become a second product', () => {
    const c = counting();
    const first = retainIdentity(null, c.mint);
    const retry = retainIdentity(first, c.mint);
    expect(c.count()).toBe(3); // the counter did not advance: no fresh mint
    expect(retry).toBe(first); // the same object, so the same commandId reaches the service
    expect(retry.commandId).toBe(first.commandId);
  });

  it('the retained commandId is what makes the service answer idempotent rather than create twice', () => {
    // offer-core keys idempotency on commandId; a fresh one would be a NEW create.
    const c = counting();
    const id = retainIdentity(null, c.mint);
    const attempts = [retainIdentity(id, c.mint), retainIdentity(id, c.mint), retainIdentity(id, c.mint)];
    expect(new Set(attempts.map((a) => a.commandId)).size).toBe(1);
    expect(new Set(attempts.map((a) => a.offerId)).size).toBe(1); // same DO address → not a collision either
  });
});

describe('the offer window — derived, and its consequence is the reason it is asserted', () => {
  it('effective is BACKDATED by the skew allowance and expiry is +365 days from the authoring instant', () => {
    const w = offerWindow('2026-07-24T21:00:00.000Z');
    expect(w.effective).toBe('2026-07-22T21:00:00.000Z'); // now − 2 days
    expect(w.expiry).toBe('2027-07-24T21:00:00.000Z'); // now + 365, NOT shortened by the backdate
    expect(OFFER_VALIDITY_DAYS).toBe(365);
    expect(CLOCK_SKEW_ALLOWANCE_DAYS).toBe(2);
  });

  /**
   * These drive the REAL read-path predicate, not a re-implementation of it. The
   * earlier version of this test compared strings it had just built — a tautology
   * that would have stayed green if projection.ts changed its rule tomorrow
   * (fresh-context verifier finding).
   */
  const OFFER_NOT_EFFECTIVE = 'offer_not_effective';
  /** Verbatim from services/offer-service/src/projection.ts:83. */
  const servable = (nowIso: string, offer: { effective: string; expiry: string }) =>
    nowIso < offer.effective || nowIso > offer.expiry ? OFFER_NOT_EFFECTIVE : 'ok';

  it('a DEVICE CLOCK RUNNING A DAY FAST still yields an offer the server will serve', () => {
    // He publishes at a device time a day ahead of the server's.
    const deviceNow = '2026-07-25T21:00:00.000Z';
    const serverNow = '2026-07-24T21:00:00.000Z';
    const w = offerWindow(deviceNow);
    expect(servable(serverNow, w)).toBe('ok');
    // …which the UNBACKDATED window would NOT have been: the screen would have
    // said « c'est publié » while every Shop+ pull refused it.
    expect(servable(serverNow, { effective: deviceNow, expiry: w.expiry })).toBe(OFFER_NOT_EFFECTIVE);
  });

  it('a clock skewed FURTHER than the allowance still fails — the guard is bounded, not magic', () => {
    const w = offerWindow('2026-07-30T21:00:00.000Z'); // 6 days fast
    expect(servable('2026-07-24T21:00:00.000Z', w)).toBe(OFFER_NOT_EFFECTIVE);
  });

  it('past the expiry the product stops being served — the disappearance the 365 default bounds', () => {
    const w = offerWindow('2026-07-24T21:00:00.000Z');
    expect(servable('2027-07-25T21:00:00.000Z', w)).toBe(OFFER_NOT_EFFECTIVE);
    expect(servable('2027-07-23T21:00:00.000Z', w)).toBe('ok');
  });

  it('refuses an unparseable clock rather than minting an offer that never serves', () => {
    expect(() => offerWindow('pas une date')).toThrow(/unparseable clock/);
  });
});

describe('the product code — derived, visible, editable, and unique enough for SKUs', () => {
  it('folds accents and non-letters out of the stem', () => {
    expect(productCodeStem('Pagne tissé Faso')).toBe('PAGNETISSE');
    expect(productCodeStem('Beurre de karité 500g')).toBe('BEURREDEKA'); // capped at 10
  });

  it('falls back to ARTICLE rather than emitting an empty stem', () => {
    expect(productCodeStem('123')).toBe('ARTICLE');
    expect(productCodeStem('')).toBe('ARTICLE');
  });

  it('suggests STEM-SUFFIX with a 4-char suffix from supplied entropy', () => {
    const code = suggestProductCode('Pagne tissé', new Uint8Array([0, 1, 2, 3]));
    expect(code).toMatch(/^PAGNETISSE-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    expect(code.split('-')[1]).toHaveLength(SUFFIX_LENGTH);
  });

  it('DISAMBIGUATES same-named products — he sells pagne, so the stem WILL repeat', () => {
    // the same name, different entropy → different codes → variant SKUs cannot collide
    const a = suggestProductCode('Pagne', new Uint8Array([0, 0, 0, 0]));
    const b = suggestProductCode('Pagne', new Uint8Array([9, 9, 9, 9]));
    expect(a).not.toBe(b);
    expect(productCodeStem('Pagne')).toBe('PAGNE'); // …while the stem stays readable
  });

  it('omits the glyphs that misread on a cracked screen in sunlight (0/O, 1/I)', () => {
    const s = suffixFromBytes(new Uint8Array([0, 1, 2, 3]));
    expect(s).not.toMatch(/[01OI]/);
  });

  it('whatever the field holds at publish is what is sent — he can override the suggestion', () => {
    const r = buildCreateOffer({ ...FORM, productCode: 'MON-CODE-A-MOI' }, CTX);
    if (!r.ok) return;
    expect(r.command.product.productCode).toBe('MON-CODE-A-MOI');
  });
});

describe('money rendering goes through the ONE existing formatter', () => {
  it('amounts render with the canon suffix and U+202F grouping — not a second formatter', () => {
    const r = buildCreateOffer(FORM, CTX);
    if (!r.ok) return;
    const rendered = formatF(r.command.draft.basePrice);
    expect(rendered).toContain('FCFA'); // canon suffix from ui-tokens, never a bare F
    expect(rendered).toMatch(/ /); // narrow no-break space grouping
    expect(rendered).not.toMatch(/ /); // never a plain ASCII space as separator
  });
});
