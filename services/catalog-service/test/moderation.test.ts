import { describe, expect, it } from 'vitest';
import { ModerationDecisionSchema } from '@platform/contracts';
import { ProductCatalog } from '../src/product.js';
import type { ModerationDecisionInput } from '../src/moderation.js';

/**
 * B2.2 · A1 → canon (MODERATION ENUM: LOCAL→CANON, v0.9.6) — the moderation
 * state machine now consuming canon's `ModerationDecisionSchema`, every A1
 * invariant re-asserted against the canon shape:
 *  ① a timeout resolves to `pending`, NEVER approved (activation stays refused);
 *  ② an unapproved version CANNOT activate (B+I-01, structural);
 *  ③ a supplier can NEVER approve his own listing — the caller-binding survives
 *     the swap: decide() stamps decided_by from ctx.actor, canon's regex refuses;
 *  ④ a silent rejection is UNREPRESENTABLE (changes_requested needs ≥1 reason);
 *  ⑤ decided_by has ONE source — a wire-smuggled decided_by is IGNORED (the
 *     stamp overwrites it), so a supplier can't smuggle an operator identity.
 */

const AT = '2026-07-13T10:00:00.000Z';
const draft = {
  supplierId: 'supplier-7',
  name: 'Savon local',
  productCode: 'SAV-01',
  category: 'hygiene',
  zone: 'Bobo',
  variantAttributes: { taille: '250g' },
};
const supplierCtx = { command_id: 'c-sup', correlation_id: 'corr-1', actor: 'supplier-7' };
const opCtx = { command_id: 'c-op', correlation_id: 'corr-1', actor: 'ops:moderation:op-3' };
const fresh = () => {
  const catalog = new ProductCatalog();
  const created = catalog.create(draft, true, supplierCtx, AT);
  if (!created.ok) throw new Error('setup');
  return { catalog, versionId: created.version.id };
};

describe('moderation state machine — the happy arc (submit → decide → activate)', () => {
  it('create SUBMITS (moderationState submitted; catalog.product_submitted.v1 emitted, canon envelope)', () => {
    const { catalog, versionId } = fresh();
    expect(catalog.get(versionId)!.moderationState).toBe('submitted');
  });

  it('an operator APPROVAL → approved + media.derivative_approved.v1; THEN activation succeeds', () => {
    const { catalog, versionId } = fresh();
    const decided = catalog.decide(versionId, { decision: 'approved' }, opCtx, AT);
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.version.moderationState).toBe('approved');
    expect(decided.events.map((e) => e.name)).toEqual(['media.derivative_approved.v1']);
    expect(decided.events[0]!.envelope).toMatchObject({ command_id: 'c-op', correlation_id: 'corr-1', actor: 'ops:moderation:op-3', serverTime: AT });
    expect(catalog.activate(versionId, true).ok).toBe(true);
  });

  it('changes_requested → changes_requested + catalog.blocked.v1 + media.asset_rejected.v1, BOTH carrying the SPECIFIC reasons', () => {
    const { catalog, versionId } = fresh();
    const decided = catalog.decide(versionId, { decision: 'changes_requested', reasons: ['price_or_contact_in_image', 'not_neutral_packaging'] }, opCtx, AT);
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.version.moderationState).toBe('changes_requested');
    expect(decided.events.map((e) => e.name)).toEqual(['catalog.blocked.v1', 'media.asset_rejected.v1']);
    for (const ev of decided.events) {
      expect(ev.payload.reasons).toEqual(['price_or_contact_in_image', 'not_neutral_packaging']); // never a silent rejection
    }
  });
});

describe('moderation NEGATIVES — planted, firing', () => {
  it('① a TIMEOUT becomes PENDING and NEVER approved — activation stays refused', () => {
    const { catalog, versionId } = fresh();
    const timedOut = catalog.timeoutModeration(versionId);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.version.moderationState).toBe('pending'); // NOT approved
    expect(catalog.activate(versionId, true)).toEqual({ ok: false, reason: 'not_approved' });
    // a decided (approved) version cannot then be "timed out" back to pending
    catalog.decide(versionId, { decision: 'approved' }, opCtx, AT);
    expect(catalog.timeoutModeration(versionId)).toEqual({ ok: false, reason: 'not_under_review' });
  });

  it('② an UNAPPROVED version cannot activate — submitted / pending / changes_requested all refuse closed (B+I-01)', () => {
    for (const drive of [
      (_c: ProductCatalog, _id: string) => {}, // stays submitted
      (c: ProductCatalog, id: string) => c.timeoutModeration(id), // pending
      (c: ProductCatalog, id: string) => c.decide(id, { decision: 'changes_requested', reasons: ['facts_incomplete'] }, opCtx, AT), // changes_requested
    ]) {
      const { catalog, versionId } = fresh();
      drive(catalog, versionId);
      expect(catalog.activate(versionId, true)).toEqual({ ok: false, reason: 'not_approved' });
      expect(catalog.get(versionId)!.status).toBe('draft'); // never went active
    }
  });

  it('③ a SUPPLIER can never approve his own listing — refused end-to-end (stamp → canon parse → refusal), state untouched', () => {
    const { catalog, versionId } = fresh();
    // decide() stamps decided_by = ctx.actor ('supplier-7'); canon's ops:moderation:* regex refuses it.
    const selfApprove = catalog.decide(versionId, { decision: 'approved' }, supplierCtx, AT);
    expect(selfApprove).toEqual({ ok: false, reason: 'not_a_moderation_operator' });
    expect(catalog.get(versionId)!.moderationState).toBe('submitted'); // unchanged — not approved
    // and it is still unactivatable
    expect(catalog.activate(versionId, true)).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('④ a SILENT rejection is UNREPRESENTABLE — canon changes_requested with no reason (or empty) is refused', () => {
    // canon's ModerationDecisionSchema requires decided_by on both variants; here an OPS actor is supplied.
    expect(ModerationDecisionSchema.safeParse({ decision: 'changes_requested', decided_by: 'ops:moderation:op-3' }).success).toBe(false); // no reasons
    expect(ModerationDecisionSchema.safeParse({ decision: 'changes_requested', reasons: [], decided_by: 'ops:moderation:op-3' }).success).toBe(false); // empty
    expect(ModerationDecisionSchema.safeParse({ decision: 'changes_requested', reasons: ['authenticity_concern'], decided_by: 'ops:moderation:op-3' }).success).toBe(true);
    expect(ModerationDecisionSchema.safeParse({ decision: 'approved', decided_by: 'ops:moderation:op-3' }).success).toBe(true);
    // canon's actor guard, at the schema: a non-operator decided_by is refused outright.
    expect(ModerationDecisionSchema.safeParse({ decision: 'approved', decided_by: 'supplier-7' }).success).toBe(false);
    // @ts-expect-error — the WIRE type also forbids a reasonless changes_requested (unrepresentable at compile time)
    const _bad: ModerationDecisionInput = { decision: 'changes_requested' };
    void _bad;
  });

  it('⑤ decided_by has ONE source — a wire-smuggled operator identity is IGNORED (the stamp overwrites it)', () => {
    const { catalog, versionId } = fresh();
    // A supplier caller casts past the wire type to smuggle a genuine operator decided_by.
    // decide() stamps decided_by = ctx.actor ('supplier-7') AFTER the spread, overwriting the
    // smuggled value — so the smuggle grants nothing; canon's regex still refuses the supplier.
    const smuggled = catalog.decide(
      versionId,
      { decision: 'approved', decided_by: 'ops:moderation:op-3' } as unknown as ModerationDecisionInput,
      supplierCtx,
      AT,
    );
    expect(smuggled).toEqual({ ok: false, reason: 'not_a_moderation_operator' });
    expect(catalog.get(versionId)!.moderationState).toBe('submitted'); // unchanged — the smuggle bought nothing
  });
});
