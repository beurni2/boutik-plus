/**
 * SUPPLIER-AUTHORING-1 — the supplier app's client to the LIVE offer-service write
 * API. These are the supplier app's FIRST outbound calls: it made none before this
 * slice (grep-verified — no `fetch`, no XHR anywhere in `src/`).
 *
 * THE ONE RULE THAT SHAPES THIS FILE — UNSET RESOLVES TO NOTHING, NEVER TO DEMO.
 * `resolveSupplyService()` returns the real HTTP adapter or **null**. There is no
 * demo fallback here and no import of one: the demo adapter lives in a module this
 * file never references (`./demo.ts`, imported only by tests), so it is ABSENT
 * from the published bundle rather than merely unselected.
 *
 * WHY, and this is not theoretical — it is shop-plus's scar (its JOURNAL records
 * two demo-fallbacks that sat bundled and masked: a hardcoded `AICHA_TRUST` trust
 * block on any real store, and an `orderedProducts` path that filled gaps from the
 * entire `VITRINE_SEED` catalogue). Both were harmless while the store was empty
 * and would have detonated the moment it was not. **An unset env resolving to
 * something populated is how fabricated data reaches a real surface.** A resolver
 * that returns demo-on-unset is one missing secret away from publishing invented
 * products under the founder's name. So it returns `null`, and the UI renders an
 * honest « non configuré » state rather than plausible fiction.
 *
 * THE KEY LIMITATION (mirrors shop-plus, founder-accepted): the write key ships
 * inside the published EAS-update bundle — easier to read than decompiling a
 * binary. It stops scanners, not a determined attacker, and being SHARED it is not
 * per-author identity. HARD GATE: no supplier but the founder authors until real
 * per-supplier identity lands.
 *
 * RN-safe: NO `@platform/*` runtime import (Metro law — the contracts package is
 * Node-shaped). The command shape is mirrored locally and the SERVICE validates it
 * at its boundary (`ProductVersionSchema.parse` in offer-core), so a malformed
 * product is refused server-side, not merely un-sent.
 */

/** Must equal WRITE_KEY_HEADER in packages/service-auth. */
export const WRITE_KEY_HEADER = 'X-Write-Key';

/** Mirrors `ProductVersion` (canon §5.6) — the fields the create command carries. */
export interface ProductVersionInput {
  readonly id: string;
  readonly supplierId: string;
  readonly version: number;
  readonly name: string;
  readonly productCode: string;
  readonly facts: Readonly<Record<string, unknown>>;
  readonly category: string;
  readonly zone: string;
  readonly moderationState: string;
  readonly status: string;
  readonly supplyMode: 'SELLER_HELD' | 'PLATFORM_OWNED';
}

/** Mirrors `OfferDraft` (services/offer-service/src/offer.ts) — the seller economics. */
export interface OfferDraftInput {
  readonly productVersionId: string;
  readonly basePrice: number;
  readonly resellerCommission: number;
  readonly eligibleVariants: readonly string[];
  readonly zones: readonly string[];
  readonly effective: string;
  readonly expiry: string;
}

/**
 * Mirrors `CreateOfferCommand` (services/offer-service/src/offer-core.ts).
 * `assets` is DELIBERATELY ABSENT in this slice: authoring carries no photographs
 * yet, so the wire receives `assetRefs: []` — the honest empty, never a placeholder.
 */
export interface CreateOfferInput {
  readonly commandId: string;
  readonly offerId: string;
  readonly product: ProductVersionInput;
  readonly draft: OfferDraftInput;
  readonly available: number;
  readonly asOf: string;
}

/** What the service answers on a create (offer-core's decision, mirrored). */
export interface CreateOfferOutcome {
  readonly status: 'created' | 'idempotent' | 'collision' | 'refused';
  readonly reason?: string;
}

/**
 * Honest result — NEVER claims success on a failed call. A network failure or a
 * non-2xx is `{ok:false}` with a readable reason; nothing throws up into the UI,
 * because a failed write is pending or refused, never « publié ».
 */
export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export interface SupplyServicePort {
  createOffer(cmd: CreateOfferInput): Promise<ServiceResult<CreateOfferOutcome>>;
}

/** The REAL client. Every failure path returns a reason the device can display —
 * the founder has no terminal, so this string is the only diagnostic he will get. */
export class HttpSupplyService implements SupplyServicePort {
  constructor(private readonly base: string, private readonly writeKey: string) {}

  async createOffer(cmd: CreateOfferInput): Promise<ServiceResult<CreateOfferOutcome>> {
    const url = `${this.base.replace(/\/+$/, '')}/offers`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [WRITE_KEY_HEADER]: this.writeKey },
        body: JSON.stringify(cmd),
      });
    } catch (err) {
      // Offline / DNS / TLS — named, because « échec réseau » with no cause is
      // undiagnosable from a phone in Ouagadougou.
      return { ok: false, reason: `réseau: ${String((err as Error)?.message ?? err)}` };
    }
    const text = await res.text();
    if (!res.ok) {
      // Surface the SERVICE's own words (401 unauthorized · 400 malformed · a typed
      // refusal), never a generic failure — the status plus its body is the whole
      // diagnostic surface for an app-only flow.
      return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    try {
      return { ok: true, value: JSON.parse(text) as CreateOfferOutcome };
    } catch {
      return { ok: false, reason: `réponse illisible: ${text.slice(0, 300)}` };
    }
  }
}

/**
 * Resolve the LIVE service, or `null` when it is not configured.
 *
 * Dot access on `process.env.EXPO_PUBLIC_*` (member expression) so
 * babel-preset-expo INLINES the values at bundle time — bracket access would
 * survive to a runtime lookup that is always undefined in a release bundle.
 *
 * `null` is the honest answer and the ONLY alternative to the real client. There
 * is deliberately no demo branch: see the module header. A caller that receives
 * `null` must render « non configuré », never invent a product.
 */
export function resolveSupplyService(): SupplyServicePort | null {
  const base = process.env.EXPO_PUBLIC_OFFER_BASE;
  const key = process.env.EXPO_PUBLIC_OFFER_WRITE_KEY;
  if (base && key) return new HttpSupplyService(base, key);
  return null;
}
