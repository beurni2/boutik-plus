import offerRouter, { OfferDO } from './offer-do.js';
import { makeSupplyFetch } from '../src/supply-endpoint.js';
import { resolveOfferStore } from '../src/offer-store.js';
import { rejectUnauthorizedWrite, type WriteAuthEnv } from './auth.js';

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

interface Env extends WriteAuthEnv {
  OFFER: DurableObjectNamespace;
}

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

    // GET /supply-projection/:pv (the wire's read side, open) + health → the
    // supply fetch over the DURABLE store, resolved here against the DO namespace
    // via the fetcher shim (the analogue of shop-plus's read-path shim).
    const store = resolveOfferStore({ OFFER_DO: { fetch: (req: Request): Promise<Response> => offerRouter.fetch(req, env) } });
    return makeSupplyFetch(store)(request);
  },
};
