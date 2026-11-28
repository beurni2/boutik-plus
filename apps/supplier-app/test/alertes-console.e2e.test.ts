import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { httpAlertesService } from '../src/alertes/service';
import { SERA, miniflareDuDepot } from './bundle-voisin';

/**
 * ═══ THE SEAM: a ready parcel waits past its window with no course, Séra
 * raises the alert, the console's OWN port reads it and closes it ═══
 *
 * Séra keeps the founder's open problems (`GET /ops/alertes`) and records who
 * closed one (`POST /ops/alertes/ack`, `{ id, by }`). This test raises a real
 * « ready parcel, no course » alert through Séra's own intake doors — the
 * funding and readiness facts dated more than an hour ago, as Séra counts the
 * window from them. The two custody problems arrive on logistics' own
 * `/produce/alerte`, custody's door, with the body custody's `alerteEvent`
 * builds. Then the console's port reads them and closes them, and the test
 * ASKS SÉRA'S BOOK whether each is closed and by whom, never the port's word.
 *
 * ⚠ The bundle lives in the Séra repo: skipped, with the reason in the title,
 * where no clone sits beside this one (`bundle-voisin.ts`).
 */

const OPS = 'test-sera-ops-alertes-seam';
const INTAKE = 'test-sera-intake-alertes-seam';
/** Custody's key on logistics' `/produce/` door. */
const LIVREE = 'test-sera-livree-alertes-seam';
const BASE = 'http://sera.test';
const SUPPLIER = 'supplier-alertes-seam';
const MINUTE = 60_000;
const LOC = { zone: 'Zogona, Ouagadougou', landmark: "À l'échangeur", directions: '', maskedRelay: '' };

const Miniflare = miniflareDuDepot();
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

type Json = Record<string, unknown>;
const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

describe.skipIf(SERA.raisonSaut !== null)(SERA.titre('ALERTES — a real Séra alert reaches the console, and his « J\'ai vu » reaches the book'), () => {
  it('raised by Séra, read by the console\'s port, closed as « founder » — asked of the book, not the answer', async () => {
    SERA.exigerAJour();
    const dir = mkdtempSync(join(tmpdir(), 'alertes-seam-'));
    dirs.push(dir);
    const mf = new Miniflare({
      modules: [{ type: 'ESModule', path: 'sera-logistics.mjs', contents: readFileSync(SERA.bundle, 'utf8') }],
      durableObjects: { LOGISTICS: 'LogisticsDO' },
      durableObjectsPersist: dir,
      bindings: { SERA_OPS_SECRET: OPS, SERA_INTAKE_SECRET: INTAKE, SERA_COURSE_LIVREE_SECRET: LIVREE },
    });
    try {
      const appels: { cle: string; auth: string | null; corps: unknown }[] = [];
      const surveille = (async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        appels.push({
          cle: `${init?.method ?? 'GET'} ${new URL(url).pathname}`,
          auth: headers.get('Authorization'),
          corps: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
        });
        return mf.dispatchFetch(url, init as never);
      }) as unknown as typeof globalThis.fetch;

      const direct = async (path: string, key: string, body?: unknown): Promise<{ status: number; json: Json }> => {
        const r = (await mf.dispatchFetch(`${BASE}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })) as unknown as Response;
        return { status: r.status, json: (await r.json().catch(() => ({}))) as Json };
      };
      const intake = async (path: string, body: unknown): Promise<void> => {
        const r = await direct(path, INTAKE, body);
        expect(r.status, `${path}: ${JSON.stringify(r.json)}`).toBe(200);
      };
      /** Custody's alert, as its `alerteEvent` builds it, on custody's own door. */
      const produire = async (scenario: string, orderId: string, serverTime: string, payload: Json): Promise<void> => {
        const r = await direct('/produce/alerte', LIVREE, {
          name: 'reconciliation.alert.v1',
          envelope: { command_id: `alerte-${scenario}-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 0, actor: 'custody-service:ops-monitor', serverTime, version: '1' },
          payload: { scenario, order_id: orderId, ...payload },
        });
        expect(r.status, `/produce/alerte: ${JSON.stringify(r.json)}`).toBe(200);
        expect(r.json['duplicate']).toBe(false);
      };
      /** Who closed it, as Séra's stored row says: a second ack answers the first, unchanged. */
      const fermeePar = async (id: string): Promise<unknown> => {
        const r = await direct('/ops/alertes/ack', OPS, { id, by: 'quelqu-un-d-autre' });
        expect(r.status).toBe(200);
        expect(r.json['duplicate']).toBe(true);
        return (r.json['alerte'] as Json)['acknowledgedBy'];
      };
      /** Séra's own read of what is open — the book, not the port. */
      const ouvertes = async (): Promise<string[]> => {
        const r = await direct('/ops/alertes', OPS);
        expect(r.status).toBe(200);
        return (r.json['alertes'] as Json[]).map((a) => a['id'] as string);
      };

      // One order, ready 61 minutes ago; a parcel of two, its latest fact 65 minutes ago.
      const O = 'ord-alertes-seam';
      const readyAt = iso(-61 * MINUTE);
      await intake('/intake/funding', { orderId: O, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: iso(-90 * MINUTE) });
      await intake('/intake/readiness', { orderId: O, ready: true, asOf: readyAt, supplierRef: SUPPLIER });
      const A = 'ord-alertes-colis-a';
      const B = 'ord-alertes-colis-b';
      const colis = { packageId: 'col-alertes-seam', orderIds: [A, B] };
      const dernier = iso(-65 * MINUTE);
      await intake('/intake/funding', { orderId: A, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: iso(-100 * MINUTE), package: colis });
      await intake('/intake/readiness', { orderId: A, ready: true, asOf: iso(-80 * MINUTE), supplierRef: SUPPLIER });
      await intake('/intake/funding', { orderId: B, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: iso(-70 * MINUTE), package: colis });
      await intake('/intake/readiness', { orderId: B, ready: true, asOf: dernier, supplierRef: SUPPLIER });
      const ID = `ready_package_no_task:${O}:${readyAt}`;
      const ID_PRET = `ready_package_no_task:${A}:${dernier}`;
      // Proof received 31 minutes ago with no decision; a custody file whose replay differs, seen 5 minutes ago.
      const P = 'ord-alertes-preuve';
      const soumise = iso(-31 * MINUTE);
      await produire('evidence_not_validated_aging', P, iso(0), { task_id: `task-${P}`, submitted_at: soumise, age_min: 31 });
      const G = 'ord-alertes-garde';
      const vueA = iso(-5 * MINUTE);
      await produire('impossible_custody', G, vueA, { package_id: `pkg-${G}`, task_id: `task-${G}`, detail: 'replay_diverged' });
      const ID_PREUVE = `evidence_not_validated_aging:${P}`;
      const ID_GARDE = `impossible_custody:${G}`;
      expect(await ouvertes(), 'Séra raised all four, oldest first').toEqual([ID_PRET, ID, ID_PREUVE, ID_GARDE]);

      const port = httpAlertesService(BASE, OPS, surveille);
      expect(await port.lire(), 'the port reads what Séra raised, in Séra\'s order').toEqual({
        kind: 'ok',
        alertes: [
          { id: ID_PRET, scenario: 'ready_package_no_task', orderId: A, orderIds: [A, B], depuis: dernier, detail: null },
          { id: ID, scenario: 'ready_package_no_task', orderId: O, orderIds: null, depuis: readyAt, detail: null },
          { id: ID_PREUVE, scenario: 'evidence_not_validated_aging', orderId: P, orderIds: null, depuis: soumise, detail: null },
          { id: ID_GARDE, scenario: 'impossible_custody', orderId: G, orderIds: null, depuis: vueA, detail: 'replay_diverged' },
        ],
        // Every entry the real Worker sends is one the port reads.
        entreesIllisibles: false,
      });
      expect(appels.map((a) => a.cle), 'one read, of the alerts door').toEqual(['GET /ops/alertes']);
      expect(appels[0]!.auth, 'on his Séra key, in the Authorization header').toBe(`Bearer ${OPS}`);

      expect(await port.marquerVu(ID_PRET)).toEqual({ kind: 'vu' });
      expect(appels[1], 'one ack, naming the alert and the founder').toEqual({ cle: 'POST /ops/alertes/ack', auth: `Bearer ${OPS}`, corps: { id: ID_PRET, by: 'founder' } });
      expect(await ouvertes(), 'ASK THE BOOK: closed, the others still open').toEqual([ID, ID_PREUVE, ID_GARDE]);
      expect(await fermeePar(ID_PRET), 'ASK THE BOOK: closed by the founder').toBe('founder');
      expect(await port.marquerVu(ID_PRET), 'closed twice is still closed').toEqual({ kind: 'vu' });

      // Custody's two close the same way, on the same door.
      expect(await port.marquerVu(ID_PREUVE)).toEqual({ kind: 'vu' });
      expect(await port.marquerVu(ID_GARDE)).toEqual({ kind: 'vu' });
      expect(await ouvertes(), 'ASK THE BOOK: only the ready order is still open').toEqual([ID]);
      expect(await fermeePar(ID_PREUVE)).toBe('founder');
      expect(await fermeePar(ID_GARDE)).toBe('founder');

      // Its course composed before he pressed: Séra no longer holds it raised, and says so.
      const tache = await direct('/ops/task', OPS, { command_id: 't-alertes-seam', orderId: O, location: LOC, window: { start: iso(0), end: iso(8 * 60 * MINUTE) } });
      expect(tache.status, JSON.stringify(tache.json)).toBe(200);
      expect(await port.marquerVu(ID), 'an alert Séra no longer holds is not « vu »').toEqual({ kind: 'refused', reason: 'alerte_inconnue' });
      expect(await port.lire()).toEqual({ kind: 'ok', alertes: [], entreesIllisibles: false });

      // A key Séra refuses, on its real answer; and a network that never answers.
      expect(await httpAlertesService(BASE, 'une-cle-que-sera-refuse', surveille).lire()).toEqual({ kind: 'bad_key' });
      expect(await httpAlertesService(BASE, 'une-cle-que-sera-refuse', surveille).marquerVu(ID)).toEqual({ kind: 'bad_key' });
      const horsLigne = (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof globalThis.fetch;
      expect(await httpAlertesService(BASE, OPS, horsLigne).lire()).toEqual({ kind: 'unreachable' });
      expect(await httpAlertesService(BASE, OPS, horsLigne).marquerVu(ID)).toEqual({ kind: 'unreachable' });
    } finally {
      await mf.dispose();
    }
  }, 60_000);
});
