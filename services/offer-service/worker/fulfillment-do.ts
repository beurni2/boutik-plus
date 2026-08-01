import { OrderConfirmedEventSchema, type OrderConfirmedEvent } from '@platform/contracts';
import type { OfferStore } from '../src/offer-store.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FulfillmentDO — THE PAID-ORDER BOOK (ORDER-PAID-WIRE-1c). One singleton
 * instance (`idFromName(BOOK_NAME)`), durably holding every order Shop+ has
 * told this platform to prepare.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the intake half of the founder-approved preparation wire: Shop+
 * emits `order.confirmed.v1` at-least-once, and THIS object absorbs it
 * FIRST-WINS on `orderId` — a redelivery (or a crafted later `paidAt`) can
 * never reset the record a supplier's preparation clock will be measured
 * against, the same law `FulfillmentBook.registerPaidOrder` already encodes
 * in the (not-yet-deployed) fulfillment-service package. The DO's input gate
 * makes first-wins STRUCTURAL: two concurrent redeliveries serialize through
 * one object.
 *
 * ═══ WHERE THE SUPPLIER COMES FROM — AND WHERE IT NEVER GOES ═══
 *
 * The wire carries NO supplier id, by founder ruling: the ROUTER resolves it
 * INTERNALLY (productVersionId → the offer store's own entry → `supplierId`)
 * before registering here. The stored record therefore knows its supplier —
 * it must, or no supplier board could ever exist — but that value leaves this
 * object only through the secret-gated ops read below. It is never echoed on
 * the intake response Shop+ sees.
 *
 * An UNRESOLVED supplier (the store had no entry for the pv — a real paid
 * order for a product this platform cannot find) is REGISTERED, not refused:
 * refusing would make Shop+ retry a delivery that can never improve, and
 * dropping it would hide a paid order from every human. It lands with
 * `supplierResolved: false`, which is precisely the kind of anomaly the
 * founder's console exists to surface.
 *
 * ═══ WHAT THIS OBJECT DOES NOT DO (scope, named) ═══
 *
 * No acceptance decision, no readiness, no 10-minute aging list, no
 * notification — those are the console/board slices on top of this book. And
 * NOTHING here touches money: `sellerBasePrice` is stored verbatim for
 * display to its own supplier, never recomputed, never summed (Ten Laws #2).
 */

export const BOOK_NAME = 'paid-orders';
const ORDER_PREFIX = 'order:';

export interface PaidOrderRecord {
  readonly orderId: string;
  readonly productVersionId: string;
  readonly offerVersion: string;
  readonly paymentMode: string;
  readonly paidAt: string;
  readonly zoneTo: string;
  readonly sellerBasePrice: number;
  /** The product's display name, joined from the same internal entry as the
   *  supplier — so the founder's board passes the 5-second test without a
   *  second lookup. '' when the pv was unknown. Display only, never identity. */
  readonly productName: string;
  /** Resolved INTERNALLY by the router; '' when the pv was unknown. */
  readonly supplierId: string;
  readonly supplierResolved: boolean;
  readonly correlationId: string;
  /** This platform's own receipt time — when the book first saw the order. */
  readonly registeredAt: string;
}

export class FulfillmentDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    /** REGISTER, FIRST-WINS. A replay answers `duplicate` with the ORIGINAL
     *  record untouched — byte-for-byte the semantics the emitter's
     *  at-least-once delivery is counting on. */
    if (request.method === 'POST' && pathname === '/register') {
      const record = (await request.json().catch(() => null)) as PaidOrderRecord | null;
      if (record === null || typeof record.orderId !== 'string' || record.orderId === '') {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const key = `${ORDER_PREFIX}${record.orderId}`;
      const existing = await this.state.storage.get<PaidOrderRecord>(key);
      if (existing !== undefined) {
        return Response.json({ ok: true, status: 'duplicate' });
      }
      await this.state.storage.put(key, record);
      return Response.json({ ok: true, status: 'registered' });
    }

    /** THE OPS READ — every paid order, supplier ids included. The ROUTER
     *  gates this behind FULFILLMENT_OPS_SECRET — the founder's OWN credential
     *  (his console's login), never the intake secret Shop+ holds to deliver.
     *  Unbounded at pilot scale on purpose (the same reasoning as the offer
     *  store's list: a cursor today is speculative flexibility, an obligation
     *  forever). */
    if (request.method === 'GET' && pathname === '/orders') {
      const entries = await this.state.storage.list<PaidOrderRecord>({ prefix: ORDER_PREFIX });
      const orders = [...entries.values()].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
      return Response.json({ ok: true, orders });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

/* ───────────────────────────── the intake handler ────────────────────────── */

export interface FulfillmentEnv {
  readonly FULFILLMENT: DurableObjectNamespace;
}

/**
 * THE INTAKE: parse through canon, resolve the supplier internally, register
 * first-wins. Auth ran at the composition root BEFORE this function — the
 * same before-any-dispatch discipline every gate in this Worker follows, so a
 * 401 can never become an existence oracle for order ids.
 *
 * `event_not_canonical` is a 400, NOT a retryable 5xx, and that distinction
 * carries weight: the emitter treats any non-2xx as undelivered and retries
 * on its backoff, so a producer bug (a payload canon refuses) surfaces as a
 * repeating 400 in both Workers' logs rather than a silent drop — while a
 * boutik outage is a 5xx/no-answer and drains normally. Nothing is dropped
 * silently in either direction.
 */
export async function handleOrderConfirmedIntake(
  request: Request,
  store: OfferStore,
  env: FulfillmentEnv,
): Promise<Response> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = OrderConfirmedEventSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
  }
  const event: OrderConfirmedEvent = parsed.data;

  // THE INTERNAL JOIN the founder's privacy ruling demands: supplier identity
  // never rides the wire; this store owns pv → supplier and answers it here.
  const entry = await store.getEntryByProductVersion(event.payload.productVersionId);
  const supplierId = entry?.product.supplierId ?? '';

  const record = {
    productName: entry?.product.name ?? '',
    orderId: event.payload.orderId,
    productVersionId: event.payload.productVersionId,
    offerVersion: event.payload.offerVersion,
    paymentMode: event.payload.paymentMode,
    paidAt: event.payload.paidAt,
    zoneTo: event.payload.zoneTo,
    sellerBasePrice: event.payload.sellerBasePrice,
    supplierId,
    supplierResolved: supplierId !== '',
    correlationId: event.envelope.correlation_id,
    registeredAt: new Date().toISOString(),
  };
  const stub = env.FULFILLMENT.get(env.FULFILLMENT.idFromName(BOOK_NAME));
  const res = await stub.fetch(
    new Request('https://do/register', { method: 'POST', body: JSON.stringify(record) }),
  );
  const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: string } | null;
  if (body?.ok !== true) {
    return Response.json({ ok: false, reason: 'book_unavailable' }, { status: 503 });
  }
  // The response Shop+ sees carries NO supplier id — the join's result stays home.
  return Response.json({ ok: true, status: body.status });
}

/** The ops list, through the same singleton. Auth is the composition root's. */
export async function handlePaidOrdersList(env: FulfillmentEnv): Promise<Response> {
  const stub = env.FULFILLMENT.get(env.FULFILLMENT.idFromName(BOOK_NAME));
  return stub.fetch(new Request('https://do/orders'));
}
