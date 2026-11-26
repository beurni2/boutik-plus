import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLASSES_ALERTE, resolveDispatchService } from '../src/operations/dispatch-service';

/**
 * The founder sees what needs checking on his Commandes tab: the console reads
 * each order's « À vérifier » off Shop+'s key-C dispatch row strictly — but a
 * field it cannot read is still something to check, so it is kept as « another
 * alert », and never costs the row (its refund status and the phone beside it).
 * The dead-letter count is read on its own, and a count that cannot be read is
 * never shown as zero.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch(reply: (url: string) => Promise<Response>) {
  const spy = vi.fn((url: string, _init?: RequestInit) => reply(url));
  vi.stubGlobal('fetch', spy);
  return spy;
}

const T = '2026-11-26T09:30:00.000Z';
const ligne = (orderId: string, aVerifier: unknown, remboursement: unknown = null) => ({
  ok: true, exists: true, orderId, state: 'payment_pending', createdAt: T,
  contact: { phone: '70 11 22 33', quartier: 'Gounghin', repere: 'près du marché' },
  productVersionId: 'pv-1', zoneTo: 'Gounghin', remboursement, aVerifier,
});

async function lire(rows: unknown[]) {
  vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'https://shop.example/');
  stubFetch(async () => new Response(JSON.stringify({ ok: true, orders: rows })));
  const res = await resolveDispatchService()!.listLivraisons('cle-c');
  if (!res.ok) throw new Error(res.reason);
  return new Map(res.rows.map((r) => [r.orderId, r] as const));
}

describe('the console reads « À vérifier » off the row', () => {
  it('a known class keeps its class and its time; null and absent mean nothing to check', async () => {
    const rows = await lire([
      ligne('ord-a', { elements: [{ classe: 'provider_amount_contradicts_quote', le: T }, { classe: 'stuck_paiement', le: T }], coupees: 0 }),
      ligne('ord-vide', null),
      { ...ligne('ord-ancien', null), aVerifier: undefined },
    ]);
    expect(rows.get('ord-a')?.aVerifier).toEqual({
      elements: [{ classe: 'provider_amount_contradicts_quote', le: T }, { classe: 'stuck_paiement', le: T }],
      coupees: 0,
    });
    expect(rows.get('ord-vide')).toBeDefined();
    expect(rows.get('ord-vide')?.aVerifier).toBeUndefined();
    expect(rows.get('ord-ancien')?.aVerifier).toBeUndefined();
  });

  it('an unknown class is kept as « another alert » with its time — never dropped, never a crash', async () => {
    const rows = await lire([ligne('ord-x', { elements: [{ classe: 'une_classe_de_demain', le: T }], coupees: 0 })]);
    expect(rows.get('ord-x')?.aVerifier).toEqual({ elements: [{ classe: 'autre', le: T }], coupees: 0 });
  });

  it('a malformed item, a time in another format, a garbled field or a bad clipped count each keep the row and become « another alert »', async () => {
    const rows = await lire([
      ligne('ord-element', { elements: [{ classe: 7, le: T }, 'x', null], coupees: 0 }, { etat: 'bloque', raison: 'refus_illisible' }),
      ligne('ord-heure', { elements: [{ classe: 'stuck_paiement', le: '2026-11-26 09:30' }], coupees: 0 }),
      ligne('ord-champ', 'pas un objet'),
      ligne('ord-liste', { elements: 'non', coupees: 0 }),
      ligne('ord-coupees', { elements: [], coupees: -1 }),
    ]);
    expect(rows.get('ord-element')?.aVerifier).toEqual({ elements: [{ classe: 'autre' }, { classe: 'autre' }, { classe: 'autre' }], coupees: 0 });
    // The refund status beside it is untouched, and so is her phone.
    expect(rows.get('ord-element')?.remboursement).toEqual({ etat: 'bloque', raison: 'refus_illisible' });
    expect(rows.get('ord-element')?.contact?.phone).toBe('70 11 22 33');
    expect(rows.get('ord-heure')?.aVerifier).toEqual({ elements: [{ classe: 'stuck_paiement' }], coupees: 0 });
    expect(rows.get('ord-champ')?.aVerifier).toEqual({ elements: [{ classe: 'autre' }], coupees: 0 });
    expect(rows.get('ord-liste')?.aVerifier).toEqual({ elements: [{ classe: 'autre' }], coupees: 0 });
    expect(rows.get('ord-coupees')?.aVerifier).toEqual({ elements: [{ classe: 'autre' }], coupees: 0 });
  });

  it('the clipped count rides with the items', async () => {
    const rows = await lire([ligne('ord-plein', { elements: [{ classe: 'stuck_paiement', le: T }], coupees: 3 })]);
    expect(rows.get('ord-plein')?.aVerifier).toEqual({ elements: [{ classe: 'stuck_paiement', le: T }], coupees: 3 });
  });
});

describe('the dead-letter count', () => {
  it('asks exactly ?compte=1 on the Shop+ base with key C, and answers held', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'https://shop.example/');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, held: 1, dropped: 0, oversize: 0 })));
    expect(await resolveDispatchService()!.compterDlq('cle-c')).toEqual({ ok: true, n: 1 });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://shop.example/checkout/dlq?compte=1');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-c');
  });

  it('a refused key is bad_key; an outage or an unreadable count is unreachable — never 0', async () => {
    vi.stubEnv('EXPO_PUBLIC_SHOP_CHECKOUT_BASE', 'https://shop.example/');
    stubFetch(async () => new Response('no', { status: 401 }));
    expect(await resolveDispatchService()!.compterDlq('k')).toEqual({ ok: false, reason: 'bad_key' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'dlq_unavailable' }), { status: 503 }));
    expect(await resolveDispatchService()!.compterDlq('k')).toEqual({ ok: false, reason: 'unreachable' });
    stubFetch(async () => new Response(JSON.stringify({ ok: true, held: 'un' })));
    expect(await resolveDispatchService()!.compterDlq('k')).toEqual({ ok: false, reason: 'unreachable' });
    stubFetch(async () => { throw new Error('réseau'); });
    expect(await resolveDispatchService()!.compterDlq('k')).toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('every class the console knows has its sentence in the catalog', () => {
  it('one `commandes.alerte_<classe>` per class, plus « another alert »', () => {
    const catalog = JSON.parse(readFileSync(join(__dirname, '../i18n/catalog.json'), 'utf8')) as { key: string; fr: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    for (const c of [...CLASSES_ALERTE, 'autre']) expect(keys.has(`commandes.alerte_${c}`), c).toBe(true);
  });
});
