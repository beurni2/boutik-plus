/**
 * ═══ ALERTES — Séra's open problems, read where the founder is looking ═══
 *
 * Séra raises an alert for the founder when a ready parcel waits past its
 * hour with no course, when a parcel's custody file does not vouch for
 * itself, and when proof of delivery waits with no decision (Execution
 * Contract §6). It keeps each open until he closes it (`GET /ops/alertes`,
 * `POST /ops/alertes/ack` with `{ id, by }`), and nothing in this console
 * asked for either.
 *
 * This port is another client of the Coursiers zone's key-gated door: the
 * same base, the same key (his, typed in « Coursiers », kept on this browser
 * only, cleared on 401), the same time limit. No authority moves here: Séra
 * decides what is open and what counts as closed.
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). Wire shapes are
 * mirrored locally and read defensively: an answer this port cannot read is
 * said as unread, never as « no alert ».
 */

import { fetchBorne } from '../reseau';
import { COURSIERS_TIMEOUT_MS } from '../coursiers/service';

/** Ruled 2026-11-28: once a minute while Opérations is on screen, as the
 *  page itself says (« chaque minute »). */
export const ALERTES_RELECTURE_MS = 60_000;

/** Who closed it, as Séra records it (`acknowledgedBy`). */
export const ALERTES_PAR = 'founder';

export type AlerteScenario = 'ready_package_no_task' | 'impossible_custody' | 'evidence_not_validated_aging';

export interface AlerteOuverte {
  readonly id: string;
  readonly scenario: AlerteScenario;
  readonly orderId: string;
  /** Every order of the parcel when it carries several; null for one order. */
  readonly orderIds: readonly string[] | null;
  /** Since when, on Séra's clock. */
  readonly depuis: string;
  /** impossible_custody only: which of the six ways the file fails. */
  readonly detail: string | null;
}

export type AlertesLecture =
  /** `entreesIllisibles`: Séra's list held an entry this port could not read, so « nothing shown » is not « nothing open ». */
  | { kind: 'ok'; alertes: readonly AlerteOuverte[]; entreesIllisibles: boolean }
  | { kind: 'unreachable' }
  | { kind: 'bad_key' }
  | { kind: 'refused'; reason: string };

export type AlerteVu =
  | { kind: 'vu' }
  | { kind: 'unreachable' }
  | { kind: 'bad_key' }
  | { kind: 'refused'; reason: string };

export interface AlertesServicePort {
  lire(): Promise<AlertesLecture>;
  marquerVu(id: string): Promise<AlerteVu>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
type Brut = { kind: 'ok'; body: unknown } | { kind: 'unreachable' } | { kind: 'bad_key' } | { kind: 'refused'; reason: string };

const SCENARIOS: readonly string[] = ['ready_package_no_task', 'impossible_custody', 'evidence_not_validated_aging'];
const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

function reasonOf(body: unknown): string {
  if (body === null || typeof body !== 'object') return 'unknown';
  return texte((body as Record<string, unknown>)['reason']) ?? 'unknown';
}

/** The open alerts in Séra's order (oldest first), and whether any entry was skipped; null when the answer is not the list. */
function alertesDe(body: unknown): { alertes: AlerteOuverte[]; entreesIllisibles: boolean } | null {
  const liste = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['alertes'] : undefined;
  if (!Array.isArray(liste)) return null;
  const alertes: AlerteOuverte[] = [];
  for (const brut of liste) {
    if (brut === null || typeof brut !== 'object') continue;
    const a = brut as Record<string, unknown>;
    const id = texte(a['id']);
    const orderId = texte(a['orderId']);
    const scenario = a['scenario'];
    if (id === null || orderId === null || typeof scenario !== 'string' || !SCENARIOS.includes(scenario)) continue;
    const ids = Array.isArray(a['orderIds']) ? a['orderIds'].filter((o): o is string => texte(o) !== null) : [];
    alertes.push({
      id,
      scenario: scenario as AlerteScenario,
      orderId,
      orderIds: ids.length > 1 ? ids : null,
      depuis: texte(a['since']) ?? '',
      detail: texte(a['detail']),
    });
  }
  return { alertes, entreesIllisibles: alertes.length < liste.length };
}

export function httpAlertesService(
  base: string,
  cle: string,
  fetchFn: FetchFn = globalThis.fetch,
  timeoutMs: number = COURSIERS_TIMEOUT_MS,
): AlertesServicePort {
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
      const r = await call('/ops/alertes', { method: 'GET' });
      if (r.kind !== 'ok') return r;
      const lu = alertesDe(r.body);
      return lu === null ? { kind: 'refused', reason: 'unreadable' } : { kind: 'ok', ...lu };
    },

    async marquerVu(id) {
      const r = await call('/ops/alertes/ack', { method: 'POST', body: JSON.stringify({ id, by: ALERTES_PAR }) });
      if (r.kind !== 'ok') return r;
      // Only Séra's own « closed » counts: its 200 carries the alert with who
      // closed it, and a second close answers the first one unchanged.
      const alerte = r.body !== null && typeof r.body === 'object' ? (r.body as Record<string, unknown>)['alerte'] : undefined;
      const par = alerte !== null && typeof alerte === 'object' ? texte((alerte as Record<string, unknown>)['acknowledgedBy']) : null;
      return (r.body as Record<string, unknown> | null)?.['ok'] === true && par !== null ? { kind: 'vu' } : { kind: 'refused', reason: 'unknown' };
    },
  };
}

/** UNSET ⇒ nothing, never a demo desk. */
export function resolveAlertesService(cle: string): AlertesServicePort | null {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const trimmed = typeof base === 'string' ? base.trim() : '';
  if (trimmed === '' || cle.trim() === '') return null;
  return httpAlertesService(trimmed, cle.trim());
}
