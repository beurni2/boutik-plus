import {
  OrderConfirmedEventSchema,
  PackageReadinessConfirmationSchema,
  type OrderConfirmedEvent,
  type PackageReadinessConfirmation,
} from '@platform/contracts';
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
const ACCEPT_PREFIX = 'accept:';
const CHALLENGE_PREFIX = 'challenge:';
const READY_PREFIX = 'ready:';

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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * READINESS-WIRE-1a — B6.1/B6.2 MADE DURABLE: acceptance, the challenge, and
 * « Produit prêt », on the same book the paid orders live in.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SPEC AUTHORITY, quoted:
 *  · B+I-06: « A Séra pickup MUST NOT be requested until fulfillment is
 *    accepted and the supplier has confirmed package-ready (readiness
 *    evidence + dynamic readiness challenge). »
 *  · §5.6 PackageReadinessConfirmation — STRICT: « carries the
 *    sellerReadinessChallenge and NOTHING ELSE secret »; a buyerDropCode (or
 *    any undeclared key) in readiness evidence is a parse failure.
 *  · B6.2: « confirm package-ready with photo + sellerReadinessChallenge
 *    (short-TTL) + qty/variant/availability → only then enters the dispatch
 *    queue. »
 *
 * The SEMANTICS mirror `@boutik/fulfillment-service`'s FulfillmentBook — the
 * tested in-memory reference: acceptance LOCKS terms and is first-wins; the
 * challenge is short-TTL and SINGLE-USE; readiness demands the strict canon
 * confirmation, a live matching challenge, and the locked terms. A pin test
 * asserts this file's TTL equals the reference's.
 *
 * SAFEST DEFAULTS, FLAGGED (walking-skeleton scope, journalled):
 *  · Acceptance locks `variant = productVersionId` and `qty = 1` — the wire
 *    carries neither (founder-approved 7 fields) and today's spine sells one
 *    unit of one version. When variants/qty reach the order wire, acceptance
 *    starts locking the real values; the ready-time equality check is already
 *    the enforcement.
 *  · NO MONEY FIELD. The reference locks `sellerNetFcfa` copied from the
 *    Quote; this Worker never sees the Quote and MUST NOT recompute (B+I-05,
 *    Ten Laws #1/#2) — so the durable acceptance simply carries no amount.
 *
 * THE CHALLENGE MINT DRAWS FROM THE OS CSPRNG (`crypto.randomUUID`), never a
 * counter: the reference's `srch-<orderId>-<n>` was mock-grade — predictable
 * secrets are not secrets, and this one is one of the four the custody laws
 * name. The mint-path-entropy discipline applies to it in full.
 */

export const READINESS_CHALLENGE_TTL_MS = 10 * 60 * 1000; // pin-tested against @boutik/fulfillment-service

export interface FulfillmentAcceptanceRecord {
  readonly orderId: string;
  readonly supplierId: string;
  /** Locked at acceptance; readiness must repeat them exactly. */
  readonly variant: string;
  readonly qty: number;
  /** THIS Worker's clock — never a caller's claim. */
  readonly acceptedAt: string;
}

interface IssuedChallengeRecord {
  readonly challenge: string;
  readonly expiresAt: string;
  /** Single-use: set on consumption; a consumed challenge refuses forever. */
  readonly consumedAt?: string;
}

interface ReadinessRecord {
  /** The canon confirmation VERBATIM — the evidence, as parsed. */
  readonly confirmation: PackageReadinessConfirmation;
  /** THIS Worker's receipt clock — the board's display time. The
   *  confirmation's own `at` is the supplier's claim and stays inside the
   *  evidence, never promoted (the emitter's paidAt law, third application). */
  readonly confirmedAt: string;
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
  constructor(
    private readonly state: DurableObjectState,
    private readonly env?: { readonly READINESS_TTL_MS?: string },
  ) {}

  /** The 10-minute canon TTL — overridable ONLY downward-visible via an env
   *  var so the e2e can prove expiry without waiting ten real minutes.
   *  Production never sets it; anything unparseable falls to the canon value. */
  private readinessTtlMs(): number {
    const raw = this.env?.READINESS_TTL_MS;
    const n = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isSafeInteger(n) && n > 0 ? n : READINESS_CHALLENGE_TTL_MS;
  }

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
      const accepts = await this.state.storage.list<FulfillmentAcceptanceRecord>({ prefix: ACCEPT_PREFIX });
      const readies = await this.state.storage.list<ReadinessRecord>({ prefix: READY_PREFIX });
      const orders = [...entries.values()]
        .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
        // Merged at READ — the stored record stays exactly the bytes the
        // intake wrote (see RelanceMark). The fulfillment mark carries the
        // TWO server clocks only; the evidence (photoRef, challenge) never
        // leaves this object through the list.
        .map((r) => {
          const mark = marks.get(`${RELANCE_PREFIX}${r.orderId}`);
          const accepted = accepts.get(`${ACCEPT_PREFIX}${r.orderId}`);
          const ready = readies.get(`${READY_PREFIX}${r.orderId}`);
          const fulfillment =
            accepted === undefined && ready === undefined
              ? undefined
              : {
                  ...(accepted !== undefined ? { acceptedAt: accepted.acceptedAt } : {}),
                  ...(ready !== undefined ? { readyAt: ready.confirmedAt } : {}),
                };
          return {
            ...r,
            ...(mark !== undefined ? { relance: mark } : {}),
            ...(fulfillment !== undefined ? { fulfillment } : {}),
          };
        });
      return Response.json({ ok: true, orders });
    }

    /** B6.1 thin — the supplier ACCEPTS, locking the terms readiness must
     *  repeat. First-wins (a second accept answers `already_accepted`, terms
     *  untouched). An unknown order and ANOTHER supplier's order answer the
     *  SAME refusal: the route is reachable with the bundled app key, and a
     *  distinguishable answer would be an oracle for who supplies what. */
    if (request.method === 'POST' && pathname === '/accept') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const orderId = body?.['orderId'];
      const supplierId = body?.['supplierId'];
      if (
        typeof orderId !== 'string' || orderId === '' ||
        typeof supplierId !== 'string' || supplierId === '' ||
        Object.keys(body ?? {}).length !== 2
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const order = await this.state.storage.get<PaidOrderRecord>(`${ORDER_PREFIX}${orderId}`);
      if (order === undefined || !order.supplierResolved || order.supplierId !== supplierId) {
        return Response.json({ ok: false, reason: 'not_yours_or_unknown' }, { status: 404 });
      }
      const key = `${ACCEPT_PREFIX}${orderId}`;
      const existing = await this.state.storage.get<FulfillmentAcceptanceRecord>(key);
      if (existing !== undefined) {
        return Response.json({ ok: true, status: 'already_accepted', acceptedAt: existing.acceptedAt });
      }
      const acceptance: FulfillmentAcceptanceRecord = {
        orderId,
        supplierId,
        // Safest defaults, flagged in the header: the wire carries neither.
        variant: order.productVersionId,
        qty: 1,
        acceptedAt: new Date().toISOString(),
      };
      await this.state.storage.put(key, acceptance);
      return Response.json({ ok: true, status: 'accepted', acceptedAt: acceptance.acceptedAt });
    }

    /** B6.2 — issue the short-TTL sellerReadinessChallenge. CSPRNG mint; a
     *  re-issue REPLACES the previous (which then refuses by mismatch). Only
     *  an ACCEPTED order may hold a challenge (B+I-06 ordering). */
    if (request.method === 'POST' && pathname === '/ready/challenge') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const orderId = body?.['orderId'];
      const supplierId = body?.['supplierId'];
      if (
        typeof orderId !== 'string' || orderId === '' ||
        typeof supplierId !== 'string' || supplierId === '' ||
        Object.keys(body ?? {}).length !== 2
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const order = await this.state.storage.get<PaidOrderRecord>(`${ORDER_PREFIX}${orderId}`);
      if (order === undefined || !order.supplierResolved || order.supplierId !== supplierId) {
        return Response.json({ ok: false, reason: 'not_yours_or_unknown' }, { status: 404 });
      }
      const acceptance = await this.state.storage.get<FulfillmentAcceptanceRecord>(`${ACCEPT_PREFIX}${orderId}`);
      if (acceptance === undefined) {
        return Response.json({ ok: false, reason: 'not_accepted' }, { status: 409 });
      }
      if ((await this.state.storage.get<ReadinessRecord>(`${READY_PREFIX}${orderId}`)) !== undefined) {
        return Response.json({ ok: false, reason: 'already_ready' }, { status: 409 });
      }
      const issued: IssuedChallengeRecord = {
        challenge: `srch-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + this.readinessTtlMs()).toISOString(),
      };
      await this.state.storage.put(`${CHALLENGE_PREFIX}${orderId}`, issued);
      return Response.json({ ok: true, challenge: issued.challenge, expiresAt: issued.expiresAt });
    }

    /** B6.2 — « Produit prêt ». The canonical STRICT confirmation is the ONLY
     *  accepted shape (a buyerDropCode — or any foreign key — is a parse
     *  failure); the challenge must match, be unexpired and UNCONSUMED; the
     *  locked terms must be repeated exactly. Consumption and the readiness
     *  record land in ONE atomic batch. Reason names mirror the reference
     *  FulfillmentBook so the two implementations can never drift silently. */
    if (request.method === 'POST' && pathname === '/ready') {
      const raw: unknown = await request.json().catch(() => null);
      const parsed = PackageReadinessConfirmationSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json({ ok: false, reason: 'not_canonical_or_foreign_secret' }, { status: 400 });
      }
      const confirmation = parsed.data;
      const orderId = confirmation.orderId;

      const already = await this.state.storage.get<ReadinessRecord>(`${READY_PREFIX}${orderId}`);
      if (already !== undefined) {
        // A REPLAY of the confirmed act (same challenge) is absorbed — the
        // at-least-once law every write on this book follows. A DIFFERENT
        // confirmation against an already-ready order is refused: correction
        // is its own flow (reopenForCorrection), not a silent overwrite.
        if (already.confirmation.readinessChallenge === confirmation.readinessChallenge) {
          return Response.json({ ok: true, status: 'already_ready', confirmedAt: already.confirmedAt });
        }
        return Response.json({ ok: false, reason: 'already_ready' }, { status: 409 });
      }

      const acceptance = await this.state.storage.get<FulfillmentAcceptanceRecord>(`${ACCEPT_PREFIX}${orderId}`);
      if (acceptance === undefined) {
        return Response.json({ ok: false, reason: 'not_accepted' }, { status: 409 });
      }
      const issued = await this.state.storage.get<IssuedChallengeRecord>(`${CHALLENGE_PREFIX}${orderId}`);
      if (issued === undefined || issued.challenge !== confirmation.readinessChallenge) {
        return Response.json({ ok: false, reason: 'challenge_missing_or_mismatched' }, { status: 409 });
      }
      // HONESTLY-DEAD DEFENCE TODAY, stated not claimed (proven by mutation:
      // removing it stays green): consumption and readiness commit in ONE
      // atomic batch below, and the already-ready branch answers first, so
      // « consumed but not ready » cannot currently exist. It comes ALIVE the
      // day reopenForCorrection lands — correction clears readiness while the
      // consumed challenge remains, and THIS line is what forces the seller
      // to a fresh challenge instead of replaying old evidence (WO-2.6).
      if (issued.consumedAt !== undefined) {
        return Response.json({ ok: false, reason: 'challenge_already_used' }, { status: 409 });
      }
      const now = new Date().toISOString();
      if (now > issued.expiresAt) {
        return Response.json({ ok: false, reason: 'challenge_expired' }, { status: 409 });
      }
      if (confirmation.qty !== acceptance.qty || confirmation.variant !== acceptance.variant || !confirmation.availableConfirmed) {
        return Response.json({ ok: false, reason: 'locked_terms_mismatch' }, { status: 409 });
      }

      const ready: ReadinessRecord = { confirmation, confirmedAt: now };
      await this.state.storage.put({
        [`${CHALLENGE_PREFIX}${orderId}`]: { ...issued, consumedAt: now } satisfies IssuedChallengeRecord,
        [`${READY_PREFIX}${orderId}`]: ready,
      });
      return Response.json({ ok: true, status: 'ready', confirmedAt: now });
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
 * READINESS-WIRE-1a — forward a supplier fulfillment act to the book. Auth
 * (the app's write key) ran at the composition root. The BODY passes through
 * VERBATIM, deliberately unlike the relance forwarder: these routes validate
 * strictly inside the object (exact key sets; the canon strict parse), so a
 * smuggled field is REFUSED there rather than silently stripped here — the
 * refuse-don't-ignore lesson the relance verifier taught, applied from birth.
 */
export async function forwardToFulfillmentBook(
  request: Request,
  env: FulfillmentEnv,
  path: '/accept' | '/ready/challenge' | '/ready',
): Promise<Response> {
  const body = await request.text();
  const stub = env.FULFILLMENT.get(env.FULFILLMENT.idFromName(BOOK_NAME));
  return stub.fetch(`https://do${path}`, { method: 'POST', body });
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
