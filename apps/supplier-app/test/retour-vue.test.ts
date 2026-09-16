import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { etapeOf, fournisseurVue, type FournisseurRead } from '../src/fournisseur/view';
import { resolveFournisseurService, type CommandeRow } from '../src/fournisseur/service';

/**
 * RETOUR-VIVANT-1 (Séra SE6.2, the supplier's half) — the buyer refused, the
 * coursier brings the colis back and says his RETURN code; the supplier types
 * it on the EN ROUTE card. The ramassage check's mirror: same door
 * discipline, its own field name, its own mark (`returnedAt`), its own zone
 * sentence. Pinned here: the port speaks the return door and only it, the
 * mark moves the row off « En route » into the archive, and a malformed mark
 * drops the whole row (the standing N4 law).
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const row = (orderId: string, fulfillment?: CommandeRow['fulfillment']): CommandeRow => ({
  orderId,
  productName: 'Bazin',
  productVersionId: 'pv-1',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-09-17T08:00:00.000Z',
  zoneTo: 'Gounghin',
  sellerBasePrice: 8_000,
  ...(fulfillment === undefined ? {} : { fulfillment }),
});

const T = { accepte: '2026-09-17T09:00:00.000Z', pret: '2026-09-17T10:00:00.000Z', remis: '2026-09-17T11:00:00.000Z', revenu: '2026-09-17T12:00:00.000Z' };

describe('the return mark ends the road — the colis is back in his hands', () => {
  it('returnedAt names its own étape, after the handover and never « en route »', () => {
    expect(etapeOf(row('o1', { acceptedAt: T.accepte, readyAt: T.pret, handedOverAt: T.remis, returnedAt: T.revenu }))).toBe('retournee');
    // a return with no handover mark is still a return (a missing sibling fact never demotes a proven one)
    expect(etapeOf(row('o2', { returnedAt: T.revenu }))).toBe('retournee');
  });

  it('a returned row leaves « En route » for the archive, and the archive names it apart from a delivery', () => {
    const rows: readonly CommandeRow[] = [
      row('d-route', { acceptedAt: T.accepte, readyAt: T.pret, handedOverAt: T.remis }),
      row('r-revenue', { acceptedAt: T.accepte, readyAt: T.pret, handedOverAt: T.remis, returnedAt: T.revenu }),
    ];
    const lu: FournisseurRead = { kind: 'ok', rows };
    const ids = (zone: 'commandes' | 'en_route' | 'livrees'): string[] => {
      const vue = fournisseurVue(lu, zone);
      return vue.kind === 'liste' ? vue.commandes.map((c) => c.orderId) : [];
    };
    expect(ids('en_route')).toEqual(['d-route']);
    expect(ids('livrees')).toEqual(['r-revenue']);
    expect(ids('commandes')).toEqual([]);
    const vue = fournisseurVue(lu, 'livrees');
    expect(vue.kind === 'liste' ? vue.commandes[0]?.etape : null).toBe('retournee');
    expect(vue.kind === 'liste' ? vue.aFaire : -1).toBe(0);
    const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string; fr: string }[];
    // The sentence claims only what HE did (the verifier's MINOR, closed): his
    // confirmed code — never a custody transfer the ledger has not made yet.
    expect(catalog.find((e) => e.key === 'fournisseur.etape_retournee')?.fr).toContain('Vous avez confirmé le code de retour');
    expect(catalog.find((e) => e.key === 'fournisseur.etape_retournee')?.fr).not.toMatch(/termin/i);
  });

  it('a malformed return mark drops the WHOLE row — never a row demoted to « en route »', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offers.example.dev');
    const bon = row('ok-1', { acceptedAt: T.accepte, handedOverAt: T.remis, returnedAt: T.revenu });
    const casse = { ...row('casse-1'), fulfillment: { acceptedAt: T.accepte, handedOverAt: T.remis, returnedAt: 'pas-une-date' } };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true, orders: [bon, casse] }), { status: 200 }));
    const res = await resolveFournisseurService()!.listMine('BF-AAAA-BBBB-CCCC-DDDD');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.orders.map((o) => o.orderId)).toEqual(['ok-1']);
    expect(res.orders[0]?.fulfillment?.returnedAt).toBe(T.revenu);
  });
});

describe('the port speaks the RETURN door, and only that door', () => {
  it('POSTs /fulfillment/retour/verify with HIS code as Bearer and exactly {orderId, codeRetour}', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offers.example.dev');
    const seen: { url?: string; auth?: string | null; body?: unknown } = {};
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      seen.url = url;
      seen.auth = new Headers(init?.headers).get('Authorization');
      seen.body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, verdict: 'confirme' }), { status: 200 });
    });
    const res = await resolveFournisseurService()!.verifierRetour('BF-AAAA-BBBB-CCCC-DDDD', 'ord-1', 'rtr-k7m');
    expect(res).toEqual({ ok: true, verdict: 'confirme' });
    expect(seen.url).toBe('https://offers.example.dev/fulfillment/retour/verify');
    expect(seen.auth).toBe('Bearer BF-AAAA-BBBB-CCCC-DDDD');
    // `codeRetour`, never `codeRamassage`: two codes, two doors, never confusable.
    expect(seen.body).toEqual({ orderId: 'ord-1', codeRetour: 'rtr-k7m' });
  });

  it('refusals keep their names: 401 → bad_code, 404 → not_yours_or_unknown, everything else → unreachable', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offers.example.dev');
    const arms: Array<[Response, string]> = [
      [new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), { status: 401 }), 'bad_code'],
      [new Response(JSON.stringify({ ok: false, reason: 'not_yours_or_unknown' }), { status: 404 }), 'not_yours_or_unknown'],
      [new Response(JSON.stringify({ ok: false, reason: 'sera_unreachable' }), { status: 503 }), 'unreachable'],
      [new Response(JSON.stringify({ ok: true, verdict: 'peut_etre' }), { status: 200 }), 'unreachable'],
    ];
    for (const [answer, want] of arms) {
      vi.stubGlobal('fetch', async () => answer);
      const res = await resolveFournisseurService()!.verifierRetour('C', 'ord-1', 'AAA-AAA');
      expect(res.ok, want).toBe(false);
      if (!res.ok) expect(res.reason).toBe(want);
    }
    vi.stubGlobal('fetch', async () => { throw new Error('down'); });
    expect(await resolveFournisseurService()!.verifierRetour('C', 'ord-1', 'AAA-AAA')).toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('the check stands on the EN ROUTE card, and the verdict names the act (call sites)', () => {
  const app = read('src/fournisseur/FournisseurApp.tsx');
  const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string; fr: string }[];

  it('the en_route card MOUNTS the return check, once, and the prête card does not', () => {
    const route = app.indexOf("commande.etape === 'en_route'");
    const livree = app.indexOf("commande.etape === 'livree'");
    const check = app.indexOf('<VerifierRetour onVerifier={onVerifierRetour} />');
    expect(check).toBeGreaterThan(route);
    expect(check).toBeLessThan(livree);
    expect(app.split('<VerifierRetour').length - 1).toBe(1);
  });

  it('the verdict names the ACT: reprenez only after the coursier validates / ne reprenez pas', () => {
    expect(catalog.find((e) => e.key === 'retour.confirme')?.fr).toContain('vous reprenez le colis');
    expect(catalog.find((e) => e.key === 'retour.non_confirme')?.fr).toContain('Ne reprenez pas le colis');
    expect(app).toMatch(/verdict === 'confirme' \? \(\s*<Banner tone="success" check>\{t\('retour\.confirme'\)\}<\/Banner>/);
    expect(app).toMatch(/verdict === 'non_confirme' \? \(\s*<Banner tone="warn">\{t\('retour\.non_confirme'\)\}<\/Banner>/);
  });

  it('a dead session code escalates the whole screen to the door — and a confirmed code does NOT re-read the book under his eyes', () => {
    const handler = app.slice(app.indexOf('const verifierRetour'), app.indexOf('const verifierRamassage'));
    expect(handler).toContain("if (res.reason === 'bad_code') setRead({ kind: 'bad_code' });");
    // The verdict must stay on screen (the coursier still validates on his
    // phone before the colis changes hands); a re-read would unmount the card
    // and its sentence the instant he typed the code. The row moves on his
    // next refresh — the ramassage check's own law.
    expect(handler).not.toContain('load(');
  });
});
