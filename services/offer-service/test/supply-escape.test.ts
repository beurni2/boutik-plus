import { describe, expect, it } from 'vitest';
import { InMemoryOfferStore } from '../src/offer-store.js';
import { makeSupplyFetch, SERVICE_NAME } from '../src/supply-endpoint.js';

/**
 * MEDIA-PORTE-1 (AUDIT-B+2 F-44, the offer half) — the single supply read took
 * a malformed percent-escape straight into `decodeURIComponent` and threw. A
 * name nothing could have minted is the same typed 404 as a product this
 * service does not hold, never an uncaught URIError.
 */
describe('F-44 — a broken escape on the supply read', () => {
  it('answers the typed 404, identical to an unknown product', async () => {
    const read = makeSupplyFetch(new InMemoryOfferStore(), () => '2026-09-29T12:00:00.000Z');
    const casse = await read(new Request('https://o/supply-projection/%E0%A4%A'));
    const inconnu = await read(new Request('https://o/supply-projection/pv-absent'));
    expect(casse.status).toBe(404);
    const corps = await casse.json();
    expect(corps).toEqual({ service: SERVICE_NAME, status: 'not_found', reason: 'unknown_product_version' });
    expect(inconnu.status).toBe(404);
    expect(await inconnu.json(), 'the same answer, word for word').toEqual(corps);
  });
});
