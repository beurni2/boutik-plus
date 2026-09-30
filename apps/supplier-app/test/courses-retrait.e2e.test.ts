import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { httpCoursiersService } from '../src/coursiers/service';
import { RAISON_SAUT, SERA_BUNDLE, exigerBundleAJour, miniflareDuDepot, titreSeam } from './sera-bundle';

/**
 * ═══ THE SEAM: this console's OWN port against the REAL Séra worker ═══
 *
 * The house law — a slice that crosses a seam is not done until ONE test
 * crosses that seam end to end, driving the app's own port against the real
 * service and asking the LEDGER for the outcome rather than believing the
 * response. Here the ledger is Séra's `/ops/board`.
 *
 * ⚠ MINIFLARE IS RESOLVED FROM A SERVICE PACKAGE, not added as a dependency
 * of this app: a console bundle must not grow a Workers runtime in its
 * dependency graph to satisfy a test (the bundle-absence gate exists for
 * exactly that class of drift).
 *
 * ⚠ SKIPPED WHEN THE SÉRA BUNDLE IS ABSENT, and the reason is IN THE TITLE
 * (AUDIT-B+2 F-83 — `sera-bundle.ts`): this repo's CI has no `sera` clone,
 * so there it says it skipped and why, instead of failing or — worse — quietly
 * proving nothing against a stub. Beside a Séra checkout it runs, and a bundle
 * older than Séra's source is refused rather than trusted.
 */

const OPS = 'test-sera-ops-courses';
const INTAKE = 'test-sera-intake-courses';
const T = '2026-08-10T09:00:00.000Z';

/** Resolved from the offer-service, which legitimately depends on it. */
const Miniflare = miniflareDuDepot();

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function spawn(prefix: string): InstanceType<typeof Miniflare> {
  exigerBundleAJour();
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  // The bundle is handed over as CONTENTS: workerd refuses a scriptPath that
  // climbs out of the starting directory, and the Séra bundle is elsewhere.
  return new Miniflare({
    modules: [{ type: 'ESModule', path: 'sera-logistics.mjs', contents: readFileSync(SERA_BUNDLE, 'utf8') }],
    durableObjects: { LOGISTICS: 'LogisticsDO' },
    durableObjectsPersist: dir,
    bindings: { SERA_OPS_SECRET: OPS, SERA_INTAKE_SECRET: INTAKE },
  });
}

describe.skipIf(RAISON_SAUT !== null)(titreSeam('PURGE-ESSAI-COURSES — the console clears a REAL course off a REAL board'), () => {
  it('composes a live course, retires it through THIS console port, and the BOARD says it is gone', async () => {
    const mf = spawn('courses-seam-');

    const asFetch = ((url: string, init?: RequestInit) =>
      mf.dispatchFetch(url, init as never)) as unknown as typeof globalThis.fetch;
    // THE CONSOLE'S OWN PORT — the same code the founder's browser runs.
    const port = httpCoursiersService('http://sera', OPS, asFetch as never);

    const direct = async (path: string, body: unknown, key: string): Promise<Response> =>
      mf.dispatchFetch(`http://sera${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });

    const ORDER = 'ord-seam-courses';
    // The two producer facts, then the founder's own compose — the real gate.
    expect((await direct('/intake/funding', { orderId: ORDER, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: T }, INTAKE)).status).toBe(200);
    expect((await direct('/intake/readiness', { orderId: ORDER, ready: true, asOf: T, supplierRef: 'supplier-seam' }, INTAKE)).status).toBe(200);
    const composed = await direct(
      '/ops/task',
      {
        command_id: 'seam-t1',
        orderId: ORDER,
        location: { zone: 'Zogona, Ouagadougou', landmark: "À l'échangeur", directions: '', maskedRelay: '' },
        window: { start: T, end: '2026-08-10T18:00:00.000Z' },
      },
      OPS,
    );
    expect(composed.status, await composed.clone().text()).toBe(200);
    const taskId = ((await composed.json()) as Record<string, unknown>)['taskId'] as string;

    // A real rider, certified, on shift, carrying it.
    await direct('/ops/riders', { riderId: 'rider-seam', displayName: 'Boss', phoneAlias: 'seam' }, OPS);
    await direct('/ops/riders/certify', { riderId: 'rider-seam', certified: true }, OPS);
    const code = ((await (await direct('/ops/rider-code/mint', { riderId: 'rider-seam' }, OPS)).json()) as Record<string, unknown>)['code'] as string;
    await mf.dispatchFetch('http://sera/rider/ack-privacy', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });
    await mf.dispatchFetch('http://sera/rider/shift/start', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });
    const granted = await direct('/ops/assign', { command_id: 'seam-a1', taskId, riderId: 'rider-seam' }, OPS);
    expect(granted.status, await granted.clone().text()).toBe(200);
    // The rider's OWN app read: the course is on it.
    const saCourse = async (): Promise<unknown> =>
      ((await (await mf.dispatchFetch('http://sera/rider/moi', { headers: { Authorization: `Bearer ${code}` } })).json()) as {
        rider: { assignment: unknown };
      }).rider.assignment;
    expect(await saCourse(), 'before the retire, the course is on his app').not.toBeNull();

    // ── THE CONSOLE READS THE BOARD through its own port ──────────────────
    const avant = await port.courses();
    expect(avant.kind).toBe('ok');
    if (avant.kind !== 'ok') throw new Error('board unreadable');
    const ligne = avant.value.find((c) => c.orderId === ORDER);
    expect(ligne, 'the course must be on the desk').toBeDefined();
    expect(ligne, 'and it must say a rider is carrying it — the dangerous case').toMatchObject({
      confiee: true,
      coursier: 'rider-seam',
    });

    // ── AND RETIRES IT through its own port ───────────────────────────────
    const retire = await port.retirerCourse(ORDER, 'seam-cmd-1');
    expect(retire.kind, JSON.stringify(retire)).toBe('ok');

    // ── ASK THE BOARD, not the answer ─────────────────────────────────────
    const apres = await port.courses();
    if (apres.kind !== 'ok') throw new Error('board unreadable after retire');
    expect(apres.value.map((c) => c.orderId)).not.toContain(ORDER);

    // …the rider is free again (SE-I01: a purge must not strand a lease)…
    const board = (await (await mf.dispatchFetch('http://sera/ops/board', { headers: { Authorization: `Bearer ${OPS}` } })).json()) as
      { board: { riders: { riderId: string; assignable: boolean }[]; assignments: unknown[] } };
    expect(board.board.assignments).toEqual([]);
    expect(board.board.riders.find((r) => r.riderId === 'rider-seam')?.assignable).toBe(true);

    // …the course is GONE FROM HIS APP (AUDIT-B+2 F-65: the one custody
    // sentence says exactly this — « la course disparaît de son application :
    // il ne pourra plus le livrer »), which is what makes it the truth…
    expect(await saCourse(), 'after the retire, his app has no course to deliver').toBeNull();

    // …the order does not resurrect as composable…
    const aPreparer = await (await mf.dispatchFetch('http://sera/ops/a-preparer', { headers: { Authorization: `Bearer ${OPS}` } })).text();
    expect(aPreparer).not.toContain(ORDER);

    // …and a second retire is quiet, not an error (the sweep re-runs).
    expect((await port.retirerCourse(ORDER, 'seam-cmd-2')).kind).toBe('ok');

    await mf.dispose();
  }, 60_000);

  it('AUDIT-B+2 F-64 — a package a rider carries: the desk reads it as one bag, one article is refused by name, and « Retirer tout le colis » takes it whole', async () => {
    const mf = spawn('courses-colis-seam-');
    const direct = async (path: string, body: unknown, key: string): Promise<Response> =>
      mf.dispatchFetch(`http://sera${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
    const asFetch = ((url: string, init?: RequestInit) =>
      mf.dispatchFetch(url, init as never)) as unknown as typeof globalThis.fetch;
    const port = httpCoursiersService('http://sera', OPS, asFetch as never);

    const A = 'ord-seam-colis-a';
    const B = 'ord-seam-colis-b';
    for (const orderId of [A, B]) {
      expect((await direct('/intake/funding', { orderId, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: T, package: { packageId: 'col-seam', orderIds: [A, B] } }, INTAKE)).status).toBe(200);
      expect((await direct('/intake/readiness', { orderId, ready: true, asOf: T, supplierRef: 'supplier-seam' }, INTAKE)).status).toBe(200);
    }
    const composed = await direct(
      '/ops/task',
      {
        command_id: 'seam-colis-t',
        orderId: A,
        location: { zone: 'Zogona, Ouagadougou', landmark: "À l'échangeur", directions: '', maskedRelay: '' },
        window: { start: T, end: '2026-08-10T18:00:00.000Z' },
        articles: [{ orderId: A, libelle: 'Pagne wax' }, { orderId: B, libelle: 'Sandales' }],
      },
      OPS,
    );
    expect(composed.status, await composed.clone().text()).toBe(200);
    const taskId = ((await composed.json()) as Record<string, unknown>)['taskId'] as string;

    // WAITING, the desk already sees one bag (the queued row names it).
    const attente = await port.courses();
    if (attente.kind !== 'ok') throw new Error('board unreadable');
    expect(attente.value.find((c) => c.orderId === A)).toMatchObject({ confiee: false, colis: [A, B] });

    await direct('/ops/riders', { riderId: 'rider-colis', displayName: 'Boss', phoneAlias: 'seam-colis' }, OPS);
    await direct('/ops/riders/certify', { riderId: 'rider-colis', certified: true }, OPS);
    const code = ((await (await direct('/ops/rider-code/mint', { riderId: 'rider-colis' }, OPS)).json()) as Record<string, unknown>)['code'] as string;
    await mf.dispatchFetch('http://sera/rider/ack-privacy', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });
    await mf.dispatchFetch('http://sera/rider/shift/start', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });
    const granted = await direct('/ops/assign', { command_id: 'seam-colis-a1', taskId, riderId: 'rider-colis' }, OPS);
    expect(granted.status, await granted.clone().text()).toBe(200);

    // CARRIED: the desk reads the bag through its own port.
    const tenu = await port.courses();
    if (tenu.kind !== 'ok') throw new Error('board unreadable');
    const ligne = tenu.value.find((c) => c.orderId === A);
    expect(ligne, 'the carried bag is on the desk as one course naming both articles').toMatchObject({ confiee: true, colis: [A, B] });

    // One article alone: refused BY NAME — the refusal the desk now says.
    expect(await port.retirerCourse(B, 'seam-colis-cmd-1')).toEqual({ kind: 'refused', reason: 'colis_en_course' });
    const encore = await port.courses();
    if (encore.kind !== 'ok') throw new Error('board unreadable');
    expect(encore.value.find((c) => c.orderId === A), 'the refusal moved nothing').toMatchObject({ confiee: true });

    // The whole bag, as « Retirer tout le colis » sends it.
    expect((await port.retirerCourse(A, 'seam-colis-cmd-2', true)).kind).toBe('ok');
    const apres = await port.courses();
    if (apres.kind !== 'ok') throw new Error('board unreadable after retire');
    expect(apres.value.map((c) => c.orderId), 'ASK THE BOARD: the bag is gone').toEqual([]);
    const moi = (await (await mf.dispatchFetch('http://sera/rider/moi', { headers: { Authorization: `Bearer ${code}` } })).json()) as {
      rider: { assignment: unknown };
    };
    expect(moi.rider.assignment, 'and so is his course').toBeNull();

    await mf.dispose();
  }, 60_000);
});
