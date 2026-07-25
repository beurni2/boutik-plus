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
const INDEX_KEY = 'index-list';

interface PvPointer {
  offerId: string;
}

/**
 * The directory-index row (BOUTIK-OFFER-DURABLE-1 admin list). ONLY the immutable
 * identifiers are stored — the mutable fields (available, basePrice,
 * resellerCommission, product name) are read LIVE off the offer entry at list
 * time (founder ruling), so the list can never show stale state. Write-once per
 * offer, append-only.
 */
interface IndexRow {
  offerId: string;
  productVersionId: string;
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

    // ── directory-index-instance ops (idFromName('index')) — the admin list ───
    if (request.method === 'PUT' && pathname === '/index/add') {
      let row: IndexRow;
      try {
        row = (await request.json()) as IndexRow;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const list = (await this.state.storage.get<IndexRow[]>(INDEX_KEY)) ?? [];
      if (!list.some((r) => r.offerId === row.offerId)) {
        list.push({ offerId: row.offerId, productVersionId: row.productVersionId });
        await this.state.storage.put(INDEX_KEY, list);
      }
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && pathname === '/index') {
      const list = (await this.state.storage.get<IndexRow[]>(INDEX_KEY)) ?? [];
      return Response.json(list);
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
// The single directory-index instance. ONE object, written only on offer
// creation and read only by the founder's admin list — a contention profile
// utterly unlike the per-productVersion pointers, which sit on the READ path and
// are touched by every wire pull. That difference is why the single-object choice
// (rejected for the pointer) is correct here (JOURNAL — do not "fix" one to match
// the other). A single index has a size ceiling — irrelevant at this scale, not
// infinite.
const indexStub = (env: Env): DurableObjectStub =>
  env.OFFER.get(env.OFFER.idFromName('index'));

const forward = async (res: Response, status = res.status): Promise<Response> =>
  new Response(await res.text(), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Router — the durable offer surface:
 *   POST /offers                       create (+ writes the pv pointer AND the index row on 'created')
 *   GET  /supply-entry/:productVersionId  the READ resolution — pointer → offer entry (or 404) [internal, via the store shim]
 *   GET  /offers                       THE ADMIN LIST — the index rows enriched with LIVE fields off each entry
 * The DO name IS the offerId (or 'pv:'+productVersionId, or 'index'); one
 * authority per offer by construction. POST /offers + GET /supply-entry are
 * reached through the store shim; GET /offers is the founder's key-gated admin
 * list (the gate is at the composition root — worker/index.ts — since the write
 * gate skips GETs).
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
      // write-once: the pv pointer + the immutable index row land on the REAL create only.
      if (decision.status === 'created') {
        await pvStub(env, decision.entry.product.id).fetch(
          new Request('https://do/pointer', { method: 'PUT', body: JSON.stringify({ offerId: cmd.offerId }) }),
        );
        await indexStub(env).fetch(
          new Request('https://do/index/add', {
            method: 'PUT',
            body: JSON.stringify({ offerId: cmd.offerId, productVersionId: decision.entry.product.id }),
          }),
        );
      }
      return forward(res);
    }

    // THE ADMIN LIST — key-gated at the composition root (a GET, so the write gate
    // skips it). Reads the write-once index, then the LIVE fields off each offer
    // entry (available / basePrice / resellerCommission / product name), so the
    // list never shows stale state. No seller-net: money stays a preview.
    if (request.method === 'GET' && pathname === '/offers') {
      const idxRes = await indexStub(env).fetch(new Request('https://do/index'));
      const rows = (await idxRes.json()) as IndexRow[];
      const out: {
        offerId: string;
        productVersionId: string;
        available: number;
        basePrice: number;
        resellerCommission: number;
        name: string;
      }[] = [];
      for (const r of rows) {
        const eRes = await offerStub(env, r.offerId).fetch(new Request('https://do/entry'));
        if (eRes.status !== 200) continue; // an orphaned index row (offer gone) is honestly skipped
        const entry = (await eRes.json()) as OfferEntry;
        out.push({
          offerId: r.offerId,
          productVersionId: r.productVersionId,
          available: entry.available,
          basePrice: entry.offer.basePrice,
          resellerCommission: entry.offer.resellerCommission,
          name: entry.product.name,
        });
      }
      return Response.json(out);
    }

    // DISCOVERY (SLICE B) — every supply entry, RAW. The collection analogue of
    // `/supply-entry/:pv` below, deliberately symmetric so `DurableOfferStore`
    // stays a thin client with no DO addressing of its own.
    //
    // IT JUDGES NOTHING. No eligibility filtering happens here: the refusal ladder
    // is applied above by the SAME `serveProjection` the single read uses. An
    // orphaned index row (offer gone) is honestly SKIPPED, exactly as the admin
    // list already does — a 404 for one offer must not fail the whole collection.
    if (request.method === 'GET' && pathname === '/supply-entries') {
      const idxRes = await indexStub(env).fetch(new Request('https://do/index'));
      const rows = (await idxRes.json()) as IndexRow[];
      const entries: OfferEntry[] = [];
      for (const r of rows) {
        const eRes = await offerStub(env, r.offerId).fetch(new Request('https://do/entry'));
        if (eRes.status !== 200) continue;
        entries.push((await eRes.json()) as OfferEntry);
      }
      return Response.json(entries);
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
