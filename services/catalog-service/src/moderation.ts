import { PlatformEventSchema, type PlatformEvent, type ModerationReasonCode } from '@platform/contracts';

/**
 * B2.2 · A1 → canon (WO MODERATION ENUM: LOCAL→CANON · @platform/contracts
 * v0.9.6) — the moderation state machine, now CONSUMING canon's decision shapes
 * instead of a local A1 mirror.
 *  - The reason codes and the decision schema live in CANON
 *    (`ModerationReasonCodeSchema` · `ModerationDecisionSchema` — "Boutik A1
 *    RATIFIED v1", canon since v0.9.6). This module NO LONGER defines them; it
 *    consumes them, so PLATFORM Desk 3 (producer) and boutik catalog-service
 *    (consumer) share ONE source (§5 identity by construction, not discipline).
 *  - The state machine (submit → decide → activate; timeout → pending) and the
 *    event builder remain app-repo work (canon owns the decision SHAPE, not the
 *    catalog's lifecycle). Governing sentences unchanged:
 *    ECOSYSTEM-MASTER-REFERENCE Part 9 / B+3: "submitted → changes-requested
 *    (with *specific* reasons) → approved …"; Building Plan B2.2: "timeout =
 *    pending"; B+I-01: an active version MUST have "an approved moderation decision".
 *
 * `draft/paused/retired` are later-lifecycle and deliberately NOT modelled here.
 */
export const MODERATION_STATES = ['submitted', 'changes_requested', 'approved', 'pending'] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

/** Only an `approved` moderation decision unlocks activation (B+I-01). */
export function isApproved(state: string): boolean {
  return state === 'approved';
}

/**
 * The WIRE / INPUT decision — the decision-verdict payload ONLY. It carries NO
 * `decided_by`: the acting operator is STAMPED by `decide()` from `ctx.actor`
 * (the single source of truth), never read from the wire. `decide()` assembles
 * the canon decision as `{ ...input, decided_by: ctx.actor }` and parses THAT
 * against canon's `ModerationDecisionSchema` — so a wire-supplied `decided_by`
 * (if a caller casts past the type) is OVERWRITTEN by ctx.actor (ignored), and
 * canon's `ops:moderation:*` regex on the stamped field becomes the total actor
 * guard (no self-moderation, closed by construction — one field, one source).
 */
export type ModerationDecisionInput =
  | { decision: 'approved' }
  | { decision: 'changes_requested'; reasons: ModerationReasonCode[] };

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
