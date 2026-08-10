import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import { httpCoursiersService } from '../src/coursiers/service';

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
 * ⚠ SKIPPED WHEN THE SÉRA BUNDLE IS ABSENT, and that is stated rather than
 * hidden: this repo's CI has no `sera` clone, so in CI this file skips
 * honestly instead of failing or — worse — quietly proving nothing against a
 * stub. It runs on the machine where both repos live, which is where the
 * cross-repo proof belongs (the same rule the odyssey follows).
 */

const SERA_BUNDLE = '/home/user/sera/services/logistics-service/dist-worker/worker.mjs';
const OPS = 'test-sera-ops-courses';
const INTAKE = 'test-sera-intake-courses';
const T = '2026-08-10T09:00:00.000Z';

/** Resolved from the offer-service, which legitimately depends on it. */
type MiniflareCtor = new (opts: Record<string, unknown>) => {
  dispatchFetch(url: string, init?: unknown): Promise<Response>;
  dispose(): Promise<void>;
};
function loadMiniflare(): MiniflareCtor | null {
  try {
    const req = createRequire('/home/user/boutik-plus/services/offer-service/package.json');
    return (req('miniflare') as { Miniflare: MiniflareCtor }).Miniflare;
  } catch {
    return null;
  }
}
const Miniflare = loadMiniflare();

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe.skipIf(Miniflare === null || !existsSync(SERA_BUNDLE))('PURGE-ESSAI-COURSES — the console clears a REAL course off a REAL board', () => {
  it('composes a live course, retires it through THIS console port, and the BOARD says it is gone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'courses-seam-'));
    dirs.push(dir);
    // The bundle is handed over as CONTENTS: workerd refuses a scriptPath that
    // climbs out of the starting directory, and the Séra bundle is elsewhere.
    const mf = new Miniflare!({
      modules: [{ type: 'ESModule', path: 'sera-logistics.mjs', contents: readFileSync(SERA_BUNDLE, 'utf8') }],
      durableObjects: { LOGISTICS: 'LogisticsDO' },
      durableObjectsPersist: dir,
      bindings: { SERA_OPS_SECRET: OPS, SERA_INTAKE_SECRET: INTAKE },
    });

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

    // …the order does not resurrect as composable…
    const aPreparer = await (await mf.dispatchFetch('http://sera/ops/a-preparer', { headers: { Authorization: `Bearer ${OPS}` } })).text();
    expect(aPreparer).not.toContain(ORDER);

    // …and a second retire is quiet, not an error (the sweep re-runs).
    expect((await port.retirerCourse(ORDER, 'seam-cmd-2')).kind).toBe('ok');

    await mf.dispose();
  }, 60_000);
});
