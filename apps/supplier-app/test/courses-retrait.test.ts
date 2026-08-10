import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { courseRows, httpCoursiersService } from '../src/coursiers/service';
import { retraitDepuisAnswer } from '../src/coursiers/view';

/**
 * ═══ PURGE-ESSAI-COURSES — clearing Séra's board from the console he opens ═══
 *
 * Founder ruling (2026-08-10): « Board yes, custody no ». The retire was first
 * built into the Séra dispatch console — which has NO deploy workflow and is
 * published nowhere — so it had no screen to appear on. He chose this desk,
 * which already holds `SERA_OPS_SECRET`.
 *
 * What is pinned here: the board is read defensively, the wire is exactly the
 * logistics door's contract, and the destructive control reuses the PROVEN
 * two-tap grammar rather than growing a second dialect.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the board, read defensively — a destructive act is never offered on a row it cannot name', () => {
  it('one row per order: a live assignment WINS over the queued row, and names the carrier', () => {
    const rows = courseRows({
      board: {
        queued: [
          { taskId: 't-1', orderId: 'ord-1' },
          { taskId: 't-2', orderId: 'ord-2' },
        ],
        assignments: [{ assignmentId: 'as-1', taskId: 't-1', orderId: 'ord-1', riderId: 'rider-boss' }],
      },
    });
    expect(rows).toEqual([
      { orderId: 'ord-1', taskId: 't-1', coursier: 'rider-boss', confiee: true },
      { orderId: 'ord-2', taskId: 't-2', confiee: false },
    ]);
  });

  it('a row that cannot name its order is DROPPED, never shown nameless', () => {
    const rows = courseRows({
      board: {
        queued: [{ taskId: 't-1' }, { taskId: 't-2', orderId: '' }, null, 'pas-un-objet'],
        assignments: [{ assignmentId: 'as-9' }],
      },
    });
    expect(rows).toEqual([]);
  });

  it('a board that is absent, malformed, or carries no lists reads as EMPTY — never as a crash', () => {
    expect(courseRows(null)).toEqual([]);
    expect(courseRows({})).toEqual([]);
    expect(courseRows({ board: {} })).toEqual([]);
    expect(courseRows({ board: { queued: 'non', assignments: 3 } })).toEqual([]);
  });

  it('an assignment with no rider name is still CARRIED — the danger is the assignment, not the label', () => {
    const rows = courseRows({ board: { assignments: [{ taskId: 't', orderId: 'ord-x' }] } });
    expect(rows[0]).toMatchObject({ orderId: 'ord-x', confiee: true });
    expect(rows[0]?.coursier).toBeUndefined();
  });
});

describe('the retire wire — exactly what the logistics door accepts', () => {
  it('POSTs /ops/order/retirer with the Séra ops Bearer and a body of {command_id, orderId}', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, status: 'retire' })));
    const port = httpCoursiersService('https://sera.example/', 'cle-sera', spy as never);
    const answer = await port.retirerCourse('ord-7', 'cmd-1');
    expect(answer.kind).toBe('ok');
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://sera.example/ops/order/retirer');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle-sera');
    expect(JSON.parse(String(init?.body))).toEqual({ command_id: 'cmd-1', orderId: 'ord-7' });
  });

  it('reads the board through GET /ops/board with the same key', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, board: { queued: [], assignments: [] } })));
    const port = httpCoursiersService('https://sera.example', 'cle-sera', spy as never);
    expect((await port.courses()).kind).toBe('ok');
    expect(spy.mock.calls[0]![0]).toBe('https://sera.example/ops/board');
    expect(spy.mock.calls[0]![1]?.method).toBe('GET');
  });

  it('a refused key is bad_key; anything else this screen cannot act on is unreachable', () => {
    expect(retraitDepuisAnswer({ kind: 'ok' })).toEqual({ ok: true });
    expect(retraitDepuisAnswer({ kind: 'bad_key' })).toEqual({ ok: false, reason: 'bad_key' });
    expect(retraitDepuisAnswer({ kind: 'unreachable' })).toEqual({ ok: false, reason: 'unreachable' });
    // A NAMED refusal is not a removal — it must never read as success.
    expect(retraitDepuisAnswer({ kind: 'refused' })).toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('the control on screen — the proven grammar, and the danger said where it is decided', () => {
  const zone = read('src/coursiers/zone.tsx');

  it('calls the REAL port with the order id, behind the two-tap confirm', () => {
    expect(zone).toContain('service.retirerCourse(orderId, mintCommandId())');
    expect(zone).toContain('const started = retraitStart(ui, c.orderId);');
    expect(zone).toContain('if (started === null) return void 0;');
  });

  it('the sweep walks THE CONFIRMED SET, one named call each — no bulk route on the wire', () => {
    expect(zone).toContain('for (const orderId of started.orderIds) {');
    expect(read('src/coursiers/service.ts')).not.toContain('/ops/orders/retirer');
  });

  it('a CARRIED course warns before it is retired — the founder cannot tell from the row alone', () => {
    expect(zone).toContain("{c.confiee ? (");
    expect(zone).toContain("t('coursiers.course_question_confiee')");
    const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string; fr: string }[];
    const avert = catalog.find((e) => e.key === 'coursiers.course_question_confiee');
    expect(avert?.fr, 'it must tell him to take the course back first').toContain('reprenez');
  });

  it('a refused key escalates on both controls, and the board is re-read only after the door answered', () => {
    expect(zone).toContain("if (r === 'bad_key') onCleRefusee();");
    expect(zone).toContain('if (cleRefusee) onCleRefusee();');
    expect(zone).toContain("else if (r === 'ok') void charger();");
  });

  it('every sentence is a catalog key, and the desk owns its own honest states', () => {
    const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    for (const k of [
      'coursiers.courses_titre', 'coursiers.courses_chargement', 'coursiers.courses_echec',
      'coursiers.courses_vide', 'coursiers.course_confiee', 'coursiers.course_attente',
      'coursiers.course_retirer', 'coursiers.course_question', 'coursiers.course_oui',
      'coursiers.course_encours', 'coursiers.course_echec', 'coursiers.courses_balayage',
      'coursiers.courses_balayage_question', 'coursiers.courses_balayage_fini',
    ]) {
      expect(keys.has(k), k).toBe(true);
      expect(zone, `${k} must be rendered from the catalog`).toContain(`'${k}'`);
    }
  });

  it('the destructive act is never a primary button on this desk', () => {
    const primaires = zone.match(/<C07BtnPrimary[\s\S]{0,220}?\/>/g) ?? [];
    for (const bloc of primaires) {
      expect(bloc).not.toContain('coursiers.course_retirer');
      expect(bloc).not.toContain('coursiers.course_oui');
      expect(bloc).not.toContain('coursiers.courses_balayage');
    }
  });
});
