import { decideConsumeAvailable, decideCreateOffer, decideRestockAvailable, type CreateOfferCommand, type CreateOfferDecision, type OfferEntry } from './offer-core.js';

/**
 * OFFER STORE — the one persistence port for the offer aggregate
 * (BOUTIK-OFFER-DURABLE-1). Both substrates implement it and the read path never
 * knows which: `InMemoryOfferStore` (CI/tests/local — a Map, the old
 * `SupplyRegistry`'s role) and `DurableOfferStore` (prod — talks to the
 * per-offer Durable Object worker over `fetch`, so this module needs no workerd
 * DO types). `resolveOfferStore` picks by the environment — the DO service
 * binding present ⇒ durable, absent ⇒ in-memory — the exact env-gated swap
 * shop-plus's read-path store resolver uses. CI binds nothing, so it can never
 * reach real storage; the mock-gate is enforced by construction.
 *
 * The read path is by `productVersionId` while the DO is addressed by `offerId`
 * (founder ruling: `idFromName(offerId)`), so — exactly like shop-plus's
 * slug→id pointer (Shape C) — a per-productVersion POINTER
 * (`productVersionId → offerId`) resolves the read. Write-once: the pointer lands
 * on the real create only. In-memory mirrors it with a `Map`.
 */

export interface OfferStore {
  /** The founder-seeded write path (POST /offers), through the real OfferBook.create. */
  create(cmd: CreateOfferCommand): Promise<CreateOfferDecision>;
  /** THE READ PATH: productVersionId → the durable supply entry, or undefined = honest not-found. */
  getEntryByProductVersion(productVersionId: string): Promise<OfferEntry | undefined>;
  /**
   * DISCOVERY (SLICE B): every supply entry, unfiltered and unjudged.
   *
   * It returns RAW entries on purpose — this port does no eligibility thinking.
   * The refusal ladder (product active · approved · offer active · effective) is
   * applied ABOVE, by the same `serveProjection` the single read uses, so the
   * collection cannot reach around it. A store that pre-filtered would be a second
   * place for that judgement to live and drift.
   *
   * UNBOUNDED BY DESIGN AT THIS SCALE — see the pagination ceiling journaled with
   * this slice. One supplier, a handful of offers; a cursor would be speculative
   * flexibility today and a real obligation forever.
   */
  listEntries(): Promise<OfferEntry[]>;
  /**
   * STOCK-VENDU-1 — a provider-confirmed order consumed one unit of this
   * product. Idempotent per `orderId` (the wire is at-least-once); floors at
   * zero with the oversell flagged; `no_offer` when the product is unknown
   * here — nothing to move, and the caller must not wedge the wire on it.
   */
  consumeAvailable(productVersionId: string, orderId: string): Promise<ConsumeAvailableResult>;
  /**
   * STOCK-VENDU-1b — a refused course sent the unit home: plus one, ONLY for
   * an order that consumed here (`not_consumed` guards inflation), idempotent
   * per orderId (the refusal wire is at-least-once end to end).
   */
  restockAvailable(productVersionId: string, orderId: string): Promise<RestockAvailableResult>;
}

export type ConsumeAvailableResult =
  | { readonly status: 'consumed'; readonly available: number; readonly alreadyEmpty: boolean }
  /** `alreadyEmpty` echoes the FIRST consume's flag — the register retry that
   *  follows a crash must learn the same oversell truth the original saw. */
  | { readonly status: 'idempotent'; readonly available: number; readonly alreadyEmpty: boolean }
  | { readonly status: 'no_offer' };

export type RestockAvailableResult =
  | { readonly status: 'restocked'; readonly available: number }
  | { readonly status: 'idempotent'; readonly available: number }
  | { readonly status: 'not_consumed' }
  | { readonly status: 'no_offer' };

/** The in-memory substrate: the offer registry + the productVersionId→offerId pointer. */
export class InMemoryOfferStore implements OfferStore {
  private readonly offers = new Map<string, OfferEntry>();
  private readonly pvToOffer = new Map<string, string>();

  async create(cmd: CreateOfferCommand): Promise<CreateOfferDecision> {
    const current = this.offers.get(cmd.offerId);
    const { decision, next } = decideCreateOffer(current, cmd);
    if (next) {
      this.offers.set(next.offerId, next);
      // write-once: the pointer lands on the real create only.
      this.pvToOffer.set(next.product.id, next.offerId);
    }
    return decision;
  }

  async getEntryByProductVersion(productVersionId: string): Promise<OfferEntry | undefined> {
    const offerId = this.pvToOffer.get(productVersionId);
    return offerId === undefined ? undefined : this.offers.get(offerId);
  }

  /** Insertion order — the Map preserves it, which keeps CI output deterministic. */
  async listEntries(): Promise<OfferEntry[]> {
    return [...this.offers.values()];
  }

  /** Mirrors the DO exactly: per-(offer, order) markers make redelivery free —
   *  the consume marker REMEMBERS its oversell flag so replays echo it. */
  private readonly vendus = new Map<string, { alreadyEmpty: boolean }>();
  private readonly rendus = new Set<string>();

  async consumeAvailable(productVersionId: string, orderId: string): Promise<ConsumeAvailableResult> {
    const offerId = this.pvToOffer.get(productVersionId);
    const entry = offerId === undefined ? undefined : this.offers.get(offerId);
    if (entry === undefined) return { status: 'no_offer' };
    const marker = `${entry.offerId}:${orderId}`;
    const seen = this.vendus.get(marker);
    if (seen !== undefined) return { status: 'idempotent', available: entry.available, alreadyEmpty: seen.alreadyEmpty };
    const d = decideConsumeAvailable(entry);
    this.offers.set(entry.offerId, d.entry);
    this.vendus.set(marker, { alreadyEmpty: d.alreadyEmpty });
    return { status: 'consumed', available: d.entry.available, alreadyEmpty: d.alreadyEmpty };
  }

  async restockAvailable(productVersionId: string, orderId: string): Promise<RestockAvailableResult> {
    const offerId = this.pvToOffer.get(productVersionId);
    const entry = offerId === undefined ? undefined : this.offers.get(offerId);
    if (entry === undefined) return { status: 'no_offer' };
    const marker = `${entry.offerId}:${orderId}`;
    if (!this.vendus.has(marker)) return { status: 'not_consumed' };
    if (this.rendus.has(marker)) return { status: 'idempotent', available: entry.available };
    const next = decideRestockAvailable(entry);
    this.offers.set(entry.offerId, next);
    this.rendus.add(marker);
    return { status: 'restocked', available: next.available };
  }
}

/** A minimal fetch target — the DO worker in prod, miniflare's dispatch in CI. */
export interface OfferFetcher {
  fetch(request: Request): Promise<Response>;
}

/** The environment the store resolves from (the DO service binding, if bound). */
export interface OfferStoreEnv {
  readonly OFFER_DO?: OfferFetcher;
}

/**
 * The durable substrate: forwards each aggregate op to the per-offer DO worker
 * over `fetch`. The worker owns the DO-instance addressing (`idFromName`) and the
 * productVersion pointer; this adapter is a thin, workerd-type-free client — the
 * through-a-binding analogue of shop-plus's durable read-path store.
 */
export class DurableOfferStore implements OfferStore {
  constructor(private readonly worker: OfferFetcher) {}

  async create(cmd: CreateOfferCommand): Promise<CreateOfferDecision> {
    const res = await this.worker.fetch(
      new Request('https://offer-do/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      }),
    );
    return (await res.json()) as CreateOfferDecision;
  }

  async getEntryByProductVersion(productVersionId: string): Promise<OfferEntry | undefined> {
    const res = await this.worker.fetch(
      new Request(`https://offer-do/supply-entry/${encodeURIComponent(productVersionId)}`),
    );
    if (res.status === 404) return undefined;
    return (await res.json()) as OfferEntry;
  }

  /**
   * Every entry, via the router's `/supply-entries` — the collection analogue of
   * `/supply-entry/:pv`, symmetric on purpose so this adapter stays a thin client
   * with no DO addressing of its own. The router walks the write-once index and
   * honestly SKIPS orphaned rows (an index row whose offer is gone), exactly as
   * the admin list already does.
   */
  async listEntries(): Promise<OfferEntry[]> {
    const res = await this.worker.fetch(new Request('https://offer-do/supply-entries'));
    if (!res.ok) return [];
    return (await res.json()) as OfferEntry[];
  }

  /** The router resolves the pointer and the per-offer DO holds the marker —
   *  this stays a thin client. A 404 is the honest `no_offer`; any other
   *  non-OK THROWS so the intake can answer 5xx and the at-least-once wire
   *  repairs the decrement on its next delivery. */
  async consumeAvailable(productVersionId: string, orderId: string): Promise<ConsumeAvailableResult> {
    const res = await this.worker.fetch(
      new Request(`https://offer-do/supply-consume/${encodeURIComponent(productVersionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      }),
    );
    if (res.status === 404) return { status: 'no_offer' };
    if (!res.ok) throw new Error(`consume_unavailable:${res.status}`);
    return (await res.json()) as ConsumeAvailableResult;
  }

  /** Same thin-client discipline as consume: 404 → honest `no_offer`, any
   *  other non-OK THROWS so the intake answers 5xx and the at-least-once
   *  refusal wire repairs the restock on its next delivery. */
  async restockAvailable(productVersionId: string, orderId: string): Promise<RestockAvailableResult> {
    const res = await this.worker.fetch(
      new Request(`https://offer-do/supply-restock/${encodeURIComponent(productVersionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      }),
    );
    if (res.status === 404) return { status: 'no_offer' };
    if (!res.ok) throw new Error(`restock_unavailable:${res.status}`);
    return (await res.json()) as RestockAvailableResult;
  }
}

/**
 * Pick the store from the environment: durable iff the DO service binding is
 * present, the in-memory registry otherwise. CI/tests/local bind nothing, so they
 * can never reach real storage — the mock-gate is enforced by construction, not
 * by discipline (shop-plus's read-path store-resolver precedent).
 */
export function resolveOfferStore(env?: OfferStoreEnv): OfferStore {
  const binding = env?.OFFER_DO;
  if (binding && typeof binding.fetch === 'function') return new DurableOfferStore(binding);
  return new InMemoryOfferStore();
}
