/**
 * ═══ SOS-DESK — a rider's SOS, read where the founder is looking ═══
 *
 * Séra keeps every SOS a rider raises (`GET /ops/sos`, open ones first, never
 * aged out) and records who answered (`POST /ops/sos/ack`). Nothing in this
 * console asked for either, so an alert could reach Séra's book and no screen.
 *
 * This port is another client of the same key-gated door as the Coursiers
 * zone: the same base, the same key (his, typed in « Coursiers », kept on this
 * browser only, cleared on 401), the same time limit. No authority moves here:
 * Séra decides what is open and what counts as answered.
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). Wire shapes are
 * mirrored locally and read defensively: an answer this port cannot read is
 * said as unread, never as « no alert ».
 */

import { fetchBorne } from '../reseau';
import { COURSIERS_TIMEOUT_MS } from '../coursiers/service';

/** Ruled 2026-11-27 against the flagged 60 s in-hours answer target: at most
 *  about 15 s before an alert shows on a page he is looking at, which leaves
 *  him most of the target to see it and press. */
export const SOS_RELECTURE_MS = 15_000;

/** Who answered, as Séra records it (`acknowledgedBy`). */
export const SOS_PAR = 'founder';

export interface SosOuvert {
  readonly commandId: string;
  readonly riderId: string;
  /** The name he typed on the roster; null when the roster was not read. */
  readonly nom: string | null;
  /** The « Téléphone (alias) » he typed; null when absent or not read. */
  readonly telephone: string | null;
  /** The phone said it was on a course when the alert left. */
  readonly enCourse: boolean;
  /** When Séra received it (Séra's clock). */
  readonly recuA: string;
}

export type SosLecture =
  | { kind: 'ok'; ouverts: readonly SosOuvert[] }
  | { kind: 'unreachable' }
  | { kind: 'bad_key' }
  | { kind: 'refused'; reason: string };

export type SosReponse =
  | { kind: 'acknowledged' }
  | { kind: 'unreachable' }
  | { kind: 'bad_key' }
  | { kind: 'refused'; reason: string };

export interface SosServicePort {
  lire(): Promise<SosLecture>;
  repondre(commandId: string): Promise<SosReponse>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
type Brut = { kind: 'ok'; body: unknown } | { kind: 'unreachable' } | { kind: 'bad_key' } | { kind: 'refused'; reason: string };

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

function reasonOf(body: unknown): string {
  if (body === null || typeof body !== 'object') return 'unknown';
  return texte((body as Record<string, unknown>)['reason']) ?? 'unknown';
}

/** The open alerts, newest first; null when the answer is not the SOS list. */
function ouvertsDe(body: unknown): Omit<SosOuvert, 'nom' | 'telephone'>[] | null {
  const liste = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['incidents'] : undefined;
  if (!Array.isArray(liste)) return null;
  const ouverts: Omit<SosOuvert, 'nom' | 'telephone'>[] = [];
  for (const brut of liste) {
    if (brut === null || typeof brut !== 'object') continue;
    const i = brut as Record<string, unknown>;
    const commandId = texte(i['commandId']);
    const riderId = texte(i['riderId']);
    if (i['state'] !== 'open' || commandId === null || riderId === null) continue;
    ouverts.push({ commandId, riderId, enCourse: texte(i['activeCourseId']) !== null, recuA: texte(i['receivedAt']) ?? '' });
  }
  return ouverts.sort((a, b) => (a.recuA < b.recuA ? 1 : a.recuA > b.recuA ? -1 : 0));
}

function fichesDe(body: unknown): Map<string, { nom: string | null; telephone: string | null }> {
  const fiches = new Map<string, { nom: string | null; telephone: string | null }>();
  const liste = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['riders'] : undefined;
  if (!Array.isArray(liste)) return fiches;
  for (const brut of liste) {
    if (brut === null || typeof brut !== 'object') continue;
    const r = brut as Record<string, unknown>;
    const riderId = texte(r['riderId']);
    if (riderId !== null) fiches.set(riderId, { nom: texte(r['displayName']), telephone: texte(r['phoneAlias']) });
  }
  return fiches;
}

export function httpSosService(
  base: string,
  cle: string,
  fetchFn: FetchFn = globalThis.fetch,
  timeoutMs: number = COURSIERS_TIMEOUT_MS,
): SosServicePort {
  const root = base.replace(/\/+$/, '');

  async function call(path: string, init: RequestInit): Promise<Brut> {
    let res: Response;
    try {
      // The key rides the Authorization header and nowhere else.
      res = await fetchBorne(`${root}${path}`, { ...init, headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' } }, timeoutMs, fetchFn);
    } catch {
      return { kind: 'unreachable' };
    }
    if (res.status === 401 || res.status === 403) return { kind: 'bad_key' };
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { kind: 'refused', reason: reasonOf(body) };
    return { kind: 'ok', body };
  }

  return {
    async lire() {
      const sos = await call('/ops/sos', { method: 'GET' });
      if (sos.kind !== 'ok') return sos;
      const ouverts = ouvertsDe(sos.body);
      if (ouverts === null) return { kind: 'refused', reason: 'unreadable' };
      if (ouverts.length === 0) return { kind: 'ok', ouverts: [] };
      // The names are a courtesy: a roster that cannot be read leaves the
      // rider ids Séra gave, and never holds an alert back.
      const roster = await call('/ops/riders', { method: 'GET' });
      const fiches = roster.kind === 'ok' ? fichesDe(roster.body) : new Map<string, { nom: string | null; telephone: string | null }>();
      return {
        kind: 'ok',
        ouverts: ouverts.map((o) => ({ ...o, nom: fiches.get(o.riderId)?.nom ?? null, telephone: fiches.get(o.riderId)?.telephone ?? null })),
      };
    },

    async repondre(commandId) {
      const r = await call('/ops/sos/ack', { method: 'POST', body: JSON.stringify({ command_id: commandId, by: SOS_PAR }) });
      if (r.kind !== 'ok') return r;
      // Only Séra's « acknowledged » counts as answered; a second answer is
      // the same word with `duplicate: true`.
      const incident = r.body !== null && typeof r.body === 'object' ? (r.body as Record<string, unknown>)['incident'] : undefined;
      const etat = incident !== null && typeof incident === 'object' ? (incident as Record<string, unknown>)['state'] : undefined;
      return etat === 'acknowledged' ? { kind: 'acknowledged' } : { kind: 'refused', reason: 'unknown' };
    },
  };
}

/** UNSET ⇒ nothing, never a demo desk. */
export function resolveSosService(cle: string): SosServicePort | null {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const trimmed = typeof base === 'string' ? base.trim() : '';
  if (trimmed === '' || cle.trim() === '') return null;
  return httpSosService(trimmed, cle.trim());
}
