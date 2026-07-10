import { describe, expect, it } from 'vitest';
import { FulfillmentBook, READINESS_CHALLENGE_TTL_MS } from '../src/fulfillment.js';

const T = '2026-07-10T09:00:00.000Z';
const PAST_TTL = new Date(Date.parse(T) + READINESS_CHALLENGE_TTL_MS + 60_000).toISOString();
const SHA = 'a3f5c9d21e8b47061234567890abcdef1234567890abcdef1234567890abcdef';

const acceptance = { orderId: 'order-e1-0001', variant: 'taille unique', qty: 1, sellerNetFcfa: 8_500, deadline: '2026-07-10T18:00:00.000Z' };

function readyPayload(challenge: string, over: Record<string, unknown> = {}) {
  return {
    orderId: 'order-e1-0001',
    photoRef: { ref: 'media/pkg-e1.jpg', sha256: SHA, mimeType: 'image/jpeg' },
    readinessChallenge: challenge,
    qty: 1,
    variant: 'taille unique',
    availableConfirmed: true,
    at: T,
    ...over,
  };
}

function acceptedBook() {
  const book = new FulfillmentBook();
  book.accept(acceptance);
  const issued = book.issueChallenge('order-e1-0001', T);
  if (!issued.ok) throw new Error('setup');
  return { book, challenge: issued.challenge as string };
}

describe('fulfillment + « Produit prêt » — B6.1/B6.2, readiness gates pickup', () => {
  it('acceptance LOCKS variant/qty/sellerNet/deadline; a second accept refuses', () => {
    const book = new FulfillmentBook();
    const locked = book.accept(acceptance);
    expect(locked.ok).toBe(true);
    expect(book.accept(acceptance)).toEqual({ ok: false, reason: 'already_accepted' });
    expect(book.acceptance('order-e1-0001')).toEqual(acceptance);
  });

  it('happy path: canonical confirmation + live challenge → pickup-eligible, ONLY then', () => {
    const { book, challenge } = acceptedBook();
    expect(book.isPickupEligible('order-e1-0001')).toBe(false); // NO pickup before readiness
    const outcome = book.confirmReady(readyPayload(challenge), T);
    expect(outcome.ok).toBe(true);
    expect(book.isPickupEligible('order-e1-0001')).toBe(true);
  });

  it('a readiness payload carrying buyerDropCode is REFUSED by the canonical STRICT shape — four-secrets law', () => {
    const { book, challenge } = acceptedBook();
    const outcome = book.confirmReady(readyPayload(challenge, { buyerDropCode: '4242' }), T);
    expect(outcome).toEqual({ ok: false, reason: 'not_canonical_or_foreign_secret' });
    expect(book.isPickupEligible('order-e1-0001')).toBe(false);
  });

  it('an EXPIRED challenge is refused closed; a mismatched or missing challenge is refused closed', () => {
    const { book, challenge } = acceptedBook();
    expect(book.confirmReady(readyPayload(challenge), PAST_TTL)).toEqual({ ok: false, reason: 'challenge_expired' });
    expect(book.confirmReady(readyPayload('srch-forged-99'), T)).toEqual({ ok: false, reason: 'challenge_missing_or_mismatched' });
    // A pickup-verification-style code is NOT a readiness challenge — secrets never substitute.
    expect(book.confirmReady(readyPayload('pvc-1234'), T)).toEqual({ ok: false, reason: 'challenge_missing_or_mismatched' });
    expect(book.isPickupEligible('order-e1-0001')).toBe(false);
  });

  it('locked-terms mismatch refuses closed: wrong qty, wrong variant, or unconfirmed availability', () => {
    const { book, challenge } = acceptedBook();
    expect(book.confirmReady(readyPayload(challenge, { qty: 2 }), T)).toEqual({ ok: false, reason: 'locked_terms_mismatch' });
    expect(book.confirmReady(readyPayload(challenge, { variant: 'grande taille' }), T)).toEqual({ ok: false, reason: 'locked_terms_mismatch' });
    expect(book.confirmReady(readyPayload(challenge, { availableConfirmed: false }), T)).toEqual({ ok: false, reason: 'locked_terms_mismatch' });
  });

  it('readiness for an order never accepted refuses closed', () => {
    const book = new FulfillmentBook();
    expect(book.confirmReady(readyPayload('srch-any'), T)).toEqual({ ok: false, reason: 'not_accepted' });
  });
});
