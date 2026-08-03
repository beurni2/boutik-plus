import { CORRELATION_HEADER, correlationIdFrom, makeHealthFetch } from '@boutik/observability';
import {
  makeReadModelSchema,
  ProductVersionSchema,
  SupplyProjectionSchema,
  type ReadModel,
  type SupplyProjection,
} from '@platform/contracts';
import { buildSupplyProjection } from './projection.js';
import { attestedTier, type AttestedSuppliersEnv } from './attested-suppliers.js';
import type { OfferEntry, CreateOfferCommand } from './offer-core.js';
import type { OfferStore } from './offer-store.js';

/**
 * SW-1 — the supply READ-MODEL endpoint (founder ruling 2026-07-15: Option B,
 * HTTP pull). offer-service serves the supply projection; Shop+ pulls and
 * caches; staleness blocks agreement on the Shop+ side (SW-2). This module is a
 * thin transport over the EXISTING pure builder: `serveProjection` calls
 * `buildSupplyProjection` unchanged and hands its output through the strict
 * canon schema + an identity key-sweep on the way OUT.
 *
 * BOUTIK-OFFER-DURABLE-1: the read now sources its supply state from the
 * `OfferStore` (durable in prod, in-memory in CI) instead of a fixed registry —
 * `available` is the number the offer's author DECLARED at create, never the old
 * hardcoded literal. The OUT-guard, the refusal ladder, and the served envelope
 * are byte-unchanged.
 */

/**
 * The identity/pickup key-sweep — mirrored from the certified shop-projection
 * consumer mock (`mocks/shop-projection-consumer-mock.ts:23`). The strict
 * `SupplyProjectionSchema` already refuses any undeclared key; this is the
 * second line so a future builder change can never leak supplier identity or
 * pickup to Shop+ (B4.2 / SP-I03).
 */
const IDENTITY_LEAK = /supplier[_-]?(id|name|phone|contact)|phone|whatsapp|pickup|adresse|address/i;

/** The Workers service name — single source (re-exported from index.ts). */
export const SERVICE_NAME = 'offer-service';

export class SupplyLeakError extends Error {
  override readonly name = 'SupplyLeakError';
}

/**
 * The read-model envelope Shop+ pulls (canon v1.2.0): the canon envelope from
 * `makeReadModelSchema(SupplyProjectionSchema)` — `version` int ≥ 1 · `asOf` the
 * canon IsoTimestamp · `value` the strict supply projection.
 */
export const SupplyReadModelSchema = makeReadModelSchema(SupplyProjectionSchema);
export type SupplyReadModel = ReadModel<SupplyProjection>;

export type ServeOutcome =
  | { ok: true; status: 200; body: SupplyReadModel }
  | {
      ok: false;
      status: 404 | 409;
      body: { service: string; status: 'not_found' | 'unavailable'; reason: string };
    };

/**
 * The OUT-guard every served value passes: the strict canon schema, THEN the
 * identity key-sweep, THEN the value-side assetRef check (canon v2.0.0). Throws
 * on any undeclared key (schema), any identity/pickup key family (sweep), or any
 * assetRef VALUE that encodes the supplier id. Returns the parsed, clean
 * projection. `supplierId` is the producer's own `ProductVersion.supplierId` —
 * it is never on the wire, held here only to compare the refs against.
 */
export function assertServableValue(value: SupplyProjection, supplierId: string): SupplyProjection {
  const parsed = SupplyProjectionSchema.parse(value); // strict — throws on any extra key
  sweepIdentityKeys(parsed); // key-based teeth
  // VIDEO-PRODUIT (canon v3.4.0): `videoRef` is the same AssetRef class as
  // `assetRefs` and carries the same first-class rule — it MUST NEVER encode
  // supplier identity — so it passes through the same value-side teeth.
  assertAssetRefsIdentityFree(
    [...parsed.assetRefs, ...(parsed.videoRef !== undefined ? [parsed.videoRef] : [])],
    supplierId,
  ); // value-based teeth (canon v2.0.0; videoRef since v3.4.0)
  return parsed;
}

/**
 * The second line, on its own so its teeth are lockable in a test independent
 * of the strict schema: throws `SupplyLeakError` on any identity/pickup key
 * family. Today the strict `SupplyProjectionSchema` refuses any extra key
 * before this runs, so on a valid projection this never fires — but if the
 * schema ever loosened, this still refuses a supplier id/phone/pickup on the
 * wire (B4.2 / SP-I03).
 */
export function sweepIdentityKeys(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (IDENTITY_LEAK.test(key)) {
      throw new SupplyLeakError(`identity material refused on the wire: ${key}`);
    }
  }
}

/**
 * The VALUE-SIDE tooth the key-sweep cannot grow (SUPPLY-DISPLAY-PRODUCER-1;
 * canon states this rule on `AssetRefSchema` but delegates enforcement here).
 * `sweepIdentityKeys` tests KEY names only, so a supplier id embedded in an
 * assetRef VALUE — a storage key whose natural shape is supplier-scoped — would
 * pass untouched. Canon cannot value-enforce it: `SupplyProjection` never carries
 * `supplierId`, and `supplierId` is an unformatted `IdSchema` with no pattern to
 * match — so the check belongs to the PRODUCER, which holds
 * `ProductVersion.supplierId` and compares directly. Stated on its own so its
 * teeth are lockable in a test independent of the schema. It was built BEFORE the
 * first real ref existed — the guard preceded the data rather than chasing it —
 * and now bites on real populated arrays (BOUTIK-MEDIA-1): media keys are opaque
 * tokens precisely so a ref can never carry the supplier id this refuses.
 */
export function assertAssetRefsIdentityFree(assetRefs: readonly string[], supplierId: string): void {
  const needle = supplierId.trim();
  if (needle.length === 0) return; // no id to match — nothing to leak (defensive; IdSchema is non-empty)
  for (const ref of assetRefs) {
    if (ref.includes(needle)) {
      throw new SupplyLeakError(`asset ref encodes supplier identity: ${ref}`);
    }
  }
}

/**
 * The pure core the fetch handler wraps. Given the supply entry the store
 * resolved for a productVersionId (or `undefined`), runs the EXISTING refusal
 * ladder via `buildSupplyProjection`, and — on pass — guards the value out.
 * Every refusal is a typed HONEST STATE, never a 200-empty.
 *
 * ── THE ASOF REVERSAL (founder ruling 2026-07-24) ────────────────────────────
 * `asOf` is now the SERVE clock. It used to be `entry.asOf`, the WRITE time, and
 * a test pinned that on purpose — « staleness is real age, never fabricated
 * freshness ». That reasoning was right about a cached read and wrong about this
 * one, and the consequence was severe enough to be a blocker:
 *
 *   Shop+ blocks any projection older than `SUPPLY_PROJECTION_MAX_AGE_MS`
 *   (`shop-plus/packages/supply-consumer/src/read-model.ts:19` — 15 minutes,
 *   founder ruling 2026-07-15, = QUOTE_TTL_MS). Serving the write time meant a
 *   product authored at 10:00 served `asOf 10:00` FOREVER. At 10:16 it was stale
 *   and Shop+ refused it. **Every real product would have vanished from every
 *   vitrine fifteen minutes after it was created — silently, on the buyer's side,
 *   with every gate green in both repos.**
 *
 * WHY SERVE-TIME IS NOT FABRICATED FRESHNESS, verified rather than assumed:
 * nothing is memoised on this path. `makeSupplyFetch` calls
 * `store.getEntryByProductVersion` on EVERY request and `buildSupplyProjection`
 * recomputes from that entry each time; there is no server-side cache to go
 * stale behind. So the value genuinely IS accurate as of `nowIso`, and saying so
 * is a true statement about a live computation.
 *
 * WHAT THE CONSUMER'S BOUND NOW CATCHES — which is what it was always for: a
 * RESPONSE that sat somewhere between serve and use (an edge cache, a retry
 * queue, a resumed offline request). That is a real staleness risk and the bound
 * still detects it. What it no longer does is reject every product for the
 * crime of having been created more than a quarter of an hour ago.
 *
 * WHAT `asOf` DOES **NOT** CLAIM: that a supplier confirmed stock just now.
 * `available` is a DECLARED number that changes only on a write. `asOf` answers
 * "as of when is this envelope accurate", not "when was this last verified".
 */
export function serveProjection(
  service: string,
  entry: OfferEntry | undefined,
  nowIso: string,
  /**
   * SELLER-TIER-WIRE-1 — the founder's attestation config. OMITTED ⇒ no
   * supplier resolves to `verified` ⇒ the wire carries `provisional` ⇒ Shop+'s
   * §6.1 refuses Option B. Every caller that forgets fails CLOSED, and the two
   * serve paths (single read and the discovery collection) both take it so they
   * cannot disagree about who is verified.
   */
  attested?: AttestedSuppliersEnv,
): ServeOutcome {
  if (!entry) {
    return { ok: false, status: 404, body: { service, status: 'not_found', reason: 'unknown_product_version' } };
  }
  // Resolved from the SUPPLIER ID THE STORE ALREADY HOLDS and the deployment's
  // own configuration — never from anything on the request.
  const tier = attestedTier(entry.product.supplierId, attested);
  const built = buildSupplyProjection(entry.product, entry.offer, entry.available, nowIso, entry.assets, tier);
  if (!built.ok) {
    // the projection.ts refusal ladder surfaces verbatim — never a 200-empty
    return { ok: false, status: 409, body: { service, status: 'unavailable', reason: built.reason } };
  }
  const value = assertServableValue(built.projection, entry.product.supplierId);
  // asOf is the SERVE clock — see THE ASOF REVERSAL above `serveProjection`.
  return { ok: true, status: 200, body: { version: entry.offer.version, asOf: nowIso, value } };
}

/**
 * THE DISCOVERY COLLECTION (SLICE B) — what a reseller browses.
 *
 * SHAPE, founder-approved and relayed to the shop lane so both halves are built
 * to ONE written spec: `{ asOf, items: [ {version, asOf, value}, … ] }`, where
 * **each item is a COMPLETE canon envelope**, byte-identical in shape to what the
 * single read returns. That is the whole design argument: shop's certified
 * `consumeSupplyProjection` runs **per item, completely unchanged** — same schema,
 * same freshness bound, same identity sweep, no new parser on the consumer side.
 * The last wire between these two services disagreed on path, envelope AND
 * freshness simultaneously; a shape needing no new parsing code is worth its one
 * redundancy, and the redundancy is the feature: an item lifted out of the list is
 * still independently verifiable.
 *
 * WHY NOT ONE FLAT ENVELOPE: `version` is PER-OFFER (`entry.offer.version`), so a
 * single top-level version is not expressible. That is the shape the data has,
 * not a preference.
 *
 * THE OUTER `asOf` IS KEPT (founder ruling) so a consumer can make ONE freshness
 * decision about the whole response without iterating. It is free: every item
 * shares the serve clock by construction — see below.
 */
export interface SupplyCollection {
  readonly asOf: string;
  readonly items: readonly SupplyReadModel[];
}

/**
 * The collection core — a FILTER over `serveProjection`, never a second ladder.
 *
 * HOW THE REFUSAL LADDER IS ENFORCED, and this is the property that matters most:
 * every entry goes through the SAME `serveProjection` the single read calls, and
 * only `ok: true` outcomes are kept. So the collection cannot reach around the
 * single read — there is exactly one function that decides what is servable, and
 * this is a filter over its answers. `serveProjection` composes MORE than the
 * ladder: `buildSupplyProjection` (product active · approved · offer active ·
 * effective) **plus** `assertServableValue` (the strict canon parse and the
 * supplier-identity out-guard). All of it is inherited here, and any check added
 * to it later is inherited automatically, with no second site to remember.
 * **An unapproved product cannot become browsable.**
 *
 * FRESHNESS IS INHERITED, NOT REDEFINED. Every item is computed in ONE request
 * from ONE `nowIso`, and since the asOf reversal `asOf` IS that serve clock — so a
 * single value describes every item truthfully. The corollary is the useful half:
 * the effectivity check inside the ladder uses that SAME clock, so an offer that
 * expires between two reads simply drops out of the next one. Envelope freshness
 * and offer effectivity are keyed to one instant. A second freshness notion would
 * be inventing a distinction the code does not have.
 *
 * A REFUSED ENTRY IS OMITTED, NOT REPORTED. The typed reason stays available on
 * the single read (409 with `product_not_approved` etc.); leaking per-item
 * refusal reasons into a browse response would tell an authenticated caller which
 * product version ids exist but are unapproved — an existence signal the single
 * read's gate is designed to keep back.
 */
export function serveProjections(
  service: string,
  entries: readonly OfferEntry[],
  nowIso: string,
  attested?: AttestedSuppliersEnv,
): SupplyCollection {
  const items: SupplyReadModel[] = [];
  for (const entry of entries) {
    const outcome = serveProjection(service, entry, nowIso, attested);
    if (outcome.ok) items.push(outcome.body);
  }
  return { asOf: nowIso, items };
}

const SUPPLY_COLLECTION_ROUTE = '/supply-projections';
const SUPPLY_ROUTE = /^\/supply-projection\/([^/]+)$/;

/**
 * Compose the supply route over a `/health`-and-404 fallback. GET only; a
 * non-GET on the supply path is an honest 405 (never a silent serve). The
 * correlation id rides inbound → response header, matching the health door. The
 * supply state is read from the `OfferStore` (durable or in-memory).
 */
export function makeSupplyFetch(
  store: OfferStore,
  now: () => string = () => new Date().toISOString(),
  fallback: (request: Request) => Response = makeHealthFetch(SERVICE_NAME),
  service: string = SERVICE_NAME,
  /** SELLER-TIER-WIRE-1 — the deployment's attestations, handed down from the Worker's env. */
  attested?: AttestedSuppliersEnv,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const isCollection = url.pathname === SUPPLY_COLLECTION_ROUTE;
    const match = SUPPLY_ROUTE.exec(url.pathname);
    if (!match && !isCollection) return fallback(request);

    const correlationId = correlationIdFrom(request);
    const headers = { [CORRELATION_HEADER]: correlationId };
    if (request.method !== 'GET') {
      return Response.json(
        { service, status: 'method_not_allowed', reason: 'use_get' },
        { status: 405, headers },
      );
    }

    // DISCOVERY — every servable offer, one serve clock for all of them.
    if (isCollection) {
      const entries = await store.listEntries();
      return Response.json(serveProjections(service, entries, now(), attested), { status: 200, headers });
    }
    const productVersionId = decodeURIComponent(match![1]!);
    const entry = await store.getEntryByProductVersion(productVersionId);
    const outcome = serveProjection(service, entry, now(), attested);
    return Response.json(outcome.body, { status: outcome.status, headers });
  };
}

// Founder-as-Supplier-#001 — a NORMAL SELLER_HELD supplier account (the
// walking skeleton's manual supplier). PLATFORM_OWNED stays B+9-gated.
export const FOUNDER_001_SUPPLIER_ID = 'supplier-founder-001';
export const FOUNDER_001_PRODUCT_VERSION_ID = 'pv-founder-001';
export const FOUNDER_001_OFFER_ID = 'offer-founder-001';

/**
 * The pilot seed — founder-#001's create command, run through the REAL command
 * path (`OfferBook.create` inside `decideCreateOffer`, never hand-built). `asOf`
 * is supplied so the caller controls the supply-state write time (truthful
 * staleness). `available` is DECLARED here (5) — an honest number from the seed
 * author, not a fabricated one baked into the read path.
 */
export function founderOneCreateCommand(asOf: string): CreateOfferCommand {
  const product = ProductVersionSchema.parse({
    id: FOUNDER_001_PRODUCT_VERSION_ID,
    supplierId: FOUNDER_001_SUPPLIER_ID,
    version: 1,
    name: 'Pagne tissé Faso (démo)',
    productCode: 'FASO-001',
    facts: {},
    // FOUNDER RULING 2026-08-01 (« for 2 and 3 work on it with your
    // recommendations »): was 'textile', which Shop+'s §6.2 matrix does not
    // know, so the pilot product correctly showed the CAUTIOUS inspection row
    // and no pay-at-door. §6.2's first row is « Fashion, bags, fabrics » and a
    // pagne tissé IS a woven fabric, so this is a CLASSIFICATION under an
    // existing row, not a new taxonomy value — the identifier is the one
    // already committed in Shop+'s `inspectableCategories`. No fourth name was
    // invented and the open ⏳ category-floor Decision is untouched.
    category: 'fashion_bags_fabrics',
    zone: 'Gounghin',
    moderationState: 'approved',
    status: 'active',
    supplyMode: 'SELLER_HELD',
  });
  return {
    commandId: 'seed-founder-001',
    offerId: FOUNDER_001_OFFER_ID,
    product,
    draft: {
      productVersionId: product.id,
      basePrice: 10_000,
      resellerCommission: 1_000,
      eligibleVariants: [],
      zones: [],
      effective: '2026-07-10T00:00:00.000Z',
      expiry: '2026-12-31T00:00:00.000Z',
    },
    available: 5,
    asOf,
  };
}

/** Seed the founder-#001 offer into a store (dev/local); throws if it did not create. */
export async function seedFounderOne(store: OfferStore, asOf: string): Promise<void> {
  const decision = await store.create(founderOneCreateCommand(asOf));
  if (decision.status !== 'created' && decision.status !== 'idempotent') {
    throw new Error(`founder-#001 seed did not persist: ${decision.status}`);
  }
}
