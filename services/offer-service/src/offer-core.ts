import { ProductAssetsSchema, ProductVersionSchema, type ProductAssets, type ProductVersion, type SupplierOffer } from '@platform/contracts';
import { OfferBook, type NetPreview, type OfferDraft } from './offer.js';
import { ASSET_REFS_MAX, wireAssetRefs } from './projection.js';

/**
 * OFFER DECISION CORE (BOUTIK-OFFER-DURABLE-1). The pure per-offer transition,
 * extracted so ONE decision logic serves both substrates — the in-memory
 * registry (CI) and the per-offer Durable Object (prod) — exactly as shop-plus's
 * read-path service keeps its create-decision core pure and byte-shared between
 * its in-memory registry (Map) and its Durable Object. The DO cannot import a
 * `Map`; it imports these functions and applies them to `this.state.storage`.
 *
 * MONEY STAYS A PREVIEW. The offer is minted through the REAL command path
 * (`OfferBook.create` — the SAME path `founderOneSupply` uses), which runs the
 * category floor, `previewSellerNet`, and `SupplierOfferSchema.parse`. The
 * seller net is RETURNED on the decision and is NEVER written into `OfferEntry`
 * and NEVER emitted on the wire — `previewSellerNet` stays a preview return
 * value, unchanged by this slice.
 *
 * `available` is DECLARED by the author on the create command — an honest number
 * from a real author, never the fabricated literal it replaces. It is NOT
 * hub-verified stock; no `hubVerified` concept exists in this slice or anywhere.
 */

/**
 * The serialisable per-offer durable state (one per `idFromName(offerId)`). It is
 * the exact supply state the read path already needs — the canon `ProductVersion`
 * (the refusal ladder reads its status/moderation), the canon `SupplierOffer`,
 * the declared `available`, and the truthful `asOf` — plus the DO address
 * (`offerId`) and the create command id for idempotency. No seller-net field.
 */
export interface OfferEntry {
  readonly offerId: string;
  readonly product: ProductVersion;
  readonly offer: SupplierOffer;
  /** Declared stock from the create command — never fabricated, never hub-verified. */
  readonly available: number;
  /**
   * WRITTEN-AT: when this supply state was created, **as claimed by the author's
   * device clock** (it travels on the create command).
   *
   * THE SECOND HALF OF THIS COMMENT USED TO SAY "the endpoint returns it verbatim
   * (truthful staleness)" AND THAT IS NO LONGER TRUE — corrected rather than left
   * to mislead. Since the asOf reversal (`supply-endpoint.ts`, founder ruling
   * 2026-07-24) the read-model envelope carries the SERVE clock, because serving
   * the write time made every product stale to Shop+ 15 minutes after creation.
   *
   * **THIS FIELD NOW HAS NO READER** (grep-verified across `src/` and `worker/`:
   * it is written here and read nowhere — the admin list does not expose it).
   * It is kept, not deleted, because it is the only record of when a supply state
   * was authored and it is already persisted in live durable objects; removing it
   * would change the stored shape of offers that already exist to gain nothing.
   *
   * **IT MUST NEVER BECOME A DECISION INPUT.** It is device-sourced and therefore
   * untrusted — a phone with a wrong clock writes a wrong value here. It is a
   * record, not evidence.
   */
  readonly asOf: string;
  readonly createCommandId: string;
  /**
   * The product's images (BOUTIK-MEDIA-1). Canon `ProductAssets`, carried on the
   * BOUTIK-LOCAL command — `ProductVersion` has no assets field and canon was
   * deliberately NOT changed for a linkage only this producer needs (founder
   * ruling). This IS the key→product link the opaque media keys keep out of the
   * URL: the durable offer record holds it. OPTIONAL — an offer may legitimately
   * have no images, and then the wire carries `[]`.
   */
  readonly assets?: ProductAssets;
  /** The supplier's variants note, verbatim from the create command — see `CreateOfferCommand.variantsNote`. */
  readonly variantsNote?: string;
  /** The completion path's idempotency key — set when assets were ATTACHED after create. */
  readonly attachCommandId?: string;
}

/**
 * The founder-seeded create command. `offerId` is the DO address (the shop-plus
 * `cmd.id` analogue — the read path is by `productVersionId`, so the offer id
 * must be caller-supplied, not the `OfferBook` counter's `offer-N`). `product`
 * is the full canon ProductVersion the projection needs; `draft` carries the
 * seller economics `OfferBook.create` validates; `available` is the declared
 * stock. Idempotent on `commandId`.
 */
export interface CreateOfferCommand {
  readonly commandId: string;
  readonly offerId: string;
  readonly product: ProductVersion;
  readonly draft: OfferDraft;
  readonly available: number;
  readonly asOf: string;
  /** The product's images — optional; boundary-validated and capped at create. */
  readonly assets?: ProductAssets;
  /**
   * The supplier's variants, IN HIS OWN WORDS (« S, M, L ») — BOUTIK-LOCAL, the
   * `assets` precedent exactly (founder ruling 2026-07-25). It is a NOTE, not a
   * claim: never parsed into variant ids, never mapped into canon
   * `eligibleVariants` (whose members are Variant-record IDS — records that exist
   * nowhere; minting ids pointing at nothing is the hubVerified shape), and never
   * on the wire. PROMOTION PATH, journaled: real `Variant` records need
   * catalog-service, which is a health stub today — whoever builds variants finds
   * his typed text waiting here rather than discovering it was silently dropped.
   */
  readonly variantsNote?: string;
}

export type CreateOfferDecision =
  | { readonly status: 'created'; readonly entry: OfferEntry; readonly preview: NetPreview }
  | { readonly status: 'idempotent'; readonly entry: OfferEntry }
  | { readonly status: 'collision'; readonly existing: OfferEntry }
  | {
      readonly status: 'refused';
      readonly reason: 'below_category_floor' | 'publisher_not_eligible' | 'too_many_asset_refs';
      readonly floor?: number;
      /** On `too_many_asset_refs`: the cap and what was actually presented — the caller can read why. */
      readonly max?: number;
      readonly presented?: number;
    };

export class OfferAvailableError extends Error {
  override readonly name = 'OfferAvailableError';
}

// ─── THE COMPLETION PATH (combined slice, founder ruling 2026-07-24) ─────────
// "The product saves with what got through … build the completion path in the
// same slice." A publish whose uploads failed on 3G lands with NO assets
// (`assetRefs: []`); this command lets a LATER upload attach the photographs
// without republishing — the offer, its ids and its economics are untouched.

export interface AttachAssetsCommand {
  readonly commandId: string;
  readonly offerId: string;
  readonly assets: ProductAssets;
}

export type AttachAssetsDecision =
  | { readonly status: 'attached'; readonly entry: OfferEntry }
  | { readonly status: 'idempotent'; readonly entry: OfferEntry }
  | { readonly status: 'not_found' }
  | {
      readonly status: 'refused';
      readonly reason: 'too_many_asset_refs' | 'assets_already_present';
      readonly max?: number;
      readonly presented?: number;
    };

/**
 * ATTACH — one-shot, absent → present, idempotent on ITS OWN command id
 * (`attachCommandId`, stored on the entry; a retry after a lost response answers
 * `idempotent` with the entry that exists, exactly the create-path property).
 *
 * `assets_already_present` IS A DELIBERATE REFUSAL, and the safest default on an
 * open question rather than a ruling I own: replacing existing photographs is an
 * EDIT — a different capability with its own honesty questions (which version is
 * live while it happens? what does the reseller see mid-swap?) — and no edit path
 * has been ruled anywhere. Completion completes; it does not quietly become
 * replacement. FLAGGED in the journal for the founder.
 *
 * The cap is the SAME `wireAssetRefs`/`ASSET_REFS_MAX` the create path applies —
 * one cap, not two — and the array is never truncated (a refusal names both
 * numbers; dropping a photograph silently is the demo-fallback dishonesty class).
 */
export function decideAttachAssets(
  current: OfferEntry | undefined,
  cmd: AttachAssetsCommand,
): { decision: AttachAssetsDecision; next?: OfferEntry } {
  if (!current) return { decision: { status: 'not_found' } };
  if (current.attachCommandId === cmd.commandId) {
    return { decision: { status: 'idempotent', entry: current } };
  }
  if (current.assets !== undefined) {
    return { decision: { status: 'refused', reason: 'assets_already_present' } };
  }
  const assets = ProductAssetsSchema.parse(cmd.assets); // boundary — never trust the wire
  const refCount = wireAssetRefs(assets).length;
  if (refCount > ASSET_REFS_MAX) {
    return { decision: { status: 'refused', reason: 'too_many_asset_refs', max: ASSET_REFS_MAX, presented: refCount } };
  }
  const next: OfferEntry = { ...current, assets, attachCommandId: cmd.commandId };
  return { decision: { status: 'attached', entry: next }, next };
}

/**
 * CREATE — idempotent on the create command id; a different command id can never
 * re-create an existing offer (collision, surfaced honestly). A first create runs
 * the REAL `OfferBook.create` command path (floor + preview + schema); its
 * refusals surface verbatim. On success it bundles the durable entry — the
 * seller-net `preview` rides on the decision only, never into the entry.
 *
 * `available` is validated at the boundary (integer ≥ 0, the canon
 * `SupplyProjectionSchema` constraint) so a bad number is refused at create,
 * never persisted to fail later on the wire.
 */
export function decideCreateOffer(
  current: OfferEntry | undefined,
  cmd: CreateOfferCommand,
): { decision: CreateOfferDecision; next?: OfferEntry } {
  if (current) {
    if (current.createCommandId === cmd.commandId) {
      return { decision: { status: 'idempotent', entry: current } };
    }
    return { decision: { status: 'collision', existing: current } };
  }
  if (!Number.isInteger(cmd.available) || cmd.available < 0) {
    throw new OfferAvailableError(`declared available must be an integer ≥ 0: ${JSON.stringify(cmd.available)}`);
  }
  const product = ProductVersionSchema.parse(cmd.product); // boundary validation — never trust the wire
  // Images: boundary-validate the canon shape, then CAP THE WIRE REFS HERE — at
  // the create command, never at the wire (founder ruling). The refusal is TYPED
  // and names both numbers; the array is NEVER truncated, because dropping a
  // supplier's photograph without telling them is the same class of dishonesty as
  // a silent demo fallback. `masterRef` is excluded from the count — it never travels.
  const assets = cmd.assets === undefined ? undefined : ProductAssetsSchema.parse(cmd.assets);
  const refCount = wireAssetRefs(assets).length;
  if (refCount > ASSET_REFS_MAX) {
    return {
      decision: { status: 'refused', reason: 'too_many_asset_refs', max: ASSET_REFS_MAX, presented: refCount },
    };
  }
  const outcome = new OfferBook().create(cmd.draft, true); // the REAL command path (previewSellerNet runs inside)
  if (!outcome.ok) {
    if (outcome.reason === 'below_category_floor') {
      return {
        decision: { status: 'refused', reason: 'below_category_floor', ...(outcome.floor !== undefined ? { floor: outcome.floor } : {}) },
      };
    }
    return { decision: { status: 'refused', reason: 'publisher_not_eligible' } };
  }
  // The variants note: HIS text, carried verbatim after a trim. A non-string is
  // refused by absence (the wire is JSON; a malformed field must not become a
  // stored value), and an empty/whitespace note is stored as ABSENT, not "".
  const variantsNote = typeof cmd.variantsNote === 'string' && cmd.variantsNote.trim().length > 0
    ? cmd.variantsNote.trim()
    : undefined;
  const entry: OfferEntry = {
    offerId: cmd.offerId,
    product,
    offer: outcome.offer,
    available: cmd.available,
    asOf: cmd.asOf,
    createCommandId: cmd.commandId,
    ...(assets !== undefined ? { assets } : {}), // exactOptionalPropertyTypes: absent, never `undefined`
    ...(variantsNote !== undefined ? { variantsNote } : {}),
  };
  return { decision: { status: 'created', entry, preview: outcome.preview }, next: entry };
}
