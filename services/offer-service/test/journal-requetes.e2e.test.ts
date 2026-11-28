import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { unstable_readConfig } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ THE OFFER SERVICE KEEPS A LOG — and never a person's data in it ═══
 *
 * One JSON line per request: which route (its template, never the raw path),
 * which method, the answer's status and how long it took. One JSON line per
 * delivery the outbox could not make. Nothing else: no id of a supplier or an
 * offer, no media key, no phone, no name, no code, no key, no body, no query,
 * no address, no amount.
 *
 * Driven against the REAL bundle (`dist/worker/worker.mjs`, built by
 * `pretest`) on workerd under the deployed compatibility date. The lines are
 * what workerd itself printed, caught by Miniflare's log handler — never a
 * value the test computed. The Shop+ stand-ins answer exactly as Shop+'s
 * progress door does: 401 `{"error":"unauthorized"}` to a key it does not hold,
 * before reading anything; 400 `{"ok":false,"reason":"event_not_canonical"}` to
 * an event its build does not take (as an older Shop+ answers one). One order
 * instead meets a Shop+ that is down for a while: 503 `{"ok":false}`, the
 * platform's answer while the far side is unavailable, naming no reason (the
 * retryable shape `readiness-return.e2e.test.ts` uses).
 */

const LIMITE = 30_000;
const SCRIPT = 'dist/worker/worker.mjs';
const COMPAT = ((): string => {
  const toml = readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8');
  const found = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(toml);
  if (found === null) throw new Error('wrangler.toml has no compatibility_date');
  return found[1]!;
})();

// Every key is a sentinel too: none may ever reach a line.
const OPS = 'sentinelle-cle-fondateur-7f3a';
const FULFILL = 'sentinelle-cle-intake-91c2';
const SUPPLY_READ = 'sentinelle-cle-lecture-4b8e';
const PROGRESS = 'sentinelle-cle-progres-2d6f';
const SHOP_ATTEND = 'une-autre-cle-que-shop-tient';

const T0 = '2026-11-02T08:00:00.000Z';
/** An order id in the shape Shop+ mints: the only shape a line may carry. */
const ORDER = 'ord-quote-5e471e11-0000-4000-8000-00000000b901';
/** Confirmed « prêt »: its Séra leg has no door configured here. */
const ORDER_PRET = 'ord-quote-5e471e11-0000-4000-8000-00000000b902';
/** On the second Worker, whose Shop+ refuses the event for good. */
const ORDER_PARQUE = 'ord-quote-5e471e11-0000-4000-8000-00000000b903';
/** On the second Worker too, whose Shop+ is down for a while for this order. */
const ORDER_REPRISE = 'ord-quote-5e471e11-0000-4000-8000-00000000b904';
const PV_REPRISE = 'pv-journal-002';
const SUPPLIER = 'fournisseur-journal-001';
const PV = 'pv-journal-001';
/** The readiness photo: a media key, so a sentinel too. */
const PHOTO_PRET = 'media/3c9e1f20-5a6b-4c7d-8e9f-a0b1c2d3e4f5';

const S = {
  fournisseur: 'sentinelle-fournisseur-55a1',
  offre: 'sentinelle-offre-66b2',
  pv: 'sentinelle-pv-77c3',
  commande: 'sentinelle-commande-88d4',
  media: 'media/9c1d2e3f-aaaa-4bbb-8ccc-0123456789ab',
  telephone: '+22670987654',
  nom: 'Awa Sentinelle',
  code: 'BF-SENTI-NELLE',
  cleEcriture: 'sentinelle-x-write-key',
  jeton: 'sentinelle-x-thumb-token',
  agent: 'SentinelleAgent/9.9',
  ip: '203.0.113.77',
  montant: '7654321',
  chemin: 'sentinelle-chemin-inconnu',
  fuiteFournisseur: 'sentinelle-fuite-fournisseur',
  fuiteOffre: 'sentinelle-fuite-offre',
  fuitePv: 'sentinelle-fuite-pv',
} as const;

/** Every log line workerd printed, verbatim, in order. */
const sorties: string[] = [];
/** Everything else it wrote to stdout and stderr. */
const brutes: string[] = [];
/** The second Worker's lines (its Shop+ refuses for good). */
const sortiesParque: string[] = [];
const persist = mkdtempSync(join(tmpdir(), 'journal-offres-'));
const persistParque = mkdtempSync(join(tmpdir(), 'journal-offres-parque-'));
let mf!: Miniflare;
let mfParque!: Miniflare;
/** The supplier code minted for SUPPLIER: typed by him, so a sentinel too. */
let code = '';
/** The readiness challenge (one of the four secrets): a sentinel too. */
let defi = '';

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    compatibilityDate: COMPAT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persist,
    bindings: {
      FULFILLMENT_WRITE_SECRET: FULFILL,
      FULFILLMENT_OPS_SECRET: OPS,
      SUPPLY_READ_SECRET: SUPPLY_READ,
      PROGRESS_WRITE_SECRET: PROGRESS,
    },
    serviceBindings: {
      STOREFRONT: async (request: Request) =>
        request.headers.get('Authorization') === `Bearer ${SHOP_ATTEND}`
          ? Response.json({ ok: true, status: 'recorded' })
          : Response.json({ error: 'unauthorized' }, { status: 401 }),
    },
    handleStructuredLogs: (l) => {
      sorties.push(l.message);
    },
    handleRuntimeStdio: (stdout, stderr) => {
      stdout.on('data', (b) => {
        brutes.push(String(b));
      });
      stderr.on('data', (b) => {
        brutes.push(String(b));
      });
    },
  });
  mfParque = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    compatibilityDate: COMPAT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persistParque,
    bindings: { FULFILLMENT_WRITE_SECRET: FULFILL, FULFILLMENT_OPS_SECRET: OPS, PROGRESS_WRITE_SECRET: PROGRESS },
    serviceBindings: {
      STOREFRONT: async (request: Request) => {
        if (request.headers.get('Authorization') !== `Bearer ${PROGRESS}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
        if ((await request.text()).includes(ORDER_REPRISE)) return Response.json({ ok: false }, { status: 503 });
        return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
      },
    },
    handleStructuredLogs: (l) => {
      sortiesParque.push(l.message);
    },
  });
  await mf.ready;
  await mfParque.ready;
}, LIMITE);
afterAll(async () => {
  await mf?.dispose();
  await mfParque?.dispose();
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistParque, { recursive: true, force: true });
});

type Ligne = Record<string, unknown>;
const lignes = (messages: readonly string[] = sorties): Ligne[] =>
  messages.flatMap((m) => {
    try {
      const v = JSON.parse(m) as unknown;
      return typeof v === 'object' && v !== null ? [v as Ligne] : [];
    } catch {
      return [];
    }
  });
const lignesDe = (cid: string): Ligne[] => lignes().filter((l) => l['correlation_id'] === cid);

/** Lines arrive after the answer; wait for them, then a little more for a straggler. */
async function attendre(ok: () => boolean, ms = 3_000): Promise<void> {
  const debut = Date.now();
  while (!ok() && Date.now() - debut < ms) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 150));
}

let n = 0;
const cidNeuf = (): string => `cid-journal-${++n}`;

async function appel(
  method: string,
  path: string,
  options: { bearer?: string; body?: unknown; headers?: Record<string, string>; cid?: string | null; sur?: Miniflare } = {},
): Promise<{ status: number; cid: string | null; reponse: Response; texte: string }> {
  const cid = options.cid === undefined ? cidNeuf() : options.cid;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (cid !== null) headers['x-correlation-id'] = cid;
  if (options.bearer !== undefined) headers['Authorization'] = `Bearer ${options.bearer}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const reponse = await (options.sur ?? mf).dispatchFetch(`http://offres.test${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {}),
  });
  const texte = await reponse.text();
  return { status: reponse.status, cid, reponse, texte };
}

const seed = (offerId: string, pv: string, supplierId: string) => ({
  commandId: `seed-${offerId}`,
  offerId,
  product: {
    id: pv, supplierId, version: 1, name: 'Bogolan (journal)', productCode: 'FASO-0091', facts: {},
    category: 'fashion_bags_fabrics', zone: 'Gounghin', moderationState: 'approved', status: 'active', supplyMode: 'SELLER_HELD',
  },
  draft: {
    productVersionId: pv, basePrice: 8_000, resellerCommission: 800, eligibleVariants: [], zones: [],
    effective: '2026-07-10T00:00:00.000Z', expiry: '2026-12-31T00:00:00.000Z',
  },
  available: 3,
  asOf: T0,
});

describe('one line per request — route template, method, status, duration, nothing more', () => {
  it('a request to a known route gives exactly one line', async () => {
    const r = await appel('GET', '/fulfillment/orders', { bearer: OPS });
    expect(r.status).toBe(200);
    await attendre(() => lignesDe(r.cid!).length > 0);
    const mes = lignesDe(r.cid!);
    expect(mes, 'exactly one line for this request').toHaveLength(1);
    expect(mes[0]).toEqual({
      ts: expect.any(String),
      level: 'info',
      correlation_id: r.cid,
      service: 'offer-service',
      msg: 'request',
      route: '/fulfillment/orders',
      method: 'GET',
      status: 200,
      durationMs: expect.any(Number),
    });
    expect(mes[0]!['durationMs'] as number).toBeGreaterThanOrEqual(0);
  }, LIMITE);

  it('the health door: one line, carrying the id the answer carries, and no second line of its own', async () => {
    const r = await appel('GET', '/health', { cid: null });
    expect(r.status).toBe(200);
    const rendu = r.reponse.headers.get('x-correlation-id');
    expect(rendu, 'the health door mints an id when none came in').toBeTruthy();
    await attendre(() => lignesDe(rendu!).length > 0);
    expect(lignesDe(rendu!)).toEqual([expect.objectContaining({ msg: 'request', route: '/health', method: 'GET', status: 200, level: 'info' })]);
    expect(lignes().filter((l) => l['msg'] === 'health check'), 'the old per-door line is muted').toEqual([]);
  }, LIMITE);

  it('an unknown path is « unmatched », never the path itself, and the old not-found line is muted', async () => {
    const r = await appel('GET', `/${S.chemin}/plus-loin`);
    expect(r.status).toBe(404);
    await attendre(() => lignesDe(r.cid!).length > 0);
    expect(lignesDe(r.cid!)).toEqual([expect.objectContaining({ msg: 'request', route: 'unmatched', status: 404, level: 'info' })]);
    expect(lignes().filter((l) => l['msg'] === 'route not found')).toEqual([]);
  }, LIMITE);

  it('levels: a refused key is warn, a 5xx is error', async () => {
    const refus = await appel('GET', '/fulfillment/orders', { bearer: 'pas-la-bonne-cle' });
    expect(refus.status).toBe(401);
    // No voice-note door is bound here: the read answers 502 media_indisponible.
    const panne = await appel('GET', `/fulfillment/repere-audio?ref=${encodeURIComponent(S.media)}`, { bearer: OPS });
    expect(panne.status).toBe(502);
    await attendre(() => lignesDe(refus.cid!).length > 0 && lignesDe(panne.cid!).length > 0);
    expect(lignesDe(refus.cid!)).toEqual([expect.objectContaining({ level: 'warn', status: 401, route: '/fulfillment/orders' })]);
    expect(lignesDe(panne.cid!)).toEqual([expect.objectContaining({ level: 'error', status: 502, route: '/fulfillment/repere-audio' })]);
  }, LIMITE);

  it('a preflight has its line; the method is one of seven names, or OTHER', async () => {
    const pre = await appel('OPTIONS', '/fulfillment/orders', { headers: { 'Access-Control-Request-Method': 'GET' } });
    expect(pre.status).toBe(204);
    const vus: { cid: string; method: string; status: number }[] = [];
    for (const m of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND']) {
      const r = await appel(m, '/health');
      vus.push({ cid: r.cid!, method: m === 'PROPFIND' ? 'OTHER' : m, status: r.status });
    }
    await attendre(() => lignesDe(pre.cid!).length > 0 && vus.every((v) => lignesDe(v.cid).length > 0));
    expect(lignesDe(pre.cid!)).toEqual([expect.objectContaining({ method: 'OPTIONS', status: 204, route: '/fulfillment/orders' })]);
    for (const v of vus) {
      expect(lignesDe(v.cid), v.method).toEqual([expect.objectContaining({ method: v.method, status: v.status, route: '/health' })]);
    }
  }, LIMITE);

  it('a long correlation id is cut to 64 characters on the line', async () => {
    const long = `cid-${'x'.repeat(96)}`;
    const r = await appel('GET', '/fulfillment/orders', { bearer: OPS, cid: long });
    expect(r.status).toBe(200);
    await attendre(() => lignesDe(long.slice(0, 64)).length > 0);
    expect(lignesDe(long.slice(0, 64))).toHaveLength(1);
    expect(lignes().some((l) => l['correlation_id'] === long)).toBe(false);
  }, LIMITE);

  it('the order id rides on the evidence read alone, and only in the shape Shop+ mints', async () => {
    const minted = await appel('GET', `/fulfillment/order-evidence?orderId=${ORDER}`, { bearer: OPS });
    const autre = await appel('GET', `/fulfillment/order-evidence?orderId=${S.commande}`, { bearer: OPS });
    const ailleurs = await appel('GET', `/fulfillment/orders?orderId=${ORDER}`, { bearer: OPS });
    await attendre(() => [minted, autre, ailleurs].every((r) => lignesDe(r.cid!).length > 0));
    expect(lignesDe(minted.cid!)).toEqual([expect.objectContaining({ route: '/fulfillment/order-evidence', orderId: ORDER })]);
    expect(lignesDe(autre.cid!)).toHaveLength(1);
    expect(lignesDe(autre.cid!)[0]).not.toHaveProperty('orderId');
    expect(lignesDe(ailleurs.cid!)).toHaveLength(1);
    expect(lignesDe(ailleurs.cid!)[0]).not.toHaveProperty('orderId');
  }, LIMITE);
});

describe('a throw and an omitted entry, on the real Worker with real inputs', () => {
  it('sets the stage: an offer whose photo address carries its supplier’s id (the leak guard refuses to serve it)', async () => {
    expect((await appel('POST', '/fulfillment/supplier-code', { bearer: OPS, body: { supplierId: S.fuiteFournisseur } })).status).toBe(200);
    expect((await appel('POST', '/offers', { bearer: OPS, body: seed(S.fuiteOffre, S.fuitePv, S.fuiteFournisseur) })).status).toBe(200);
    const ref = (r: string) => ({ ref: r, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' });
    const attache = await appel('POST', '/offers/assets', {
      bearer: OPS,
      body: {
        commandId: 'attach-fuite-1', offerId: S.fuiteOffre,
        assets: {
          masterRef: ref('private/master/x'), heroSquare: ref(`media/${S.fuiteFournisseur}/hero.jpg`),
          heroVertical: ref('media/11111111-0000-4000-8000-000000000001'), proof: ref('media/11111111-0000-4000-8000-000000000002'),
          detail: [], hashes: ['a'.repeat(64)], processingVersion: 'premium-frame.v1',
        },
      },
    });
    expect(attache.status, attache.texte).toBe(200);
  }, LIMITE);

  it('the single read throws: one error line with status 500 and the error’s class name only', async () => {
    const r = await appel('GET', `/supply-projection/${S.fuitePv}`, { bearer: SUPPLY_READ });
    expect(r.status, 'precondition: the leak guard throws out of the Worker').toBe(500);
    await attendre(() => lignesDe(r.cid!).length > 0);
    // The throw's own report — the only place the runtime shows its message is
    // the 500 it renders — names no supplier, and nothing printed does either.
    expect(r.texte, 'the uncaught error’s report').toContain('SupplyLeakError');
    expect(r.texte, 'the uncaught error’s report').not.toContain(S.fuiteFournisseur);
    for (const m of [...sorties, ...brutes]) expect(m).not.toContain(S.fuiteFournisseur);
    expect(lignesDe(r.cid!)).toEqual([{
      ts: expect.any(String),
      level: 'error',
      correlation_id: r.cid,
      service: 'offer-service',
      msg: 'request',
      route: '/supply-projection/:id',
      method: 'GET',
      status: 500,
      durationMs: expect.any(Number),
      error: 'SupplyLeakError',
    }]);
  }, LIMITE);

  it('the collection omits it: one warn line naming the error’s class, and no offer id anywhere', async () => {
    const r = await appel('GET', '/supply-projections', { bearer: SUPPLY_READ });
    expect(r.status).toBe(200);
    await attendre(() => lignesDe(r.cid!).length > 0 && lignes().some((l) => l['msg'] === 'projection_omitted'));
    expect(lignesDe(r.cid!)).toEqual([expect.objectContaining({ msg: 'request', route: '/supply-projections', status: 200, level: 'info' })]);
    const omises = lignes().filter((l) => l['msg'] === 'projection_omitted');
    expect(omises.length).toBeGreaterThanOrEqual(1);
    for (const l of omises) {
      expect(l).toEqual({
        ts: expect.any(String),
        level: 'warn',
        correlation_id: expect.any(String),
        service: 'offer-service',
        msg: 'projection_omitted',
        error: 'SupplyLeakError',
      });
    }
    expect(sorties.filter((m) => m.includes('entry omitted')), 'the free-text line is gone').toEqual([]);
  }, LIMITE);
});

describe('a delivery the outbox could not make gives one line, at error for a refused key', () => {
  it('sets the stage: a paid order, accepted by its supplier', async () => {
    const minted = await appel('POST', '/fulfillment/supplier-code', { bearer: OPS, body: { supplierId: SUPPLIER } });
    expect(minted.status, minted.texte).toBe(200);
    code = (JSON.parse(minted.texte) as { code: string }).code;
    expect((await appel('POST', '/offers', { bearer: OPS, body: seed('offre-journal-1', PV, SUPPLIER) })).status).toBe(200);
    const confirme = await appel('POST', '/fulfillment/order-confirmed', {
      bearer: FULFILL,
      body: {
        name: 'order.confirmed.v1',
        envelope: {
          command_id: `ord-confirm-${ORDER}`, correlation_id: `corr-${ORDER}`,
          aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
        },
        payload: {
          orderId: ORDER, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
          paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
        },
      },
    });
    expect(confirme.status, confirme.texte).toBe(200);
    const accepte = await appel('POST', '/fulfillment/accept', { bearer: code, body: { orderId: ORDER } });
    expect(accepte.status, accepte.texte).toBe(200);
  }, LIMITE);

  it('Shop+ refuses the key (401): one line with the outbox, the order, the attempt count and the status', async () => {
    const echecs = (): Ligne[] =>
      lignes().filter((l) => l['msg'] === 'outbox_undelivered' && l['outbox'] === 'storefront' && l['orderId'] === ORDER);
    await attendre(() => echecs().length > 0, 8_000);
    expect(echecs()[0]).toEqual({
      ts: expect.any(String),
      level: 'error',
      correlation_id: `corr-${ORDER}`,
      service: 'offer-service',
      msg: 'outbox_undelivered',
      outbox: 'storefront',
      orderId: ORDER,
      attempts: 1,
      status: 401,
    });
    const comptes = echecs().map((l) => l['attempts']);
    expect(comptes, 'one line per attempt, never two for the same one').toEqual(comptes.map((_, i) => i + 1));
  }, LIMITE);

  it('« prêt » with no Séra door configured here: one line, reason not_configured, at error', async () => {
    const confirme = await appel('POST', '/fulfillment/order-confirmed', {
      bearer: FULFILL,
      body: {
        name: 'order.confirmed.v1',
        envelope: {
          command_id: `ord-confirm-${ORDER_PRET}`, correlation_id: `corr-${ORDER_PRET}`,
          aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
        },
        payload: {
          orderId: ORDER_PRET, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
          paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
        },
      },
    });
    expect(confirme.status, confirme.texte).toBe(200);
    expect((await appel('POST', '/fulfillment/accept', { bearer: code, body: { orderId: ORDER_PRET } })).status).toBe(200);
    const challenge = await appel('POST', '/fulfillment/ready/challenge', { bearer: code, body: { orderId: ORDER_PRET } });
    expect(challenge.status, challenge.texte).toBe(200);
    defi = (JSON.parse(challenge.texte) as { challenge: string }).challenge;
    const pret = await appel('POST', '/fulfillment/ready', {
      bearer: code,
      body: {
        orderId: ORDER_PRET,
        photoRef: { ref: PHOTO_PRET, sha256: 'b'.repeat(64), mimeType: 'image/jpeg' },
        readinessChallenge: defi, qty: 1, variant: PV, availableConfirmed: true, at: new Date().toISOString(),
      },
    });
    expect(pret.status, pret.texte).toBe(200);

    const sera = (): Ligne[] => lignes().filter((l) => l['msg'] === 'outbox_undelivered' && l['outbox'] === 'sera');
    await attendre(() => sera().length > 0, 8_000);
    expect(sera()[0]).toEqual({
      ts: expect.any(String),
      level: 'error',
      correlation_id: `corr-${ORDER_PRET}`,
      service: 'offer-service',
      msg: 'outbox_undelivered',
      outbox: 'sera',
      orderId: ORDER_PRET,
      attempts: 1,
      reason: 'not_configured',
    });
  }, LIMITE);

  it('Shop+ refuses the event for good (400): the row is parked, and its one line says parked, at error', async () => {
    const minted = await appel('POST', '/fulfillment/supplier-code', { bearer: OPS, body: { supplierId: SUPPLIER }, sur: mfParque });
    expect(minted.status, minted.texte).toBe(200);
    const codeParque = (JSON.parse(minted.texte) as { code: string }).code;
    expect((await appel('POST', '/offers', { bearer: OPS, body: seed('offre-journal-parque', PV, SUPPLIER), sur: mfParque })).status).toBe(200);
    const confirme = await appel('POST', '/fulfillment/order-confirmed', {
      bearer: FULFILL,
      sur: mfParque,
      body: {
        name: 'order.confirmed.v1',
        envelope: {
          command_id: `ord-confirm-${ORDER_PARQUE}`, correlation_id: `corr-${ORDER_PARQUE}`,
          aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
        },
        payload: {
          orderId: ORDER_PARQUE, productVersionId: PV, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
          paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
        },
      },
    });
    expect(confirme.status, confirme.texte).toBe(200);
    expect((await appel('POST', '/fulfillment/accept', { bearer: codeParque, body: { orderId: ORDER_PARQUE }, sur: mfParque })).status).toBe(200);

    const parquees = (): Ligne[] => lignes(sortiesParque).filter((l) => l['msg'] === 'outbox_undelivered');
    await attendre(() => parquees().length > 0, 8_000);
    expect(parquees(), 'a parked row is never tried again').toEqual([{
      ts: expect.any(String),
      level: 'error',
      correlation_id: `corr-${ORDER_PARQUE}`,
      service: 'offer-service',
      msg: 'outbox_undelivered',
      outbox: 'storefront',
      orderId: ORDER_PARQUE,
      attempts: 1,
      status: 400,
      parked: true,
    }]);
    for (const m of sortiesParque) {
      for (const interdit of [OPS, FULFILL, PROGRESS, codeParque, SUPPLIER, PV]) expect(m).not.toContain(interdit);
    }
  }, LIMITE);

  it('Shop+ is down for a while (503): one warn line, and the row is tried again, never parked', async () => {
    const minted = await appel('POST', '/fulfillment/supplier-code', { bearer: OPS, body: { supplierId: SUPPLIER }, sur: mfParque });
    expect(minted.status, minted.texte).toBe(200);
    const code = (JSON.parse(minted.texte) as { code: string }).code;
    expect((await appel('POST', '/offers', { bearer: OPS, body: seed('offre-journal-reprise', PV_REPRISE, SUPPLIER), sur: mfParque })).status).toBe(200);
    const confirme = await appel('POST', '/fulfillment/order-confirmed', {
      bearer: FULFILL,
      sur: mfParque,
      body: {
        name: 'order.confirmed.v1',
        envelope: {
          command_id: `ord-confirm-${ORDER_REPRISE}`, correlation_id: `corr-${ORDER_REPRISE}`,
          aggregateVersion: 5, actor: 'shop-plus:order-emitter', serverTime: T0, version: 'v1',
        },
        payload: {
          orderId: ORDER_REPRISE, productVersionId: PV_REPRISE, offerVersion: 'ov-1', paymentMode: 'FULL_PREPAY',
          paidAt: T0, zoneTo: 'Gounghin, Ouagadougou', sellerBasePrice: 8_000,
        },
      },
    });
    expect(confirme.status, confirme.texte).toBe(200);
    expect((await appel('POST', '/fulfillment/accept', { bearer: code, body: { orderId: ORDER_REPRISE }, sur: mfParque })).status).toBe(200);

    const siennes = (): Ligne[] =>
      lignes(sortiesParque).filter((l) => l['msg'] === 'outbox_undelivered' && l['orderId'] === ORDER_REPRISE);
    await attendre(() => siennes().length > 0, 8_000);
    expect(siennes()[0]).toEqual({
      ts: expect.any(String),
      level: 'warn',
      correlation_id: `corr-${ORDER_REPRISE}`,
      service: 'offer-service',
      msg: 'outbox_undelivered',
      outbox: 'storefront',
      orderId: ORDER_REPRISE,
      attempts: 1,
      status: 503,
    });
    // Its next try comes after the first backoff step (1 s): a warn again, one attempt more.
    await attendre(() => siennes().length > 1, 8_000);
    expect(siennes()[1]).toMatchObject({ level: 'warn', attempts: 2, status: 503 });
    expect(siennes().some((l) => 'parked' in l), 'a 503 is never parked').toBe(false);
  }, LIMITE);
});

describe('no line ever carries a person’s data', () => {
  it('a sweep over every route, with sentinels in paths, queries, headers and bodies, finds none of them in any line', async () => {
    const q = new URLSearchParams({
      supplierId: S.fournisseur, offerId: S.offre, ref: S.media, orderId: S.commande, code: S.code,
      phone: S.telephone, name: S.nom, amount: S.montant, productVersionId: S.pv, cursor: S.offre,
    }).toString();
    const corps = {
      supplierId: S.fournisseur, offerId: S.offre, orderId: S.commande, productVersionId: S.pv, ref: S.media,
      phone: S.telephone, name: S.nom, contact: { name: S.nom, phone: S.telephone }, code: S.code, challenge: S.code,
      pickupCode: S.code, returnCode: S.code, basePrice: Number(S.montant), sellerBasePrice: Number(S.montant), amount: Number(S.montant),
    };
    const entetes = { 'X-Write-Key': S.cleEcriture, 'X-Thumb-Token': S.jeton, 'User-Agent': S.agent, 'cf-connecting-ip': S.ip };
    const routes: readonly [string, string, string | undefined][] = [
      ['POST', '/supply-grouping', SUPPLY_READ],
      ['GET', '/supply-projections', SUPPLY_READ],
      ['GET', `/supply-projection/${S.pv}`, SUPPLY_READ],
      ['GET', `/supply-projection/${S.pv}/${S.offre}`, SUPPLY_READ],
      ['POST', '/fulfillment/order-confirmed', FULFILL],
      ['POST', '/fulfillment/delivered', FULFILL],
      ['POST', '/fulfillment/delivery-refused', FULFILL],
      ['POST', '/fulfillment/stock-hold', FULFILL],
      ['POST', '/fulfillment/stock-hold/release', FULFILL],
      ['GET', '/fulfillment/orders', OPS],
      ['GET', '/fulfillment/order-evidence', OPS],
      ['GET', '/fulfillment/repere-audio', OPS],
      ['POST', '/fulfillment/supplier-contact', OPS],
      ['GET', '/fulfillment/supplier-contacts', OPS],
      ['POST', '/fulfillment/relance', OPS],
      ['POST', '/fulfillment/order/retirer', OPS],
      ['POST', '/fulfillment/order/annuler', OPS],
      ['GET', '/offers/inventaire', OPS],
      ['POST', '/offers/stock', OPS],
      ['GET', '/offers/stock/attente', OPS],
      ['POST', '/offers/prolonger', OPS],
      ['GET', '/offers/journal', OPS],
      ['GET', '/fulfillment/supplier-codes', OPS],
      ['POST', '/fulfillment/supplier-code', OPS],
      ['POST', '/fulfillment/supplier-code/reveal', OPS],
      ['POST', '/fulfillment/supplier-acces/suite', OPS],
      ['POST', '/fulfillment/supplier-code/revoke', OPS],
      ['POST', '/fulfillment/supplier/effacer', OPS],
      ['GET', '/fulfillment/mine', S.code],
      ['GET', '/offers/mine', code],
      ['POST', '/fulfillment/accept', code],
      ['POST', '/fulfillment/refuse', S.code],
      ['POST', '/fulfillment/ready/challenge', code],
      ['POST', '/fulfillment/ready', code],
      ['POST', '/fulfillment/ramassage/verify', code],
      ['POST', '/fulfillment/retour/verify', code],
      ['POST', '/offers', OPS],
      ['POST', '/offers/assets', OPS],
      ['POST', '/offers/delete', OPS],
      ['GET', '/offers', OPS],
      ['GET', '/health', undefined],
      ['GET', `/${S.chemin}`, undefined],
      ['POST', `/${S.chemin}/${S.fournisseur}`, OPS],
      ['OPTIONS', '/fulfillment/supplier-contact', undefined],
    ];
    const faits: { cid: string; path: string }[] = [];
    for (const [method, path, bearer] of routes) {
      const r = await appel(method, `${path}?${q}`, {
        ...(bearer !== undefined ? { bearer } : {}),
        ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: corps }),
        headers: entetes,
      });
      faits.push({ cid: r.cid!, path });
    }
    await attendre(() => faits.every((f) => lignesDe(f.cid).length > 0), 8_000);

    for (const f of faits) expect(lignesDe(f.cid), `one line for ${f.path}`).toHaveLength(1);
    const interdits = [
      ...Object.values(S), OPS, FULFILL, SUPPLY_READ, PROGRESS, code, defi, SUPPLIER, PV, PHOTO_PRET,
      S.telephone.slice(4), encodeURIComponent(S.nom), S.media.slice('media/'.length), PHOTO_PRET.slice('media/'.length),
    ];
    for (const sortie of [...sorties, ...brutes]) {
      for (const interdit of interdits) expect(sortie, `a line carries « ${interdit} »`).not.toContain(interdit);
    }
  }, LIMITE * 2);
});

describe('the deployed config turns the log on and keeps queries out of it', () => {
  it('wrangler reads the [observability] block from wrangler.toml', () => {
    const config = unstable_readConfig({ config: fileURLToPath(new URL('../wrangler.toml', import.meta.url)) });
    expect(config.observability).toEqual({
      enabled: true,
      head_sampling_rate: 1,
      redact_query_string: true,
      logs: { invocation_logs: false },
    });
  });
});
