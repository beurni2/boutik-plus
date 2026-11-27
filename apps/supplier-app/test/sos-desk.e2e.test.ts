import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { httpSosService } from '../src/sos/service';
import { SERA, miniflareDuDepot } from './bundle-voisin';

/**
 * ═══ THE SEAM: a rider's SOS, rider app → REAL Séra worker → the console's
 * own port, and back ═══
 *
 * A rider's alert reached Séra's book and was read by no screen: nothing in
 * this console asked `GET /ops/sos`. This test raises the alert with the
 * rider app's OWN sender (`apps/rider-app/src/net/sos-wire.ts` in the Séra
 * repo, imported from the clone beside this one), so the body is the one a
 * real phone sends:
 *
 *     POST ${root}/rider/sos
 *     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` }
 *     body: JSON.stringify({ command_id: entry.commandId, riderId: intent.riderId,
 *       hours: intent.hours, onShift: intent.onShift,
 *       activeCourseId: intent.activeCourseId, raisedAt: intent.raisedAt })
 *
 * Then the console's OWN port reads it as open, answers it, and the BOOK is
 * asked whether the answer landed — never the port's word for it.
 *
 * ⚠ MINIFLARE IS RESOLVED FROM A SERVICE PACKAGE, and the file SKIPS — with the
 * reason in its title — when the Séra bundle is absent (`bundle-voisin.ts`).
 */

const OPS = 'test-sera-ops-sos-desk';
const INTAKE = 'test-sera-intake-sos-desk';
const T = '2026-11-27T09:00:00.000Z';
const RIDER = 'rider-sos-seam';
const NOM = 'Awa Sos';
const TEL = '70 11 22 33';

const Miniflare = miniflareDuDepot();

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

type Envoi = (entry: { commandId: string; kind: string; payload: unknown; status: 'pending' }) => Promise<string>;
type Expediteur = (base: string, code: string, fetchFn: typeof globalThis.fetch) => Envoi;

/** The rider app's own sender, from the Séra clone the bundle came from. */
async function expediteurDuCoursier(): Promise<Expediteur> {
  const racine = join(dirname(SERA.bundle), '..', '..', '..');
  const mod = (await import(join(racine, 'apps/rider-app/src/net/sos-wire.ts'))) as { httpSosSender: Expediteur };
  return mod.httpSosSender;
}

interface Incident {
  commandId: string;
  riderId: string;
  state: string;
  acknowledgedBy: string | null;
  activeCourseId: string | null;
}

describe.skipIf(SERA.raisonSaut !== null)(SERA.titre('SOS-DESK — a real SOS reaches the console, and its answer reaches the book'), () => {
  it('raised by the rider app, read open by the console, answered by the founder — asked of the book, not the answer', async () => {
    SERA.exigerAJour();
    const dir = mkdtempSync(join(tmpdir(), 'sos-desk-seam-'));
    dirs.push(dir);
    const mf = new Miniflare({
      modules: [{ type: 'ESModule', path: 'sera-logistics.mjs', contents: readFileSync(SERA.bundle, 'utf8') }],
      durableObjects: { LOGISTICS: 'LogisticsDO' },
      durableObjectsPersist: dir,
      bindings: { SERA_OPS_SECRET: OPS, SERA_INTAKE_SECRET: INTAKE },
    });
    const asFetch = ((url: string, init?: RequestInit) =>
      mf.dispatchFetch(url, init as never)) as unknown as typeof globalThis.fetch;
    const appels: string[] = [];
    const surveille = ((url: string, init?: RequestInit) => {
      appels.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      return asFetch(url, init);
    }) as typeof globalThis.fetch;

    // THE CONSOLE'S OWN PORT — the same code the founder's browser runs.
    const port = httpSosService('http://sera', OPS, surveille);

    const direct = async (path: string, body: unknown, key: string): Promise<Response> =>
      mf.dispatchFetch(`http://sera${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
    const livre = async (): Promise<Incident[]> => {
      const r = await mf.dispatchFetch('http://sera/ops/sos', { headers: { Authorization: `Bearer ${OPS}` } });
      expect(r.status).toBe(200);
      return ((await r.json()) as { incidents: Incident[] }).incidents;
    };

    // A real rider: on the roster with the phone he typed, certified, a code.
    expect((await direct('/ops/riders', { riderId: RIDER, displayName: NOM, phoneAlias: TEL }, OPS)).status).toBe(200);
    expect((await direct('/ops/riders/certify', { riderId: RIDER, certified: true }, OPS)).status).toBe(200);
    const code = ((await (await direct('/ops/rider-code/mint', { riderId: RIDER }, OPS)).json()) as Record<string, unknown>)['code'] as string;
    expect(typeof code).toBe('string');
    await mf.dispatchFetch('http://sera/rider/ack-privacy', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });
    await mf.dispatchFetch('http://sera/rider/shift/start', { method: 'POST', headers: { Authorization: `Bearer ${code}` } });

    // Nothing raised yet: the console reads an empty desk, and says so as empty.
    const vide = await port.lire();
    expect(vide, JSON.stringify(vide)).toEqual({ kind: 'ok', ouverts: [] });
    expect(appels, 'an empty desk asks for the SOS list only').toEqual(['GET /ops/sos']);

    // ── THE RIDER PRESSES SOS, through the rider app's own sender ────────────
    const envoyes: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const telephone = ((url: string, init?: RequestInit) => {
      envoyes.push({
        url,
        headers: { ...(init?.headers as Record<string, string>) },
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return asFetch(url, init);
    }) as typeof globalThis.fetch;
    const envoyer = (await expediteurDuCoursier())('http://sera', code, telephone);
    const raise = (commandId: string, activeCourseId: string | null, raisedAt: string): Promise<string> =>
      envoyer({
        commandId,
        kind: 'sos.raise',
        payload: { riderId: RIDER, hours: 'in_hours', onShift: true, activeCourseId, raisedAt },
        status: 'pending',
      });
    expect(await raise('sos-seam-1', null, T)).toBe('applied');
    // The body the phone really sent, pinned to the quote above.
    expect(envoyes[0]?.url).toBe('http://sera/rider/sos');
    expect(envoyes[0]?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${code}` });
    expect(Object.keys(envoyes[0]?.body ?? {})).toEqual(['command_id', 'riderId', 'hours', 'onShift', 'activeCourseId', 'raisedAt']);

    // A second alert, later, from the road (on a course): newest first.
    await new Promise((r) => setTimeout(r, 10));
    expect(await raise('sos-seam-2', 'course-seam-7', '2026-11-27T09:05:00.000Z')).toBe('applied');

    // ── THE CONSOLE READS BOTH, OPEN, NAMED, NEWEST FIRST ───────────────────
    appels.length = 0;
    const lu = await port.lire();
    expect(lu.kind, JSON.stringify(lu)).toBe('ok');
    const ouverts = lu.kind === 'ok' ? lu.ouverts : [];
    expect(ouverts.map((o) => o.commandId), 'both open, the newest first').toEqual(['sos-seam-2', 'sos-seam-1']);
    expect(ouverts.map((o) => [o.riderId, o.nom, o.telephone])).toEqual([
      [RIDER, NOM, TEL],
      [RIDER, NOM, TEL],
    ]);
    expect(ouverts.map((o) => o.enCourse), 'on a course or not, as the phone said').toEqual([true, false]);
    for (const o of ouverts) expect(Number.isNaN(Date.parse(o.recuA)), 'when Séra received it').toBe(false);
    expect(appels, 'the SOS list, then the roster for the names').toEqual(['GET /ops/sos', 'GET /ops/riders']);
    expect((await livre()).filter((i) => i.state === 'open').map((i) => i.commandId)).toEqual(['sos-seam-2', 'sos-seam-1']);

    // ── THE FOUNDER ANSWERS ONE — and the BOOK says so ───────────────────────
    const repondu = await port.repondre('sos-seam-2');
    expect(repondu, JSON.stringify(repondu)).toEqual({ kind: 'acknowledged' });
    const apres = await livre();
    const deux = apres.find((i) => i.commandId === 'sos-seam-2');
    expect(deux?.state, 'ASK THE BOOK: the answer landed').toBe('acknowledged');
    expect(deux?.acknowledgedBy, 'ASK THE BOOK: answered by the founder').toBe('founder');
    expect(apres.find((i) => i.commandId === 'sos-seam-1')?.state, 'the other alert is untouched').toBe('open');

    // The console now reads only the one still open.
    const relu = await port.lire();
    expect(relu.kind === 'ok' ? relu.ouverts.map((o) => o.commandId) : relu).toEqual(['sos-seam-1']);

    // Answering again (a second console, a double press) is still answered.
    expect(await port.repondre('sos-seam-2')).toEqual({ kind: 'acknowledged' });
    expect((await livre()).find((i) => i.commandId === 'sos-seam-2')?.acknowledgedBy, 'the first answer keeps the record').toBe('founder');

    // An alert the book never had is refused BY NAME, never « answered ».
    expect(await port.repondre('sos-jamais-leve')).toEqual({ kind: 'refused', reason: 'unknown_incident' });

    // A wrong key is the key's fault, not the network's.
    const mauvais = httpSosService('http://sera', 'pas-la-bonne-cle', asFetch);
    expect(await mauvais.lire()).toEqual({ kind: 'bad_key' });
    expect(await mauvais.repondre('sos-seam-1')).toEqual({ kind: 'bad_key' });
    expect((await livre()).find((i) => i.commandId === 'sos-seam-1')?.state, 'a refused key answered nothing').toBe('open');

    await mf.dispose();
  }, 60_000);
});
