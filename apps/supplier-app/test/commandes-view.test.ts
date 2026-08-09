import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  attenteDepuis,
  nomFournisseur,
  pilluleCommande,
  segmenter,
  tonAttente,
} from '../src/commandes/view';
import type { PaidOrderRow } from '../src/operations/service';

/**
 * RB-1 — the Commandes tab's pure decisions (founder direction 2026-08-08).
 */

const T0 = Date.parse('2026-08-08T12:00:00.000Z');

const order = (orderId: string, over: Partial<PaidOrderRow> = {}): PaidOrderRow => ({
  orderId,
  productVersionId: 'pv-1',
  productName: 'Bazin riche',
  offerVersion: 'ov-1',
  paymentMode: 'FULL_PREPAY',
  paidAt: '2026-08-08T10:00:00.000Z',
  zoneTo: 'Gounghin, Ouagadougou',
  sellerBasePrice: 8_000,
  supplierId: 'supplier-a',
  supplierResolved: true,
  registeredAt: '2026-08-08T10:00:00.000Z',
  ...over,
});

describe('BOUTIK-FLOW — the five segments are a PARTITION of the whole road, incidents first', () => {
  const paid = order('ord-1');
  const ready = order('ord-2', { fulfillment: { readyAt: '2026-08-08T11:00:00.000Z' } });
  const claimedReady = order('ord-3', { fulfillment: { readyAt: '2026-08-08T11:00:00.000Z' } });
  const relayed = order('ord-4', { fulfillment: { readyAt: '2026-08-08T11:00:00.000Z' } });
  const delivered = order('ord-5', { fulfillment: { readyAt: '2026-08-08T11:00:00.000Z' } });

  it('paid → à traiter · ready → prêt à livrer · relayed → en route · delivered → terminées · claimed → incidents', () => {
    const s = segmenter(
      [paid, ready, claimedReady, relayed, delivered],
      new Set(['ord-3']),
      new Set(['ord-4']),
      new Set(['ord-5']),
    );
    expect(s.a_traiter.map((o) => o.orderId)).toEqual(['ord-1']);
    expect(s.pret.map((o) => o.orderId)).toEqual(['ord-2']);
    expect(s.en_route.map((o) => o.orderId)).toEqual(['ord-4']);
    expect(s.terminees.map((o) => o.orderId)).toEqual(['ord-5']);
    // A contested order must NEVER read as settled work — incidents wins.
    expect(s.incidents.map((o) => o.orderId)).toEqual(['ord-3']);
  });

  it('precedence holds on one order wearing every hat: claimed > delivered > en route > prêt', () => {
    const all = order('ord-all', { fulfillment: { readyAt: '2026-08-08T11:00:00.000Z' } });
    const claimed = segmenter([all], new Set(['ord-all']), new Set(['ord-all']), new Set(['ord-all']));
    expect(claimed.incidents.length).toBe(1);
    const done = segmenter([all], new Set(), new Set(['ord-all']), new Set(['ord-all']));
    expect(done.terminees.length).toBe(1);
    const carried = segmenter([all], new Set(), new Set(['ord-all']), new Set());
    expect(carried.en_route.length).toBe(1);
  });

  it('every order lands in exactly one segment; empty road facts degrade toward prêt, never invent', () => {
    const s = segmenter([paid, ready, claimedReady, relayed, delivered], new Set(['ord-3']), new Set(), new Set());
    expect(s.a_traiter.length + s.pret.length + s.en_route.length + s.terminees.length + s.incidents.length).toBe(5);
    // Without board/gains facts, relayed & delivered read as prêt — true-but-
    // colder; the confier door itself re-refuses a double relay.
    expect(s.pret.map((o) => o.orderId).sort()).toEqual(['ord-2', 'ord-4', 'ord-5']);
    expect(s.en_route.length).toBe(0);
    expect(s.terminees.length).toBe(0);
  });
});

describe('the waiting clock speaks market French, largest honest unit only', () => {
  it('instant, minutes, hours, days', () => {
    const at = (iso: string) => attenteDepuis(iso, T0);
    expect(at('2026-08-08T11:59:40.000Z')).toBe('commandes.instant');
    expect(at('2026-08-08T11:15:00.000Z')).toBe('45 min');
    expect(at('2026-08-08T10:00:00.000Z')).toBe('2 heures');
    expect(at('2026-08-08T11:00:00.000Z')).toBe('1 heure');
    expect(at('2026-08-05T12:00:00.000Z')).toBe('3 jours');
    expect(at('not-a-date')).toBe('');
  });

  it('the tone escalates at 4 h and 24 h — stated urgency, never manufactured', () => {
    expect(tonAttente('2026-08-08T10:00:00.000Z', T0)).toBe('calme');
    expect(tonAttente('2026-08-08T02:00:00.000Z', T0)).toBe('appuye');
    expect(tonAttente('2026-08-06T02:00:00.000Z', T0)).toBe('fort');
  });
});

describe('the supplier’s name comes from HIS card, never invented', () => {
  it('a card names them; no card shows the true id and says the card is missing', () => {
    const contacts = [{ supplierId: 'supplier-a', name: 'Aïcha Ouédraogo', phone: '70 00 00 01' }];
    expect(nomFournisseur('supplier-a', contacts)).toEqual({
      nom: 'Aïcha Ouédraogo', telephone: '70 00 00 01', carteAbsente: false,
    });
    expect(nomFournisseur('supplier-b', contacts)).toEqual({
      nom: 'supplier-b', telephone: '', carteAbsente: true,
    });
  });
});

describe('one pill per row', () => {
  it('names the segment state, and « acceptée » only from the book’s own mark', () => {
    expect(pilluleCommande(order('o'), 'incidents').label).toBe('commandes.pill_incident');
    expect(pilluleCommande(order('o'), 'terminees').label).toBe('commandes.pill_livree');
    expect(pilluleCommande(order('o'), 'en_route').label).toBe('commandes.pill_en_route');
    expect(pilluleCommande(order('o'), 'pret').label).toBe('commandes.pill_prete');
    expect(pilluleCommande(order('o'), 'a_traiter').label).toBe('commandes.pill_attente');
    expect(
      pilluleCommande(order('o', { fulfillment: { acceptedAt: '2026-08-08T10:30:00.000Z' } }), 'a_traiter').label,
    ).toBe('commandes.pill_acceptee');
  });
});

describe('[source-text checks] the tab’s discipline', () => {
  const screen = readFileSync(join(import.meta.dirname, '..', 'src/commandes/screen.tsx'), 'utf8');

  it('every commandes.* key the tab renders exists in the catalog', () => {
    const catalog = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'i18n/catalog.json'), 'utf8'),
    ) as { key: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...screen.matchAll(/t\('(commandes\.[a-z_.]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(20);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });

  it('no demo import — unset resolves to nothing, never an invented order book', () => {
    expect(screen).not.toMatch(/from '\.\.\/demo/);
    expect(screen).toContain('resolveOperationsService()');
  });

  it('a refused ops key clears back to the door; a refused key C clears ITS OWN door, never the board’s', () => {
    expect(screen).toContain('clearStoredOpsKey();');
    expect(screen).toContain('clearStoredCleC();');
  });
});

describe('RB-2 — the pin the founder pastes, refused before it can reach a rider', () => {
  it('reads « lat, lng » and nothing else, inside the globe only', async () => {
    const { lirePin } = await import('../src/commandes/sera-service');
    expect(lirePin('12.3714, -1.5197')).toEqual({ lat: 12.3714, lng: -1.5197 });
    expect(lirePin('  -11.5 ,  39.2 ')).toEqual({ lat: -11.5, lng: 39.2 });
    for (const bad of ['', '12.37', '12,37 -1,52', 'douze, un', '95, 10', '10, 190', '12.3;-1.5']) {
      expect(lirePin(bad), bad).toBeNull();
    }
  });
});

describe('RB-2 — [source-text checks] the dispatch fold’s discipline', () => {
  const confier = readFileSync(join(import.meta.dirname, '..', 'src/commandes/confier.tsx'), 'utf8');
  const sera = readFileSync(join(import.meta.dirname, '..', 'src/commandes/sera-service.ts'), 'utf8');

  it('every confier.* key rendered exists in the catalog', () => {
    const catalog = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'i18n/catalog.json'), 'utf8'),
    ) as { key: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...confier.matchAll(/t\('(confier\.[a-z_.]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(12);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });

  it('Séra’s gate refusals reach the screen BY NAME, never flattened', () => {
    expect(confier).toContain("'funding_projection_stale'");
    expect(confier).toContain("'readiness_projection_stale'");
  });

  it('the task id is never chosen client-side, and both command ids are deterministic', () => {
    // The Worker refuses a caller-chosen taskId outright (SE-LIVE-2c blocker);
    // this port must never even try.
    expect(sera).not.toMatch(/taskId:.*crypto|taskId:.*uuid/i);
    expect(sera).toContain('cmd-boutik-tache-${orderId}');
    expect(sera).toContain('cmd-boutik-confier-${taskId}-${riderId}');
  });

  it('only ASSIGNABLE riders become buttons — absent is not assignable', () => {
    expect(sera).toContain("assignable: r['assignable'] === true");
    expect(confier).toContain('.filter((r) => r.assignable)');
  });

  it('the fold shares the Coursiers zone’s key slot — one Séra key, typed once', () => {
    expect(confier).toContain("readStoredCleCoursiers");
    expect(confier).toContain("clearStoredCleCoursiers");
    expect(confier).not.toContain('EXPO_PUBLIC_SERA_OPS');
  });
});
