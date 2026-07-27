import { Miniflare } from 'miniflare';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mf = new Miniflare({
  modules: true, scriptPath: '/home/user/boutik-plus/services/offer-service/dist/worker/worker.mjs',
  durableObjects: { OFFER: 'OfferDO' },
  durableObjectsPersist: mkdtempSync(join(tmpdir(), 'w3-proof-')),
  bindings: { OFFER_WRITE_SECRET: 'test-offer-write-secret-0001', SUPPLY_READ_SECRET: 'test-supply-read-secret-0002' },
  port: 8799,
});
await mf.ready;
console.log('WORKER READY on 8799');
