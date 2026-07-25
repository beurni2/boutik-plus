import { decideCreateOffer, type CreateOfferCommand, type CreateOfferDecision, type OfferEntry } from './offer-core.js';

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
}

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
