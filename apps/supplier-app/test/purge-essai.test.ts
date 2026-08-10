import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    expect(sweepStart(RETRAIT_IDLE, 3)).toBeNull();
    expect(sweepDemande(RETRAIT_IDLE, 0), 'nothing to retire, nothing to ask').toBeNull();
  });

  it('cannot start for a DIFFERENT count than the one he was shown', () => {
    const asked = sweepDemande(RETRAIT_IDLE, 3)!;
    expect(asked.sweep).toEqual({ kind: 'demande', total: 3 });
    expect(sweepStart(asked, 5), 'the board grew under him — ask again').toBeNull();
    expect(sweepStart(asked, 3)).toMatchObject({ sweep: { kind: 'encours', faits: 0, total: 3 } });
  });

  it('counts what it did and says what it could not', () => {
    let ui = sweepStart(sweepDemande(RETRAIT_IDLE, 2)!, 2)!;
    ui = sweepAvance(ui);
    expect(ui.sweep).toEqual({ kind: 'encours', faits: 1, total: 2 });
    ui = sweepAvance(ui);
    const fini = sweepFini(ui, 1, 1);
    expect(fini.sweep, 'a partial sweep must SAY it was partial').toEqual({ kind: 'fini', faits: 1, echecs: 1 });
  });

  it('cancelling the sweep arms nothing', () => {
    const annule = sweepAnnule(sweepDemande(RETRAIT_IDLE, 4)!);
    expect(annule.sweep).toEqual({ kind: 'idle' });
    expect(sweepStart(annule, 4)).toBeNull();
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

  it('the sweep loops the VISIBLE rows, one named call each — never a bulk server route', () => {
    expect(screen).toContain('for (const o of rows) {');
    expect(screen).toContain('await service.retirerCommande(cle, o.orderId)');
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

  it('the control is SECONDARY and sits under the list — a destructive act never greets him', () => {
    // It renders through the soft button, never the screen's primary.
    expect(screen).toContain("label={t('operations.retrait_action')}");
    expect(screen).not.toContain("C07BtnPrimary\n            label={t('operations.retrait_action')}");
    // The sweep is mounted AFTER the rows block, and only when rows exist.
    const sweepAt = screen.indexOf('<BalayageEssai');
    const rowsAt = screen.indexOf('<RangCommande');
    expect(sweepAt).toBeGreaterThan(rowsAt);
    expect(screen).toContain('{rows.length > 0 ? (');
  });
});
