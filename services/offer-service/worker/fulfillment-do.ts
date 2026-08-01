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
const RELANCE_PREFIX = 'relance:';

/**
 * CONSOLE-2 — THE OPERATOR'S CHASE LOG, AND WHAT IT DELIBERATELY IS NOT.
 *
 * The founder's ruling (2026-08-01): « after 10 mn if the another supplier get
 * a product sold but still not showing any sign of preparation I will notify
 * them offline myself. » A relance records THAT ACT — the operator phoned the
 * supplier at this instant — and nothing more.
 *
 * ═══ IT IS NOT READINESS. THIS SEPARATION IS LOAD-BEARING ═══
 *
 * The canon already owns « le produit est prêt »: B+6 / B6.2 —
 * `PackageReadinessConfirmation` (photo + the short-TTL
 * `sellerReadinessChallenge` + qty/variant/availability), and B+I-06: « A Séra
 * pickup MUST NOT be requested until fulfillment is accepted and the supplier
 * has confirmed package-ready. » Readiness is the SUPPLIER's evidenced act and
 * it GATES CUSTODY. A phone call by the operator is neither, so it is stored
 * under its own prefix, named for what it is, and can never be mistaken for —
 * or promoted into — readiness evidence. A console that could mark an order
 * « prêt » would be forging the dispatch gate; this one cannot express the
 * idea at all.
 *
 * Stored SEPARATELY from the record for a second reason: the paid-order record
 * is first-wins and byte-stable, the property the emitter's at-least-once
 * delivery leans on. Annotations never mutate it; they are merged at read.
 */
export interface RelanceMark {
  /** THIS Worker's clock when the relance was recorded — never a client's
   *  claim, the same law `paidAt` follows on the emitter side. */
  readonly at: string;
  /** How many times the operator has called about this order. */
  readonly count: number;
}

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
      const marks = await this.state.storage.list<RelanceMark>({ prefix: RELANCE_PREFIX });
      const orders = [...entries.values()]
        .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
        // Merged at READ — the stored record stays exactly the bytes the
        // intake wrote (see RelanceMark).
        .map((r) => {
          const mark = marks.get(`${RELANCE_PREFIX}${r.orderId}`);
          return mark === undefined ? r : { ...r, relance: mark };
        });
      return Response.json({ ok: true, orders });
    }

    /** RECORD A RELANCE — the operator called this supplier, just now.
     *  Repeatable on purpose: a second call a day later is a real event, so
     *  the count grows and `at` moves to the latest. An order this book has
     *  never heard of is a 404, never an invented row: a chase log about a
     *  paid order that does not exist would be a lie about a real one. */
    if (request.method === 'POST' && pathname === '/relance') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const orderId = body?.['orderId'];
      if (typeof orderId !== 'string' || orderId === '') {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      // A body that CARRIES `at`/`count` is REFUSED, not quietly ignored — the
      // verifier's fix, and a better one than mine: ignoring made this object's
      // clock defence untestable on its own (the router already strips those
      // fields, so a regression here stayed green). Refusing means either layer
      // failing alone is red, and « quand » can never come from a caller.
      if (body?.['at'] !== undefined || body?.['count'] !== undefined) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const existing = await this.state.storage.get<PaidOrderRecord>(`${ORDER_PREFIX}${orderId}`);
      if (existing === undefined) {
        return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      }
      const key = `${RELANCE_PREFIX}${orderId}`;
      const prev = await this.state.storage.get<RelanceMark>(key);
      const mark: RelanceMark = { at: new Date().toISOString(), count: (prev?.count ?? 0) + 1 };
      await this.state.storage.put(key, mark);
      return Response.json({ ok: true, relance: mark });
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

/**
 * CONSOLE-2 — record one relance. Auth (the FOUNDER'S ops credential) ran at
 * the composition root: chasing is his act alone, and the intake secret Shop+
 * holds must never reach it.
 *
 * ONLY `orderId` IS FORWARDED, and that re-serialization is load-bearing, not
 * tidiness: it strips any `at`/`count` a caller invents before the object can
 * see them. Proven by mutation — making the DO trust a claimed `at` ALONE
 * leaves the suite green, because this line already threw the claim away;
 * both layers must fall together before the clock can lie, and the e2e goes
 * red exactly then. Do not "simplify" this to forward the body.
 */
export async function handleRelance(request: Request, env: FulfillmentEnv): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
  const stub = env.FULFILLMENT.get(env.FULFILLMENT.idFromName(BOOK_NAME));
  return stub.fetch(
    new Request('https://do/relance', {
      method: 'POST',
      body: JSON.stringify({ orderId: body?.orderId }),
    }),
  );
}
