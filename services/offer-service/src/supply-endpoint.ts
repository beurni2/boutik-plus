import { CORRELATION_HEADER, correlationIdFrom, makeHealthFetch } from '@boutik/observability';
import {
  makeReadModelSchema,
  ProductVersionSchema,
  SupplyProjectionSchema,
  type ReadModel,
  type SupplyProjection,
} from '@platform/contracts';
import { buildSupplyProjection } from './projection.js';
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
 * The OUT-guard every served value passes: the strict canon schema THEN the
 * identity key-sweep. Throws on any undeclared key (schema) or any identity/
 * pickup key family (sweep). Returns the parsed, clean projection.
 */
export function assertServableValue(value: SupplyProjection): SupplyProjection {
  const parsed = SupplyProjectionSchema.parse(value); // strict — throws on any extra key
  sweepIdentityKeys(parsed);
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
 * The pure core the fetch handler wraps. Given the supply entry the store
 * resolved for a productVersionId (or `undefined`), runs the EXISTING refusal
 * ladder via `buildSupplyProjection`, and — on pass — guards the value out.
 * Every refusal is a typed HONEST STATE, never a 200-empty.
 */
export function serveProjection(service: string, entry: OfferEntry | undefined, nowIso: string): ServeOutcome {
  if (!entry) {
    return { ok: false, status: 404, body: { service, status: 'not_found', reason: 'unknown_product_version' } };
  }
  const built = buildSupplyProjection(entry.product, entry.offer, entry.available, nowIso);
  if (!built.ok) {
    // the projection.ts refusal ladder surfaces verbatim — never a 200-empty
    return { ok: false, status: 409, body: { service, status: 'unavailable', reason: built.reason } };
  }
  const value = assertServableValue(built.projection);
  return { ok: true, status: 200, body: { version: entry.offer.version, asOf: entry.asOf, value } };
}

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
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const match = SUPPLY_ROUTE.exec(url.pathname);
    if (!match) return fallback(request);

    const correlationId = correlationIdFrom(request);
    const headers = { [CORRELATION_HEADER]: correlationId };
    if (request.method !== 'GET') {
      return Response.json(
        { service, status: 'method_not_allowed', reason: 'use_get' },
        { status: 405, headers },
      );
    }
    const productVersionId = decodeURIComponent(match[1]!);
    const entry = await store.getEntryByProductVersion(productVersionId);
    const outcome = serveProjection(service, entry, now());
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
    category: 'textile',
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
