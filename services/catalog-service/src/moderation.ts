import { z } from 'zod';
import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * B2.2 · A1 — the real moderation state machine (replaces the E1
 * `approved_e1_sandbox` stub). Governing sentences:
 *  - ECOSYSTEM-MASTER-REFERENCE Part 9 / B+3: "Moderation states: draft →
 *    submitted → changes-requested (with *specific* reasons) → approved →
 *    paused → retired."  This slice builds the submit → decision → activate arc.
 *  - Building Plan B2.2: "Moderation timeout = pending" — a timeout resolves to
 *    `pending`, and MAY NEVER resolve to approved.
 *  - Desk 3: "The queue for facts, media, and categories. Specific, actionable
 *    reasons — never a silent rejection. No self-moderation (a supplier can
 *    never approve his own listing)."
 *  - B+I-01: an active version MUST have "an approved moderation decision".
 *
 * `draft/paused/retired` are later-lifecycle (offer.paused / retirement) and are
 * deliberately NOT modelled here — not invented ahead of their slice.
 */
export const MODERATION_STATES = ['submitted', 'changes_requested', 'approved', 'pending'] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

/** Only an `approved` moderation decision unlocks activation (B+I-01). */
export function isApproved(state: string): boolean {
  return state === 'approved';
}

/**
 * "Specific, actionable reasons — never a silent rejection" (Desk 3). The spec
 * names the RULE, not a code list; each code below TRACES to an enumerated
 * requirement. ⏳ FLAGGED for founder ratification of the exact set (the spec
 * enumerates the requirements, not the reason codes — derived, not invented):
 *  - facts_incomplete                → B+I-01 (approved facts)
 *  - no_public_safe_proof            → B+I-01 (approved public-safe actual-item proof)
 *  - price_or_contact_in_image       → B+I-02 / Desk 3 (no price/contact in images)
 *  - not_neutral_packaging           → B+3 (neutral/platform packaging)
 *  - prohibited_or_unlaunched_category → M2/M4 decision (launch/prohibited categories)
 *  - authenticity_concern            → §2 (no unresolved authenticity concern)
 */
export const CHANGE_REASONS = [
  'facts_incomplete',
  'no_public_safe_proof',
  'price_or_contact_in_image',
  'not_neutral_packaging',
  'prohibited_or_unlaunched_category',
  'authenticity_concern',
] as const;
export type ChangeReason = (typeof CHANGE_REASONS)[number];

/**
 * A moderation decision. `changes_requested` CANNOT exist without ≥1 specific
 * reason — a SILENT REJECTION IS UNREPRESENTABLE (the sera bare-`failed`
 * precedent: no reasonless variant in the union, and a strict parse refuses an
 * empty reason list). The `approved` variant carries no reason, by construction.
 */
export const ModerationDecisionSchema = z
  .discriminatedUnion('verdict', [
    z.object({ verdict: z.literal('approved') }).strict(),
    z.object({ verdict: z.literal('changes_requested'), reasons: z.array(z.enum(CHANGE_REASONS)).min(1) }).strict(),
  ]);
export type ModerationDecision = z.infer<typeof ModerationDecisionSchema>;

/**
 * "No self-moderation — a supplier can never approve his own listing" (Desk 3).
 * The decision authority is Ops-only: a decision takes effect ONLY from a
 * moderation-operator actor; any other actor (a supplier, above all) is REFUSED
 * (the sera actor-provenance pattern). There is NO supplier-callable approve
 * lever anywhere in this module — the supplier surface can submit and revise, it
 * can never decide. For E4 the operator decision arrives through a
 * contract-honouring mock decision path (mock-certification standard); the live
 * sibling is the platform Ops console's Desk 3, whose half this repo never builds.
 */
export const MODERATION_OPERATOR_PREFIX = 'ops:moderation:';
export function isModerationOperator(actor: string): boolean {
  return actor.startsWith(MODERATION_OPERATOR_PREFIX);
}

/** The command context an emitted event's envelope is stamped from (§5.7). */
export interface CommandContext {
  command_id: string;
  correlation_id: string;
  actor: string;
}

/**
 * Build a canon PlatformEvent (envelope + registered name + payload). Payload
 * schemas are app-repo/E1 work (canon note); the NAME and ENVELOPE are canon and
 * validated here — we consume the shapes, never redefine them.
 */
export function moderationEvent(
  name: 'catalog.product_submitted.v1' | 'catalog.blocked.v1' | 'media.derivative_approved.v1' | 'media.asset_rejected.v1',
  ctx: CommandContext,
  aggregateVersion: number,
  payload: Record<string, unknown>,
  serverTime: string,
): PlatformEvent {
  return PlatformEventSchema.parse({
    name,
    envelope: {
      command_id: ctx.command_id,
      correlation_id: ctx.correlation_id,
      aggregateVersion,
      actor: ctx.actor,
      serverTime,
      version: 'v1',
    },
    payload,
  });
}
