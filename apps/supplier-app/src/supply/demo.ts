import type { AttachAssetsInput, AttachAssetsOutcome, CreateOfferInput, CreateOfferOutcome, DeleteOfferInput, DeleteOfferOutcome, ServiceResult, SupplierOfferList, SupplyServicePort } from './service.js';

/**
 * THE DEMO ADAPTER — FOR TESTS ONLY. **No app code may import this module.**
 *
 * That is not a convention, it is enforced: `scripts/gates/no-demo-in-app-graph.mjs`
 * fails the build if any file reachable from the app's entry imports it, and this
 * file carries the sentinel below so a bundle can be searched for it directly. The
 * resolver in `service.ts` has no demo branch at all, so this module is ABSENT from
 * the published bundle rather than merely unselected.
 *
 * WHY THE HARD LINE (shop-plus's scar, quoted from its JOURNAL): two demo
 * fallbacks sat bundled and masked — a hardcoded `AICHA_TRUST` trust block that
 * would appear on ANY real store, and an `orderedProducts` path that filled gaps
 * from the entire `VITRINE_SEED` catalogue. Neither was reachable while the store
 * was empty; both would have detonated the moment it was not. The lesson is that a
 * fabrication path in the bundle is a fabrication waiting for a code path, so the
 * fix is absence, not selection.
 *
 * It records what it was asked to write so a test can assert the app built the
 * right command. It fabricates NOTHING back: no invented ids, no plausible
 * products, no success that did not happen.
 */

/**
 * THE BUNDLE FINGERPRINT. Searched for inside the real Metro/Hermes artifact by
 * `scripts/gates/bundle-absence.mjs`, and MUST NOT appear in any app source file.
 *
 * It is a STRING LITERAL — data — deliberately: a minifier may rename any class
 * or function it likes, but it cannot delete a string the program still holds.
 * That is why the gate keys on this and treats `DemoSupplyService` as a
 * secondary signal only: the gate must fail on PRESENCE, not on naming fashion.
 *
 * And it is REACHABLE FROM THE CLASS (see `sentinel` below) rather than a
 * free-floating export, so it cannot be dropped as an unused binding while the
 * adapter itself is still in the graph.
 */
export const DEMO_SUPPLY_SENTINEL = 'BOUTIK_DEMO_SUPPLY_ADAPTER_MUST_NOT_SHIP';

export class DemoSupplyService implements SupplyServicePort {
  /** Ties the fingerprint to the class — see DEMO_SUPPLY_SENTINEL. */
  readonly sentinel: string = DEMO_SUPPLY_SENTINEL;

  /** Every command handed to it, in order — the assertion surface for tests. */
  readonly written: CreateOfferInput[] = [];

  constructor(private readonly answer: ServiceResult<CreateOfferOutcome> = { ok: true, value: { status: 'created' } }) {}

  async createOffer(cmd: CreateOfferInput): Promise<ServiceResult<CreateOfferOutcome>> {
    this.written.push(cmd);
    return this.answer;
  }

  /** Attach commands, recorded like creates. Fabricates nothing back. */
  readonly attached: AttachAssetsInput[] = [];
  attachAnswer: ServiceResult<AttachAssetsOutcome> = { ok: true, value: { status: 'attached' } };

  async attachAssets(cmd: AttachAssetsInput): Promise<ServiceResult<AttachAssetsOutcome>> {
    this.attached.push(cmd);
    return this.attachAnswer;
  }

  /** List calls, recorded. FABRICATES NOTHING: the default answer is an EMPTY
   * list, never invented products — a demo adapter that answered with plausible
   * offers is exactly the mock that makes integration look healthier than it is. */
  readonly listed: string[] = [];
  listAnswer: ServiceResult<SupplierOfferList> = { ok: true, value: { asOf: '1970-01-01T00:00:00.000Z', items: [] } };

  async listOffers(supplierId: string): Promise<ServiceResult<SupplierOfferList>> {
    this.listed.push(supplierId);
    return this.listAnswer;
  }

  /** Delete commands, recorded like the rest (OFFER-DELETE-1). The default
   * answer mirrors the real route's happy path; a test that needs the failure
   * or the idempotent branch sets `deleteAnswer` explicitly. */
  readonly deleted: DeleteOfferInput[] = [];
  deleteAnswer: ServiceResult<DeleteOfferOutcome> = { ok: true, value: { status: 'deleted' } };

  async deleteOffer(cmd: DeleteOfferInput): Promise<ServiceResult<DeleteOfferOutcome>> {
    this.deleted.push(cmd);
    return this.deleteAnswer;
  }
}
