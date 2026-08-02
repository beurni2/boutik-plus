import {
  FulfillmentAcceptedEventSchema,
  FulfillmentReadyEventSchema,
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
const CODEHASH_PREFIX = 'codehash:';
const SUPPLIERCODE_PREFIX = 'suppliercode:';
/** READINESS-RETURN-1 — one outbox row per (order, fact). */
const PROGRESS_OUTBOX_PREFIX = 'progressoutbox:';

/**
 * At-least-once backoff for the return leg, mirroring the Shop+ emitter's
 * policy rather than inventing a second one: quick first retries for a
 * transient blip, then hourly so a long Shop+ outage cannot spin a Worker.
 */
function progressBackoffMs(attempts: number): number {
  const ladder = [1_000, 5_000, 30_000, 300_000, 1_800_000];
  return attempts - 1 < ladder.length ? ladder[attempts - 1]! : 3_600_000;
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * READINESS-WIRE-1b-i — THE PERSONAL CODE: each supplier's own door.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FOUNDER RULING (2026-08-02, verbatim): « i do not want other suppliers
 * boutik+ webapp be able to list new products, only my webapp have that
 * capability, their webapp will be only able to accept commandes, upload
 * photo prove of readiness , and see all the follow up until product is
 * delivered » — approved implementation: « the personal code door ».
 *
 * The supplier fulfillment acts therefore leave the offers write key
 * entirely: the suppliers' bundle must not CARRY authoring capability, and a
 * shared key in that bundle would carry it. Instead the FOUNDER mints one
 * personal code per supplier (his ops credential gates the mint), hands it
 * over offline, and the code IS the identity: every act derives its
 * supplierId from the presented code server-side — no request body carries a
 * claimed supplierId anywhere in this flow any more, which retires 1a's
 * spoofing caveat instead of patching it.
 *
 * CODE DISCIPLINE:
 *  · minted from the OS CSPRNG (80 bits, base32, grouped for human handover:
 *    BF-XXXX-XXXX-XXXX-XXXX) — typeable once on a low-end phone, unguessable
 *    online at any rate;
 *  · stored ONLY as its SHA-256 — this object can prove a code, never leak
 *    one; the plaintext exists exactly twice: in the mint RESPONSE the
 *    founder reads once, and in the supplier's own browser;
 *  · ONE active code per supplier — re-minting replaces (the old code dies
 *    at that instant), which is also the revocation story: « cut them off »
 *    is one founder call away;
 *  · every refused code answers ONE uniform 401 — never an oracle for which
 *    codes exist.
 */

export interface SupplierCodeRecord {
  readonly supplierId: string;
  readonly mintedAt: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** RFC-4648-ish base32 (no padding) over CSPRNG bytes, grouped for handover. */
function mintSupplierCode(): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(10)); // 80 bits
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `BF-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

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
    private readonly env?: {
      readonly READINESS_TTL_MS?: string;
      /**
       * READINESS-RETURN-1 — the return leg's destination and credential.
       * `STOREFRONT` is the Shop+ service binding; `PROGRESS_WRITE_SECRET` is
       * its intake's own secret (a `wrangler secret`, never `[vars]`, never
       * bundled). EITHER ABSENT ⇒ nothing is delivered and the outbox keeps
       * retrying, which is the correct behaviour before the founder has set
       * both sides — never a silent drop, never a fabricated success.
       */
      readonly STOREFRONT?: { fetch(request: Request): Promise<Response> };
      readonly PROGRESS_WRITE_SECRET?: string;
    },
  ) {}

  /**
   * ═══ READINESS-RETURN-1 — THE RETURN LEG, Boutik+ → Shop+ ═══
   *
   * Founder-approved 2026-08-02. Two facts travel home so a reseller's
   * follow-up can continue past « payée »: the supplier ACCEPTED the order,
   * and the supplier confirmed PACKAGE-READY. Both already exist durably in
   * this object; until now neither left it.
   *
   * ONE OUTBOX ROW PER (order, fact) — deliberately NOT the single-row outbox
   * Shop+'s OrderDO uses. That one carries exactly one event per order; this
   * object emits two at different times, and a shared row would let the
   * second overwrite an undelivered first. Keyed rows also make redelivery
   * first-wins for free.
   *
   * The event is COMPOSED THROUGH CANON before it is stored, so a payload
   * canon would refuse can never sit in the outbox retrying forever.
   */
  private async enqueueProgress(kind: 'accepted' | 'ready', orderId: string, at: string): Promise<void> {
    try {
      const name = kind === 'accepted' ? 'fulfillment.accepted.v1' : 'fulfillment.ready.v1';
      const schema = kind === 'accepted' ? FulfillmentAcceptedEventSchema : FulfillmentReadyEventSchema;
      const order = await this.state.storage.get<PaidOrderRecord>(`${ORDER_PREFIX}${orderId}`);
      const composed = schema.safeParse({
        name,
        envelope: {
          command_id: `ful-${kind}-${orderId}`,
          /**
           * VERIFIER M2 — SHOP+'S OWN CORRELATION ID, carried off the paid-order
           * record where `order.confirmed.v1` left it. The first cut fabricated
           * `corr-${orderId}`, which made these the only two events in the
           * ecosystem that could not be joined to their transaction by the
           * correlation chain. The fallback is used only for a record this
           * object somehow lacks — never in the normal path.
           */
          correlation_id: order?.correlationId ?? `corr-${orderId}`,
          /** VERIFIER M3 — acceptance and readiness are two DISTINCT transitions
           *  of the same aggregate; declaring both version 1 said otherwise. */
          aggregateVersion: kind === 'accepted' ? 1 : 2,
          actor: 'offer-service:fulfillment',
          serverTime: at,
          version: 'v1',
        },
        payload: { orderId, at },
      });
      const key = `${PROGRESS_OUTBOX_PREFIX}${orderId}:${kind}`;
      const existing = await this.state.storage.get<{ status: string }>(key);
      if (existing !== undefined) {
        /**
         * FIRST-WINS, and now genuinely load-bearing: the call sites re-enter
         * here on every re-assertion (verifier B1), so this is what stops a
         * repeat act from re-announcing. It also RE-ARMS A STRANDED ROW: a
         * swallowed `setAlarm` failure below would otherwise leave a pending
         * row with no scheduler, and only a later fact on this same object
         * could ever rescue it — which never comes for a supplier who accepts
         * and never confirms readiness.
         */
        if (existing.status === 'pending' && (await this.state.storage.getAlarm()) === null) {
          await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
        }
        return;
      }
      const row = composed.success
        ? { status: 'pending' as const, event: composed.data, attempts: 0, nextAttemptAt: 0 }
        : { status: 'unsendable' as const, reason: 'not_canonical', attempts: 0, nextAttemptAt: 0 };
      await this.state.storage.put(key, row);
      if (composed.success) await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
    } catch {
      // The supplier's act is already durably recorded and must never fail on
      // a queueing problem. RECOVERY IS REAL, not asserted: both call sites
      // re-enter this method every time the fact is re-asserted (verifier B1),
      // so a row lost to a transient failure is recreated on the next accept
      // or readiness confirmation for the same order.
    }
  }

  /** Drain every pending progress row. At-least-once with backoff, exactly
   *  like the Shop+ emitter — a non-2xx is UNDELIVERED and retried, so a
   *  producer bug shows up as a repeating refusal in both Workers' logs
   *  rather than a silent loss. */
  async alarm(): Promise<void> {
    const rows = await this.state.storage.list<{
      status: 'pending' | 'delivered' | 'unsendable';
      event?: unknown;
      attempts: number;
      nextAttemptAt?: number;
      reason?: string;
    }>({ prefix: PROGRESS_OUTBOX_PREFIX });
    const now = Date.now();
    let retryIn: number | null = null;
    for (const [key, row] of rows) {
      if (row.status !== 'pending' || row.event === undefined) continue;
      /**
       * VERIFIER M5 — EACH ROW WAITS ITS OWN TURN. Without a per-row due time
       * a row whose ladder says thirty minutes was re-attempted — and had its
       * attempt count burned — every time a sibling's one-second timer fired,
       * which is not the backoff this code claims to implement.
       */
      const due = row.nextAttemptAt ?? 0;
      if (due > now) {
        retryIn = retryIn === null ? due - now : Math.min(retryIn, due - now);
        continue;
      }
      let delivered = false;
      let permanentRefusal = false;
      const target = this.env?.STOREFRONT;
      const secret = this.env?.PROGRESS_WRITE_SECRET;
      if (target !== undefined && secret !== undefined && secret !== '') {
        const res = await target
          .fetch(
            new Request('https://storefront/fulfillment/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
              body: JSON.stringify(row.event),
            }),
          )
          .catch(() => undefined);
        delivered = res !== undefined && res.ok;
        /**
         * VERIFIER M4 — A PERMANENT REFUSAL IS PARKED, NOT RETRIED FOREVER.
         * A consumer 400 (`event_not_canonical`) or 404 (`unknown_order`) can
         * never improve by waiting, and the first cut retried both hourly for
         * ever with an unbounded attempt count. 401/408/429 are DELIBERATELY
         * excluded: an unset secret and a rate limit are exactly the cases
         * that DO improve on their own, and parking those would drop a real
         * fact. A parked row is visible in storage with its reason — an
         * operator can see it; nothing silently disappears.
         */
        if (res !== undefined && !res.ok && res.status >= 400 && res.status < 500 &&
            res.status !== 401 && res.status !== 408 && res.status !== 429) {
          permanentRefusal = true;
        }
      }
      if (delivered) {
        await this.state.storage.put(key, { ...row, status: 'delivered', attempts: row.attempts + 1 });
        continue;
      }
      if (permanentRefusal) {
        await this.state.storage.put(key, {
          ...row, status: 'unsendable', reason: 'refused_by_consumer', attempts: row.attempts + 1,
        });
        continue;
      }
      const attempts = row.attempts + 1;
      const next = progressBackoffMs(attempts);
      await this.state.storage.put(key, { ...row, attempts, nextAttemptAt: now + next });
      retryIn = retryIn === null ? next : Math.min(retryIn, next);
    }
    if (retryIn !== null) await this.state.storage.setAlarm(Date.now() + retryIn).catch(() => undefined);
  }

  /** The 10-minute canon TTL, and CANON IS THE CEILING BY CONSTRUCTION: the
   *  env knob exists so the e2e can prove expiry in milliseconds, and it can
   *  only SHORTEN the window — the verifier set it to 999999999999 and minted
   *  a challenge valid ~31 years, which would have silently weakened one of
   *  the four custody secrets on a single env typo. Clamped, that class of
   *  misconfiguration is unexpressible. Unset/unparseable → canon. */
  private readinessTtlMs(): number {
    const raw = this.env?.READINESS_TTL_MS;
    const n = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isSafeInteger(n) && n > 0 ? Math.min(n, READINESS_CHALLENGE_TTL_MS) : READINESS_CHALLENGE_TTL_MS;
  }

  /** Hash the presented code and look it up — a miss, a non-string, and a
   *  revoked code are all the SAME null (one uniform 401 upstream, never an
   *  oracle). No secret-dependent comparison exists: the hash is the key. */
  private async resolveCode(presented: unknown): Promise<SupplierCodeRecord | null> {
    if (typeof presented !== 'string' || presented === '') return null;
    const record = await this.state.storage.get<SupplierCodeRecord>(`${CODEHASH_PREFIX}${await sha256Hex(presented)}`);
    return record ?? null;
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

    /** THE FOUNDER MINTS a personal code (ops-key-gated at the router). ONE
     *  active code per supplier: re-mint atomically replaces — the previous
     *  code dies at that instant, which is also revocation-by-rotation. The
     *  plaintext appears in THIS response once and is never stored. */
    if (request.method === 'POST' && pathname === '/code/mint') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const supplierId = body?.['supplierId'];
      if (typeof supplierId !== 'string' || supplierId === '' || Object.keys(body ?? {}).length !== 1) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const code = mintSupplierCode();
      const hash = await sha256Hex(code);
      const mintedAt = new Date().toISOString();
      const previous = await this.state.storage.get<{ hash: string }>(`${SUPPLIERCODE_PREFIX}${supplierId}`);
      if (previous !== undefined) await this.state.storage.delete(`${CODEHASH_PREFIX}${previous.hash}`);
      await this.state.storage.put({
        [`${CODEHASH_PREFIX}${hash}`]: { supplierId, mintedAt } satisfies SupplierCodeRecord,
        [`${SUPPLIERCODE_PREFIX}${supplierId}`]: { hash, mintedAt },
      });
      return Response.json({ ok: true, code, supplierId, mintedAt });
    }

    /** CONSOLE-3 — THE CODE INVENTORY (ops read; the router gates it behind
     *  the founder's own credential). Answers « who currently holds a door? »
     *  — one row per active code, `{supplierId, mintedAt}` as an explicit
     *  ALLOWLIST: the stored `hash` NEVER leaves this object, the same law
     *  the /mine allowlist follows. Closes the mint footgun's blind half:
     *  before this list existed, a typo'd supplierId minted a working code
     *  for a phantom and nothing could ever show it. */
    if (request.method === 'GET' && pathname === '/codes') {
      const entries = await this.state.storage.list<{ mintedAt: string }>({ prefix: SUPPLIERCODE_PREFIX });
      const codes = [...entries.entries()]
        .map(([key, v]) => ({ supplierId: key.slice(SUPPLIERCODE_PREFIX.length), mintedAt: v.mintedAt }))
        .sort((a, b) => (a.supplierId < b.supplierId ? -1 : 1));
      return Response.json({ ok: true, codes });
    }

    /** REVOKE — the founder cuts a supplier off. Idempotent: revoking a
     *  supplier with no code answers honestly rather than erroring. */
    if (request.method === 'POST' && pathname === '/code/revoke') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const supplierId = body?.['supplierId'];
      if (typeof supplierId !== 'string' || supplierId === '' || Object.keys(body ?? {}).length !== 1) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const existing = await this.state.storage.get<{ hash: string }>(`${SUPPLIERCODE_PREFIX}${supplierId}`);
      if (existing === undefined) return Response.json({ ok: true, status: 'no_code' });
      await this.state.storage.delete([`${CODEHASH_PREFIX}${existing.hash}`, `${SUPPLIERCODE_PREFIX}${supplierId}`]);
      return Response.json({ ok: true, status: 'revoked' });
    }

    /** LISTER-POUR-1a — WHO IS BEHIND THIS CODE, and nothing else. An
     *  INTERNAL door: only the composition root calls it (the public route
     *  is `GET /offers/mine`), so the answer carries the derived identity
     *  alone — no orders, no code bytes, no mintedAt. Same uniform null as
     *  every other code lookup: a miss, a non-string and a revoked code are
     *  indistinguishable upstream. */
    if (request.method === 'POST' && pathname === '/resolve') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resolved = await this.resolveCode(body?.['code']);
      if (resolved === null) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      return Response.json({ ok: true, supplierId: resolved.supplierId });
    }

    /** THE SUPPLIER'S OWN LIST — the code is the identity; only that
     *  supplier's orders leave, each as an explicit ALLOWLIST of fields
     *  (never a record spread): the founder's relance log and the neighbours'
     *  orders are not theirs to see. */
    if (request.method === 'POST' && pathname === '/mine') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resolved = await this.resolveCode(body?.['code']);
      if (resolved === null) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      const entries = await this.state.storage.list<PaidOrderRecord>({ prefix: ORDER_PREFIX });
      const accepts = await this.state.storage.list<FulfillmentAcceptanceRecord>({ prefix: ACCEPT_PREFIX });
      const readies = await this.state.storage.list<ReadinessRecord>({ prefix: READY_PREFIX });
      const orders = [...entries.values()]
        .filter((r) => r.supplierResolved && r.supplierId === resolved.supplierId)
        .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
        .map((r) => {
          const accepted = accepts.get(`${ACCEPT_PREFIX}${r.orderId}`);
          const ready = readies.get(`${READY_PREFIX}${r.orderId}`);
          return {
            orderId: r.orderId,
            productName: r.productName,
            productVersionId: r.productVersionId,
            offerVersion: r.offerVersion,
            paymentMode: r.paymentMode,
            paidAt: r.paidAt,
            zoneTo: r.zoneTo,
            sellerBasePrice: r.sellerBasePrice,
            ...(accepted !== undefined || ready !== undefined
              ? {
                  fulfillment: {
                    ...(accepted !== undefined ? { acceptedAt: accepted.acceptedAt } : {}),
                    ...(ready !== undefined ? { readyAt: ready.confirmedAt } : {}),
                  },
                }
              : {}),
          };
        });
      return Response.json({ ok: true, orders });
    }

    /** B6.1 thin — the supplier ACCEPTS, locking the terms readiness must
     *  repeat. First-wins (a second accept answers `already_accepted`, terms
     *  untouched). THE CODE IS THE IDENTITY (1b-i): supplierId is DERIVED
     *  from the presented code, never claimed by the body. An unknown order
     *  and another supplier's order answer the SAME refusal — never an
     *  oracle for who supplies what. */
    if (request.method === 'POST' && pathname === '/accept') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resolved = await this.resolveCode(body?.['code']);
      if (resolved === null) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      const orderId = body?.['orderId'];
      if (typeof orderId !== 'string' || orderId === '' || Object.keys(body ?? {}).length !== 2) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const supplierId = resolved.supplierId;
      const order = await this.state.storage.get<PaidOrderRecord>(`${ORDER_PREFIX}${orderId}`);
      if (order === undefined || !order.supplierResolved || order.supplierId !== supplierId) {
        return Response.json({ ok: false, reason: 'not_yours_or_unknown' }, { status: 404 });
      }
      const key = `${ACCEPT_PREFIX}${orderId}`;
      const existing = await this.state.storage.get<FulfillmentAcceptanceRecord>(key);
      if (existing !== undefined) {
        // VERIFIER B1 — RE-ASSERTING THE ACT REPAIRS A LOST FACT. The first
        // cut returned here without re-entering `enqueueProgress`, while that
        // method's own catch claimed « both call sites are idempotent and
        // re-enter here ». They did not, so ONE transient storage blip during
        // enqueue lost the fact FOREVER: the supplier's act stayed durable,
        // Shop+ never learned, and her follow-up sat at « payée » with no
        // error anywhere. Re-entering is free — the outbox row is first-wins.
        await this.enqueueProgress('accepted', orderId, existing.acceptedAt);
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
      // READINESS-RETURN-1 — the fact travels home. AFTER the durable write,
      // so nothing is announced that this object has not already recorded;
      // first-wins above means a repeat accept never re-announces.
      await this.enqueueProgress('accepted', orderId, acceptance.acceptedAt);
      return Response.json({ ok: true, status: 'accepted', acceptedAt: acceptance.acceptedAt });
    }

    /** B6.2 — issue the short-TTL sellerReadinessChallenge. CSPRNG mint; a
     *  re-issue REPLACES the previous (which then refuses by mismatch). Only
     *  an ACCEPTED order may hold a challenge (B+I-06 ordering). Identity
     *  derived from the code, as everywhere on this door. */
    if (request.method === 'POST' && pathname === '/ready/challenge') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resolved = await this.resolveCode(body?.['code']);
      if (resolved === null) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      const orderId = body?.['orderId'];
      if (typeof orderId !== 'string' || orderId === '' || Object.keys(body ?? {}).length !== 2) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const order = await this.state.storage.get<PaidOrderRecord>(`${ORDER_PREFIX}${orderId}`);
      if (order === undefined || !order.supplierResolved || order.supplierId !== resolved.supplierId) {
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
     *  FulfillmentBook so the two implementations can never drift silently.
     *  ENVELOPE (1b-i): { code, confirmation } — the code authenticates and
     *  binds the supplier; the confirmation stays byte-for-byte the canon
     *  shape, strict-parsed on its own. */
    if (request.method === 'POST' && pathname === '/ready') {
      const envelope = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resolved = await this.resolveCode(envelope?.['code']);
      if (resolved === null) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      const raw: unknown = envelope?.['confirmation'];
      const parsed = PackageReadinessConfirmationSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json({ ok: false, reason: 'not_canonical_or_foreign_secret' }, { status: 400 });
      }
      const confirmation = parsed.data;
      const orderId = confirmation.orderId;

      // OWNERSHIP BEFORE ANY STATE IS REVEALED: a valid code that is not THIS
      // order's supplier learns nothing — not even that the order is already
      // ready. Same uniform refusal as everywhere on this door.
      const owned = await this.state.storage.get<PaidOrderRecord>(`${ORDER_PREFIX}${orderId}`);
      if (owned === undefined || !owned.supplierResolved || owned.supplierId !== resolved.supplierId) {
        return Response.json({ ok: false, reason: 'not_yours_or_unknown' }, { status: 404 });
      }

      const already = await this.state.storage.get<ReadinessRecord>(`${READY_PREFIX}${orderId}`);
      if (already !== undefined) {
        // A REPLAY of the confirmed act (same challenge) is absorbed — the
        // at-least-once law every write on this book follows. A DIFFERENT
        // confirmation against an already-ready order is refused: correction
        // is its own flow (reopenForCorrection), not a silent overwrite.
        if (already.confirmation.readinessChallenge === confirmation.readinessChallenge) {
          // VERIFIER B1 — same repair on the readiness side.
          await this.enqueueProgress('ready', orderId, already.confirmedAt);
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
      // READINESS-RETURN-1 — package-ready travels home, AFTER the atomic
      // batch above. The event carries the FACT and its instant only: the
      // photo and the challenge that proved it stay in this object (§5.4's
      // four secrets are not shareable, and Ten Laws #3 names readiness
      // evidence explicitly).
      await this.enqueueProgress('ready', orderId, now);
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
 * READINESS-WIRE-1b-i — forward a SUPPLIER act. The Bearer is the supplier's
 * personal code: extracted here, resolved INSIDE the object (hash lookup —
 * no secret ever compares against attacker-controlled bytes). The caller's
 * body rides inside the envelope untouched, so the object's strict
 * validation (exact key sets; the canon parse) still refuses smuggled
 * fields rather than this layer silently stripping them.
 *
 * A missing/malformed Authorization answers the SAME 401 shape an unknown
 * code answers — the door never says which part was wrong.
 */
export async function forwardSupplierAct(
  request: Request,
  env: FulfillmentEnv,
  path: '/mine' | '/accept' | '/ready/challenge' | '/ready',
): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const code = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (code === '') return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  const raw: unknown = request.method === 'GET' ? null : await request.json().catch(() => null);
  // THE BEARER ALWAYS WINS: `code` is set AFTER the spread, so a body that
  // smuggles its own `code` field cannot substitute the authenticated one —
  // the identity is the header, never a body byte.
  const envelope =
    path === '/mine'
      ? { code }
      : path === '/ready'
        ? { code, confirmation: raw }
        : { ...(raw !== null && typeof raw === 'object' ? raw : {}), code };
  const stub = env.FULFILLMENT.get(env.FULFILLMENT.idFromName(BOOK_NAME));
  return stub.fetch(`https://do${path}`, { method: 'POST', body: JSON.stringify(envelope) });
}

/** LISTER-POUR-1a — derive the supplier behind a presented code, or null.
 *  The book's `/resolve` is internal; this helper is its ONLY caller surface,
 *  so the envelope discipline (exactly `{code}`) lives here next to the
 *  forwarders that share it. Null on ANY failure — the caller answers the
 *  same 401 whether the code was absent, unknown, or revoked. */
export async function resolveSupplierIdByCode(env: FulfillmentEnv, code: string): Promise<string | null> {
  if (code === '') return null;
  const stub = env.FULFILLMENT.get(env.FULFILLMENT.idFromName(BOOK_NAME));
  const res = await stub.fetch('https://do/resolve', { method: 'POST', body: JSON.stringify({ code }) });
  if (res.status !== 200) return null;
  const body = (await res.json().catch(() => null)) as { supplierId?: unknown } | null;
  return typeof body?.supplierId === 'string' && body.supplierId !== '' ? body.supplierId : null;
}

/** CONSOLE-3 — the code inventory, through the same singleton. Auth (the
 *  founder's ops credential) is the composition root's, exactly as the
 *  orders list. */
export async function handleSupplierCodesList(env: FulfillmentEnv): Promise<Response> {
  const stub = env.FULFILLMENT.get(env.FULFILLMENT.idFromName(BOOK_NAME));
  return stub.fetch(new Request('https://do/codes'));
}

/** The founder's code administration (mint/revoke) — his ops key ran at the
 *  composition root. The body crosses VERBATIM so the object's exact-key
 *  check REFUSES a smuggled field instead of this layer silently stripping
 *  it — the refuse-don't-ignore law, which this forwarder's first cut broke
 *  (the verifier's M-K mutation stayed green precisely because the strip
 *  here had dead-lettered the check there). */
export async function forwardOpsCodeAdmin(
  request: Request,
  env: FulfillmentEnv,
  path: '/code/mint' | '/code/revoke',
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
