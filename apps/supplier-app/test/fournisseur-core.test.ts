import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredCode,
  readStoredCode,
  resolveFournisseurService,
  storeCode,
  type CommandeRow,
} from '../src/fournisseur/service';
import {
  PRET_REPOS,
  etapeOf,
  fournisseurVue,
  pretChoisir,
  pretEnvoyer,
  pretIssue,
  pretRefusKey,
} from '../src/fournisseur/view';
import { catalog } from '../src/i18n';

/**
 * READINESS-WIRE-1b-ii — the fournisseur surface's PURE CORE, by value.
 *
 * The card's one primary action follows the TRUE state (paid → accepter,
 * accepted → préparer, readied → nothing), the work sits above the archive,
 * and every server refusal of « Produit prêt » keeps its own French sentence —
 * because each asks a DIFFERENT act of the supplier.
 */

const keys = new Set(catalog.map((e) => e.key));

function row(orderId: string, paidAt: string, over: Partial<CommandeRow> = {}): CommandeRow {
  return {
    orderId, productName: 'Pagne tissé', productVersionId: 'pv-1', offerVersion: 'ov-1',
    paymentMode: 'FULL_PREPAY', paidAt, zoneTo: 'Gounghin', sellerBasePrice: 8_000, ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the card’s one action follows the TRUE state', () => {
  it('paid → a_accepter · accepted → a_preparer · readied → prete (readyAt wins over acceptedAt)', () => {
    expect(etapeOf(row('o1', '2026-08-02T08:00:00.000Z'))).toBe('a_accepter');
    expect(etapeOf(row('o2', '2026-08-02T08:00:00.000Z', { fulfillment: { acceptedAt: '2026-08-02T08:05:00.000Z' } }))).toBe('a_preparer');
    expect(etapeOf(row('o3', '2026-08-02T08:00:00.000Z', { fulfillment: { acceptedAt: '2026-08-02T08:05:00.000Z', readyAt: '2026-08-02T08:10:00.000Z' } }))).toBe('prete');
  });

  it('THE WORK SITS ABOVE THE ARCHIVE: à accepter first (oldest paid first), then à préparer, then the done ones newest first', () => {
    const vue = fournisseurVue({
      kind: 'ok',
      rows: [
        row('done-old', '2026-08-02T06:00:00.000Z', { fulfillment: { readyAt: '2026-08-02T07:00:00.000Z' } }),
        row('prep-1', '2026-08-02T08:00:00.000Z', { fulfillment: { acceptedAt: '2026-08-02T08:05:00.000Z' } }),
        row('new-2', '2026-08-02T09:00:00.000Z'),
        row('new-1', '2026-08-02T07:30:00.000Z'),
        row('done-new', '2026-08-02T08:30:00.000Z', { fulfillment: { readyAt: '2026-08-02T09:00:00.000Z' } }),
      ],
    });
    if (vue.kind !== 'liste') throw new Error(vue.kind);
    expect(vue.commandes.map((c) => c.orderId)).toEqual(['new-1', 'new-2', 'prep-1', 'done-new', 'done-old']);
    expect(vue.aFaire).toBe(3); // the headline counts only what needs hands
  });

  it('honest states map to their own catalog keys, and every key exists', () => {
    for (const [read, kind, message] of [
      [{ kind: 'loading' }, 'loading', 'fournisseur.chargement'],
      [{ kind: 'not_configured' }, 'not_configured', 'fournisseur.non_configure'],
      [{ kind: 'bad_code' }, 'bad_code', 'fournisseur.code_refuse'],
      [{ kind: 'failed' }, 'failed', 'fournisseur.echec'],
      [{ kind: 'ok', rows: [] }, 'empty', 'fournisseur.vide'],
    ] as const) {
      const vue = fournisseurVue(read);
      expect(vue.kind, message).toBe(kind);
      expect('message' in vue && vue.message, kind).toBe(message);
      expect(keys.has(message), `${message} missing from catalog`).toBe(true);
    }
  });
});

describe('the « Produit prêt » reducer — one flow at a time, Law-7 honest, refusals by name', () => {
  it('choosing arms the send; choosing during another order’s send is IGNORED', () => {
    expect(pretChoisir(PRET_REPOS, 'o1', 'blob:x')).toEqual({ etat: 'photo_choisie', orderId: 'o1', previewUri: 'blob:x' });
    expect(pretChoisir({ etat: 'envoi', orderId: 'o2' }, 'o1', 'blob:x')).toBeNull();
    expect(pretEnvoyer({ etat: 'photo_choisie', orderId: 'o1', previewUri: 'blob:x' })).toEqual({ etat: 'envoi', orderId: 'o1' });
    expect(pretEnvoyer(PRET_REPOS)).toBeNull(); // no photo, no send — ever
  });

  it('SUCCESS and already_ready both demand a RE-READ — what the card shows is the stored truth, never this screen’s hope', () => {
    expect(pretIssue('o1', { ok: true, status: 'ready', confirmedAt: 'x' })).toEqual({ ui: PRET_REPOS, then: 'refresh' });
    expect(pretIssue('o1', { ok: false, reason: 'already_ready' })).toEqual({ ui: PRET_REPOS, then: 'refresh' });
  });

  it('a refused CODE escalates the whole screen back to the door', () => {
    expect(pretIssue('o1', { ok: false, reason: 'bad_code' })).toEqual({ ui: PRET_REPOS, then: 'bad_code' });
  });

  it('EVERY refusal keeps its own sentence, each key in the catalog — expired invites a retry, terms mismatch says call, never a generic wall', () => {
    for (const [reason, key] of [
      ['challenge_expired', 'fournisseur.pret_defi_perime'],
      ['challenge_missing_or_mismatched', 'fournisseur.pret_defi_perime'],
      ['challenge_already_used', 'fournisseur.pret_defi_perime'],
      ['locked_terms_mismatch', 'fournisseur.pret_termes'],
      ['not_accepted', 'fournisseur.pret_pas_acceptee'],
      ['not_yours_or_unknown', 'fournisseur.pret_impossible'],
      ['not_canonical_or_foreign_secret', 'fournisseur.pret_impossible'],
      ['unreachable', 'fournisseur.pret_echec'],
    ] as const) {
      expect(pretRefusKey(reason), reason).toBe(key);
      expect(keys.has(key), `${key} missing from catalog`).toBe(true);
      const issue = pretIssue('o9', { ok: false, reason });
      expect(issue.then, reason).toBe('none');
      expect(issue.ui).toEqual({ etat: 'refus', orderId: 'o9', messageKey: key });
    }
    const photo = pretIssue('o9', { ok: false, reason: 'photo_echec' });
    expect(photo.ui).toEqual({ etat: 'refus', orderId: 'o9', messageKey: 'fournisseur.pret_photo_echec' });
  });
});

describe('the port — Bearer code, refusals by status, malformed rows dropped', () => {
  function stubFetch(reply: () => Promise<Response>) {
    const spy = vi.fn((_url: string, _init?: RequestInit) => reply());
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('unset base resolves to NOTHING — never demo', () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', '');
    expect(resolveFournisseurService()).toBeNull();
  });

  it('listMine: the code travels as Bearer on /fulfillment/mine; 401 → bad_code; malformed rows DROPPED', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example/');
    const good = row('ord-true', '2026-08-02T08:00:00.000Z');
    const spy = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, orders: [good, { orderId: '' }, { ...good, orderId: 'ord-franc', sellerBasePrice: 0.5 }, null] })),
    );
    const res = await resolveFournisseurService()!.listMine('BF-AAAA-BBBB-CCCC-DDDD');
    if (!res.ok) throw new Error(res.reason);
    expect(res.orders.map((r) => r.orderId)).toEqual(['ord-true']);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://offer.example/fulfillment/mine');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer BF-AAAA-BBBB-CCCC-DDDD');

    stubFetch(async () => new Response('no', { status: 401 }));
    expect(await resolveFournisseurService()!.listMine('k')).toEqual({ ok: false, reason: 'bad_code' });
  });

  it('accept: body is EXACTLY {orderId} (identity is the header, never a body byte); 404 → not_yours_or_unknown', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, status: 'accepted', acceptedAt: 'x' })));
    expect(await resolveFournisseurService()!.accept('code-1', 'ord-1')).toEqual({ ok: true });
    const [, init] = spy.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ orderId: 'ord-1' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'not_yours_or_unknown' }), { status: 404 }));
    expect(await resolveFournisseurService()!.accept('code-1', 'ord-x')).toEqual({ ok: false, reason: 'not_yours_or_unknown' });
  });

  it('ready: forwards the confirmation whole; every NAMED server refusal survives to the caller; junk → unreachable', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const port = resolveFournisseurService()!;
    const conf = {
      orderId: 'o1', photoRef: { ref: 'media/x', sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
      readinessChallenge: 'srch-x', qty: 1, variant: 'pv-1', availableConfirmed: true, at: '2026-08-02T08:00:00.000Z',
    };
    for (const reason of ['challenge_expired', 'locked_terms_mismatch', 'not_accepted'] as const) {
      stubFetch(async () => new Response(JSON.stringify({ ok: false, reason }), { status: 409 }));
      expect(await port.ready('c', conf), reason).toEqual({ ok: false, reason });
    }
    stubFetch(async () => new Response(JSON.stringify({ ok: true, status: 'ready', confirmedAt: 't1' })));
    expect(await port.ready('c', conf)).toEqual({ ok: true, status: 'ready', confirmedAt: 't1' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'quelque_chose_de_neuf' }), { status: 409 }));
    expect(await port.ready('c', conf)).toEqual({ ok: false, reason: 'unreachable' }); // an unknown name is never invented into a sentence
  });

  it('the code storage: round-trip in a browser store, null without one, empty reads as null', () => {
    expect(readStoredCode()).toBeNull();
    const bag = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => bag.get(k) ?? null,
      setItem: (k: string, v: string) => void bag.set(k, v),
      removeItem: (k: string) => void bag.delete(k),
    });
    storeCode('BF-XXXX-YYYY-ZZZZ-WWWW');
    expect(readStoredCode()).toBe('BF-XXXX-YYYY-ZZZZ-WWWW');
    expect([...bag.keys()]).toEqual(['boutik.fournisseur.code']);
    clearStoredCode();
    expect(bag.size).toBe(0);
  });
});
