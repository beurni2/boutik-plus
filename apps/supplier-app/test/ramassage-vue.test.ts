import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFournisseurService } from '../src/fournisseur/service';

/**
 * RAMASSAGE (founder orders 2026-08-09, both of them) — the supplier's half
 * of the two-party pickup (Séra SE5): « once the rider arrives to the pickup
 * location, he will give the code to the supplier who will enter it in that
 * screen … » and, the correction that moved it: « that screen should be on
 * the supplier's console not mine. »
 *
 * So the check lives on the FOURNISSEUR surface, behind the supplier's own
 * session code — and is GONE from the founder's operator console, whose Séra
 * key no supplier holds. Both facts are pinned here: the mount where it must
 * be, and the absence where it must not.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the check stands where the SUPPLIER stands — on his ready (à ramasser) product', () => {
  const app = read('src/fournisseur/FournisseurApp.tsx');
  const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string; fr: string }[];

  it('the prete card MOUNTS the check (call site, not the component existing)', () => {
    const branch = app.slice(app.indexOf("etape === 'prete'"), app.indexOf("etape === 'a_accepter'"));
    expect(branch).toContain('<VerifierRamassage onVerifier={onVerifierRamassage} />');
  });

  it('the verdict names the ACT, from the catalog: remettez / ne remettez pas', () => {
    const confirme = catalog.find((e) => e.key === 'ramassage.confirme');
    const non = catalog.find((e) => e.key === 'ramassage.non_confirme');
    expect(confirme?.fr).toContain('remettre le colis');
    expect(non?.fr).toContain('Ne remettez pas le colis');
    expect(app).toMatch(/verdict === 'confirme' \? \(\s*<Banner tone="success" check>\{t\('ramassage\.confirme'\)\}<\/Banner>/);
    expect(app).toMatch(/verdict === 'non_confirme' \? \(\s*<Banner tone="warn">\{t\('ramassage\.non_confirme'\)\}<\/Banner>/);
  });

  it('an unreachable road is its own honest sentence — never a fake verdict', () => {
    expect(app).toMatch(/verdict === 'echec' \? \(\s*<Banner tone="warn">\{t\('ramassage\.echec_reseau'\)\}<\/Banner>/);
    expect(catalog.some((e) => e.key === 'ramassage.echec_reseau')).toBe(true);
  });

  it('a dead session code escalates the whole screen to the door, exactly as accept does (call site)', () => {
    const handler = app.slice(app.indexOf('const verifierRamassage'), app.indexOf('const envoyer'));
    expect(handler).toContain("if (res.reason === 'bad_code') setRead({ kind: 'bad_code' });");
  });
});

describe('the port speaks the supplier door, and only that door', () => {
  it('POSTs /fulfillment/ramassage/verify with HIS code as Bearer and exactly {orderId, codeRamassage}', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offers.example.dev');
    const seen: { url?: string; auth?: string | null; body?: unknown } = {};
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      seen.url = url;
      seen.auth = new Headers(init?.headers).get('Authorization');
      seen.body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, verdict: 'confirme' }), { status: 200 });
    });
    const port = resolveFournisseurService();
    expect(port).not.toBeNull();
    const res = await port!.verifierRamassage('BF-AAAA-BBBB-CCCC-DDDD', 'ord-1', 'kvn-38m');
    expect(res).toEqual({ ok: true, verdict: 'confirme' });
    expect(seen.url).toBe('https://offers.example.dev/fulfillment/ramassage/verify');
    expect(seen.auth).toBe('Bearer BF-AAAA-BBBB-CCCC-DDDD');
    // The typed code travels as codeRamassage — `code` is the Bearer's name
    // on this wire, and the two must never be confusable.
    expect(seen.body).toEqual({ orderId: 'ord-1', codeRamassage: 'kvn-38m' });
  });

  it('refusals keep their names: 401 → bad_code, 404 → not_yours_or_unknown, everything else → unreachable', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offers.example.dev');
    const arms: Array<[Response, string]> = [
      [new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), { status: 401 }), 'bad_code'],
      [new Response(JSON.stringify({ ok: false, reason: 'not_yours_or_unknown' }), { status: 404 }), 'not_yours_or_unknown'],
      [new Response(JSON.stringify({ ok: false, reason: 'sera_unreachable' }), { status: 503 }), 'unreachable'],
      // a malformed 200 is NEVER promoted to a verdict
      [new Response(JSON.stringify({ ok: true, verdict: 'peut_etre' }), { status: 200 }), 'unreachable'],
    ];
    for (const [answer, want] of arms) {
      vi.stubGlobal('fetch', async () => answer);
      const res = await resolveFournisseurService()!.verifierRamassage('C', 'ord-1', 'AAA-AAA');
      expect(res.ok, want).toBe(false);
      if (!res.ok) expect(res.reason).toBe(want);
    }
    // and a road that throws is unreachable, not a crash
    vi.stubGlobal('fetch', async () => { throw new Error('down'); });
    expect(await resolveFournisseurService()!.verifierRamassage('C', 'ord-1', 'AAA-AAA'))
      .toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('and it is GONE from the founder’s console — the correction, pinned', () => {
  const screen = read('src/commandes/screen.tsx');
  const service = read('src/commandes/sera-service.ts');

  it('the operator screen no longer mounts or defines the check', () => {
    expect(screen).not.toContain('VerifierRamassage');
    expect(screen).not.toContain('ramassage.');
  });

  it('the ops dispatch port no longer carries a verify act or its path', () => {
    expect(service).not.toMatch(/ramassage/i);
  });

  it('the fournisseur surface never touches the founder’s Séra key or any /ops/ door', () => {
    for (const f of ['FournisseurApp.tsx', 'service.ts', 'view.ts', 'media-upload.ts']) {
      const src = read(join('src/fournisseur', f));
      expect(src, f).not.toContain('/ops/');
      expect(src, f).not.toContain('resolveSeraDispatch');
      expect(src, f).not.toContain('readStoredCleCoursiers');
    }
  });
});
