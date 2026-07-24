import type { CreateOfferInput, ServiceResult, SupplyServicePort } from './service';
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
 */
export const OFFER_VALIDITY_DAYS = 365;
const DAY_MS = 86_400_000;

/** Derive the offer window from the authoring clock. Pure; the caller supplies `now`. */
export function offerWindow(nowIso: string): { readonly effective: string; readonly expiry: string } {
  const start = Date.parse(nowIso);
  if (!Number.isFinite(start)) throw new Error(`offerWindow: unparseable clock: ${nowIso}`);
  return { effective: nowIso, expiry: new Date(start + OFFER_VALIDITY_DAYS * DAY_MS).toISOString() };
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
export function buildCreateOffer(form: AuthoringForm, ctx: AuthoringContext): ValidationResult {
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
      // assets ABSENT — the wire gets assetRefs: [] this slice
    },
  };
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
   * pinned waterfall) and is ABSENT on an idempotent re-tap, which carries no
   * preview. The screen renders nothing where it is absent — never a local
   * recomputation, never a remembered figure from an earlier attempt.
   */
  | { readonly kind: 'published'; readonly offerId: string; readonly sellerNetFcfa?: number }
  /** The service answered, and declined — its own words, never a generic message. */
  | { readonly kind: 'refused'; readonly reason: string }
  /** The call failed — the status and the service's words, or the network cause. */
  | { readonly kind: 'failed'; readonly reason: string };

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
): Promise<PublishState> {
  if (service === null) return { kind: 'not_configured' };
  const built = buildCreateOffer(form, ctx);
  if (!built.ok) return { kind: 'invalid', errors: built.errors };

  const res: ServiceResult<CreateOfferOutcome> = await service.createOffer(built.command);
  if (!res.ok) return { kind: 'failed', reason: res.reason };

  const status = res.value.status;
  if (status === 'created' || status === 'idempotent') {
    const net = res.value.preview?.sellerNetFcfa;
    return net === undefined
      ? { kind: 'published', offerId: built.command.offerId }
      : { kind: 'published', offerId: built.command.offerId, sellerNetFcfa: net };
  }
  // 'collision' | 'refused' — the service decided against it; surface its words.
  return { kind: 'refused', reason: res.value.reason ? `${status}: ${res.value.reason}` : status };
}
