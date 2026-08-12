import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import { httpCoursiersService } from '../src/coursiers/service';

/**
 * ═══ THE SEAM: RETIRER UN COURSIER, console port → REAL Séra worker ═══
 *
 * Founder, 2026-08-12: « add a way to remove riders as well on coursiers. »
 *
 * The walk (`rendu-coursiers.test.tsx`) proves the SCREEN, against a double.
 * Séra's own e2e proves the DOOR. Between them sits a seam nothing was
 * asserting: the field name. The door refuses `428 custody_bound_not_asserted`
 * unless the request carries `custodyNotBegun: true` — so a console that
 * spelled it `custody_not_begun`, or dropped it, would pass every test in both
 * repos and remove NOBODY on the founder's screen. This test drives the
 * console's OWN port against the REAL worker and asks the ROSTER for the
 * outcome, never the response.
 *
 * ⚠ MINIFLARE IS RESOLVED FROM A SERVICE PACKAGE, and the file SKIPS honestly
 * when the Séra bundle is absent — the same two rules the courses seam test
 * states, for the same reasons (a console bundle must not grow a Workers
 * runtime; this repo's CI has no `sera` clone).
 */

const SERA_BUNDLE = '/home/user/sera/services/logistics-service/dist-worker/worker.mjs';
const OPS = 'test-sera-ops-retrait-coursier';
const INTAKE = 'test-sera-intake-retrait-coursier';
const T = '2026-08-12T09:00:00.000Z';

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

describe.skipIf(Miniflare === null || !existsSync(SERA_BUNDLE))('RETIRER-COURSIER — the console removes a REAL rider from a REAL roster', () => {
  it('removes a free rider, and REFUSES the one carrying a parcel — asked of the roster, not the answer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'retrait-coursier-seam-'));
    dirs.push(dir);
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
    const roster = async (): Promise<string[]> => {
      const lu = await port.liste();
      if (lu.kind !== 'ok') throw new Error(`roster unreadable: ${lu.kind}`);
      return lu.value.map((c) => c.riderId);
    };

    // Two real riders on the real roster; one of them will take a course.
    for (const riderId of ['rider-libre-seam', 'rider-porteur-seam']) {
      await direct('/ops/riders', { riderId, displayName: riderId, phoneAlias: `alias-${riderId}` }, OPS);
      await direct('/ops/riders/certify', { riderId, certified: true }, OPS);
    }
    const code = ((await (await direct('/ops/rider-code/mint', { riderId: 'rider-porteur-seam' }, OPS)).json()) as Record<string, unknown>)['code'] as string;
    await mf.dispatchFetch('http://sera/rider/ack-privacy', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });
    await mf.dispatchFetch('http://sera/rider/shift/start', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });

    const ORDER = 'ord-seam-retrait';
    expect((await direct('/intake/funding', { orderId: ORDER, status: 'funded', paymentMode: 'FULL_PREPAY', asOf: T }, INTAKE)).status).toBe(200);
    expect((await direct('/intake/readiness', { orderId: ORDER, ready: true, asOf: T, supplierRef: 'supplier-seam' }, INTAKE)).status).toBe(200);
    const composed = await direct(
      '/ops/task',
      {
        command_id: 'seam-retrait-t1',
        orderId: ORDER,
        location: { zone: 'Zogona, Ouagadougou', landmark: "À l'échangeur", directions: '', maskedRelay: '' },
        window: { start: T, end: '2026-08-12T18:00:00.000Z' },
      },
      OPS,
    );
    expect(composed.status, await composed.clone().text()).toBe(200);
    const taskId = ((await composed.json()) as Record<string, unknown>)['taskId'] as string;
    const granted = await direct('/ops/assign', { command_id: 'seam-retrait-a1', taskId, riderId: 'rider-porteur-seam' }, OPS);
    expect(granted.status, await granted.clone().text()).toBe(200);

    expect(await roster()).toEqual(expect.arrayContaining(['rider-libre-seam', 'rider-porteur-seam']));

    // ── THE FREE RIDER GOES, through the console's own port ───────────────
    // ⚠ THIS IS THE FIELD-NAME PROOF. A port that stopped asserting the
    // custody bound gets 428 here and this line reads `refused`.
    const parti = await port.retirerCoursier('rider-libre-seam');
    expect(parti.kind, JSON.stringify(parti)).toBe('ok');
    expect(await roster(), 'the roster still names a rider the server removed').not.toContain('rider-libre-seam');

    // ── AND THE CARRYING RIDER IS REFUSED, BY NAME ────────────────────────
    const refuse = await port.retirerCoursier('rider-porteur-seam');
    expect(refuse.kind).toBe('refused');
    expect(
      refuse.kind === 'refused' ? refuse.reason : '',
      'the console must receive the NAMED reason — it is the sentence the screen shows him',
    ).toBe('rider_carrying');
    // Asked of the roster: nothing moved, and his code still opens the app.
    expect(await roster()).toContain('rider-porteur-seam');
    const encore = await mf.dispatchFetch('http://sera/rider/moi', { headers: { Authorization: `Bearer ${code}` } });
    expect(encore.status, 'a refused removal locked the carrying rider out of his own course').toBe(200);

    await mf.dispose();
  }, 60_000);
});
