import { describe, expect, it } from 'vitest';
import { FulfillmentDO } from '../worker/fulfillment-do.js';
import { StockageCompteur } from './doubles/stockage-compteur.js';

/**
 * PREUVE-PRETE-1 (AUDIT-B+2 F-39, verifier MINOR 2) — an act confirmed BEFORE
 * the uploaded-photo rule is still absorbed on replay, never re-judged.
 *
 * Every e2e now sends minted refs, so none of them could see the rule's place
 * in the door: moved above the replay branch it stayed green everywhere. This
 * pins it on the REAL `FulfillmentDO` over the counting storage double (bounds
 * at the top of `doubles/stockage-compteur.ts`), with a readiness record
 * written the way the door wrote it before this slice — its photo ref in the
 * old test shape nobody's upload ever mints.
 */

const T0 = '2026-09-20T08:00:00.000Z';
const SUPPLIER = 'supplier-preuve-u';
const ORDER = 'ord-preuve-ancienne';

describe('PREUVE-PRETE-1 — a readiness confirmed before the rule', () => {
  it('its replay is absorbed as already_ready; a different act on it is refused as already_ready, never as a photo', async () => {
    const storage = new StockageCompteur();
    const book = new FulfillmentDO({ storage } as unknown as DurableObjectState, {});
    const post = async (path: string, body: unknown) => {
      const res = await book.fetch(new Request(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) }));
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    const code = (await post('/code/mint', { supplierId: SUPPLIER })).json['code'] as string;

    const confirmation = {
      orderId: ORDER,
      photoRef: { ref: `media/readiness/${ORDER}`, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
      readinessChallenge: 'srch-ancienne',
      qty: 1,
      variant: 'pv-ancienne',
      availableConfirmed: true,
      at: T0,
    };
    await storage.put(`order:${ORDER}`, {
      orderId: ORDER, productVersionId: 'pv-ancienne', offerVersion: '1', paymentMode: 'FULL_PREPAY', paidAt: T0, zoneTo: '',
      sellerBasePrice: 8_000, productName: 'Bazin', supplierId: SUPPLIER, supplierResolved: true, correlationId: `corr-${ORDER}`, registeredAt: T0,
    });
    await storage.put(`accept:${ORDER}`, { orderId: ORDER, supplierId: SUPPLIER, variant: 'pv-ancienne', qty: 1, acceptedAt: T0 });
    await storage.put(`challenge:${ORDER}`, { challenge: 'srch-ancienne', expiresAt: '2026-09-20T08:10:00.000Z', consumedAt: T0 });
    await storage.put(`ready:${ORDER}`, { confirmation, confirmedAt: T0 });

    const replay = await post('/ready', { code, confirmation });
    expect(replay.status, JSON.stringify(replay.json)).toBe(200);
    expect(replay.json).toMatchObject({ ok: true, status: 'already_ready', confirmedAt: T0 });

    const autre = await post('/ready', { code, confirmation: { ...confirmation, readinessChallenge: 'srch-autre' } });
    expect(autre.status).toBe(409);
    expect(autre.json['reason']).toBe('already_ready');
  });
});
