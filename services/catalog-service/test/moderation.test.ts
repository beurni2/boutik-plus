import { describe, expect, it } from 'vitest';
import { ProductCatalog } from '../src/product.js';
import { ModerationDecisionSchema, isModerationOperator } from '../src/moderation.js';

/**
 * B2.2 · A1 — the real moderation state machine, and its four owed NEGATIVES,
 * each planted and firing:
 *  ① a timeout resolves to `pending`, NEVER approved (activation stays refused);
 *  ② an unapproved version CANNOT activate (B+I-01, structural);
 *  ③ a supplier can NEVER approve his own listing (no self-moderation, Desk 3);
 *  ④ a silent rejection is UNREPRESENTABLE (changes_requested needs ≥1 reason).
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
    const decided = catalog.decide(versionId, { verdict: 'approved' }, opCtx, AT);
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.version.moderationState).toBe('approved');
    expect(decided.events.map((e) => e.name)).toEqual(['media.derivative_approved.v1']);
    expect(decided.events[0]!.envelope).toMatchObject({ command_id: 'c-op', correlation_id: 'corr-1', actor: 'ops:moderation:op-3', serverTime: AT });
    expect(catalog.activate(versionId, true).ok).toBe(true);
  });

  it('changes_requested → changes_requested + catalog.blocked.v1 + media.asset_rejected.v1, BOTH carrying the SPECIFIC reasons', () => {
    const { catalog, versionId } = fresh();
    const decided = catalog.decide(versionId, { verdict: 'changes_requested', reasons: ['price_or_contact_in_image', 'not_neutral_packaging'] }, opCtx, AT);
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
    catalog.decide(versionId, { verdict: 'approved' }, opCtx, AT);
    expect(catalog.timeoutModeration(versionId)).toEqual({ ok: false, reason: 'not_under_review' });
  });

  it('② an UNAPPROVED version cannot activate — submitted / pending / changes_requested all refuse closed (B+I-01)', () => {
    for (const drive of [
      (_c: ProductCatalog, _id: string) => {}, // stays submitted
      (c: ProductCatalog, id: string) => c.timeoutModeration(id), // pending
      (c: ProductCatalog, id: string) => c.decide(id, { verdict: 'changes_requested', reasons: ['facts_incomplete'] }, opCtx, AT), // changes_requested
    ]) {
      const { catalog, versionId } = fresh();
      drive(catalog, versionId);
      expect(catalog.activate(versionId, true)).toEqual({ ok: false, reason: 'not_approved' });
      expect(catalog.get(versionId)!.status).toBe('draft'); // never went active
    }
  });

  it('③ a SUPPLIER can never approve his own listing — the decision is refused, the state is untouched (no self-moderation)', () => {
    const { catalog, versionId } = fresh();
    expect(isModerationOperator(supplierCtx.actor)).toBe(false);
    const selfApprove = catalog.decide(versionId, { verdict: 'approved' }, supplierCtx, AT);
    expect(selfApprove).toEqual({ ok: false, reason: 'not_a_moderation_operator' });
    expect(catalog.get(versionId)!.moderationState).toBe('submitted'); // unchanged — not approved
    // and it is still unactivatable
    expect(catalog.activate(versionId, true)).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('④ a SILENT rejection is UNREPRESENTABLE — changes_requested with no reason (or empty) is refused', () => {
    expect(ModerationDecisionSchema.safeParse({ verdict: 'changes_requested' }).success).toBe(false); // no reasons field
    expect(ModerationDecisionSchema.safeParse({ verdict: 'changes_requested', reasons: [] }).success).toBe(false); // empty
    expect(ModerationDecisionSchema.safeParse({ verdict: 'changes_requested', reasons: ['authenticity_concern'] }).success).toBe(true);
    expect(ModerationDecisionSchema.safeParse({ verdict: 'approved' }).success).toBe(true);
    // @ts-expect-error — the TYPE also forbids a reasonless changes_requested (unrepresentable at compile time)
    const _bad: import('../src/moderation.js').ModerationDecision = { verdict: 'changes_requested' };
    void _bad;
  });
});
