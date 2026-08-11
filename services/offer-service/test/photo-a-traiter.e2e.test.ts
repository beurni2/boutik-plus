import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * ═══ PHOTO-À-TRAITER — THE SEAM, ON REAL WORKERD ═══
 *
 * Founder, 2026-08-10: « on my ops console when a bought product comes on a
 * traiter show the product photo to it as well. »
 *
 * WHAT THIS PROVES AND WHY IT IS NOT A UNIT TEST: the photograph is joined at
 * READ time — `/fulfillment/orders` asks the OFFER STORE for the entry behind
 * each row's `productVersionId` and lifts `assets.heroSquare.ref`. That join
 * crosses three things a fake would hide: the router's store composition, the
 * per-offer Durable Object the entry actually lives in, and the pv → offerId
 * pointer that resolves the read. So the whole path runs on real workerd, and
 * the LAST leg is the supplier app's OWN port — `resolveOperationsService()`,
 * the module the Commandes tab and the Accueil both call — because a shape
 * that drifts between the route and the port is exactly the failure the seam
 * law exists to catch (the precedent: RB-1's own port e2e in
 * `fulfillment-readiness.e2e.test.ts`).
 *
 * THE THREE ROWS IT WALKS, because « it works » is only true if the absences
 * are honest too:
 *   1. a product WITH photographs      ⇒ the heroSquare ref, verbatim
 *   2. a product with NO photographs   ⇒ '' (he uploaded none)
 *   3. an order for an UNKNOWN product ⇒ '' (the store cannot answer)
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'photo-a-traiter-'));
const WRITE_SECRET = 'test-offer-write-secret-0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0001';
const OPS_SECRET = 'test-fulfillment-ops-secret-0001';
const T0 = '2026-08-10T08:00:00.000Z';

const PV_AVEC = 'pv-photo-avec-001';
const PV_SANS = 'pv-photo-sans-001';
const PV_INCONNU = 'pv-photo-inconnu-001';
const SUPPLIER = 'supplier-founder-001';

/** THE ref the row must carry — a real MediaRef shape, hero-square slot. */
const HERO_SQUARE = 'media/11111111-1111-4111-8111-111111111111';
const mediaRef = (r: string) => ({ ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: {
    OFFER_WRITE_SECRET: WRITE_SECRET,
    FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    FULFILLMENT_OPS_SECRET: OPS_SECRET,
  },
});

afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function seed(offerId: string, pv: string, name: string) {
  return {
    commandId: `seed-${offerId}`,
    offerId,
    product: {
      id: pv,
      supplierId: SUPPLIER,
      version: 1,
      name,
      productCode: `FASO-${offerId}`,
      facts: {},
      category: 'fashion_bags_fabrics',
      zone: 'Gounghin',
      moderationState: 'approved',
      status: 'active',
      supplyMode: 'SELLER_HELD',
    },
    draft: {
      productVersionId: pv,
      basePrice: 10_000,
      resellerCommission: 1_000,
      eligibleVariants: [],
      zones: [],
      effective: '2026-07-10T00:00:00.000Z',
      expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 5,
    asOf: T0,
  };
}

/** The canon `order.confirmed.v1` Shop+ emits — the ONLY way a row enters the book. */
function confirmedEvent(orderId: string, pv: string) {
  return {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: `ord-confirm-${orderId}`,
      correlation_id: `corr-${orderId}`,
      aggregateVersion: 5,
      // Spelled NEUTRALLY, and for the reason `fulfillment-intake.e2e.test.ts`
      // states at length: B+I-15's gate greps this repo for consumer-commerce
      // words, and a neighbour service's name in a fixture is that gate's one
      // legitimate false positive. The SCHEMA is the fidelity anchor here.
      actor: 'shop-plus:order-emitter',
      serverTime: T0,
      version: 'v1',
    },
    payload: {
      orderId,
      productVersionId: pv,
      offerVersion: 'ov-1',
      paymentMode: 'FULL_PREPAY',
      paidAt: T0,
      zoneTo: 'Gounghin',
      sellerBasePrice: 10_000,
    },
  };
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string>,
  m: Miniflare = mf,
): Promise<Response> {
  return m.dispatchFetch(`http://o${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as unknown as Promise<Response>;
}

describe('PHOTO-À-TRAITER — the product photograph reaches his board', () => {
  it('the app’s OWN port reads the hero ref for a product that has one, and \'\' for the two that do not', async () => {
    // ── MINT BEFORE SEED (LISTER-POUR-1a'): a create may only name a
    // supplier who currently holds an active code. ─────────────────────────
    const ops = { Authorization: `Bearer ${OPS_SECRET}` };
    expect((await post('/fulfillment/supplier-code', { supplierId: SUPPLIER }, ops)).status).toBe(200);

    // ── seed two real offers through the real command path ────────────────
    const write = { 'X-Write-Key': WRITE_SECRET };
    for (const [offerId, pv, name] of [
      ['offer-photo-avec', PV_AVEC, 'Bazin riche'],
      ['offer-photo-sans', PV_SANS, 'Sac en cuir'],
    ] as const) {
      const res = await post('/offers', seed(offerId, pv, name), write);
      expect(res.status, `${offerId}: ${await res.clone().text().catch(() => '')}`).toBe(200);
      expect(((await res.json()) as { status: string }).status).toBe('created');
    }

    // ── attach photographs to ONE of them, through the real completion path ─
    const attach = await post(
      '/offers/assets',
      {
        commandId: 'attach-photo-avec',
        offerId: 'offer-photo-avec',
        assets: {
          masterRef: mediaRef('private/master/capture-1'),
          heroSquare: mediaRef(HERO_SQUARE),
          heroVertical: mediaRef('media/22222222-2222-4222-8222-222222222222'),
          proof: mediaRef('media/33333333-3333-4333-8333-333333333333'),
          detail: [],
          hashes: ['a'.repeat(64)],
          processingVersion: 'premium-frame.v1',
        },
      },
      write,
    );
    expect(attach.status, await attach.text().catch(() => '')).toBe(200);

    // ── three paid orders arrive, exactly as Shop+ delivers them ───────────
    const fulfil = { Authorization: `Bearer ${FULFILL_SECRET}` };
    for (const [orderId, pv] of [
      ['ord-photo-avec', PV_AVEC],
      ['ord-photo-sans', PV_SANS],
      ['ord-photo-inconnu', PV_INCONNU],
    ] as const) {
      const res = await post('/fulfillment/order-confirmed', confirmedEvent(orderId, pv), fulfil);
      expect(res.status, `${orderId}: ${await res.text().catch(() => '')}`).toBe(200);
    }

    // ── THE LAST LEG: the supplier app's real port against the real Worker ──
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'http://o');
    vi.stubGlobal('fetch', ((url: string, init?: RequestInit) => mf.dispatchFetch(url, init as never)) as never);
    try {
      const { resolveOperationsService } = await import('../../../apps/supplier-app/src/operations/service');
      const port = resolveOperationsService();
      expect(port, 'the base is set, so the port must resolve').not.toBeNull();

      const board = await port!.listPaidOrders(OPS_SECRET);
      expect(board.ok, JSON.stringify(board)).toBe(true);
      const rows = board.ok ? board.orders : [];
      const par = (id: string) => rows.find((o) => o.orderId === id);

      // 1 — the photograph he asked for, verbatim off the offer entry. NOT the
      // vertical crop, NOT the proof shot: the square hero is the thumbnail.
      expect(par('ord-photo-avec')?.productPhotoRef).toBe(HERO_SQUARE);
      // …and the name still comes from the same join, so one read serves both.
      expect(par('ord-photo-avec')?.productName).toBe('Bazin riche');

      // 2 — a real product with no photographs is '' — an honest absence, and
      // never a stand-in ref. The row itself is still fully there.
      expect(par('ord-photo-sans')?.productPhotoRef).toBe('');
      expect(par('ord-photo-sans')?.productName).toBe('Sac en cuir');

      // 3 — an order whose product the store cannot answer for is ALSO '',
      // and — the older law this must not break — it stays UNRESOLVED rather
      // than being dropped or attributed to a supplier.
      expect(par('ord-photo-inconnu')?.productPhotoRef).toBe('');
      expect(par('ord-photo-inconnu')?.supplierResolved).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('the lookup is CAPPED, and the cap spends itself on the NEWEST orders', async () => {
    /**
     * ⚠ THE CAP IS A REAL WORKERS CEILING, NOT TIDINESS. Each join walks the
     * pv→offerId pointer and then the per-offer DO — up to two subrequests —
     * and Workers bounds subrequests per request. Uncapped, the day his book
     * passes the ceiling the whole BOARD stops loading, which trades a nicety
     * for his work. So the join is bounded at 20 distinct products, and this
     * pins WHICH 20: rows arrive newest-first, so the newest keep their
     * photographs and the oldest silently has none — the same honest state a
     * product with no photographs already renders.
     *
     * It is asserted, not documented, because a silent cap that nothing
     * exercises is exactly §9.7 — a bound nobody proves is a bound that can
     * quietly become « all of them » or « none of them ».
     */
    // ⚠ ITS OWN EMPTY BOOK. Sharing the book with the test above would spend
    // some of the 20 slots on THAT test's products, and the arithmetic would
    // then depend on execution order — a test whose meaning changes when a
    // neighbour is added is not a pin.
    const capPersist = mkdtempSync(join(tmpdir(), 'photo-cap-'));
    const mfCap = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
      durableObjectsPersist: capPersist,
      bindings: {
        OFFER_WRITE_SECRET: WRITE_SECRET,
        FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
        FULFILLMENT_OPS_SECRET: OPS_SECRET,
      },
    });
    try {
    const write = { 'X-Write-Key': WRITE_SECRET };
    const fulfil = { Authorization: `Bearer ${FULFILL_SECRET}` };
    expect((await post('/fulfillment/supplier-code', { supplierId: SUPPLIER }, { Authorization: `Bearer ${OPS_SECRET}` }, mfCap)).status).toBe(200);
    const N = 21;
    for (let i = 0; i < N; i += 1) {
      const pv = `pv-cap-${String(i).padStart(2, '0')}`;
      const offerId = `offer-cap-${String(i).padStart(2, '0')}`;
      expect((await post('/offers', seed(offerId, pv, `Produit ${i}`), write, mfCap)).status).toBe(200);
      expect(
        (await post('/offers/assets', {
          commandId: `attach-cap-${i}`,
          offerId,
          assets: {
            masterRef: mediaRef(`private/master/cap-${i}`),
            heroSquare: mediaRef(`media/cap-hero-${i}`),
            heroVertical: mediaRef(`media/cap-vert-${i}`),
            proof: mediaRef(`media/cap-proof-${i}`),
            detail: [],
            hashes: ['a'.repeat(64)],
            processingVersion: 'premium-frame.v1',
          },
        }, write, mfCap)).status,
      ).toBe(200);
      // Distinct, ASCENDING paid times: index 0 is the OLDEST, so it is the one
      // the newest-first cap must drop.
      const ev = confirmedEvent(`ord-cap-${String(i).padStart(2, '0')}`, pv);
      ev.payload.paidAt = `2026-08-1${Math.floor(i / 10)}T${String(i % 10).padStart(2, '0')}:00:00.000Z`;
      expect((await post('/fulfillment/order-confirmed', ev, fulfil, mfCap)).status).toBe(200);
    }

    const board = (await mfCap.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    })) as unknown as Response;
    expect(board.status).toBe(200);
    const rows = ((await board.json()) as { orders: { orderId: string; productPhotoRef: string }[] }).orders;
    const cap = rows.filter((r) => r.orderId.startsWith('ord-cap-'));
    expect(cap).toHaveLength(N);

    // The NEWEST 20 carry their photograph…
    const withPhoto = cap.filter((r) => r.productPhotoRef !== '');
    expect(withPhoto).toHaveLength(20);
    expect(cap.find((r) => r.orderId === 'ord-cap-20')?.productPhotoRef).toBe('media/cap-hero-20');
    // …and the OLDEST is the one that goes without — never an arbitrary row.
    expect(cap.find((r) => r.orderId === 'ord-cap-00')?.productPhotoRef).toBe('');
    } finally {
      await mfCap.dispose();
      rmSync(capPersist, { recursive: true, force: true });
    }
  });

  it('the ops door still gates the board — the join did not open a second road in', async () => {
    // The read now composes a store. That must not have moved the credential:
    // an unkeyed or wrongly-keyed call is still 401 BEFORE any dispatch, so a
    // 401 can never become an existence oracle for order ids.
    const bare = (await mf.dispatchFetch('http://o/fulfillment/orders')) as unknown as Response;
    expect(bare.status).toBe(401);
    const wrong = (await mf.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: 'Bearer wrong-key' },
    })) as unknown as Response;
    expect(wrong.status).toBe(401);
    // And the intake secret is NOT interchangeable with the ops secret.
    const shopKey = (await mf.dispatchFetch('http://o/fulfillment/orders', {
      headers: { Authorization: `Bearer ${FULFILL_SECRET}` },
    })) as unknown as Response;
    expect(shopKey.status).toBe(401);
  });
});
