import { decideAttachAssets, decideCreateOffer, OfferAvailableError, type AttachAssetsCommand, type AttachAssetsDecision, type CreateOfferCommand, type CreateOfferDecision, type OfferEntry } from '../src/offer-core.js';
import { buildSupplierList } from '../src/supplier-list.js';

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
    // THE COMPLETION PATH — attach photographs to THIS offer after create.
    // Same shape as /entry/create: parse, decide (pure), persist iff `next`.
    // A schema violation in the assets is `malformed`, exactly as create treats
    // a bad product — the boundary refuses, it never stores a partial.
    if (request.method === 'POST' && pathname === '/entry/attach-assets') {
      let cmd: AttachAssetsCommand;
      try {
        cmd = (await request.json()) as AttachAssetsCommand;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<OfferEntry>(ENTRY_KEY);
      let result: { decision: AttachAssetsDecision; next?: OfferEntry };
      try {
        result = decideAttachAssets(current, cmd);
      } catch {
        // ProductAssetsSchema refused the shape — malformed, never stored
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (result.next) await this.state.storage.put(ENTRY_KEY, result.next);
      return Response.json(result.decision);
    }
    if (request.method === 'GET' && pathname === '/entry') {
      const entry = await this.state.storage.get<OfferEntry>(ENTRY_KEY);
      if (!entry) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(entry);
    }

    // OFFER-DELETE-1 (founder feature 2026-07-27): remove this offer's entry.
    // Storage-level removal — NO canon shape changes; the answer says whether
    // anything existed so the router can report deleted vs idempotent.
    if (request.method === 'POST' && pathname === '/entry/delete') {
      const existed = (await this.state.storage.get<OfferEntry>(ENTRY_KEY)) !== undefined;
      await this.state.storage.delete(ENTRY_KEY);
      return Response.json({ existed });
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
    // OFFER-DELETE-1: drop the pv→offer pointer (kills the single read first).
    if (request.method === 'POST' && pathname === '/pointer/delete') {
      await this.state.storage.delete(POINTER_KEY);
      return Response.json({ ok: true });
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
    // OFFER-DELETE-1: remove one offer's row. Filter-and-put, dedup-safe like
    // /index/add — removing an absent row is a no-op, so replays are free.
    if (request.method === 'PUT' && pathname === '/index/remove') {
      let row: { offerId: string };
      try {
        row = (await request.json()) as { offerId: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const list = (await this.state.storage.get<IndexRow[]>(INDEX_KEY)) ?? [];
      const next = list.filter((r) => r.offerId !== row.offerId);
      if (next.length !== list.length) await this.state.storage.put(INDEX_KEY, next);
      return Response.json({ ok: true });
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
 *   GET  /offers?supplierId=…          THE SUPPLIER LIST — his own offers, scope REQUIRED (400 names it)
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
      // THE POINTER AND THE INDEX ROW LAND ON 'created' **AND** 'idempotent'
      // (device incident 2026-07-26 — a published product invisible in
      // Produits). These are TWO writes to TWO DOs with no transaction across
      // them: a router that dies between /entry/create and /index/add leaves an
      // ORPHAN — an honestly-published entry no list can ever see, because the
      // index IS the enumeration (name-addressed DOs cannot be listed). The old
      // 'created'-only condition made every retry SKIP the repair: the entry
      // already existed, so the one command that could have healed the index
      // walked past it. Both target writes are dedup-safe (/index/add checks
      // `some(offerId)`; the pointer PUT rewrites the same value), so replaying
      // them is free — every idempotent replay is now a repair.
      if (decision.status === 'created' || decision.status === 'idempotent') {
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

    // THE COMPLETION PATH at the router — POST /offers/assets, body carries the
    // offerId (matching the create route's body-addressing; the DO name IS the
    // offerId). Behind the SAME write gate as POST /offers (the composition root
    // gates every non-safe method before any dispatch).
    if (request.method === 'POST' && pathname === '/offers/assets') {
      const cmd = (await request.clone().json().catch(() => null)) as AttachAssetsCommand | null;
      if (cmd == null || typeof cmd.offerId !== 'string' || typeof cmd.commandId !== 'string' || cmd.assets == null) {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const res = await offerStub(env, cmd.offerId).fetch(
        new Request('https://do/entry/attach-assets', { method: 'POST', body: JSON.stringify(cmd) }),
      );
      // No pointer/index writes: the offer already exists; only its entry changed.
      return forward(res);
    }

    // OFFER-DELETE-1 (founder feature 2026-07-27: *"delete from produits and it
    // will be removed from shop+ as well"*). The command carries all three
    // identifiers, so the router never needs the entry to clean up — a replay
    // against an already-deleted offer still walks every removal.
    //
    // THE ORDER IS THE FAIL-SAFETY (three DOs, no transaction across them):
    //   1. pointer  — kills the single supply read first (Shop+'s per-pv wire);
    //   2. index    — kills every enumeration (admin list + supply collection);
    //   3. entry    — the record itself, LAST.
    // Die anywhere and what remains is INVISIBLE (both list routes already skip
    // rows whose entry answers 404, and a dangling pointer to a deleted entry
    // reads as the same honest not-found) — and the NEXT replay finishes the
    // job, because every removal is a no-op when its target is already gone.
    // Deleting first would instead leave a live pointer serving a product the
    // founder asked to remove.
    if (request.method === 'POST' && pathname === '/offers/delete') {
      const cmd = (await request.clone().json().catch(() => null)) as
        | { commandId?: unknown; offerId?: unknown; productVersionId?: unknown }
        | null;
      if (
        cmd == null ||
        typeof cmd.commandId !== 'string' ||
        typeof cmd.offerId !== 'string' ||
        typeof cmd.productVersionId !== 'string'
      ) {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      // GUARD: only drop the pointer if it still points at THIS offer — a pv
      // whose pointer was since rebound to another offer must keep it.
      const ptrRes = await pvStub(env, cmd.productVersionId).fetch(new Request('https://do/pointer'));
      if (ptrRes.status === 200) {
        const ptr = (await ptrRes.json()) as PvPointer;
        if (ptr.offerId === cmd.offerId) {
          await pvStub(env, cmd.productVersionId).fetch(
            new Request('https://do/pointer/delete', { method: 'POST' }),
          );
        }
      }
      await indexStub(env).fetch(
        new Request('https://do/index/remove', { method: 'PUT', body: JSON.stringify({ offerId: cmd.offerId }) }),
      );
      const delRes = await offerStub(env, cmd.offerId).fetch(
        new Request('https://do/entry/delete', { method: 'POST' }),
      );
      const { existed } = (await delRes.json()) as { existed: boolean };
      return Response.json({ status: existed ? 'deleted' : 'idempotent', offerId: cmd.offerId });
    }

    // THE SUPPLIER LIST — key-gated at the composition root (a GET, so the write
    // gate skips it). Reads the write-once index, then the LIVE fields off each
    // offer entry, so the list can never show stale state. No seller-net: money
    // stays a preview.
    //
    // **SCOPE IS REQUIRED, AND ITS ABSENCE IS A 400 THAT NAMES IT** (founder
    // ruling 2026-07-25). `IndexRow` carries no supplierId and the index DO is
    // global, so a scope-less list is EVERY supplier's offers. That is invisible
    // while one supplier exists and fails OPEN the day a second does — the same
    // class as the `/supply-projections` prefix hazard. Refusing beats returning
    // empty: an empty list is indistinguishable from « you have no products »,
    // which is the one confusion the empty states exist to prevent.
    //
    // The refusal comes BEFORE the index read: a malformed request does no work.
    if (request.method === 'GET' && pathname === '/offers') {
      const supplierId = new URL(request.url).searchParams.get('supplierId');
      if (supplierId === null || supplierId.trim() === '') {
        return Response.json({ error: 'missing_supplier_id', param: 'supplierId' }, { status: 400 });
      }
      const idxRes = await indexStub(env).fetch(new Request('https://do/index'));
      const rows = (await idxRes.json()) as IndexRow[];
      const entries: OfferEntry[] = [];
      for (const r of rows) {
        const eRes = await offerStub(env, r.offerId).fetch(new Request('https://do/entry'));
        if (eRes.status !== 200) continue; // an orphaned index row (offer gone) is honestly skipped
        entries.push((await eRes.json()) as OfferEntry);
      }
      // Filtering, the wire-order refs and the ladder-derived `hiddenReason` all
      // live in the PURE builder, so they are testable without a DO.
      return Response.json(buildSupplierList(supplierId, entries, new Date().toISOString()));
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
