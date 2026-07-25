import offerRouter, { OfferDO } from './offer-do.js';
import { makeSupplyFetch } from '../src/supply-endpoint.js';
import { resolveOfferStore } from '../src/offer-store.js';
import {
  keyAuthorized,
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
export { OfferDO };

interface Env extends WriteAuthEnv, SupplyReadAuthEnv {
  OFFER: DurableObjectNamespace;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // SERVICE-WRITE-AUTH — gate EVERY write at the one deployed entry, before any
    // dispatch or existence lookup (so the 401 is never an existence oracle).
    // Reads pass straight through; a Worker with no secret configured fails closed.
    const denied = await rejectUnauthorizedWrite(request, env);
    if (denied) return denied;

    const { pathname } = new URL(request.url);
    // POST /offers (the founder-seed write path) → the offer DO router.
    if (request.method === 'POST' && pathname === '/offers') return offerRouter.fetch(request, env);

    // POST /offers/assets — THE COMPLETION PATH (attach photographs to an
    // existing offer). A WRITE, so the gate above has already run; same key,
    // same 401, no separate credential.
    if (request.method === 'POST' && pathname === '/offers/assets') return offerRouter.fetch(request, env);

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
    return makeSupplyFetch(store)(request);
  },
};
