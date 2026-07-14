import { CORRELATION_HEADER, correlationIdFrom, makeHealthFetch } from '@boutik/observability';
import {
  ProductVersionSchema,
  SupplyProjectionSchema,
  type ProductVersion,
  type SupplierOffer,
  type SupplyProjection,
} from '@platform/contracts';
import { OfferBook, type OfferDraft } from './offer.js';
import { buildSupplyProjection } from './projection.js';

/**
 * SW-1 — the supply READ-MODEL endpoint (founder ruling 2026-07-15: Option B,
 * HTTP pull). offer-service serves the supply projection; Shop+ pulls and
 * caches; staleness blocks agreement on the Shop+ side (SW-2). This module is
 * a thin transport over the EXISTING pure builder: `serveProjection` calls
 * `buildSupplyProjection` unchanged and hands its output through the strict
 * canon schema + an identity key-sweep on the way OUT. The offer aggregate
 * (previewSellerNet — the only math), the category floor, and offer
 * versioning are untouched; the founder-#001 offer is minted through the REAL
 * command path (`OfferBook.create`).
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

export interface SupplyEntry {
  product: ProductVersion;
  offer: SupplierOffer;
  available: number;
  /**
   * The real age of this supply state — set when the state was WRITTEN, never
   * at read. The endpoint returns it verbatim so a Shop+ stale-block computes
   * a truthful age; freshness is never fabricated.
   */
  asOf: string;
}

/** The read-model envelope Shop+ pulls (the mock's certified {version, asOf, value} shape). */
export interface SupplyReadModel {
  /** The offer version — canon: a change is a new version. */
  version: number;
  asOf: string;
  value: SupplyProjection;
}

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
  for (const key of Object.keys(parsed)) {
    if (IDENTITY_LEAK.test(key)) {
      throw new SupplyLeakError(`identity material refused on the wire: ${key}`);
    }
  }
  return parsed;
}

/** In-memory supply registry keyed by productVersionId — the pilot's single-supplier state. */
export class SupplyRegistry {
  private readonly entries = new Map<string, SupplyEntry>();

  register(entry: SupplyEntry): void {
    this.entries.set(entry.product.id, entry);
  }

  get(productVersionId: string): SupplyEntry | undefined {
    return this.entries.get(productVersionId);
  }
}

/**
 * The pure core the fetch handler wraps. Reads one supply entry, runs the
 * EXISTING refusal ladder via `buildSupplyProjection`, and — on pass — guards
 * the value out. Every refusal is a typed HONEST STATE, never a 200-empty.
 */
export function serveProjection(
  service: string,
  registry: SupplyRegistry,
  productVersionId: string,
  nowIso: string,
): ServeOutcome {
  const entry = registry.get(productVersionId);
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
 * correlation id rides inbound → response header, matching the health door.
 */
export function makeSupplyFetch(
  registry: SupplyRegistry,
  now: () => string = () => new Date().toISOString(),
  fallback: (request: Request) => Response = makeHealthFetch(SERVICE_NAME),
  service: string = SERVICE_NAME,
): (request: Request) => Response {
  return (request: Request): Response => {
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
    const outcome = serveProjection(service, registry, productVersionId, now());
    return Response.json(outcome.body, { status: outcome.status, headers });
  };
}

// Founder-as-Supplier-#001 — a NORMAL SELLER_HELD supplier account (the
// walking skeleton's manual supplier). PLATFORM_OWNED stays B+9-gated.
export const FOUNDER_001_SUPPLIER_ID = 'supplier-founder-001';
export const FOUNDER_001_PRODUCT_VERSION_ID = 'pv-founder-001';

/**
 * The pilot fixture — founder-#001's real offer, minted through the REAL
 * command path (`OfferBook.create`, never hand-built). `asOf` is supplied so
 * the caller controls the supply-state write time (truthful staleness).
 */
export function founderOneSupply(asOf: string): SupplyEntry {
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
  const draft: OfferDraft = {
    productVersionId: product.id,
    basePrice: 10_000,
    resellerCommission: 1_000,
    eligibleVariants: [],
    zones: [],
    effective: '2026-07-10T00:00:00.000Z',
    expiry: '2026-12-31T00:00:00.000Z',
  };
  const outcome = new OfferBook().create(draft, true); // the REAL command path (previewSellerNet runs inside)
  if (!outcome.ok) throw new Error(`founder-#001 offer did not publish: ${outcome.reason}`);
  return { product, offer: outcome.offer, available: 5, asOf };
}
