import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveOperationsService } from '../src/operations/service';
import {
  RETRAIT_IDLE,
  retraitAnnule,
  retraitDemande,
  retraitSettled,
  retraitStart,
  sweepAnnule,
  sweepAvance,
  sweepDemande,
  sweepFini,
  sweepStart,
} from '../src/operations/view';

/**
 * ═══ PURGE-ESSAI — THE ONE DESTRUCTIVE CONTROL ON THIS CONSOLE ═══
 *
 * Founder ruling (2026-08-10): retire the TEST ORDERS from both consoles; the
 * product catalogue stays. What is pinned here is not that the button exists —
 * it is that the button CANNOT FIRE BY ACCIDENT, and that the screen actually
 * calls the port (a port that exists is not a port that is called).
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch(reply: () => Promise<Response>) {
  const spy = vi.fn((_url: string, _init?: RequestInit) => reply());
  vi.stubGlobal('fetch', spy);
  return spy;
}

/**
 * ⚠ THE VERIFIER'S EVIDENCE GAP, CLOSED: nothing executed this wire. The
 * screen's call site was pinned by source scan and the Worker's door by an
 * e2e that spoke raw HTTP — so the URL, the verb, the Bearer and the body
 * the CONSOLE actually sends were proven by nobody. A typo in the path would
 * have shipped green.
 */
describe('the retire port — the exact bytes the console puts on the wire', () => {
  it('POSTs to /fulfillment/order/retirer with the founder Bearer and a body of EXACTLY {orderId}', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, status: 'retire' })));
    const res = await resolveOperationsService()!.retirerCommande('cle-ops', 'ord-7');
    expect(res).toEqual({ ok: true });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://offer.example/fulfillment/order/retirer');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-ops');
    expect(JSON.parse(String(init?.body)), 'only the id crosses').toEqual({ orderId: 'ord-7' });
  });

  it('401 is bad_key; every other refusal and a dead network are unreachable — never a cheerful default', async () => {
    vi.stubEnv('EXPO_PUBLIC_OFFER_BASE', 'https://offer.example');
    const port = resolveOperationsService()!;
    for (const [reply, expected] of [
      [async () => new Response('no', { status: 401 }), 'bad_key'],
      [async () => new Response('no', { status: 400 }), 'unreachable'],
      [async () => new Response('no', { status: 500 }), 'unreachable'],
      [() => Promise.reject(new Error('down')), 'unreachable'],
    ] as const) {
      stubFetch(reply as () => Promise<Response>);
      expect(await port.retirerCommande('k', 'ord-1'), expected).toEqual({ ok: false, reason: expected });
    }
  });
});

describe('two taps, and the second one is checked by value', () => {
  it('a confirm with NO standing question does nothing — this is the whole safety of the control', () => {
    expect(retraitStart(RETRAIT_IDLE, 'ord-1')).toBeNull();
  });

  it('a confirm for a DIFFERENT order than the one asked does nothing', () => {
    const asked = retraitDemande(RETRAIT_IDLE, 'ord-1');
    expect(asked).not.toBeNull();
    expect(retraitStart(asked!, 'ord-2'), 'a stale card must never delete its neighbour').toBeNull();
    // …and the honest path still works on the order that WAS asked.
    expect(retraitStart(asked!, 'ord-1')).toMatchObject({ busy: 'ord-1', demande: null });
  });

  it('« Annuler » takes the question back, leaving nothing armed', () => {
    const asked = retraitDemande(RETRAIT_IDLE, 'ord-1')!;
    const annule = retraitAnnule(asked);
    expect(annule.demande).toBeNull();
    expect(retraitStart(annule, 'ord-1'), 'a cancelled question cannot be confirmed').toBeNull();
  });

  it('ONE AT A TIME: while a removal is in flight, no other card may ask or fire', () => {
    const busy = retraitStart(retraitDemande(RETRAIT_IDLE, 'ord-1')!, 'ord-1')!;
    expect(retraitDemande(busy, 'ord-2')).toBeNull();
    expect(retraitStart(busy, 'ord-2')).toBeNull();
  });

  it('a failure is KEYED to its own order and asks the board for the truth only on success', () => {
    const ok = retraitSettled('ord-1', { ok: true });
    expect(ok.then, 'the row leaves only when the BOOK says so').toBe('refresh');
    const echec = retraitSettled('ord-1', { ok: false, reason: 'unreachable' });
    expect(echec.then).toBe('none');
    expect(echec.ui.echec).toBe('ord-1');
    const cle = retraitSettled('ord-1', { ok: false, reason: 'bad_key' });
    expect(cle.then, 'a refused key escalates to the console own surface').toBe('bad_key');
  });
});

describe('the sweep asks once, counts honestly, and cannot start unasked', () => {
  it('cannot start without its own standing question, and not on an empty board', () => {
    expect(sweepStart(RETRAIT_IDLE)).toBeNull();
    expect(sweepDemande(RETRAIT_IDLE, []), 'nothing to retire, nothing to ask').toBeNull();
  });

  /**
   * ⚠ THE VERIFIER'S MAJOR, PINNED: the question CARRIES ITS SET. The first
   * cut stored a count and the loop read the screen's current rows, so
   * asking on a 3-row segment and confirming on a 7-row one retired seven
   * orders against a question about three. `sweepStart` now HANDS BACK the
   * ids it was asked about, and nothing else can be looped.
   */
  it('hands back EXACTLY the orders he was shown — never whatever the screen now holds', () => {
    const asked = sweepDemande(RETRAIT_IDLE, ['ord-1', 'ord-2', 'ord-3'])!;
    expect(asked.sweep).toEqual({ kind: 'demande', orderIds: ['ord-1', 'ord-2', 'ord-3'] });
    const started = sweepStart(asked)!;
    expect(started.orderIds).toEqual(['ord-1', 'ord-2', 'ord-3']);
    expect(started.ui.sweep).toMatchObject({ kind: 'encours', faits: 0, total: 3 });
    // …and the set is a COPY: a caller mutating its own array afterwards
    // cannot re-target a standing question.
    const rows = ['ord-a', 'ord-b'];
    const q = sweepDemande(RETRAIT_IDLE, rows)!;
    rows.push('ord-c');
    expect(sweepStart(q)!.orderIds).toEqual(['ord-a', 'ord-b']);
  });

  it('counts what it did and says what it could not', () => {
    let ui = sweepStart(sweepDemande(RETRAIT_IDLE, ['ord-1', 'ord-2'])!)!.ui;
    ui = sweepAvance(ui);
    expect(ui.sweep).toEqual({ kind: 'encours', faits: 1, total: 2 });
    ui = sweepAvance(ui);
    const fini = sweepFini(ui, 1, 1);
    expect(fini.sweep, 'a partial sweep must SAY it was partial').toEqual({ kind: 'fini', faits: 1, echecs: 1 });
  });

  it('cancelling the sweep arms nothing', () => {
    const annule = sweepAnnule(sweepDemande(RETRAIT_IDLE, ['ord-1'])!);
    expect(annule.sweep).toEqual({ kind: 'idle' });
    expect(sweepStart(annule)).toBeNull();
  });
});

describe('the console actually calls the port, and the strings come from the catalog', () => {
  const screen = read('src/commandes/screen.tsx');

  it('the per-card control fires the REAL port with the order id — the call site, not the guard', () => {
    expect(screen).toContain('service.retirerCommande(cle, row.orderId)');
    // and it is reached only through the pure confirm
    expect(screen).toContain('const started = retraitStart(ui, row.orderId);');
    expect(screen).toContain('if (started === null) return void 0;');
  });

  it('the sweep loops THE CONFIRMED SET, one named call each — never a bulk server route', () => {
    expect(screen).toContain('for (const orderId of started.orderIds) {');
    expect(screen).toContain('await service.retirerCommande(cle, orderId)');
    // and it must NOT be reading the live rows at confirm time (the defect)
    expect(screen).not.toContain('for (const o of rows) {');
    // No « retirer tout » path may exist on the wire.
    expect(read('src/operations/service.ts')).not.toContain('/fulfillment/orders/retirer');
  });

  it('every sentence it shows is a catalog key — none inline', () => {
    const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    for (const k of [
      'operations.retrait_action', 'operations.retrait_question', 'operations.retrait_oui',
      'operations.retrait_annuler', 'operations.retrait_encours', 'operations.retrait_echec',
      'operations.balayage_action', 'operations.balayage_question', 'operations.balayage_oui',
      'operations.balayage_encours', 'operations.balayage_fini', 'operations.balayage_reste',
    ]) {
      expect(keys.has(k), k).toBe(true);
      expect(screen, `${k} must be rendered from the catalog`).toContain(`'${k}'`);
    }
  });

  it('a refused key ESCALATES on both controls — never a silent no-op (verifier MAJOR)', () => {
    expect(screen).toContain("else if (settled.then === 'bad_key') onCleRefusee();");
    expect(screen).toContain("if (r.reason === 'bad_key') cleRefusee = true;");
    expect(screen).toContain('if (cleRefusee) onCleRefusee();');
    // and a segment switch restarts the question rather than carrying it
    expect(screen).toContain('key={segment}');
  });

  it('the control is SECONDARY and sits under the list — a destructive act never greets him', () => {
    // It renders through the SOFT button, never the screen's primary — and
    // the check is whitespace-insensitive (a verifier NOTE killed the exact
    // string version: it could never fail, so it protected nothing).
    expect(screen).toContain("label={t('operations.retrait_action')}");
    const primaires = screen.match(/<C07BtnPrimary[\s\S]{0,200}?\/>/g) ?? [];
    for (const bloc of primaires) {
      expect(bloc, 'a destructive act is never the primary button').not.toContain('operations.retrait_action');
      expect(bloc).not.toContain('operations.balayage_action');
      expect(bloc).not.toContain('operations.balayage_oui');
    }
    // The sweep is mounted AFTER the rows block, and only when rows exist.
    const sweepAt = screen.indexOf('<BalayageEssai');
    const rowsAt = screen.indexOf('<RangCommande');
    expect(sweepAt).toBeGreaterThan(rowsAt);
    expect(screen).toContain('{rows.length > 0 ? (');
  });
});
