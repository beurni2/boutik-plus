import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/** SCRATCH PROBE — a product LISTED FOR ANOTHER SUPPLIER, then deleted.
 *  Does it leave `/supply-projections` (what Shop+ Opportunités reads)? */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'probe-autre-'));
const WRITE = 'w-secret';
const OPS = 'ops-secret';
const READ = 'read-secret';
const MOI = 'supplier-founder-001';
const AUTRE = 'supplier-aicha-002';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
  durableObjectsPersist: persist,
  bindings: { OFFER_WRITE_SECRET: WRITE, FULFILLMENT_OPS_SECRET: OPS, SUPPLY_READ_SECRET: READ },
});
afterAll(async () => { await mf.dispose(); rmSync(persist, { recursive: true, force: true }); });

const seed = (offerId: string, pv: string, supplierId: string) => ({
  commandId: `seed-${offerId}`,
  offerId,
  product: {
    id: pv, supplierId, version: 1, name: `Produit ${supplierId}`, productCode: `P-${offerId}`,
    facts: {}, category: 'fashion_bags_fabrics', zone: 'Gounghin',
    moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: pv, basePrice: 10_000, resellerCommission: 1_000,
    eligibleVariants: [], zones: [],
    effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 5,
  asOf: '2026-08-11T08:00:00.000Z',
});

async function mint(supplierId: string) {
  const r = await mf.dispatchFetch('http://o/fulfillment/supplier-code', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ supplierId }),
  });
  expect(r.status, await r.text()).toBe(200);
}
async function collection(): Promise<string> {
  const r = await mf.dispatchFetch('http://o/supply-projections', { headers: { Authorization: `Bearer ${READ}` } });
  return r.text();
}

describe('PROBE — a product listed FOR ANOTHER supplier, then deleted', () => {
  it('walks list-for-other -> admin list -> delete -> browse', async () => {
    await mint(MOI);
    await mint(AUTRE);
    for (const [oid, pv, sup] of [['offer-moi', 'pv-moi', MOI], ['offer-autre', 'pv-autre', AUTRE]] as const) {
      const r = await mf.dispatchFetch('http://o/offers', {
        method: 'POST', headers: { 'X-Write-Key': WRITE, 'Content-Type': 'application/json' },
        body: JSON.stringify(seed(oid, pv, sup)),
      });
      expect(r.status, await r.clone().text()).toBe(200);
    }

    // The founder's Produits tab, SCOPED TO THE OTHER SUPPLIER via the chip.
    const mine = await mf.dispatchFetch(`http://o/offers?supplierId=${AUTRE}`, { headers: { 'X-Write-Key': WRITE } });
    const listed = await mine.text();
    console.log('ADMIN LIST (autre) =', listed.slice(0, 600));

    const row = (JSON.parse(listed) as { items: { offerId: string; productVersionId: string }[] }).items[0]!;
    console.log('ROW offerId =', row.offerId, 'pv =', row.productVersionId);

    const del = await mf.dispatchFetch('http://o/offers/delete', {
      method: 'POST', headers: { 'X-Write-Key': WRITE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: 'del-autre', offerId: row.offerId, productVersionId: row.productVersionId }),
    });
    console.log('DELETE =', del.status, await del.clone().text());

    const after = await collection();
    console.log('COLLECTION AFTER =', after.slice(0, 700));
    console.log('still contains pv-autre?', after.includes('pv-autre'));
  });
});
