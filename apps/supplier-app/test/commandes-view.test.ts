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

describe('the three segments are a PARTITION, incidents first', () => {
  const paid = order('ord-1');
  const ready = order('ord-2', { fulfillment: { readyAt: '2026-08-08T11:00:00.000Z' } });
  const claimedReady = order('ord-3', { fulfillment: { readyAt: '2026-08-08T11:00:00.000Z' } });

  it('paid lands in à traiter, ready in terminées, claimed in incidents — even a READY claimed order', () => {
    const s = segmenter([paid, ready, claimedReady], new Set(['ord-3']));
    expect(s.a_traiter.map((o) => o.orderId)).toEqual(['ord-1']);
    expect(s.terminees.map((o) => o.orderId)).toEqual(['ord-2']);
    // A contested order must NEVER read as settled work — incidents wins.
    expect(s.incidents.map((o) => o.orderId)).toEqual(['ord-3']);
  });

  it('every order lands in exactly one segment', () => {
    const s = segmenter([paid, ready, claimedReady], new Set(['ord-3']));
    expect(s.a_traiter.length + s.terminees.length + s.incidents.length).toBe(3);
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
    expect(pilluleCommande(order('o'), 'terminees').label).toBe('commandes.pill_prete');
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
