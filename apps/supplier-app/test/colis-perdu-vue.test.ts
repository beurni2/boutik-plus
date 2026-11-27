import { describe, expect, it } from 'vitest';
import { colisEnMain, httpColisPerdu, resolveColisPerdu } from '../src/colis-perdu/service';
import { aRenvoyer, montantTape, phraseReponse } from '../src/colis-perdu/view';
import { t } from '../src/i18n';

/**
 * COLIS-PERDU — the port reads every answer of Séra's declare door by name,
 * and nothing it cannot read is ever « declared ». A plain fetch double, as
 * the SOS port's tests use: the door's real answers are walked on Séra's own
 * Workers in `rendu-colis-perdu.e2e.test.tsx`.
 */

type Appel = { url: string; init: RequestInit | undefined };

function doublure(status: number, corps: unknown, brut = false) {
  const appels: Appel[] = [];
  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    appels.push({ url, init });
    return new Response(brut ? String(corps) : JSON.stringify(corps), { status });
  };
  return { appels, port: httpColisPerdu('http://sera.test/', 'cle-sera', fetchFn, 50) };
}

const MONTANTS = [{ orderId: 'ord-1', amount: 15000 }];

describe('the declare door, answer by answer', () => {
  const cas: [number, unknown, string][] = [
    [200, { ok: true, status: 'declare' }, 'declare'],
    [200, { ok: true, status: 'deja_declare' }, 'deja_declare'],
    [409, { ok: false, reason: 'no_active_course' }, 'no_active_course'],
    [409, { ok: false, reason: 'pas_chez_le_livreur' }, 'pas_chez_le_livreur'],
    [400, { ok: false, reason: 'montants_incomplets' }, 'montants_incomplets'],
    [400, { ok: false, reason: 'malformed' }, 'malformed'],
    [503, { ok: false, reason: 'custody_non_relie' }, 'custody'],
    [503, { ok: false, reason: 'custody_unreachable' }, 'custody'],
    [401, { error: 'unauthorized' }, 'bad_key'],
    [403, { error: 'forbidden' }, 'bad_key'],
    // Anything else is not Séra's word: nobody knows whether it landed.
    [200, { ok: true }, 'non_su'],
    [200, { ok: true, status: 'declared' }, 'non_su'],
    [200, { ok: false, status: 'declare' }, 'non_su'],
    [409, { ok: false, reason: 'montants_incomplets' }, 'non_su'],
    [500, { ok: false, reason: 'pas_chez_le_livreur' }, 'non_su'],
    [502, { ok: false }, 'non_su'],
    [404, { ok: false, reason: 'not_found' }, 'non_su'],
  ];
  for (const [status, corps, attendu] of cas) {
    it(`${status} ${JSON.stringify(corps)} → ${attendu}`, async () => {
      const { port } = doublure(status, corps);
      expect((await port.declarer('cmd-1', 'ord-1', MONTANTS)).kind).toBe(attendu);
    });
  }

  it('a 200 whose body is not JSON is « not known »', async () => {
    const { port } = doublure(200, '<html>ok</html>', true);
    expect((await port.declarer('cmd-1', 'ord-1', MONTANTS)).kind).toBe('non_su');
  });

  it('no network, or a stall past the limit, is « not known »', async () => {
    const horsLigne = httpColisPerdu('http://sera.test', 'k', async () => { throw new TypeError('Failed to fetch'); }, 50);
    expect((await horsLigne.declarer('c', 'o', MONTANTS)).kind).toBe('non_su');
    const bloque = httpColisPerdu('http://sera.test', 'k', (_u, init) => new Promise((_, no) => {
      init?.signal?.addEventListener('abort', () => no(new DOMException('aborted', 'AbortError')));
    }), 50);
    expect((await bloque.declarer('c', 'o', MONTANTS)).kind).toBe('non_su');
  });

  it('sends exactly the command id, the course and the typed amounts, on his Séra key only', async () => {
    const { appels, port } = doublure(200, { ok: true, status: 'declare' });
    await port.declarer('cmd-42', 'ord-c-a', [{ orderId: 'ord-c-a', amount: 12000 }, { orderId: 'ord-c-b', amount: 2500 }]);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe('http://sera.test/ops/colis/perdu');
    expect(appels[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(appels[0]!.init?.body))).toEqual({
      command_id: 'cmd-42',
      orderId: 'ord-c-a',
      montants: [{ orderId: 'ord-c-a', amount: 12000 }, { orderId: 'ord-c-b', amount: 2500 }],
    });
    expect((appels[0]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-sera');
  });
});

describe('the board: only parcels a rider holds', () => {
  const T = '2026-11-27T09:00:00.000Z';
  const planche = (o: { readings: Record<string, string>; colis?: string[] }) => ({
    ok: true,
    board: {
      riders: [{ riderId: 'r-awa', displayName: 'Awa' }],
      assignments: [{ assignmentId: 'a1', orderId: 'ord-a', riderId: 'r-awa', status: 'acknowledged' }],
      manifestes: { 'r-awa': { custodyReadings: Object.entries(o.readings).map(([orderId, reading]) => ({ orderId, reading, asOf: T })) } },
      colisEnCourse: o.colis === undefined ? {} : { a1: { orderIds: o.colis } },
    },
  });

  it('a course custody places with its rider is offered, with his name and no price', () => {
    expect(colisEnMain(planche({ readings: { 'ord-a': 'coursier' } }))).toEqual([
      { orderId: 'ord-a', commandes: ['ord-a'], riderId: 'r-awa', nom: 'Awa' },
    ]);
  });

  it('at the stall, unknown, or no reading at all: not offered', () => {
    expect(colisEnMain(planche({ readings: { 'ord-a': 'ailleurs' } }))).toEqual([]);
    expect(colisEnMain(planche({ readings: { 'ord-a': 'inconnue' } }))).toEqual([]);
    expect(colisEnMain(planche({ readings: {} }))).toEqual([]);
  });

  it('a parcel of two orders is offered only when the rider holds both, and names both', () => {
    expect(colisEnMain(planche({ readings: { 'ord-a': 'coursier' }, colis: ['ord-a', 'ord-b'] }))).toEqual([]);
    expect(colisEnMain(planche({ readings: { 'ord-a': 'coursier', 'ord-b': 'coursier' }, colis: ['ord-a', 'ord-b'] }))).toEqual([
      { orderId: 'ord-a', commandes: ['ord-a', 'ord-b'], riderId: 'r-awa', nom: 'Awa' },
    ]);
  });

  it('a body that is not the board is unread, never « nothing held »', async () => {
    expect(colisEnMain({ ok: true })).toBeNull();
    expect((await doublure(200, { ok: true }).port.lire()).kind).toBe('unreachable');
    expect((await doublure(401, { error: 'unauthorized' }).port.lire()).kind).toBe('bad_key');
  });

  it('no Séra address or no key: no port at all, never a demo', () => {
    delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
    expect(resolveColisPerdu('k')).toBeNull();
    process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = 'http://sera.test';
    expect(resolveColisPerdu('  ')).toBeNull();
    expect(resolveColisPerdu('k')).not.toBeNull();
    delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
  });
});

describe('what he types, and what may be sent again', () => {
  it('whole francs above zero only; the console never rounds one', () => {
    expect(montantTape('15000')).toBe(15000);
    expect(montantTape('12 000')).toBe(12000);
    for (const faux of ['', '0', '00', '-5', '2500,50', '2500.5', '1e3', 'abc', '99999999999999999']) expect(montantTape(faux), faux).toBeNull();
  });

  it('only an unknown outcome, or custody not asked, sends the same declaration again', () => {
    expect(aRenvoyer({ kind: 'non_su' })).toBe(true);
    expect(aRenvoyer({ kind: 'custody' })).toBe(true);
    for (const k of ['declare', 'deja_declare', 'no_active_course', 'pas_chez_le_livreur', 'montants_incomplets', 'malformed', 'bad_key'] as const) {
      expect(aRenvoyer({ kind: k }), k).toBe(false);
    }
  });

  it('a 503 never says « nothing was declared »: Séra may have finished part of the parcel', () => {
    const phrase = t(phraseReponse({ kind: 'custody' }));
    expect(phrase).toBe("Séra n'a pas pu finir la déclaration. Réessayez : ce qui est déjà fait ne sera pas refait.");
    expect(phrase).not.toContain("Rien n'a été déclaré");
  });

  it('every answer has its sentence in the catalog', () => {
    for (const k of ['declare', 'deja_declare', 'no_active_course', 'pas_chez_le_livreur', 'montants_incomplets', 'malformed', 'custody', 'bad_key', 'non_su'] as const) {
      expect(t(phraseReponse({ kind: k })).length, k).toBeGreaterThan(0);
    }
  });
});
