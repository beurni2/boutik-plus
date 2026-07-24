import { decideCreateOffer, OfferAvailableError, type CreateOfferCommand, type CreateOfferDecision, type OfferEntry } from '../src/offer-core.js';

/**
 * OfferDO — the DURABLE offer authority (BOUTIK-OFFER-DURABLE-1). One DO instance
 * per offer (addressed by `idFromName(offerId)` — founder ruling), so every
 * command for an offer serializes through workerd's input gate — the same real
 * mechanism the inventory reservation DO uses, not a shim. State survives via DO
 * storage; the decision logic is the pure core in `src/offer-core.ts`
 * (`decideCreateOffer`), byte-shared with the in-memory registry.
 *
 * PRODUCTVERSION POINTER — the read path is by `productVersionId` while the DO is
 * keyed by `offerId`, so a per-productVersion POINTER is its OWN instance of this
 * same class, addressed by `idFromName('pv:'+productVersionId)`, holding just
 * `{ offerId }` (the shop-plus slug→id Shape C, applied to pv→offer). Write-once
 * (an offer's productVersionId is fixed at create), no second binding. The router
 * resolves a read by hitting the pointer instance, then the offer instance.
 *
 * No money here beyond what the pure core already computed: the seller-net
 * `preview` rides on the create decision and is never stored in the entry.
 */

const ENTRY_KEY = 'offer-entry';
const POINTER_KEY = 'pv-pointer';

interface PvPointer {
  offerId: string;
}

export class OfferDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    // ── offer-instance ops (idFromName(offerId)) ─────────────────────────────
    if (request.method === 'POST' && pathname === '/entry/create') {
      let cmd: CreateOfferCommand;
      try {
        cmd = (await request.json()) as CreateOfferCommand;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<OfferEntry>(ENTRY_KEY);
      let result: { decision: CreateOfferDecision; next?: OfferEntry };
      try {
        result = decideCreateOffer(current, cmd);
      } catch (err) {
        if (err instanceof OfferAvailableError) return Response.json({ error: 'malformed' }, { status: 400 });
        throw err;
      }
      if (result.next) await this.state.storage.put(ENTRY_KEY, result.next);
      return Response.json(result.decision);
    }
    if (request.method === 'GET' && pathname === '/entry') {
      const entry = await this.state.storage.get<OfferEntry>(ENTRY_KEY);
      if (!entry) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(entry);
    }

    // ── pv-pointer-instance ops (idFromName('pv:'+productVersionId)) ─────────
    if (request.method === 'PUT' && pathname === '/pointer') {
      let ptr: PvPointer;
      try {
        ptr = (await request.json()) as PvPointer;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      await this.state.storage.put(POINTER_KEY, ptr);
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && pathname === '/pointer') {
      const ptr = await this.state.storage.get<PvPointer>(POINTER_KEY);
      if (!ptr) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(ptr);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

interface Env {
  OFFER: DurableObjectNamespace;
}

const offerStub = (env: Env, offerId: string): DurableObjectStub =>
  env.OFFER.get(env.OFFER.idFromName(offerId));
const pvStub = (env: Env, productVersionId: string): DurableObjectStub =>
  env.OFFER.get(env.OFFER.idFromName(`pv:${productVersionId}`));

const forward = async (res: Response, status = res.status): Promise<Response> =>
  new Response(await res.text(), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Router — the durable offer surface used by `DurableOfferStore`:
 *   POST /offers                       create (+ writes the pv pointer on 'created')
 *   GET  /supply-entry/:productVersionId  the READ resolution — pointer → offer entry (or 404)
 * The DO name IS the offerId (or 'pv:'+productVersionId); one authority per offer
 * by construction. These are INTERNAL router paths, reached only through the
 * store shim — the external surface (POST /offers write, GET /supply-projection
 * read) lives in worker/index.ts.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/offers') {
      const cmd = (await request.clone().json().catch(() => null)) as CreateOfferCommand | null;
      if (
        cmd == null ||
        typeof cmd.offerId !== 'string' ||
        cmd.product == null ||
        typeof (cmd.product as { id?: unknown }).id !== 'string'
      ) {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const res = await offerStub(env, cmd.offerId).fetch(
        new Request('https://do/entry/create', { method: 'POST', body: JSON.stringify(cmd) }),
      );
      const decision = (await res.clone().json()) as CreateOfferDecision;
      // write-once: the pv pointer lands on the REAL create only.
      if (decision.status === 'created') {
        await pvStub(env, decision.entry.product.id).fetch(
          new Request('https://do/pointer', { method: 'PUT', body: JSON.stringify({ offerId: cmd.offerId }) }),
        );
      }
      return forward(res);
    }

    const m = /^\/supply-entry\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const productVersionId = decodeURIComponent(m[1]!);
      const ptrRes = await pvStub(env, productVersionId).fetch(new Request('https://do/pointer'));
      if (ptrRes.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      const ptr = (await ptrRes.json()) as PvPointer;
      const res = await offerStub(env, ptr.offerId).fetch(new Request('https://do/entry'));
      // an orphaned pointer (offer gone) reads as the SAME honest not-found
      if (res.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      return forward(res, 200);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
