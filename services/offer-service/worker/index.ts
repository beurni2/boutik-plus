import offerRouter, { OfferDO } from './offer-do.js';
import { FulfillmentDO, forwardOpsCodeAdmin, forwardSupplierAct, handleDeliveredIntake, handleOrderConfirmedIntake, handleOrderEvidence, handleOrderRetirer, handlePaidOrdersList, handleRelance, handleSupplierCodesList, handleSupplierContactSet, handleSupplierContactsList, resolveSupplierIdByCode, supplierHasActiveCode } from './fulfillment-do.js';
import { makeSupplyFetch } from '../src/supply-endpoint.js';
import type { AttestedSuppliersEnv } from '../src/attested-suppliers.js';
import { resolveOfferStore } from '../src/offer-store.js';
import {
  keyAuthorized,
  rejectUnauthorizedBearer,
  rejectUnauthorizedSupplyRead,
  rejectUnauthorizedWrite,
  unauthorized,
  type SupplyReadAuthEnv,
  type WriteAuthEnv,
} from './auth.js';

/**
 * THE COMBINED WORKER (BOUTIK-OFFER-DURABLE-1, mirroring shop-plus's
 * one-combined-Worker deploy ruling). One deployable =
 * index.ts's service routes + the Durable Object class, under one wrangler.toml
 * and one URL. The DO input-gating still serializes per object; the only
 * composition-root indirection is the namespace→fetcher SHIM below, so the
 * tested `DurableOfferStore` stays fetch-based and untouched.
 *
 * wrangler binds this class by its exported name.
 */
export { OfferDO, FulfillmentDO };

interface Env extends WriteAuthEnv, SupplyReadAuthEnv, AttestedSuppliersEnv {
  OFFER: DurableObjectNamespace;
  /** ORDER-PAID-WIRE-1c — the paid-order book (one singleton instance). */
  FULFILLMENT: DurableObjectNamespace;
  /** The intake's shared credential (wrangler secret; Shop+ holds the same
   *  value and presents it as Bearer). UNSET ⇒ every intake is 401 — fail
   *  closed; the emitter's outbox retries until the founder sets both sides. */
  FULFILLMENT_WRITE_SECRET?: string;
  /**
   * THE OPERATOR'S OWN CREDENTIAL (verifier MINOR, closed structurally): the
   * ops read returns `supplierId`, and gating it with the intake secret would
   * hand Shop+ — which holds that secret to deliver — a key to supplier
   * identities, leaving B4.2's intent true only because nobody calls it. This
   * secret is the founder's alone; the operator-console slice authenticates
   * with it. UNSET ⇒ the ops read is 401 for everyone, including Shop+.
   */
  FULFILLMENT_OPS_SECRET?: string;
  /** READINESS-WIRE-1a TEST KNOB, never a secret: overrides the 10-minute
   *  challenge TTL so the e2e can prove expiry without waiting. Production
   *  never sets it; unset or unparseable falls to the canon value. */
  READINESS_TTL_MS?: string;
}

/**
 * The gated service-to-service reads. Both supply routes in supply-endpoint.ts:
 * the single read (`/supply-projection/:pv`) and the DISCOVERY COLLECTION
 * (`/supply-projections`).
 *
 * THE COLLECTION MUST BE GATED **MORE** CAREFULLY, NOT LESS: the single read
 * leaks one supplier's cost structure to whoever guesses one product version id;
 * the collection hands over EVERY servable offer's basePrice and
 * resellerCommission in one unauthenticated request, with no guessing at all.
 *
 * Note the plural route does NOT start with the singular prefix (the trailing
 * slash), so it needs its own match — a `startsWith('/supply-projection')`
 * without the slash would have silently covered both and been fragile. Stated
 * because getting this wrong fails OPEN.
 */
const SUPPLY_PREFIX = '/supply-projection/';
const SUPPLY_COLLECTION = '/supply-projections';
const isSupplyRoute = (pathname: string): boolean =>
  pathname.startsWith(SUPPLY_PREFIX) || pathname === SUPPLY_COLLECTION;

/**
 * BOUTIK-WEB-W1 — CORS at the one deployed entry (Boutik-Plus-Web North Star,
 * founder-ruled 2026-07-26). The supplier surface now also runs in browsers,
 * and a browser is the one client that asks permission before sending: a GET
 * carrying `X-Write-Key` is not a "simple request", so the browser sends a
 * bare OPTIONS preflight first and refuses to hand the page any response that
 * lacks `Access-Control-Allow-Origin`. Without this block the web app cannot
 * read this service at all — not as a 401, as a browser-side wall.
 *
 * `*` is deliberate and safe HERE, and only here: this worker holds no cookie
 * and no ambient credential — every write and the admin read are gated by an
 * explicit header a page must knowingly attach, and the supply routes by a
 * Bearer secret — so allowing all origins grants an attacker's page nothing it
 * would not still need the key for. THE TRIPWIRE: the moment any cookie or
 * session state enters this worker, `*` stops being safe and this comment is
 * the review flag.
 *
 * The preflight answers before the write gate ON PURPOSE: OPTIONS carries no
 * key (browsers strip custom headers from preflights), grants nothing, and
 * must succeed for the authed request behind it to even be attempted.
 */
const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // `Authorization` is here for exactly one browser client: the founder's
  // operator console (CONSOLE-1) reading GET /fulfillment/orders with his
  // Bearer key. Without it the preflight refuses the header and the board can
  // never load — not as a 401, as a browser-side wall. Granting the HEADER
  // grants nothing: the ops read still 401s anything but the founder's key.
  'Access-Control-Allow-Headers': 'Content-Type, X-Write-Key, Authorization',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    return withCors(await handle(request, env));
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
    // ═══ ORDER-PAID-WIRE-1c — THE PREPARATION INTAKE, gated by ITS OWN secret
    // BEFORE the write gate (the write key ships in the supplier app bundle;
    // this credential never leaves two Workers — they must not be
    // interchangeable, so this route never reaches the X-Write-Key gate at
    // all). Bearer-gated before any dispatch: a 401 is never an existence
    // oracle for order ids, and an unset secret refuses everything (the
    // emitter's outbox absorbs that as retry-hourly, by design).
    const { pathname: fp } = new URL(request.url);
    if (request.method === 'POST' && fp === '/fulfillment/order-confirmed') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_WRITE_SECRET);
      if (refused) return refused;
      const store = resolveOfferStore({ OFFER_DO: { fetch: (req: Request): Promise<Response> => offerRouter.fetch(req, env) } });
      return handleOrderConfirmedIntake(request, store, env);
    }
    /**
     * BOUTIK-SUIVI (founder, 2026-08-09: « when the delivery is completed …
     * the product leaves en route to that screen ») — Séra proves the
     * delivery, Shop+ receives its `delivery.validated.v1` and relays that
     * SAME canonical event here, on the SAME credential it already uses to
     * register a paid order. No new event name (canon's enum is closed), no
     * new secret, no third road: the fact travels the wire that exists.
     */
    if (request.method === 'POST' && fp === '/fulfillment/delivered') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_WRITE_SECRET);
      if (refused) return refused;
      return handleDeliveredIntake(request, env);
    }
    // The OPS READ of the book — gated by the FOUNDER'S OWN credential, never
    // the intake secret: the list carries `supplierId`, and the intake secret
    // is held by Shop+ to deliver. Two capabilities, two keys, structurally.
    if (request.method === 'GET' && fp === '/fulfillment/orders') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      // PHOTO-À-TRAITER — the board read now joins each row's product
      // photograph from the offer entry, so the store is composed here exactly
      // as the intake composes it (same binding, same router, one road).
      const store = resolveOfferStore({ OFFER_DO: { fetch: (req: Request): Promise<Response> => offerRouter.fetch(req, env) } });
      return handlePaidOrdersList(store, env);
    }
    // RB-1 — three founder-only additions on the SAME credential as the board
    // read (the Commandes tab is that board's new home): the per-order
    // readiness evidence (photo + confirmed terms — the /orders list
    // deliberately never carries it), and his own supplier contact card
    // (name + phone — founder decision 2026-08-08; no other book holds either).
    if (request.method === 'GET' && fp === '/fulfillment/order-evidence') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return handleOrderEvidence(request, env);
    }
    if (request.method === 'POST' && fp === '/fulfillment/supplier-contact') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return handleSupplierContactSet(request, env);
    }
    if (request.method === 'GET' && fp === '/fulfillment/supplier-contacts') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return handleSupplierContactsList(env);
    }
    // CONSOLE-2 — the operator's chase log. HIS credential, not Shop+'s: the
    // relance is the founder's own act (« j'ai appelé le fournisseur »), and
    // it is emphatically NOT readiness — canon readiness (B+I-06, photo +
    // sellerReadinessChallenge) gates custody and lives in fulfillment-service.
    if (request.method === 'POST' && fp === '/fulfillment/relance') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return handleRelance(request, env);
    }
    // PURGE-ESSAI (founder ruling 2026-08-10) — retire ONE test order from the
    // book. HIS credential alone, on the same door as the board read whose
    // rows it removes: the supplier's personal code must never open it (a
    // supplier erasing an order is a supplier erasing evidence), and Shop+'s
    // intake secret must never open it (a producer must not be able to
    // un-deliver what it delivered). The object bounds what a purge means;
    // this line bounds who may ask.
    if (request.method === 'POST' && fp === '/fulfillment/order/retirer') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return handleOrderRetirer(request, env);
    }
    // ═══ READINESS-WIRE-1b-i — THE PERSONAL CODE DOOR (founder ruling
    // 2026-08-02: authoring is HIS webapp alone; suppliers are fulfillment-
    // only). The supplier acts left the offers write key ENTIRELY: a
    // suppliers' bundle carrying that key would carry authoring capability.
    // The founder MINTS one personal code per supplier (his ops credential
    // gates the mint); the code is presented as Bearer and IS the identity —
    // supplierId is derived server-side, never claimed by a body. The write
    // key, the ops key, and the intake secret open none of these; the code
    // opens nothing else.
    // CONSOLE-3 — the code INVENTORY: which suppliers hold an active door,
    // since when. The founder's credential, same as every code-admin act;
    // the response carries supplierId + mintedAt only (the DO's allowlist —
    // never a hash, never a code).
    // INVENTAIRE-COMPLET (founder report 2026-08-11) — EVERY offer on the
    // platform, each tagged with its supplier, behind HIS ops credential.
    //
    // WHY IT HAD TO EXIST: his Produits tab could only ask `?supplierId=…` and
    // it sourced those ids from the ACTIVE-CODE roster, so a product whose
    // supplier no longer holds a code was invisible AND undeletable from
    // Boutik+ while `/supply-projections` went on serving it to Shop+ forever.
    // He reported it as « deleted and still on Opportunités »; it had never
    // been deletable at all.
    //
    // GATED ON `FULFILLMENT_OPS_SECRET`, never the bundled write key: this is
    // the whole platform's supply with supplier identity attached, and that is
    // the founder's read alone — the same credential and the same reasoning as
    // the paid-order book two routes above.
    if (request.method === 'GET' && fp === '/offers/inventaire') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return offerRouter.fetch(new Request('https://do/offers/inventaire'), env);
    }
    if (request.method === 'GET' && fp === '/fulfillment/supplier-codes') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return handleSupplierCodesList(env);
    }
    if (request.method === 'POST' && fp === '/fulfillment/supplier-code') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return forwardOpsCodeAdmin(request, env, '/code/mint');
    }
    if (request.method === 'POST' && fp === '/fulfillment/supplier-code/revoke') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return forwardOpsCodeAdmin(request, env, '/code/revoke');
    }
    // CODE-REVU (founder ruling 2026-08-09): reread a code already given —
    // the same founder-only door as the mint it rereads.
    if (request.method === 'POST' && fp === '/fulfillment/supplier-code/reveal') {
      const refused = await rejectUnauthorizedBearer(request, env.FULFILLMENT_OPS_SECRET);
      if (refused) return refused;
      return forwardOpsCodeAdmin(request, env, '/code/reveal');
    }
    if (request.method === 'GET' && fp === '/fulfillment/mine') {
      return forwardSupplierAct(request, env, '/mine');
    }
    // ═══ LISTER-POUR-1a — HIS OWN PRODUCTS, THROUGH HIS OWN DOOR (founder
    // order 2026-08-02: the founder lists FOR suppliers; each supplier WATCHES
    // his own, and edits nothing). The write side needs no change — POST
    // /offers has been the founder-seed path behind the write key since day
    // one, and no personal code opens it. This is the missing READ.
    //
    // WHY NOT `GET /offers?supplierId=…`: that route's own header records the
    // hazard — its scope is a FILTER the caller names, not an authorization,
    // "nil while one supplier exists, real the day there are two." This route
    // is the day there are two, so here the identity is DERIVED: the Bearer
    // personal code resolves to a supplierId inside the book (same door as
    // /fulfillment/mine), and the derived id — never a claimed one — scopes
    // the list. Missing, unknown and revoked codes answer ONE identical 401.
    //
    // A named scope is REFUSED, not stripped (the refuse-don't-ignore law):
    // silently ignoring `?supplierId=` would teach the one caller who tries
    // it that naming a neighbour works.
    if (request.method === 'GET' && fp === '/offers/mine') {
      if (new URL(request.url).searchParams.has('supplierId')) {
        return Response.json({ error: 'scope_is_derived' }, { status: 400 });
      }
      const auth = request.headers.get('Authorization') ?? '';
      const presented = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
      const supplierId = await resolveSupplierIdByCode(env, presented);
      if (supplierId === null) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      return offerRouter.fetch(new Request(`https://do/offers?supplierId=${encodeURIComponent(supplierId)}`), env);
    }
    if (request.method === 'POST' && fp === '/fulfillment/accept') {
      return forwardSupplierAct(request, env, '/accept');
    }
    if (request.method === 'POST' && fp === '/fulfillment/ready/challenge') {
      return forwardSupplierAct(request, env, '/ready/challenge');
    }
    if (request.method === 'POST' && fp === '/fulfillment/ready') {
      return forwardSupplierAct(request, env, '/ready');
    }
    // RAMASSAGE (founder, 2026-08-09: « that screen should be on the
    // supplier's console not mine ») — the pickup check, through the
    // supplier's OWN door: his personal code is the identity, the book
    // proves the order is his, and Séra answers the verdict server-side.
    if (request.method === 'POST' && fp === '/fulfillment/ramassage/verify') {
      return forwardSupplierAct(request, env, '/ramassage/verify');
    }

    // SERVICE-WRITE-AUTH — gate EVERY write at the one deployed entry, before any
    // dispatch or existence lookup (so the 401 is never an existence oracle).
    // Reads pass straight through; a Worker with no secret configured fails closed.
    const denied = await rejectUnauthorizedWrite(request, env);
    if (denied) return denied;

    const { pathname } = new URL(request.url);
    // POST /offers (the founder-seed write path) → the offer DO router.
    //
    // LISTER-POUR-1a' (founder-approved 2026-08-02): a create may only name a
    // supplierId the book KNOWS — one currently holding an active personal
    // code. Without this, one typo strands a product on a ghost supplier no
    // screen will ever show: `/offers/mine` scopes by the DERIVED id, so a
    // mis-attributed offer is invisible to the very supplier it was meant
    // for, silently. The check keys on the SAME registry CONSOLE-3 lists —
    // the founder mints first, lists second, including once for himself.
    //
    // Only the CREATE is gated: /offers/assets and /offers/delete name an
    // offerId whose attribution is already settled. A body from which no
    // supplierId can be read passes through UNJUDGED — the offer DO's own
    // validation owns malformed, and owns it entirely (one home for that
    // refusal, not two that can drift).
    if (request.method === 'POST' && pathname === '/offers') {
      const raw = await request.text();
      let named = '';
      try {
        const body = JSON.parse(raw) as { product?: { supplierId?: unknown } };
        if (typeof body?.product?.supplierId === 'string') named = body.product.supplierId;
      } catch { /* the DO's validation owns malformed */ }
      if (named !== '' && !(await supplierHasActiveCode(env, named))) {
        return Response.json({ error: 'unknown_supplier', supplierId: named }, { status: 400 });
      }
      return offerRouter.fetch(new Request(request.url, { method: 'POST', headers: request.headers, body: raw }), env);
    }

    // POST /offers/assets — THE COMPLETION PATH (attach photographs to an
    // existing offer). A WRITE, so the gate above has already run; same key,
    // same 401, no separate credential.
    if (request.method === 'POST' && pathname === '/offers/assets') return offerRouter.fetch(request, env);

    // POST /offers/delete — OFFER-DELETE-1 (founder feature 2026-07-27). A
    // WRITE like the two above: the gate has already run; same key, same 401.
    if (request.method === 'POST' && pathname === '/offers/delete') return offerRouter.fetch(request, env);


    // GET /offers (the founder's admin list) is a GET, so the write gate above
    // skipped it — key-gate it EXPLICITLY here with the same key before any
    // dispatch, then hand to the offer DO router (which enriches with live fields).
    if (request.method === 'GET' && pathname === '/offers') {
      if (!(await keyAuthorized(request, env))) return unauthorized();
      return offerRouter.fetch(request, env);
    }

    // SUPPLY-READ-AUTH — the wire's read side is a SERVICE-TO-SERVICE route and is
    // gated by `Authorization: Bearer` against SUPPLY_READ_SECRET.
    //
    // WHY IT IS GATED AT ALL: the projection carries `basePrice` and
    // `resellerCommission`, and product version ids are guessable. Open to the
    // internet, anyone who guesses one reads a supplier's cost structure.
    //
    // WHY IT IS GATED **HERE**: before `resolveOfferStore`, so an unauthorised
    // caller never reaches a Durable Object and the 401 cannot become an existence
    // oracle — a wrong id and a real id are indistinguishable without the secret.
    //
    // `/health` and unknown routes fall through UNGATED, deliberately: the health
    // door is how the deploy is verified and it carries no supply data.
    const { pathname: p } = new URL(request.url);
    if (isSupplyRoute(p)) {
      const refused = await rejectUnauthorizedSupplyRead(request, env);
      if (refused) return refused;
    }

    // GET /supply-projection/:pv (now gated, above) + health → the supply fetch
    // over the DURABLE store, resolved here against the DO namespace via the
    // fetcher shim (the analogue of shop-plus's read-path shim).
    const store = resolveOfferStore({ OFFER_DO: { fetch: (req: Request): Promise<Response> => offerRouter.fetch(req, env) } });
    return makeSupplyFetch(store, undefined, undefined, undefined, env)(request);
}
