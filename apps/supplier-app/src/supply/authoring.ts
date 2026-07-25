import type { CreateOfferInput, FailureCause, ServiceResult, SupplyServicePort } from './service';
import type { CreateOfferOutcome } from './service';

/**
 * SUPPLIER-AUTHORING-1 part 2 — the AUTHORING CORE. Pure: form values in, a
 * command or a typed refusal out. The screen renders this; it decides nothing.
 *
 * WHAT THE FOUNDER FILLS IN, and nothing else: name · category · zone · base
 * price · reseller commission · declared stock · the derived-and-editable product
 * code. Everything else is either forced or honestly absent:
 *   · `supplyMode` = SELLER_HELD — NOT a default I chose. `PLATFORM_OWNED` is
 *     B+9-gated (PackLab), so the gate leaves exactly one lawful value. **HARD
 *     GATE: this becomes a real form choice only when B+9 opens.**
 *   · `handlingClass` — canon marks it `.optional()`; a supplier cannot honestly
 *     state one, so the field is OMITTED entirely. Omitting an optional field is
 *     not the same as inventing a value for it.
 *   · `facts` = `{}` — an empty record is legal, and no facts claimed beats facts
 *     invented.
 *   · `assets` — ABSENT this slice. The wire carries `assetRefs: []` and the
 *     product shows with no image everywhere. No placeholder, no stubbed ref.
 *   · `moderationState` — set AT AUTHORING because the founder is the only
 *     supplier. **HARD GATE: a second supplier makes this a real approval
 *     surface; none is built here, and self-approval must not survive that day.**
 */

/** What the screen collects. All strings — the form is text; parsing happens here. */
export interface AuthoringForm {
  readonly name: string;
  readonly productCode: string;
  readonly category: string;
  readonly zone: string;
  /** FCFA, as typed. Parsed and bounded below. */
  readonly basePrice: string;
  readonly resellerCommission: string;
  readonly available: string;
  /** His variants, his words (« S, M, L ») — optional; travels as the boutik-local NOTE. */
  readonly variantsNote?: string;
}

/** Identity + clock the caller supplies (never invented in here). */
export interface AuthoringContext {
  readonly supplierId: string;
  readonly productVersionId: string;
  readonly offerId: string;
  readonly commandId: string;
  readonly now: string;
  readonly effective: string;
  readonly expiry: string;
  /** Set at authoring — see the HARD GATE in the module header. */
  readonly moderationState: string;
}

export type FieldError =
  | 'name_required'
  | 'product_code_required'
  | 'category_required'
  | 'zone_required'
  | 'base_price_invalid'
  | 'base_price_below_floor'
  | 'commission_invalid'
  | 'available_invalid';

/** The category floor mirrored from services/offer-service/src/offer.ts (B4.1: ≥ 5 000). */
export const CATEGORY_FLOOR_FCFA = 5_000;

/**
 * THE OFFER WINDOW — a FOURTH field a supplier cannot honestly state, found while
 * wiring the screen (the founder ruled on three: productCode · supplyMode ·
 * handlingClass). `OfferDraft` requires `effective` and `expiry`, and they are not
 * decorative: `services/offer-service/src/projection.ts:83` refuses the read with
 * `offer_not_effective` when `nowIso < effective || nowIso > expiry`. **Past the
 * expiry the product silently stops being served to Shop+ — a disappearance with
 * no error anywhere.**
 *
 * A supplier cannot state "until when is this product for sale"; he does not know.
 * So the window is DERIVED — effective = now, expiry = now + 365 days — and the
 * screen STATES the consequence in plain words (« Cette offre reste en ligne un
 * an. ») rather than hiding it. This is not the productCode treatment (visible AND
 * editable): a date field on a phone is a real UX cost, and the founder has not
 * ruled here.
 *
 * **FLAGGED FOR THE FOUNDER — 365 IS MY NUMBER, NOT HIS.** It is the safest of the
 * available defaults (a short window fails invisibly; a long one is correctable),
 * but it is an invented figure and he must ratify or replace it. **HARD GATE: no
 * edit path exists yet, so an offer published today cannot have its window changed
 * from the app.**
 *
 * THE NEAR END BITES WITHOUT ANY YEAR PASSING (fresh-context verifier finding,
 * 2026-07-24), and it is the more dangerous half. `effective` is written from the
 * DEVICE clock and judged against the SERVER clock (`supply-endpoint.ts` calls
 * `new Date()` itself). A cheap Android whose clock runs a day fast would store an
 * `effective` a day in the FUTURE — and every Shop+ pull would refuse
 * `offer_not_effective` while this screen had already said « c'est publié ». So
 * `effective` is BACKDATED by `CLOCK_SKEW_ALLOWANCE_DAYS`. That is not a lie about
 * when the offer starts: it starts now, and the backdate only absorbs a
 * disagreement between two clocks about what "now" is. The expiry keeps its full
 * span from the authoring instant, so the backdate does not shorten the offer.
 */
export const OFFER_VALIDITY_DAYS = 365;
/** How far the device clock may run fast before a published offer would go dark. */
export const CLOCK_SKEW_ALLOWANCE_DAYS = 2;
const DAY_MS = 86_400_000;

/** Derive the offer window from the authoring clock. Pure; the caller supplies `now`. */
export function offerWindow(nowIso: string): { readonly effective: string; readonly expiry: string } {
  const start = Date.parse(nowIso);
  if (!Number.isFinite(start)) throw new Error(`offerWindow: unparseable clock: ${nowIso}`);
  return {
    effective: new Date(start - CLOCK_SKEW_ALLOWANCE_DAYS * DAY_MS).toISOString(),
    expiry: new Date(start + OFFER_VALIDITY_DAYS * DAY_MS).toISOString(),
  };
}

export type ValidationResult =
  | { readonly ok: true; readonly command: CreateOfferInput }
  | { readonly ok: false; readonly errors: readonly FieldError[] };

/** Whole non-negative FCFA only — « 10 000 », « 10000 » and « 10 000 » all parse; anything else is refused. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Validate the form and build the command. Refusals are TYPED and collected —
 * the screen shows every problem at once rather than one per attempt, because a
 * form that reveals its objections one at a time on a 3G connection is a form he
 * abandons.
 *
 * The floor is checked HERE as well as server-side, deliberately: the service is
 * the authority (it refuses below-floor with its own typed reason), but telling
 * him before a round-trip is the difference between an instant answer and a
 * network wait for a rejection.
 */
export function buildCreateOffer(
  form: AuthoringForm,
  ctx: AuthoringContext,
  assets?: import('./assets').ProductAssetsInput,
): ValidationResult {
  const errors: FieldError[] = [];
  const name = form.name.trim();
  const productCode = form.productCode.trim();
  const category = form.category.trim();
  const zone = form.zone.trim();

  if (name.length === 0) errors.push('name_required');
  if (productCode.length === 0) errors.push('product_code_required');
  if (category.length === 0) errors.push('category_required');
  if (zone.length === 0) errors.push('zone_required');

  const basePrice = parseAmount(form.basePrice);
  if (basePrice === null) errors.push('base_price_invalid');
  else if (basePrice < CATEGORY_FLOOR_FCFA) errors.push('base_price_below_floor');

  const commission = parseAmount(form.resellerCommission);
  if (commission === null) errors.push('commission_invalid');

  const available = parseAmount(form.available);
  if (available === null) errors.push('available_invalid');

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    command: {
      commandId: ctx.commandId,
      offerId: ctx.offerId,
      product: {
        id: ctx.productVersionId,
        supplierId: ctx.supplierId,
        version: 1,
        name,
        productCode,
        facts: {}, // no facts claimed — see header
        category,
        zone,
        moderationState: ctx.moderationState,
        status: 'active',
        supplyMode: 'SELLER_HELD', // the gate leaves one lawful value — see header
        // handlingClass omitted — optional in canon, unstatable by a supplier
      },
      draft: {
        productVersionId: ctx.productVersionId,
        basePrice: basePrice as number,
        resellerCommission: commission as number,
        eligibleVariants: [],
        zones: [],
        effective: ctx.effective,
        expiry: ctx.expiry,
      },
      available: available as number,
      asOf: ctx.now,
      // assets present ONLY when assembly succeeded (longest-complete-prefix);
      // otherwise absent and the wire carries the honest assetRefs: [].
      ...(assets !== undefined ? { assets } : {}),
      ...(form.variantsNote !== undefined && form.variantsNote.trim().length > 0
        ? { variantsNote: form.variantsNote.trim() }
        : {}),
    },
  };
}

/**
 * The three ids one authoring attempt carries. They are minted ONCE and REUSED
 * across retries — see `retainIdentity`.
 */
export interface OfferIdentity {
  readonly productVersionId: string;
  readonly offerId: string;
  readonly commandId: string;
}

/**
 * Mint the attempt's ids once, then hand back the SAME ones forever.
 *
 * THE DEFECT THIS CLOSES, which is the whole reason `commandId` exists: the
 * service is idempotent on `commandId` (`decideCreateOffer` — an existing entry
 * with the same command id answers `idempotent` and writes nothing). A retry that
 * minted FRESH ids would throw that away. The scenario that bites: the POST
 * reaches the service, the offer IS created, and the response is lost on the way
 * back (3G, tunnel, dead battery on the router). The screen shows `failed`, he
 * taps « Réessayer » — and with fresh ids that second request creates a SECOND
 * product. With the ids retained it answers `idempotent`, and he sees the one
 * product that exists.
 *
 * The CLOCK is deliberately NOT retained: `asOf` is the real supply-state write
 * time, so each attempt carries its own. Only identity must be stable.
 */
export function retainIdentity(current: OfferIdentity | null, mint: () => string): OfferIdentity {
  if (current !== null) return current;
  return { productVersionId: mint(), offerId: mint(), commandId: mint() };
}

/**
 * What the screen shows after the publish button. Every state is honest and
 * distinct — there is no state that looks like success without being one.
 */
export type PublishState =
  /** The seam resolved to null: the app is not configured to write anywhere. */
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'invalid'; readonly errors: readonly FieldError[] }
  | { readonly kind: 'sending' }
  /**
   * `sellerNetFcfa` is the SERVICE's own figure (`preview.sellerNetFcfa`, from the
   * pinned waterfall) and is ABSENT on an idempotent answer, which carries no
   * preview. The screen renders nothing where it is absent — never a local
   * recomputation, never a remembered figure from an earlier attempt.
   *
   * `alreadyRegistered` DISTINGUISHES the two ways this state is reached, and the
   * distinction is not cosmetic (fresh-context verifier finding, 2026-07-24).
   * Because one attempt keeps one `commandId`, a retry after an AMBIGUOUS failure
   * can answer `idempotent` — returning the offer stored on the FIRST attempt.
   * The form is still editable in that window, so he may have corrected the price
   * before retrying: the service then answers success while the live offer keeps
   * the OLD price. Rendering a plain « c'est publié » there would tell him
   * something false about his own money. The screen must say which one happened.
   */
  | {
      readonly kind: 'published';
      readonly offerId: string;
      readonly sellerNetFcfa?: number;
      /** true ⇒ this offer was stored by an EARLIER attempt; what is live is that version. */
      readonly alreadyRegistered: boolean;
    }
  /** The service answered, and declined — its own words, never a generic message. */
  | { readonly kind: 'refused'; readonly reason: string }
  /** The call failed — see `cause`: only `http` means the service answered at all. */
  | { readonly kind: 'failed'; readonly cause: FailureCause; readonly reason: string };

/**
 * Publish. `service` is `null` when `resolveSupplyService()` found no
 * configuration — and this returns `not_configured` rather than pretending.
 *
 * THE FAILURE THE SHOP-PLUS RESELLER ADAPTER HAS, refused here one layer up: its
 * demo `create` cannot fail, so an unset secret yields a success toast and writes
 * nothing anywhere, leaving no artifact to notice. **Nothing in this function can
 * return `published` without the service having answered 2xx with a real
 * decision.**
 *
 * The reason strings are passed through UNTOUCHED (the seam already puts the HTTP
 * status and the service's own body in them). On a phone with no terminal, that
 * string is the entire diagnostic anyone will have.
 */
export async function publish(
  service: SupplyServicePort | null,
  form: AuthoringForm,
  ctx: AuthoringContext,
  assets?: import('./assets').ProductAssetsInput,
): Promise<PublishState> {
  if (service === null) return { kind: 'not_configured' };
  const built = buildCreateOffer(form, ctx, assets);
  if (!built.ok) return { kind: 'invalid', errors: built.errors };

  const res: ServiceResult<CreateOfferOutcome> = await service.createOffer(built.command);
  if (!res.ok) return { kind: 'failed', cause: res.cause, reason: res.reason };

  const status = res.value.status;
  if (status === 'created' || status === 'idempotent') {
    const net = res.value.preview?.sellerNetFcfa;
    const base = {
      kind: 'published' as const,
      offerId: built.command.offerId,
      alreadyRegistered: status === 'idempotent',
    };
    return net === undefined ? base : { ...base, sellerNetFcfa: net };
  }
  // 'collision' | 'refused' — the service decided against it; surface its words.
  return { kind: 'refused', reason: res.value.reason ? `${status}: ${res.value.reason}` : status };
}
