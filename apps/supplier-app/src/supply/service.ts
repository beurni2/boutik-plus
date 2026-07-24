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

/**
 * What the service answers on a create (offer-core's decision, mirrored).
 *
 * `preview` rides on a REAL create only (`services/offer-service/src/offer.ts`
 * `previewSellerNet` → `computeWaterfall` + `assertQuoteReconciles`, returned on
 * the `created` decision and forwarded verbatim by the worker). It is the ONLY
 * seller-net number this app will ever show: the app computes no money, and an
 * `idempotent` re-tap carries no preview — so the screen shows no figure rather
 * than a recomputed one.
 */
export interface CreateOfferOutcome {
  readonly status: 'created' | 'idempotent' | 'collision' | 'refused';
  readonly reason?: string;
  readonly preview?: { readonly sellerNetFcfa: number; readonly sellerPlatformFeeFcfa: number };
}

/**
 * Honest result — NEVER claims success on a failed call. A network failure or a
 * non-2xx is `{ok:false}` with a readable reason; nothing throws up into the UI,
 * because a failed write is pending or refused, never « publié ».
 */
/**
 * WHY THE CAUSE IS TYPED (fresh-context verifier finding, 2026-07-24): the screen
 * used to render one sentence — « voici ce que le service a répondu » — for all
 * three failures. On the two commonest ones the service answered NOTHING: the
 * network never reached it, or no id could be minted. Saying otherwise is a
 * user-facing falsehood, and on a phone in Ouagadougou the network case is the
 * likely one. The cause travels so the screen can be truthful about which
 * happened, and so `network` can be a DESIGNED offline state rather than a red
 * wall with a raw English error in it.
 */
export type FailureCause =
  /** Nothing left the phone — offline, DNS, TLS. The service was never reached. */
  | 'network'
  /** The service answered, with a non-2xx. Its status and body are the reason. */
  | 'http'
  /** The service answered 2xx with something this app cannot read as a decision. */
  | 'unreadable'
  /**
   * The PHONE could not prepare the command (no CSPRNG for the ids). Never
   * produced by this seam — the caller sets it — but it lives in the same union
   * because the screen must tell those four apart, and only `http` may claim the
   * service said anything.
   */
  | 'device';

export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly cause: FailureCause; readonly reason: string };

export interface SupplyServicePort {
  createOffer(cmd: CreateOfferInput): Promise<ServiceResult<CreateOfferOutcome>>;
}

const DECISION_STATUSES = ['created', 'idempotent', 'collision', 'refused'] as const;

/**
 * VALIDATE THE RESPONSE AT THE BOUNDARY — money crosses here (verifier finding,
 * 2026-07-24). The old code did `JSON.parse(text) as CreateOfferOutcome`, which
 * is a compile-time lie: a 2xx body of `null` made `res.value.status` a TypeError
 * that threw out of `publish()` mid-render, and a `sellerNetFcfa` of `null` or a
 * string reached `formatF` and rendered a wrong figure — or crashed — AFTER the
 * offer was already created. Zod is unavailable at runtime here (Metro law: no
 * `@platform/*` import in app code), so this is hand-written and deliberately
 * strict: an unknown status or a non-finite net is `unreadable`, never a
 * half-trusted decision.
 */
export function readOutcome(body: unknown): CreateOfferOutcome | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const status = DECISION_STATUSES.find((s) => s === b['status']);
  if (status === undefined) return null;
  const reason = typeof b['reason'] === 'string' ? { reason: b['reason'] } : {};

  const raw = b['preview'];
  if (typeof raw !== 'object' || raw === null) return { status, ...reason };
  const p = raw as Record<string, unknown>;
  const net = p['sellerNetFcfa'];
  const fee = p['sellerPlatformFeeFcfa'];
  // A malformed preview drops the FIGURE, not the decision: the offer really was
  // created, so refusing the whole response would be the bigger lie. No figure
  // beats a wrong one.
  if (!Number.isFinite(net) || !Number.isFinite(fee)) return { status, ...reason };
  return { status, ...reason, preview: { sellerNetFcfa: net as number, sellerPlatformFeeFcfa: fee as number } };
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
      // undiagnosable from a phone in Ouagadougou. NOTHING was sent.
      return { ok: false, cause: 'network', reason: `réseau: ${String((err as Error)?.message ?? err)}` };
    }
    const text = await res.text();
    if (!res.ok) {
      // Surface the SERVICE's own words (401 unauthorized · 400 malformed · a typed
      // refusal), never a generic failure — the status plus its body is the whole
      // diagnostic surface for an app-only flow.
      return { ok: false, cause: 'http', reason: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, cause: 'unreadable', reason: `réponse illisible: ${text.slice(0, 300)}` };
    }
    const outcome = readOutcome(parsed);
    if (outcome === null) {
      return { ok: false, cause: 'unreadable', reason: `réponse inattendue: ${text.slice(0, 300)}` };
    }
    return { ok: true, value: outcome };
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
