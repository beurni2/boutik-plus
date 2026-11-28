import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { unstable_readConfig } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ THE MEDIA SERVICE KEEPS A LOG — and never a person's data in it ═══
 *
 * One JSON line per request: which route (its template, never the raw path
 * and never a media key), which method, the answer's status and how long it
 * took. No key, no token, no body, no query, no address.
 *
 * Driven against the REAL bundle (`dist/worker/worker.mjs`, built by
 * `pretest`) on workerd with an R2 binding, under the deployed compatibility
 * date. The lines are what workerd itself printed, caught by Miniflare's log
 * handler — never a value the test computed.
 */

const LIMITE = 30_000;
const BUNDLE = fileURLToPath(new URL('../dist/worker/worker.mjs', import.meta.url));
const TOML = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
const COMPAT = ((): string => {
  const found = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(readFileSync(TOML, 'utf8'));
  if (found === null) throw new Error('wrangler.toml has no compatibility_date');
  return found[1]!;
})();

// Both keys are sentinels too: neither may ever reach a line.
const WRITE = 'sentinelle-cle-ecriture-media-3e9a';
const REVOKE = 'sentinelle-cle-retrait-media-8b1c';

const S = {
  cle: 'media/7d2e4f60-bbbb-4ccc-9ddd-0123456789ef',
  jeton: 'sentinelle-jeton-vignette',
  telephone: '+22670123987',
  nom: 'Salif Sentinelle',
  fournisseur: 'sentinelle-fournisseur-media',
  agent: 'SentinelleAgent/7.7',
  ip: '198.51.100.23',
  chemin: 'sentinelle-chemin-media',
  corps: 'SENTINELLE-OCTETS-DU-CORPS',
} as const;

/** A baseline JPEG frame of exactly `total` bytes declaring `width`×`height`. */
function jpeg(width: number, height: number, total: number, remplissage = 0x12): Uint8Array {
  const seg = (marker: number, body: readonly number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const tete = [
    0xff, 0xd8,
    ...seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
    ...seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
  ];
  const out = new Uint8Array(total);
  out.set(tete, 0);
  out.fill(remplissage, tete.length, total - 2);
  out[total - 2] = 0xff;
  out[total - 1] = 0xd9;
  return out;
}

const sorties: string[] = [];
const sortiesSansStockage: string[] = [];
const dirs: string[] = [];
let mf!: Miniflare;
let sansStockage!: Miniflare;

beforeAll(async () => {
  const d = mkdtempSync(join(tmpdir(), 'journal-media-'));
  dirs.push(d);
  const modules = [{ type: 'ESModule' as const, path: 'media.mjs', contents: readFileSync(BUNDLE, 'utf8') }];
  mf = new Miniflare({
    modules,
    compatibilityDate: COMPAT,
    r2Buckets: { BUCKET: 'journal-media-bucket' },
    r2Persist: d,
    bindings: { MEDIA_WRITE_SECRET: WRITE, MEDIA_REVOKE_SECRET: REVOKE },
    handleStructuredLogs: (l) => {
      sorties.push(l.message);
    },
  });
  // The same Worker with no bucket bound: every write answers 503.
  sansStockage = new Miniflare({
    modules,
    compatibilityDate: COMPAT,
    bindings: { MEDIA_WRITE_SECRET: WRITE, MEDIA_REVOKE_SECRET: REVOKE },
    handleStructuredLogs: (l) => {
      sortiesSansStockage.push(l.message);
    },
  });
  await mf.ready;
  await sansStockage.ready;
}, LIMITE);
afterAll(async () => {
  await mf?.dispose();
  await sansStockage?.dispose();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

type Ligne = Record<string, unknown>;
const lu = (messages: readonly string[]): Ligne[] =>
  messages.flatMap((m) => {
    try {
      const v = JSON.parse(m) as unknown;
      return typeof v === 'object' && v !== null ? [v as Ligne] : [];
    } catch {
      return [];
    }
  });
const lignesDe = (cid: string, messages: readonly string[] = sorties): Ligne[] =>
  lu(messages).filter((l) => l['correlation_id'] === cid);

async function attendre(ok: () => boolean, ms = 3_000): Promise<void> {
  const debut = Date.now();
  while (!ok() && Date.now() - debut < ms) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 150));
}

let n = 0;
const cidNeuf = (): string => `cid-media-${++n}`;

async function appel(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: BodyInit; cid?: string | null; sur?: Miniflare } = {},
): Promise<{ status: number; cid: string | null; reponse: Response; texte: string }> {
  const cid = options.cid === undefined ? cidNeuf() : options.cid;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (cid !== null) headers['x-correlation-id'] = cid;
  const reponse = await (options.sur ?? mf).dispatchFetch(`http://media.test${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: options.body } : {}),
  });
  const texte = await reponse.text();
  return { status: reponse.status, cid, reponse, texte };
}

/** A photograph through the real upload door: its minted key and its one-time vignette token. */
async function photographie(): Promise<{ ref: string; thumbToken: string; cid: string }> {
  const r = await appel('POST', '/media', { headers: { 'X-Write-Key': WRITE }, body: jpeg(1280, 1280, 2_000) });
  expect(r.status, r.texte).toBe(201);
  const corps = JSON.parse(r.texte) as { ref: string; thumbToken: string };
  return { ...corps, cid: r.cid! };
}

describe('one line per request — route template, method, status, duration, nothing more', () => {
  it('an upload gives exactly one line', async () => {
    const photo = await photographie();
    await attendre(() => lignesDe(photo.cid).length > 0);
    const mes = lignesDe(photo.cid);
    expect(mes, 'exactly one line for this request').toHaveLength(1);
    expect(mes[0]).toEqual({
      ts: expect.any(String),
      level: 'info',
      correlation_id: photo.cid,
      service: 'media-service',
      msg: 'request',
      route: '/media',
      method: 'POST',
      status: 201,
      durationMs: expect.any(Number),
    });
    expect(mes[0]!['durationMs'] as number).toBeGreaterThanOrEqual(0);
  }, LIMITE);

  it('a read names the route, never the key', async () => {
    const photo = await photographie();
    const r = await appel('GET', `/${photo.ref}?v=thumb`);
    expect(r.status).toBe(200);
    await attendre(() => lignesDe(r.cid!).length > 0);
    expect(lignesDe(r.cid!)).toEqual([expect.objectContaining({ msg: 'request', route: '/media/:key', method: 'GET', status: 200, level: 'info' })]);
  }, LIMITE);

  it('the health door: one line, carrying the id the answer carries, and no second line of its own', async () => {
    const r = await appel('GET', '/health', { cid: null });
    expect(r.status).toBe(200);
    const rendu = r.reponse.headers.get('x-correlation-id');
    expect(rendu).toBeTruthy();
    await attendre(() => lignesDe(rendu!).length > 0);
    expect(lignesDe(rendu!)).toEqual([expect.objectContaining({ msg: 'request', route: '/health', method: 'GET', status: 200 })]);
    expect(lu(sorties).filter((l) => l['msg'] === 'health check')).toEqual([]);
  }, LIMITE);

  it('an unknown path is « unmatched », never the path itself, and the old not-found line is muted', async () => {
    const r = await appel('GET', `/${S.chemin}`);
    expect(r.status).toBe(404);
    await attendre(() => lignesDe(r.cid!).length > 0);
    expect(lignesDe(r.cid!)).toEqual([expect.objectContaining({ route: 'unmatched', status: 404, level: 'info' })]);
    expect(lu(sorties).filter((l) => l['msg'] === 'route not found')).toEqual([]);
  }, LIMITE);

  it('levels: a refused key and a wrong vignette token are warn; storage that is not bound is error', async () => {
    const cle = await appel('POST', '/media', { headers: { 'X-Write-Key': 'pas-la-bonne-cle' }, body: jpeg(1280, 1280, 2_000) });
    expect(cle.status).toBe(401);
    const photo = await photographie();
    const jeton = await appel('POST', `/media/thumb?for=${encodeURIComponent(photo.ref)}`, {
      headers: { 'X-Write-Key': WRITE, 'X-Thumb-Token': S.jeton },
      body: jpeg(320, 320, 1_500),
    });
    expect(jeton.status).toBe(403);
    const panne = await appel('POST', '/media', { headers: { 'X-Write-Key': WRITE }, body: jpeg(1280, 1280, 2_000), sur: sansStockage });
    expect(panne.status).toBe(503);
    await attendre(() => lignesDe(cle.cid!).length > 0 && lignesDe(jeton.cid!).length > 0 && lignesDe(panne.cid!, sortiesSansStockage).length > 0);
    expect(lignesDe(cle.cid!)).toEqual([expect.objectContaining({ level: 'warn', status: 401, route: '/media' })]);
    expect(lignesDe(jeton.cid!)).toEqual([expect.objectContaining({ level: 'warn', status: 403, route: '/media/thumb' })]);
    expect(lignesDe(panne.cid!, sortiesSansStockage)).toEqual([expect.objectContaining({ level: 'error', status: 503, route: '/media' })]);
  }, LIMITE);

  it('a preflight has its line; the method is one of seven names, or OTHER', async () => {
    const pre = await appel('OPTIONS', '/media', { headers: { 'Access-Control-Request-Method': 'POST' } });
    expect(pre.status).toBe(204);
    const vus: { cid: string; method: string; status: number }[] = [];
    for (const m of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND']) {
      const r = await appel(m, '/health');
      vus.push({ cid: r.cid!, method: m === 'PROPFIND' ? 'OTHER' : m, status: r.status });
    }
    await attendre(() => lignesDe(pre.cid!).length > 0 && vus.every((v) => lignesDe(v.cid).length > 0));
    expect(lignesDe(pre.cid!)).toEqual([expect.objectContaining({ method: 'OPTIONS', status: 204, route: '/media' })]);
    for (const v of vus) {
      expect(lignesDe(v.cid), v.method).toEqual([expect.objectContaining({ method: v.method, status: v.status, route: '/health' })]);
    }
  }, LIMITE);

  it('a long correlation id is cut to 64 characters on the line', async () => {
    const long = `cid-${'y'.repeat(96)}`;
    const r = await appel('GET', `/${S.cle}`, { cid: long });
    await attendre(() => lignesDe(long.slice(0, 64)).length > 0);
    expect(r.status).toBe(404);
    expect(lignesDe(long.slice(0, 64))).toHaveLength(1);
    expect(lu(sorties).some((l) => l['correlation_id'] === long)).toBe(false);
  }, LIMITE);
});

describe('no line ever carries a person’s data', () => {
  it('a sweep over every route, with keys, tokens and sentinels in paths, queries, headers and bodies, finds none of them in any line', async () => {
    const photo = await photographie();
    const q = new URLSearchParams({ for: photo.ref, v: 'thumb', supplierId: S.fournisseur, phone: S.telephone, name: S.nom, key: S.cle }).toString();
    const entetes = { 'X-Write-Key': WRITE, 'X-Thumb-Token': photo.thumbToken, 'User-Agent': S.agent, 'cf-connecting-ip': S.ip };
    const json = JSON.stringify({ ref: photo.ref, supplierId: S.fournisseur, phone: S.telephone, name: S.nom, note: S.corps });
    const octets = new TextEncoder().encode(S.corps);
    const routes: readonly [string, string, Record<string, string>, BodyInit | undefined][] = [
      ['POST', '/media', {}, jpeg(1280, 1280, 2_000)],
      ['POST', '/media', {}, octets],
      ['POST', '/media/video', {}, octets],
      ['POST', '/media/audio', {}, octets],
      ['POST', '/media/thumb', {}, jpeg(320, 320, 1_500)],
      ['POST', '/media/thumb', { 'X-Thumb-Token': S.jeton }, octets],
      ['GET', `/${photo.ref}`, {}, undefined],
      ['GET', `/${S.cle}`, {}, undefined],
      ['GET', `/${S.cle}/${S.fournisseur}`, {}, undefined],
      ['POST', '/media/revoke', { Authorization: `Bearer ${REVOKE}`, 'Content-Type': 'application/json' }, json],
      ['POST', '/media/revoke', { Authorization: `Bearer ${S.jeton}`, 'Content-Type': 'application/json' }, json],
      ['GET', '/health', {}, undefined],
      ['GET', `/${S.chemin}/${S.fournisseur}`, {}, undefined],
      ['POST', `/${S.chemin}`, {}, json],
      ['OPTIONS', '/media/thumb', {}, undefined],
    ];
    const faits: { cid: string; path: string }[] = [];
    /** Every key the sweep's own uploads minted: never on a line either. */
    const mintees: string[] = [];
    for (const [method, path, plus, body] of routes) {
      const r = await appel(method, `${path}?${q}`, { headers: { ...entetes, ...plus }, ...(body !== undefined ? { body } : {}) });
      faits.push({ cid: r.cid!, path });
      for (const m of r.texte.matchAll(/media\/([0-9a-f-]{36})/g)) mintees.push(m[1]!);
    }
    await attendre(() => faits.every((f) => lignesDe(f.cid).length > 0), 8_000);

    for (const f of faits) expect(lignesDe(f.cid), `one line for ${f.path}`).toHaveLength(1);
    const interdits = [
      ...Object.values(S), WRITE, REVOKE, photo.ref, photo.ref.slice('media/'.length), photo.thumbToken,
      S.cle.slice('media/'.length), S.telephone.slice(4), encodeURIComponent(S.nom), ...mintees,
    ];
    for (const sortie of [...sorties, ...sortiesSansStockage]) {
      for (const interdit of interdits) expect(sortie, `a line carries « ${interdit} »`).not.toContain(interdit);
    }
  }, LIMITE * 2);
});

describe('the deployed config turns the log on and keeps queries out of it', () => {
  it('wrangler reads the [observability] block from wrangler.toml', () => {
    expect(unstable_readConfig({ config: TOML }).observability).toEqual({
      enabled: true,
      head_sampling_rate: 1,
      redact_query_string: true,
      logs: { invocation_logs: false },
    });
  });
});
